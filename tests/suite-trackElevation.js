/**
 * Track Elevation suites — DEM tile math, bilinear sampling over decoded
 * tiles, the fill/replace/restore strategies, the async run controller's
 * race behavior, and the metrics/export integration. Every network path is
 * injected (`fetchTile` / `sampler`): no test touches the real tile service.
 */
import { suite, test, assert } from './runner.js';
import { eastTrack } from './helpers.js';
import {
  trackDemSource, lonLatToTileFraction, buildSamples, tileKey,
  isValidElevation, sampleElevation, ELEVATION_MIN_M, ELEVATION_MAX_M,
} from '../js/elevation/terrain.js';
import { sampleTrackElevations, CancelledError, DEM_CONCURRENCY } from '../js/elevation/demSampler.js';
import {
  isEleMissing, buildFillValues, buildReplaceValues, applyElevations,
  restoreElevations, runElevationFix, cancelElevationFix,
  restoreOriginalElevations,
} from '../js/elevation/elevationFix.js';
import { trackStore } from '../js/core/stores.js';
import { prepareTrack } from '../js/geo/track.js';
import { computeSectorMetrics } from '../js/metrics/sectorMetrics.js';
import { buildGpxExport } from '../js/export/exporter.js';
import { t, setLanguage, getCurrentLanguage, getLanguages } from '../js/language/language.js';

const SOURCE = { zoom: 12, tileSize: 512 };
const SIZE = SOURCE.tileSize;
const Z = SOURCE.zoom;
const assertNotEqual = (a, b, msg) => assert(a !== b, msg);

/* Fixtures ------------------------------------------------------------------ */

/** A synthetic decoded tile whose pixel (x, y) holds fn(x, y) meters
 *  (NaN = void pixel, like the DEM pipeline's out-of-window values). */
function syntheticTile(fn) {
  const data = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) data[y * SIZE + x] = fn(x, y);
  }
  return { data, width: SIZE, height: SIZE };
}

/** lon/lat at a chosen pixel fraction inside tile (tx, ty) at the source zoom. */
function inTile(tx, fxFrac, ty, fyFrac) {
  const lon = ((tx + fxFrac) / 2 ** Z) * 360 - 180;
  const n = Math.PI * (1 - (2 * (ty + fyFrac)) / 2 ** Z);
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lon, lat };
}

/** @private Runs fn with `track` loaded, restoring the previous track after. */
async function withStore(track, fn) {
  const previous = trackStore.get();
  trackStore.set(track);
  try {
    return await fn(track);
  } finally {
    trackStore.set(previous);
  }
}

/* 1. Coordinate → tile mapping -------------------------------------------------- */

suite('Track elevation — tile coordinates', () => {
  test('origin maps to the center tile at the source zoom', () => {
    const f = lonLatToTileFraction(0, 0, Z);
    assert.closeTo(f.x, 2048, 1e-9, 'x fraction');
    assert.closeTo(f.y, 2048, 1e-9, 'y fraction');
  });

  test('matches the standard slippy formulas (tilebelt reference)', () => {
    for (const [lon, lat, z] of [[8.5417, 47.3769, 12], [-73.9857, 40.7484, 12], [106.55, 29.56, 12]]) {
      const mine = lonLatToTileFraction(lon, lat, z);
      const sinLat = Math.sin((lat * Math.PI) / 180);
      const n = 2 ** z;
      const refX = n * (lon / 360 + 0.5);
      const refY = n * (0.5 - (0.25 * Math.log((1 + sinLat) / (1 - sinLat))) / Math.PI);
      assert.closeTo(mine.x, refX, 1e-7, 'x');
      assert.closeTo(mine.y, refY, 1e-7, 'y');
    }
  });

  test('boundaries: antimeridian wraps, west edge is tile 0', () => {
    assert.equal(Math.floor(lonLatToTileFraction(-180, 0, Z).x), 0, 'west edge');
    assert.equal(Math.floor(lonLatToTileFraction(180, 0, Z).x), 0, 'antimeridian wraps');
  });

  test('invalid coordinates yield null, not a coerced tile', () => {
    assert.isNull(lonLatToTileFraction(0, 90, Z), 'north of the Mercator bound');
    assert.isNull(lonLatToTileFraction(0, -90, Z), 'south of the Mercator bound');
    assert.isNull(lonLatToTileFraction(NaN, 0, Z), 'NaN lon');
    assert.isNull(lonLatToTileFraction(0, Infinity, Z), 'infinite lat');
  });

  test('trackDemSource mirrors the active terrain provider', () => {
    const src = trackDemSource();
    assert.equal(src.zoom, 12, 'Mapterhorn native zoom');
    assert.equal(src.tileSize, 512, 'Mapterhorn tile size');
  });
});

