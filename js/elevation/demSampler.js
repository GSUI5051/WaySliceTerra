/**
 * DEM sampling orchestration — turns a track's points into per-point
 * elevations through "points → unique tiles → bounded-concurrency fetch →
 * local bilinear sampling" (the terrain.js half). The tiles come from the
 * app's shared DEM pipeline (js/map/demSource.js): the same maplibre-contour
 * DemSource that serves 3D terrain, hillshade and contours, so tiles a map
 * view already warmed cost nothing and every fetch lands in one shared LRU.
 * The whole fetch step is injectable (`fetchTile`), so tests never touch the
 * real tile service.
 *
 * Failure discipline: a tile that cannot be fetched or decoded is simply
 * absent from the tile store; the points that needed it come back as null
 * (no sample). Nothing is ever reported as elevation 0 because of a failure.
 * Cancellation is cooperative through an AbortSignal: the pool stops
 * scheduling, in-flight requests abort, and the promise rejects with
 * CancelledError so a caller can never mistake a partial run for a result.
 */
import { buildSamples, sampleElevation, tileKey, trackDemSource } from './terrain.js';
import { getDemSource } from '../map/demSource.js';

/** Rejection sentinel for aborted runs. */
export class CancelledError extends Error {
  constructor() {
    super('DEM sampling cancelled');
    this.name = 'CancelledError';
  }
}

/** Simultaneous tile requests. Tiles are ~300 KB; a long trail at the DEM's
 *  native zoom crosses a few dozen of them, so a small pool keeps the
 *  browser queue — and the server — fed without a request storm. */
export const DEM_CONCURRENCY = 6;

/**
 * Samples a DEM elevation for every point of a track.
 * @param {{lat:number, lon:number}[]} points
 * @param {{demSource?:{getDemTile:(z:number,x:number,y:number,c?:AbortController)
 *            =>Promise<import('./terrain.js').DemTile>},
 *          fetchTile?:(x:number,y:number,signal:AbortSignal)
 *            =>Promise<import('./terrain.js').DemTile|null>,
 *          concurrency?:number, signal?:AbortSignal,
 *          onProgress?:(p:{done:number,total:number})=>void,
 *          source?:{zoom:number, tileSize:number}}} [opts]
 *   `fetchTile` (test seam) replaces the whole network step; `demSource`
 *   injects an already-created DemSource — by default the shared singleton
 *   is created on demand.
 * @returns {Promise<{elevations:(number|null)[], sampled:number, failed:number,
 *                     tilesTotal:number, tilesFailed:number}>}
 *   `elevations` aligns with `points`; null marks a point with no sample.
 * @throws {CancelledError} when `signal` aborts (also mid-fetch).
 */
export async function sampleTrackElevations(points, opts = {}) {
  const {
    demSource,
    fetchTile,
    concurrency = DEM_CONCURRENCY,
    signal,
    onProgress,
    source = trackDemSource(),
  } = opts;
  // The DemSource singleton is created on demand — but never when a test
  // injected the whole network step.
  const dem = fetchTile ? null : (demSource ?? await getDemSource());
  // The DemSource speaks in AbortControllers while the run is coordinated by
  // a signal: relay the run's signal onto one controller so a cancel aborts
  // every in-flight tile request together.
  let relay = null;
  if (!fetchTile && signal) {
    relay = new AbortController();
    if (signal.aborted) relay.abort();
    else signal.addEventListener('abort', () => relay.abort(), { once: true });
  }
  const fetchOne = fetchTile ?? ((x, y) =>
    dem.getDemTile(source.zoom, x, y, relay));

  const { samples, tiles } = buildSamples(points, source);
  const total = tiles.length;
  const store = new Map();
  let done = 0;
  let tilesFailed = 0;
  onProgress?.({ done, total });

  const aborted = () => signal?.aborted === true;
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      if (aborted()) throw new CancelledError();
      const index = cursor++;
      if (index >= total) return;
      const { x, y } = tiles[index];
      let tile = null;
      try {
        tile = await fetchOne(x, y, signal);
      } catch (err) {
        // A single tile's network failure must not sink the batch — but an
        // abort must, even when it surfaces as a fetch rejection.
        if (aborted()) throw new CancelledError();
        tile = null;
      }
      if (aborted()) throw new CancelledError();
      if (tile) store.set(tileKey(x, y, source.zoom), tile);
      else tilesFailed++;
      done++;
      onProgress?.({ done, total });
    }
  };
  const lanes = Math.max(1, Math.min(concurrency, total));
  await Promise.all(Array.from({ length: lanes }, worker));

  const elevations = samples.map((s) => (s ? sampleElevation(store, s, source) : null));
  let sampled = 0;
  for (const ele of elevations) if (ele != null) sampled++;
  return {
    elevations,
    sampled,
    failed: points.length - sampled,
    tilesTotal: total,
    tilesFailed,
  };
}