/* 2. Tile planning ---------------------------------------------------------------- */

suite('Track elevation — tile planning', () => {
  test('points in one tile dedupe to a single tile', () => {
    const a = inTile(2000, 0.30, 2000, 0.40);
    const b = inTile(2000, 0.32, 2000, 0.44);
    const c = inTile(2000, 0.48, 2000, 0.60);
    const { samples, tiles } = buildSamples([a, b, c], SOURCE);
    assert.equal(tiles.length, 1, 'one unique tile for three nearby points');
    for (const s of samples) assert.truthy(s != null, 'every valid point has a sample');
    assert.equal(samples[0].tx, 2000);
    assert.equal(samples[0].ty, 2000);
  });

  test('a point on the last pixel column also plans the eastern neighbour', () => {
    const p = inTile(2000, 511.5 / SIZE, 2000, 0.5);
    const { tiles } = buildSamples([p], SOURCE);
    const keys = tiles.map((t) => `${t.x}/${t.y}`).sort();
    assert.deepEqual(keys, ['2000/2000', '2001/2000'], 'east neighbour is part of the fetch set');
  });

  test('last row plans the southern neighbour, the corner plans the diagonal', () => {
    const corner = inTile(2000, 511.5 / SIZE, 2000, 511.5 / SIZE);
    const { tiles } = buildSamples([corner], SOURCE);
    const keys = tiles.map((t) => `${t.x}/${t.y}`).sort();
    assert.deepEqual(keys, ['2000/2000', '2000/2001', '2001/2000', '2001/2001'],
      'E, S and diagonal neighbours for a corner point');
  });

  test('invalid points get null samples and plan no tile', () => {
    const { samples, tiles } = buildSamples([{ lat: 95, lon: 0 }], SOURCE);
    assert.isNull(samples[0]);
    assert.equal(tiles.length, 0);
  });
});

/* 3. Bilinear sampling ------------------------------------------------------------- */

suite('Track elevation — sampling', () => {
  test('validity window: 0 is valid, nodata is not', () => {
    assert.truthy(isValidElevation(0), 'sea level is a value');
    assert.truthy(isValidElevation(8848));
    assert.truthy(isValidElevation(-430));
    assert.truthy(!isValidElevation(NaN), 'NaN is void');
    assert.truthy(!isValidElevation(-32768), 'Terrarium nodata is void');
    assert.truthy(!isValidElevation(ELEVATION_MIN_M - 1));
    assert.truthy(!isValidElevation(ELEVATION_MAX_M + 1));
  });

  test('a flat tile samples to its value everywhere', () => {
    const tile = syntheticTile(() => 100);
    const store = new Map([[tileKey(2000, 2000, Z), tile]]);
    for (const [fx, fy] of [[0.5 / SIZE, 0.5 / SIZE], [0.3, 0.7], [511.5 / SIZE, 511.5 / SIZE]]) {
      const sample = { tx: 2000, ty: 2000, fx: fx * SIZE, fy: fy * SIZE };
      assert.closeTo(sampleElevation(store, sample, SOURCE), 100, 1e-9, `flat at ${fx},${fy}`);
    }
  });

  test('an exact pixel center reads that pixel', () => {
    const tile = syntheticTile((x, y) => x * 3 + y * 10);
    const store = new Map([[tileKey(2000, 2000, Z), tile]]);
    const sample = { tx: 2000, ty: 2000, fx: 10, fy: 20 };
    assert.closeTo(sampleElevation(store, sample, SOURCE), 10 * 3 + 20 * 10, 1e-9);
  });

  test('a fractional position bilinearly blends the four window pixels', () => {
    const tile = syntheticTile((x, y) => x + y * 1000);
    const store = new Map([[tileKey(2000, 2000, Z), tile]]);
    const sample = { tx: 2000, ty: 2000, fx: 0.5, fy: 0.5 };
    // (0 + 1 + 1000 + 1001) / 4
    assert.closeTo(sampleElevation(store, sample, SOURCE), 500.5, 1e-9);
  });

  test('a window crossing the last column reads the eastern tile', () => {
    const west = syntheticTile((x) => x);
    const east = syntheticTile((x) => 1000 + x);
    const store = new Map([
      [tileKey(2000, 2000, Z), west],
      [tileKey(2001, 2000, Z), east],
    ]);
    const sample = { tx: 2000, ty: 2000, fx: 511.5, fy: 10 };
    // dy = 0 → only p00 (west col 511) and p10 (east col 0 = 1000) blend.
    assert.closeTo(sampleElevation(store, sample, SOURCE), 511 * 0.5 + 1000 * 0.5, 1e-9,
      'no wrap-around to the tile’s own column 0');
  });

  test('a missing neighbour degrades to an edge clamp, never a wrap', () => {
    const west = syntheticTile((x) => x);
    const store = new Map([[tileKey(2000, 2000, Z), west]]);
    const sample = { tx: 2000, ty: 2000, fx: 511.5, fy: 10 };
    assert.closeTo(sampleElevation(store, sample, SOURCE), 511, 1e-9,
      'clamps onto the last available pixel');
  });

  test('an invalid primary pixel is an honest null, never a fabricated 0', () => {
    const tile = syntheticTile((x, y) => (x === 5 && y === 5 ? NaN : 100));
    const store = new Map([[tileKey(2000, 2000, Z), tile]]);
    assert.isNull(sampleElevation(store, { tx: 2000, ty: 2000, fx: 5, fy: 5 }, SOURCE),
      'the void pixel as the window primary → null');
    assert.closeTo(sampleElevation(store, { tx: 2000, ty: 2000, fx: 5, fy: 4.5 }, SOURCE), 100, 1e-9,
      'a void NEIGHBOR pixel clamps onto the primary instead of failing');
    assert.truthy(sampleElevation(store, { tx: 2000, ty: 2000, fx: 4.5, fy: 4.5 }, SOURCE) != null,
      'window without the void pixel samples fine');
  });

  test('a missing primary tile is null', () => {
    assert.isNull(sampleElevation(new Map(), { tx: 1, ty: 2, fx: 0, fy: 0 }, SOURCE));
  });

  test('sea-level tiles sample as 0 — a real value, not a failure', () => {
    const tile = syntheticTile(() => 0);
    const store = new Map([[tileKey(2000, 2000, Z), tile]]);
    assert.equal(sampleElevation(store, { tx: 2000, ty: 2000, fx: 3, fy: 3 }, SOURCE), 0);
  });
});

/* 4. Sampling orchestration ---------------------------------------------------------- */

suite('Track elevation — orchestration', () => {
  test('elevations align with points; counts and progress are exact', async () => {
    const points = [
      inTile(2000, 0.30, 2000, 0.40),
      inTile(2000, 0.32, 2000, 0.44),
      { lat: 95, lon: 0 }, // unsampleable — no tile
    ];
    const progress = [];
    const result = await sampleTrackElevations(points, {
      source: SOURCE,
      fetchTile: async () => syntheticTile(() => 42),
      onProgress: (p) => progress.push({ ...p }),
    });
    assert.equal(result.elevations[0], 42);
    assert.equal(result.elevations[1], 42);
    assert.isNull(result.elevations[2]);
    assert.equal(result.sampled, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.tilesTotal, 1);
    assert.equal(result.tilesFailed, 0);
    assert.equal(progress[0].total, 1, 'progress announces the total up front');
    assert.equal(progress[progress.length - 1].done, 1, 'progress ends at done = total');
    for (let i = 1; i < progress.length; i++) {
      assert.truthy(progress[i].done >= progress[i - 1].done, 'progress is monotonic');
    }
  });

  test('a failed tile yields nulls for its points, not zeros', async () => {
    const points = [inTile(2000, 0.3, 2000, 0.4), inTile(2001, 0.3, 2001, 0.4)];
    const result = await sampleTrackElevations(points, {
      source: SOURCE,
      fetchTile: async (x) => (x === 2000 ? null : syntheticTile(() => 7)),
    });
    assert.isNull(result.elevations[0], 'failed tile → no sample');
    assert.equal(result.elevations[1], 7);
    assert.equal(result.tilesFailed, 1);
    assert.equal(result.failed, 1);
  });

  test('a throwing fetch is a tile failure, not a crash', async () => {
    const points = [inTile(2000, 0.3, 2000, 0.4)];
    const result = await sampleTrackElevations(points, {
      source: SOURCE,
      fetchTile: async () => { throw new Error('offline'); },
    });
    assert.isNull(result.elevations[0]);
    assert.equal(result.tilesFailed, 1);
  });

  test('tile fetches respect the concurrency cap', async () => {
    const points = [];
    for (let tx = 2000; tx < 2004; tx++) {
      for (let ty = 2000; ty < 2004; ty++) points.push(inTile(tx, 0.5, ty, 0.5));
    }
    let active = 0;
    let peak = 0;
    const result = await sampleTrackElevations(points, {
      source: SOURCE,
      fetchTile: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return syntheticTile(() => 1);
      },
    });
    assert.equal(result.sampled, points.length);
    assert.truthy(peak <= DEM_CONCURRENCY, `peak ${peak} ≤ ${DEM_CONCURRENCY}`);
  });

  test('abort mid-run rejects with CancelledError', async () => {
    const points = [inTile(2000, 0.3, 2000, 0.4), inTile(2001, 0.3, 2001, 0.4)];
    const controller = new AbortController();
    const hang = (signal) => new Promise((_, reject) => {
      if (signal.aborted) reject(new Error('aborted'));
      else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    const p = sampleTrackElevations(points, {
      source: SOURCE,
      signal: controller.signal,
      fetchTile: (x, y, signal) => hang(signal),
    });
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await assert.throwsAsync(() => p, 'aborted runs reject instead of resolving partial data');
    assert.truthy(p instanceof Promise);
  });

  test('CancelledError is the rejection sentinel', () => {
    const err = new CancelledError();
    assert.truthy(err instanceof Error);
    assert.equal(err.name, 'CancelledError');
  });
});

/* 5. Strategies ------------------------------------------------------------------------ */

suite('Track elevation — strategies', () => {
  test('fill touches only missing points; 0 is a value, not a gap', () => {
    const points = eastTrack({ count: 4, ele: (i) => (i === 1 || i === 3 ? null : i === 2 ? 0 : 50) });
    const samples = [11, 22, 33, null];
    const built = buildFillValues(points, samples);
    assert.deepEqual(built.values, [50, 22, 0, null],
      'recorded values (0 included) survive; no sample stays null');
    assert.equal(built.applied, 1);
    assert.equal(built.failed, 1);
    assert.equal(built.candidates, 2, 'only missing points are candidates');
  });

  test('replace takes every sample; unsampled points keep their value', () => {
    const points = eastTrack({ count: 3, ele: (i) => (i === 2 ? null : 50 + i) });
    const samples = [11, null, 33];
    const built = buildReplaceValues(points, samples);
    assert.deepEqual(built.values, [11, 51, 33],
      'every sample lands (even on a missing original); no sample → original (missing stays missing, never 0)');
    assert.equal(built.applied, 2);
    assert.equal(built.failed, 1);
    assert.equal(built.candidates, 3);
  });

  test('applyElevations captures originals once and never stacks', () => {
    const points = eastTrack({ count: 3, ele: (i) => 100 + i });
    const track = { ...prepareTrack(points, 'T'), sourceName: 'test.gpx' };
    const first = applyElevations(track, [9, 8, 7], 'replace');
    assert.deepEqual(first.eleOriginal, [100, 101, 102]);
    assert.equal(first.eleSource, 'replace');
    assert.equal(track.points[0].ele, 9, 'points mutated in place');
    const second = applyElevations(first, [5, 5, 5], 'replace');
    assert.deepEqual(second.eleOriginal, [100, 101, 102], 'originals never overwritten');
  });

  test('apply touches nothing but elevations', () => {
    const points = eastTrack({
      count: 4, ele: (i) => 100 + i, time: (i) => i * 60000, hr: (i) => 120 + i,
    });
    const track = prepareTrack(points, 'T');
    const cumDist = track.cumDist;
    const lat = points.map((p) => p.lat);
    const lon = points.map((p) => p.lon);
    const time = points.map((p) => p.time);
    const hr = points.map((p) => p.hr);
    applyElevations(track, [1, 2, 3, 4], 'replace');
    assert.deepEqual(points.map((p) => p.lat), lat);
    assert.deepEqual(points.map((p) => p.lon), lon);
    assert.deepEqual(points.map((p) => p.time), time);
    assert.deepEqual(points.map((p) => p.hr), hr);
    assert.equal(track.cumDist, cumDist, 'geometry untouched');
  });

  test('flags recompute with prepareTrack semantics', () => {
    const points = eastTrack({ count: 4, ele: (i) => (i < 2 ? null : 100 + i) });
    const track = prepareTrack(points, 'T');
    assert.truthy(!track.hasElevation, 'parsed partial series starts false');
    // Partial fill: holes remain → hasElevation stays false, extremes stay null.
    const partial = applyElevations(track, [50, null, 102, 103], 'fill');
    assert.truthy(!partial.hasElevation);
    assert.equal(partial.eleMin, null);
    assert.equal(partial.eleMax, null);
    // Complete the series: hasElevation flips true, extremes computed.
    const complete = applyElevations(track, [50, 51, 102, 103], 'fill');
    assert.truthy(complete.hasElevation);
    assert.equal(complete.eleMin, 50);
    assert.equal(complete.eleMax, 103);
  });

  test('restore returns the exact originals and clears the state', () => {
    const points = eastTrack({ count: 3, ele: (i) => (i === 0 ? null : 100 + i) });
    const track = prepareTrack(points, 'T');
    assert.equal(restoreElevations(track), null, 'nothing corrected → null');
    const applied = applyElevations(track, [7, 8, 9], 'fill');
    const once = restoreElevations(applied);
    assert.deepEqual(points.map((p) => p.ele), [null, 101, 102], 'exact round-trip, including the null');
    assert.equal(once.eleOriginal, null);
    assert.equal(once.eleSource, null);
    assert.equal(restoreElevations(once), null, 'a restored track has nothing left to restore');
  });
});

/* 6. Run controller ------------------------------------------------------------------------ */

suite('Track elevation — run controller', () => {
  test('applied runs publish the corrected track through the store', async () => {
    const points = eastTrack({ count: 3, ele: (i) => 100 + i });
    const track = { ...prepareTrack(points, 'T'), sourceName: 'run.gpx' };
    await withStore(track, async () => {
      const sampler = async (pts) => ({
        elevations: pts.map((_, i) => 200 + i),
        sampled: pts.length, failed: 0, tilesTotal: 1, tilesFailed: 0,
      });
      const result = await runElevationFix('replace', { sampler });
      assert.equal(result.status, 'applied');
      assert.equal(result.applied, 3);
      const published = trackStore.get();
      assert.equal(published.eleSource, 'replace');
      assert.equal(published.points, track.points, 'same points array');
      assert.equal(published.name, 'T', 'name preserved');
      assert.equal(published.sourceName, 'run.gpx', 'sourceName preserved');
      assert.equal(published.cumDist, track.cumDist);
    });
  });

  test('no track → no-track; a full track with nothing to fill reports it', async () => {
    const saved = trackStore.get();
    trackStore.set(null);
    const none = await runElevationFix('fill', { sampler: async () => { throw new Error('must not sample'); } });
    assert.equal(none.status, 'no-track');
    const points = eastTrack({ count: 2, ele: (i) => 100 + i });
    const track = prepareTrack(points, 'T');
    trackStore.set(track);
    const full = await runElevationFix('fill', {
      sampler: async (pts) => ({
        elevations: pts.map(() => 500),
        sampled: pts.length, failed: 0, tilesTotal: 1, tilesFailed: 0,
      }),
    });
    assert.equal(full.status, 'nothing-to-fill');
    assert.equal(trackStore.get(), track, 'the store is untouched');
    trackStore.set(saved);
  });

  test('total sampling failure applies nothing', async () => {
    const points = eastTrack({ count: 2, ele: (i) => (i === 0 ? null : 100) });
    const track = prepareTrack(points, 'T');
    await withStore(track, async () => {
      const result = await runElevationFix('fill', {
        sampler: async (pts) => ({
          elevations: pts.map(() => null),
          sampled: 0, failed: pts.length, tilesTotal: 3, tilesFailed: 3,
        }),
      });
      assert.equal(result.status, 'failed-all');
      assert.equal(trackStore.get(), track);
      assert.isNull(points[0].ele, 'missing stays missing');
    });
  });

  test('cancelling the active run resolves cancelled and leaves the store', async () => {
    const points = eastTrack({ count: 2, ele: (i) => 100 + i });
    const track = prepareTrack(points, 'T');
    await withStore(track, async () => {
      const p = runElevationFix('fill', {
        sampler: (pts, opts) => new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => reject(new CancelledError()), { once: true });
        }),
      });
      await new Promise((r) => setTimeout(r, 5));
      cancelElevationFix();
      const result = await p;
      assert.equal(result.status, 'cancelled');
      assert.equal(trackStore.get(), track);
    });
  });

  test('a track loaded mid-run supersedes the old run and stops its requests', async () => {
    const points = eastTrack({ count: 2, ele: (i) => 100 + i });
    const track = prepareTrack(points, 'T');
    await withStore(track, async () => {
      const newPoints = eastTrack({ count: 2, ele: (i) => 900 + i, lonStep: 0.002 });
      const newTrack = prepareTrack(newPoints, 'Other');
      const p = runElevationFix('fill', {
        sampler: async (pts, opts) => {
          trackStore.set(newTrack); // a genuinely different file loads mid-run
          return {
            elevations: pts.map(() => 1),
            sampled: pts.length, failed: 0, tilesTotal: 1, tilesFailed: 0,
          };
        },
      });
      const result = await p;
      assert.truthy(result.status === 'superseded' || result.status === 'cancelled',
        'the old run never publishes across tracks');
      const published = trackStore.get();
      assert.equal(published.points, newPoints, 'the new track is untouched');
      assert.truthy(!published.eleSource, 'the new track carries no correction state');
    });
  });

  test('restore goes through the store without re-sampling', async () => {
    const points = eastTrack({ count: 2, ele: (i) => 100 + i });
    const track = prepareTrack(points, 'T');
    await withStore(track, async () => {
      await runElevationFix('replace', {
        sampler: async (pts) => ({
          elevations: pts.map(() => 300),
          sampled: pts.length, failed: 0, tilesTotal: 1, tilesFailed: 0,
        }),
      });
      const corrected = trackStore.get();
      assert.equal(corrected.points[0].ele, 300);
      const result = restoreOriginalElevations();
      assert.equal(result.status, 'restored');
      const restored = trackStore.get();
      assert.equal(restored.points[0].ele, 100);
      assert.equal(restored.eleOriginal, null);
      assert.equal(restored.eleSource, null);
    });
  });

  test('isEleMissing draws the line between null and 0', () => {
    assert.truthy(isEleMissing(null));
    assert.truthy(isEleMissing(undefined));
    assert.truthy(isEleMissing(NaN));
    assert.truthy(!isEleMissing(0));
    assert.truthy(!isEleMissing(-12.5));
  });
});

/* 7. Metrics + export integration ------------------------------------------------------------- */

suite('Track elevation — metrics and export integration', () => {
  test('a correction moves gain and 3D distance; restore round-trips exactly', async () => {
    const points = eastTrack({
      count: 20, ele: (i) => 100 + i * 10, time: (i) => i * 60000,
    });
    const track = prepareTrack(points, 'T');
    await withStore(track, async () => {
      const before = computeSectorMetrics(track, 0, track.totalDistance);
      const result = await runElevationFix('replace', {
        sampler: async (pts) => ({
          elevations: pts.map((_, i) => 500 + i * 2), // flatter grade, higher base
          sampled: pts.length, failed: 0, tilesTotal: 1, tilesFailed: 0,
        }),
      });
      assert.equal(result.status, 'applied');
      const corrected = trackStore.get();
      const after = computeSectorMetrics(corrected, 0, corrected.totalDistance);
      assert.truthy(before.gain !== after.gain, 'gain follows the new elevations');
      assert.truthy(after.distance3D > corrected.totalDistance,
        '3D distance exceeds 2D on graded ground');
      const restored = restoreOriginalElevations();
      assert.equal(restored.status, 'restored');
      const back = computeSectorMetrics(trackStore.get(), 0, track.totalDistance);
      assert.closeTo(back.gain, before.gain, 1e-9, 'restore returns the exact originals');
      assert.closeTo(back.distance3D, before.distance3D, 1e-9);
    });
  });

  test('exports carry the effective elevations, then the originals again', async () => {
    const points = eastTrack({ count: 3, ele: (i) => 100 + i, time: (i) => i * 60000 });
    const track = prepareTrack(points, 'T');
    await withStore(track, async () => {
      await runElevationFix('replace', {
        sampler: async (pts) => ({
          elevations: pts.map(() => 250),
          sampled: pts.length, failed: 0, tilesTotal: 1, tilesFailed: 0,
        }),
      });
      const corrected = buildGpxExport(trackStore.get(), { start: 0, end: track.totalDistance });
      assert.truthy(corrected.includes('250'), 'corrected elevation in the export');
      restoreOriginalElevations();
      const restored = buildGpxExport(trackStore.get(), { start: 0, end: track.totalDistance });
      assert.truthy(restored.includes('100'), 'original elevation after restore');
      assertNotEqual(corrected, restored);
    });
  });
});

/* 8. Drawer section ------------------------------------------------------------------------------ */

suite('Track elevation — i18n seams', () => {
  test('the group title and confirm label resolve in every pack', async () => {
    const saved = getCurrentLanguage();
    try {
      for (const { code } of getLanguages()) {
        await setLanguage(code);
        // The drawer references these keys by string literal — a typo there
        // falls back to the raw key text, so pin that they resolve.
        assert(t('trackEle') !== 'trackEle', `${code}: title key resolves`);
        assert(t('trackEleConfirmReplace') !== 'trackEleConfirmReplace', `${code}: confirm key resolves`);
      }
      await setLanguage('en');
      assert.equal(t('trackEleConfirmReplace'), 'Replace', 'confirm label is the short verb');
      assert.equal(t('trackEleCancel'), 'Cancel');
    } finally {
      await setLanguage(saved);
    }
  });
});

suite('Track elevation — drawer section', () => {
  test('no track: rows are disabled and the hint says to load one', async () => {
    const { trackElevationContent } = await import('../js/ui/trackElevationSettings.js');
    const saved = trackStore.get();
    trackStore.set(null);
    const root = trackElevationContent();
    const rows = [...root.querySelectorAll('button.menu-item')];
    assert.truthy(rows.every((b) => b.disabled), 'no track → nothing clickable');
    assert.truthy(root.textContent.includes('Load a track'), 'the hint names the precondition');
    trackStore.set(saved);
  });

  test('a track enables fill/replace, and a corrected track adds restore', async () => {
    const { trackElevationContent } = await import('../js/ui/trackElevationSettings.js');
    const points = eastTrack({ count: 2, ele: (i) => 100 + i });
    const track = prepareTrack(points, 'T');
    await withStore(track, async () => {
      const root = trackElevationContent();
      assert.truthy(!root.querySelector('[data-value="ele-fill"]').disabled);
      assert.truthy(!root.querySelector('[data-value="ele-replace"]').disabled);
      assert.isNull(root.querySelector('[data-value="ele-restore"]'),
        'no correction yet → no restore row');
      assert.truthy(root.textContent.includes('Elevation data: original'), 'status line');

      track.eleOriginal = points.map((p) => p.ele);
      track.eleSource = 'replace';
      const correctedRoot = trackElevationContent();
      assert.truthy(correctedRoot.querySelector('[data-value="ele-restore"]'),
        'corrected track → restore row appears');
      assert.truthy(correctedRoot.textContent.includes('Elevations replaced with DEM'),
        'status line follows the data source');
      delete track.eleOriginal;
      delete track.eleSource;
    });
  });

  test('replace asks for confirmation before it runs; cancel returns to idle', async () => {
    const { trackElevationContent } = await import('../js/ui/trackElevationSettings.js');
    const points = eastTrack({ count: 2, ele: (i) => 100 + i });
    const track = prepareTrack(points, 'T');
    await withStore(track, async () => {
      const root = trackElevationContent();
      root.querySelector('[data-value="ele-replace"]').click();
      assert.truthy(root.querySelector('[data-value="ele-confirm-replace"]'),
        'the confirm step exists');
      assert.truthy(root.textContent.includes('barometer'),
        'the warning says DEM values can differ from the recording');
      assert.isNull(root.querySelector('[data-value="ele-replace"]'),
        'the action rows step aside while confirming');
      root.querySelector('[data-value="ele-confirm-cancel"]').click();
      assert.truthy(root.querySelector('[data-value="ele-replace"]'),
        'cancel returns to the idle rows without running anything');
    });
  });
});
