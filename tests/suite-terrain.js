/** Terra 3D architecture tests: terrain provider catalog + settings, the
 * metric / imperial contour interval configuration (maplibre-contour
 * generation params), the view-mode state machine, i18n coverage. */
import { suite, test, assert } from './runner.js';
import {
  TERRAIN_PROVIDERS, DEFAULT_TERRAIN_PROVIDER_ID,
  getTerrainProvider, getTerrainProviderId,
  loadTerrainSettings, saveTerrainSettings,
} from '../js/map/providers/terrain.js';
import {
  CONTOUR_CONFIG, CONTOUR_MODES, CONTOUR_SOURCE_MAXZOOM,
  contourTileParams, contourLabelField,
  METRIC_CONTOUR_INTERVALS, IMPERIAL_CONTOUR_INTERVALS,
  CONTOUR_SNAP_HYSTERESIS, contourBaseRange, snapContourInterval,
  buildContourThresholds,
} from '../js/map/providers/contours.js';
import {
  TERRAIN_CONTOUR_CONFIG, terrainLogBias, selectContourInterval,
  planViewportTiles,
} from '../js/map/terrain-analysis.js';
import { METERS_PER_FOOT } from '../js/units/units.js';
import { MAP_GLYPHS_URL, skyConfig } from '../js/map/mapView.js';
import {
  setTerrainEnabled, toggleTerrainLayer, terrainLayerEnabled, updateTerrainSettings,
  getContourAdaptation, getTerrainStats,
} from '../js/map/terrain.js';
import { createViewModeManager, DEFAULT_3D_PITCH } from '../js/map/viewMode.js';
import * as language from '../js/language/language.js';
import '../js/language/langs.js';

/* Terrain provider catalog -------------------------------------------------- */

suite('terrain provider / catalog integrity', () => {
  test('every provider has the required fields and a unique id', () => {
    const ids = TERRAIN_PROVIDERS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate provider ids');
    for (const p of TERRAIN_PROVIDERS) {
      assert.truthy(p.id && p.labelKey && p.url && p.encoding && p.maxZoom && p.tileSize && p.attribution, `incomplete provider: ${p.id}`);
      assert.truthy(p.encoding === 'mapbox' || p.encoding === 'terrarium', `encoding for ${p.id}`);
      assert.truthy(p.url.includes('{z}/{x}/{y}'), `xyz template for ${p.id}`);
    }
  });

  test('the default provider is keyless Mapterhorn terrarium DEM at zoom 12', () => {
    const provider = getTerrainProvider();
    assert.equal(provider.id, DEFAULT_TERRAIN_PROVIDER_ID);
    assert.equal(provider.id, 'mapterhorn');
    assert.equal(provider.encoding, 'terrarium');
    assert.equal(provider.maxZoom, 12);
    assert.equal(provider.tileSize, 512, 'Mapterhorn serves 512px tiles');
    assert.truthy(provider.url.startsWith('https://tiles.mapterhorn.com/'), 'Mapterhorn tiles');
    assert.truthy(!/[?&](key|apikey|api_key|token|access_token)=/i.test(provider.url), 'keyless URL');
    assert.truthy(provider.attribution.includes('Mapterhorn'), 'provider credit');
  });

  test('terrain provider is decoupled from the basemap catalog', async () => {
    // The DEM seam must not live in sources.js and vice versa: the provider
    // carries its own attribution/label and sources.js stays raster/vector.
    const sources = await import('../js/map/sources.js');
    assert.truthy(!('TERRAIN_PROVIDERS' in sources));
    assert.truthy(!('CONTOUR_CONFIG' in sources), 'sources.js knows nothing about contours');
    assert.equal(getTerrainProviderId(), DEFAULT_TERRAIN_PROVIDER_ID);
  });
});

suite('terrain provider / settings persistence', () => {
  test('defaults: contours on + hillshade off, one shared pair for both view modes', () => {
    localStorage.removeItem('wayslice-terrain');
    const settings = loadTerrainSettings();
    assert.deepEqual(settings.layers, { hillshade: false, contours: true }, 'contours are the terrain info, hillshade keeps the flat map readable');
    assert.equal(settings.exaggeration, 1);
    assert.equal(settings.providerId, DEFAULT_TERRAIN_PROVIDER_ID);
  });

  test('a settings round-trip preserves the patch (layers deep-merge)', () => {
    localStorage.removeItem('wayslice-terrain');
    saveTerrainSettings({ layers: { hillshade: true }, exaggeration: 1.8 });
    const settings = loadTerrainSettings();
    assert.equal(settings.layers.hillshade, true, 'patched entry');
    assert.equal(settings.layers.contours, true, 'sibling key untouched');
    assert.closeTo(settings.exaggeration, 1.8, 1e-9);
    localStorage.removeItem('wayslice-terrain');
  });

  test('a v2 blob (per-mode pair under modes) migrates: the 2D entry seeds the shared pair', () => {
    // The app boots in 2D, so seeding from the 2D entry changes nothing on
    // screen at boot; the 3D entry dissolves into the same pair (the new
    // shared semantics) instead of surviving as a separate state.
    localStorage.setItem('wayslice-terrain', JSON.stringify({
      modes: { '2d': { hillshade: true, contours: true }, '3d': { hillshade: false, contours: false } },
    }));
    const settings = loadTerrainSettings();
    assert.deepEqual(settings.layers, { hillshade: true, contours: true }, 'seeded from the 2d entry, not the 3d one');
    localStorage.removeItem('wayslice-terrain');
  });

  test('a v1 blob (flat hillshade/contours keys) migrates into the shared pair', () => {
    // Before the per-mode split the toggles governed the 3D view — the only
    // mode that then rendered terrain. The flat keys seed the shared pair.
    localStorage.setItem('wayslice-terrain', JSON.stringify({ hillshade: false, contours: true }));
    const settings = loadTerrainSettings();
    assert.deepEqual(settings.layers, { hillshade: false, contours: true });
    localStorage.removeItem('wayslice-terrain');
  });

  test('out-of-range exaggeration clamps and a broken blob falls back', () => {
    saveTerrainSettings({ exaggeration: 99 });
    assert.equal(loadTerrainSettings().exaggeration, 3);
    saveTerrainSettings({ exaggeration: -2 });
    assert.equal(loadTerrainSettings().exaggeration, 0);
    localStorage.setItem('wayslice-terrain', '{not json');
    assert.equal(loadTerrainSettings().providerId, DEFAULT_TERRAIN_PROVIDER_ID);
    localStorage.removeItem('wayslice-terrain');
  });

  test('a stale saved provider id falls back to the default', () => {
    localStorage.setItem('wayslice-terrain', JSON.stringify({ providerId: 'not-a-provider' }));
    assert.equal(getTerrainProviderId(), DEFAULT_TERRAIN_PROVIDER_ID);
    localStorage.removeItem('wayslice-terrain');
  });
});

/* Terrain layer toggles (map-area buttons) ----------------------------------- */

/** Restores the module singletons' state: defaults in storage AND in the
 * terrain module's memory (its settings snapshot only refreshes through the
 * save paths), view mode back to 2D, storage left empty for later suites. */
function resetTerrainState() {
  localStorage.removeItem('wayslice-terrain');
  setTerrainEnabled(false, '2d');
  updateTerrainSettings({ layers: { hillshade: false, contours: true } });
  localStorage.removeItem('wayslice-terrain');
}

suite('terrain layer toggles / shared state', () => {
  test('defaults: contours on, hillshade off — a toggle flips the shared pair and persists', () => {
    resetTerrainState();
    try {
      assert.equal(terrainLayerEnabled('contours'), true, 'default: contours on');
      assert.equal(terrainLayerEnabled('hillshade'), false, 'default: hillshade off');
      toggleTerrainLayer('hillshade');
      assert.equal(terrainLayerEnabled('hillshade'), true, 'flipped');
      assert.equal(terrainLayerEnabled('contours'), true, 'sibling untouched');
      const stored = JSON.parse(localStorage.getItem('wayslice-terrain'));
      assert.equal(stored.layers.hillshade, true, 'persisted under the shared entry');
      assert.equal(stored.layers.contours, true, 'sibling persisted untouched');
    } finally {
      resetTerrainState();
    }
  });

  test('the pair is shared across view modes — a mode flip never swaps it', () => {
    resetTerrainState();
    try {
      toggleTerrainLayer('hillshade');
      setTerrainEnabled(true, '3d');
      assert.equal(terrainLayerEnabled('hillshade'), true, '3D reads the same pair');
      assert.equal(terrainLayerEnabled('contours'), true);
      toggleTerrainLayer('contours');
      assert.equal(terrainLayerEnabled('contours'), false, '3D contour toggled off');
      setTerrainEnabled(false, '2d');
      assert.equal(terrainLayerEnabled('hillshade'), true, 'back in 2D: the 3D toggle carried over');
      assert.equal(terrainLayerEnabled('contours'), false, '2D reads the same pair');
      const stored = JSON.parse(localStorage.getItem('wayslice-terrain'));
      assert.deepEqual(stored.layers, { hillshade: true, contours: false }, 'one persisted pair, no per-mode entries');
    } finally {
      resetTerrainState();
    }
  });

  test('toggleTerrainLayer rejects unknown layers', () => {
    resetTerrainState();
    assert.throws(() => toggleTerrainLayer('exaggeration'));
    assert.throws(() => toggleTerrainLayer('mesh'));
    resetTerrainState();
  });
});

/* Contour configuration ------------------------------------------------------ */

suite('contour config / interval tables', () => {
  test('metric and imperial are two independent literal configurations', () => {
    assert.deepEqual(Object.keys(CONTOUR_CONFIG).sort(), ['imperial', 'metric']);
    assert.truthy(CONTOUR_CONFIG.metric !== CONTOUR_CONFIG.imperial, 'separate config objects');
    assert.truthy(CONTOUR_CONFIG.metric.thresholds !== CONTOUR_CONFIG.imperial.thresholds, 'separate interval tables — never one derived from the other');
    assert.equal(CONTOUR_CONFIG.metric.multiplier, 1, 'metric isolines on meter elevations');
    assert.closeTo(CONTOUR_CONFIG.imperial.multiplier, 1 / METERS_PER_FOOT, 1e-12, 'imperial scales meters to feet BEFORE isolines are extracted');
    assert.truthy(Number.isFinite(CONTOUR_SOURCE_MAXZOOM) && CONTOUR_SOURCE_MAXZOOM > 12, 'contour tiles generate past the DEM native zoom');
  });

  test('both view modes carry their own tables, structurally parallel across unit systems', () => {
    assert.deepEqual(CONTOUR_MODES, ['2d', '3d']);
    for (const units of ['metric', 'imperial']) {
      assert.deepEqual(Object.keys(CONTOUR_CONFIG[units].thresholds), ['2d', '3d'], `${units}: one table per view mode`);
      for (const viewMode of CONTOUR_MODES) {
        assert.deepEqual(
          Object.keys(CONTOUR_CONFIG.metric.thresholds[viewMode]),
          Object.keys(CONTOUR_CONFIG.imperial.thresholds[viewMode]),
          `${viewMode}: both unit systems stay structurally parallel (one zoom key each)`,
        );
      }
    }
  });

  test('all four range tables span standard topo values: whole tens, candidate endpoints, refining on zoom-in', () => {
    // Since the rework spec the thresholds literals are RECOMMENDED RANGES
    // [lo, hi] per zoom band — endpoints must come from the same topo
    // ladders the selection snaps into (they are the range's own bounds).
    const allowed = {
      metric: new Set(METRIC_CONTOUR_INTERVALS),
      imperial: new Set(IMPERIAL_CONTOUR_INTERVALS),
    };
    for (const units of ['metric', 'imperial']) {
      for (const viewMode of CONTOUR_MODES) {
        const table = CONTOUR_CONFIG[units].thresholds[viewMode];
        const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
        assert.equal(keys[0], 0, `${units} ${viewMode}: a key-0 entry covers every zoom below the first threshold`);
        let prev = null;
        for (const z of keys) {
          const [lo, hi] = table[z];
          assert.truthy(allowed[units].has(lo) && allowed[units].has(hi), `${units} ${viewMode} z${z}: standard topo range endpoints only`);
          assert.truthy(lo % 10 === 0 && hi % 10 === 0, `${units} ${viewMode} z${z}: whole tens — no conversion artifacts like 164 or 328`);
          assert.truthy(lo < hi, `${units} ${viewMode} z${z}: a real span, lo below hi`);
          if (prev) {
            // Both endpoints stay monotonic on every key crossing — the
            // bands refine on zoom-in, most importantly at the z15→z16
            // tile-generation boundary (all tables repeat their z15 range
            // there, so only a future hand-edit could break it).
            assert.truthy(lo <= prev[0] && hi <= prev[1], `${units} ${viewMode} z${z}: never coarser than the band below — the LOD ladder must not step backwards at a tile-generation boundary`);
          }
          prev = [lo, hi];
        }
      }
    }
  });

  test('the tables match the zoom bands: hand-tuned per mode and unit system', () => {
    // All four tables hand-tuned, latest user pass 2026-10-04 (full-set
    // customization, imperial 2D z10 re-tuned the same evening): the metric
    // 2D table keeps a 100 m range floor to z13 and the 20 m floor covers
    // z14–16; the metric 3D table floors at 50 m from its overview band on.
    // The imperial 2D table spans to a 2000 ft ceiling through its
    // mid-zooms (z10–13) before tightening to [100, 500] ft at z14; the
    // imperial 3D table floors at the 100 ft range everywhere. There is no
    // fixed finer/coarser ordering between the modes. All tables repeat
    // their z15 range at z16.
    const specs = {
      metric: {
        '2d': { 0: [500, 1000], 10: [100, 1000], 11: [100, 500], 12: [100, 500], 13: [100, 500], 14: [20, 100], 15: [20, 100], 16: [20, 100] },
        '3d': { 0: [50, 1000], 10: [50, 1000], 11: [50, 1000], 12: [50, 500], 13: [50, 100], 14: [50, 100], 15: [50, 100], 16: [50, 100] },
      },
      imperial: {
        '2d': { 0: [1000, 2000], 10: [500, 2000], 11: [500, 2000], 12: [500, 2000], 13: [500, 2000], 14: [100, 500], 15: [100, 500], 16: [100, 500] },
        '3d': { 0: [100, 2000], 10: [100, 1000], 11: [100, 1000], 12: [100, 1000], 13: [100, 200], 14: [100, 200], 15: [100, 200], 16: [100, 200] },
      },
    };
    for (const [units, modes] of Object.entries(specs)) {
      for (const [viewMode, spec] of Object.entries(modes)) {
        assert.deepEqual(CONTOUR_CONFIG[units].thresholds[viewMode], spec, `${units} ${viewMode} table`);
      }
    }
  });

  test('contour tiles generate deep enough for the deepest interval band', () => {
    // The z16 thresholds only take effect on tiles GENERATED at z16 — with
    // a z15 source the deepest band would be dead code (z16+ viewports
    // render upscaled z15 tiles, keyed at 15).
    assert.equal(CONTOUR_SOURCE_MAXZOOM, 16);
  });

  test('the unit system + view mode pick their own generation params for the contour protocol URL', () => {
    const metric3d = contourTileParams('metric', '3d');
    assert.equal(metric3d.multiplier, 1);
    assert.deepEqual(metric3d.thresholds, buildContourThresholds('metric', '3d'), 'params carry the built table, not the range literals');
    assert.truthy(metric3d.thresholds !== CONTOUR_CONFIG.metric.thresholds['3d'], 'a fresh object — the config literals are never exposed');
    assert.equal(metric3d.elevationKey, 'ele');
    assert.equal(metric3d.levelKey, 'level');
    assert.equal(metric3d.contourLayer, 'contours');
    assert.equal(metric3d.overzoom, 1, 'the official example\'s overzoom smoothing');
    assert.equal(metric3d.buffer, 1, 'generation buffer against tile seams');
    const imperial2d = contourTileParams('imperial', '2d');
    assert.closeTo(imperial2d.multiplier, 1 / METERS_PER_FOOT, 1e-12);
    assert.deepEqual(imperial2d.thresholds, buildContourThresholds('imperial', '2d'));
    assert.truthy(
      contourTileParams('metric', '2d').thresholds !== contourTileParams('metric', '3d').thresholds,
      'a mode flip picks a different interval table',
    );
  });

  test('contourTileParams rejects an unknown unit system, view mode or bias', () => {
    assert.throws(() => contourTileParams('nautical', '3d'));
    assert.throws(() => contourTileParams('metric', '4d'));
    assert.throws(() => contourTileParams('metric'), 'the view mode is not optional — a silent default would mask bugs');
    assert.throws(() => contourTileParams('metric', '3d', NaN), 'a non-finite bias must fail loud, not silently steer the ladder');
    assert.throws(() => contourTileParams('metric', '3d', Infinity));
  });

  test('the unit systems put their isolines where their labels read round', () => {
    // The 100 m contour sits at 100 m of real elevation; the 100 ft contour
    // at 30.48 m — the scaled elevation the isoline extraction reads — so
    // both label as round numbers in their own unit. A 328 ft "conversion
    // label" cannot exist: imperial tiles carry foot elevations only.
    assert.equal(100 * CONTOUR_CONFIG.metric.multiplier, 100);
    assert.closeTo(30.48 * CONTOUR_CONFIG.imperial.multiplier, 100, 1e-9);
  });

  test('contour labels follow each system\'s paper-map convention: metric bare, imperial feet prime', () => {
    // USGS-style sheets flag feet with a prime (3300'); metric topo labels
    // are bare elevation numbers. Language plays no part — a carried 米
    // would rotate sideways along the line (MapLibre line placement rotates
    // every glyph; upright-CJK vertical writing is point-placement-only in
    // the vendored 6.13.0).
    const bare = ['to-string', ['round', ['get', 'ele']]];
    assert.deepEqual(contourLabelField('metric'), bare);
    assert.deepEqual(contourLabelField('imperial'), ['concat', bare, "'"]);
  });

  test('unit labels follow the packs: zh-CN 米/英尺, zh-TW 公尺/英尺, others m/ft', async () => {
    const expect = { 'zh-CN': ['米', '英尺'], 'zh-TW': ['公尺', '英尺'] };
    for (const { code } of language.getLanguages()) {
      await language.setLanguage(code);
      const [m, ft] = expect[code] ?? ['m', 'ft'];
      assert.equal(language.t('unitM'), m, `unitM in ${code}`);
      assert.equal(language.t('unitFt'), ft, `unitFt in ${code}`);
    }
    await language.setLanguage('en');
  });

  test('the contour label is language-independent: bare metric / primed imperial in every pack', async () => {
    // The unit suffix left the language packs entirely (2026-10-07 ruling):
    // every UI language labels metric contours bare and imperial contours
    // with the USGS feet prime.
    const bare = ['to-string', ['round', ['get', 'ele']]];
    for (const { code } of language.getLanguages()) {
      await language.setLanguage(code);
      assert.deepEqual(contourLabelField('metric'), bare, `bare metric label in ${code}`);
      assert.deepEqual(contourLabelField('imperial'), ['concat', bare, "'"], `primed imperial label in ${code}`);
    }
    await language.setLanguage('en');
  });

  test('the inline glyph server is keyless and serves the label fontstack', () => {
    // The inline styles' symbol layers (terrain-contour-labels) load glyphs
    // from here — it must stay keyless and addressable per fontstack/range.
    assert.truthy(MAP_GLYPHS_URL.startsWith('https://'), 'https glyphs');
    assert.truthy(MAP_GLYPHS_URL.includes('{fontstack}/{range}'), 'glyph template');
    assert.truthy(!/[?&](key|apikey|api_key|token|access_token)=/i.test(MAP_GLYPHS_URL), 'keyless glyphs');
    assert.truthy(MAP_GLYPHS_URL.includes('openfreemap.org'), 'the OpenFreeMap font host');
  });
});

/* Dynamic contour interval selection */

/** Viewport stats fixture: mean elevation, elevation range (m), relief per
 * km of viewport width (m/km), map zoom. The scenario numbers are
 * representative SRTM/Copernicus-scale figures for the named regions. */
function viewportStats(meanElevation, elevationRange, reliefPerKm, zoom = 13) {
  return {
    meanElevation,
    minElevation: meanElevation - elevationRange / 2,
    maxElevation: meanElevation + elevationRange / 2,
    elevationRange,
    reliefPerKm,
    zoom,
    mode: '2d',
  };
}

suite('contour base range / band lookup', () => {
  test('the greatest zoom key <= zoom wins, key 0 covers everything below', () => {
    assert.deepEqual(contourBaseRange('metric', '2d', 16), [20, 100]);
    assert.deepEqual(contourBaseRange('metric', '2d', 14), [20, 100]);
    assert.deepEqual(contourBaseRange('metric', '2d', 13.9), [100, 500]);
    assert.deepEqual(contourBaseRange('metric', '2d', 10), [100, 1000]);
    assert.deepEqual(contourBaseRange('metric', '2d', 3), [500, 1000], 'below the first key: the key-0 range');
    assert.deepEqual(contourBaseRange('imperial', '3d', 15), [100, 200]);
    assert.deepEqual(contourBaseRange('metric', '3d', 0), [50, 1000]);
  });

  test('rejects unknown axes and a non-finite zoom', () => {
    assert.throws(() => contourBaseRange('nautical', '2d', 12));
    assert.throws(() => contourBaseRange('metric', '4d', 12));
    assert.throws(() => contourBaseRange('metric', '2d', NaN));
  });
});

suite('contour candidates / log-nearest snap', () => {
  test('the two candidate ladders are pinned literals, frozen', () => {
    // Metric floors at 20 m by the 2026-10-07 second user decision (the
    // day went 10 -> 50 -> 20; the 10 m rung stays retired — under the
    // ±0.7 bias clamp no band target ever reached it).
    assert.deepEqual([...METRIC_CONTOUR_INTERVALS], [20, 50, 100, 200, 500, 1000]);
    assert.deepEqual([...IMPERIAL_CONTOUR_INTERVALS], [50, 100, 200, 500, 1000, 2000]);
    assert.truthy(Object.isFrozen(METRIC_CONTOUR_INTERVALS) && Object.isFrozen(IMPERIAL_CONTOUR_INTERVALS), 'the allowed set is not editable at runtime');
    assert.equal(CONTOUR_SNAP_HYSTERESIS, 0.1, 'the anti-flap margin lives in one constant');
  });

  test('snaps by log distance — proportion, not absolute difference', () => {
    // The spec's own example: target 70 sits exactly on the sqrt(50 x 100)
    // boundary — a tie, resolved to the finer candidate.
    assert.equal(snapContourInterval(70, 'metric'), 50);
    // 71.5 is proportionally closer to 100 although its absolute distance
    // to 50 is smaller (21.5 vs 28.5) — the reason the snap is logarithmic.
    assert.equal(snapContourInterval(71.5, 'metric'), 100);
    assert.equal(snapContourInterval(30, 'imperial'), 50);
    assert.equal(snapContourInterval(70, 'imperial'), 50, 'the 50/100 ft tie also resolves finer');
    assert.equal(snapContourInterval(300, 'metric'), 200);
    assert.equal(snapContourInterval(700, 'imperial'), 500, 'proportionally closer to 500 than 1000');
  });

  test('targets outside the ladder clamp to its ends, the snap is monotone', () => {
    assert.equal(snapContourInterval(3, 'metric'), 20, 'the 20 m ladder floor (2026-10-07 second user decision)');
    assert.equal(snapContourInterval(5000, 'metric'), 1000);
    assert.equal(snapContourInterval(3000, 'imperial'), 2000);
    let prev = 0;
    for (let t = 5; t <= 2000; t += 0.5) {
      const snapped = snapContourInterval(t, 'metric');
      assert.truthy(snapped >= prev, `monotone at target ${t}`);
      prev = snapped;
    }
  });

  test('hysteresis: the applied interval survives a near-boundary move, yields on a decisive one', () => {
    // Target 70: pure snap says 50, but the applied 100 is within the
    // margin — it sticks (a parked viewport must not flip-flop tiles).
    assert.equal(snapContourInterval(70, 'metric', 100), 100);
    assert.equal(snapContourInterval(70, 'metric', 50), 50, 'current == winner: trivially kept');
    // Target 60: 100 is now decisively farther — the winner takes over.
    assert.equal(snapContourInterval(60, 'metric', 100), 50);
    // An applied value off the ladder cannot be sticky (foreign-unit guard).
    assert.equal(snapContourInterval(70, 'metric', 250), 50);
  });

  test('rejects unknown unit systems and invalid targets', () => {
    assert.throws(() => snapContourInterval(100, 'nautical'));
    assert.throws(() => snapContourInterval(NaN, 'metric'));
    assert.throws(() => snapContourInterval(0, 'metric'));
    assert.throws(() => snapContourInterval(-5, 'metric'));
    assert.throws(() => snapContourInterval(Infinity, 'metric'));
  });
});

suite('contour thresholds build / LOD ladder', () => {
  test('the neutral build (bias 0) is the snapped geometric median of every band', () => {
    assert.deepEqual(buildContourThresholds('metric', '2d'), {
      0: [500, 1000], 10: [200, 2000], 11: [200, 1000], 12: [200, 1000], 13: [200, 1000],
      14: [50, 250], 15: [50, 250], 16: [50, 250],
    }, 'metric 2D neutral ladder');
    assert.deepEqual(buildContourThresholds('metric', '3d'), {
      0: [200, 4000], 10: [200, 4000], 11: [200, 4000], 12: [200, 2000],
      13: [50, 100], 14: [50, 100], 15: [50, 100], 16: [50, 100],
    }, 'metric 3D neutral ladder (the [50,100] bands reproduce the old literal pair)');
    assert.deepEqual(buildContourThresholds('imperial', '2d'), {
      0: [1000, 2000], 10: [1000, 4000], 11: [1000, 4000], 12: [1000, 4000], 13: [1000, 4000],
      14: [200, 1000], 15: [200, 1000], 16: [200, 1000],
    }, 'imperial 2D neutral ladder');
    assert.deepEqual(buildContourThresholds('imperial', '3d'), {
      0: [500, 10000], 10: [200, 2000], 11: [200, 2000], 12: [200, 2000],
      13: [100, 200], 14: [100, 200], 15: [100, 200], 16: [100, 200],
    }, 'imperial 3D neutral ladder');
  });

  test('each band keeps its hand-tuned index ratio: major = minor x hi/lo', () => {
    for (const units of ['metric', 'imperial']) {
      for (const viewMode of CONTOUR_MODES) {
        const ranges = CONTOUR_CONFIG[units].thresholds[viewMode];
        for (const bias of [0, -0.515, 0.7]) {
          const table = buildContourThresholds(units, viewMode, bias);
          for (const [key, [lo, hi]] of Object.entries(ranges)) {
            const [minor, major] = table[key];
            assert.closeTo(major / minor, hi / lo, 1e-9, `${units} ${viewMode} z${key} bias ${bias}: index cadence preserved`);
          }
        }
      }
    }
  });

  test('a terrain-biased build shifts the whole ladder within the candidate set', () => {
    // 梧桐山-class bias (see the scenario suite): the deep bands refine to
    // their range floors, the already-coarse overview barely moves.
    const rugged = buildContourThresholds('metric', '2d', -0.515);
    assert.deepEqual(rugged[13], [100, 500], 'mid-zoom band drops to the range floor (its own 5x index)');
    assert.deepEqual(rugged[14], [20, 100], 'deep band drops to the range floor');
    assert.deepEqual(rugged[0], [500, 1000], 'overview band stays put (its range is coarse already)');
    // 高原腹地-class bias: every band coarsens.
    const plateau = buildContourThresholds('metric', '2d', 0.7);
    assert.deepEqual(plateau[13], [500, 2500]);
    assert.deepEqual(plateau[14], [100, 500]);
    for (const table of [rugged, plateau]) {
      const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
      let prev = null;
      for (const z of keys) {
        const [minor, major] = table[z];
        assert.truthy(METRIC_CONTOUR_INTERVALS.includes(minor), `z${z}: minors come from the candidate ladder only`);
        assert.truthy(minor > 0 && major > minor && major % minor === 0, `z${z}: a sane [minor, major] pair`);
        if (prev) assert.truthy(minor <= prev, `z${z}: the ladder never steps backwards`);
        prev = minor;
      }
    }
  });

  test('a previous table rides the snap hysteresis band by band', () => {
    const neutral = buildContourThresholds('metric', '2d');
    // A whisker of bias: the cold build flips z10 to 500 (its neutral target
    // 316 sits almost exactly on the 200/500 boundary), the sticky build
    // keeps the applied 200 — the whole point of the margin.
    const cold = buildContourThresholds('metric', '2d', 0.03);
    const sticky = buildContourThresholds('metric', '2d', 0.03, neutral);
    assert.deepEqual(cold[10], [500, 5000], 'cold build snaps to the new winner');
    assert.deepEqual(sticky[10], [200, 2000], 'applied interval survives a non-decisive move');
    // A decisive bias takes over even with the previous table in hand.
    const decisive = buildContourThresholds('metric', '2d', 0.3, neutral);
    assert.deepEqual(decisive[10], [500, 5000]);
    // The previous table never leaks anywhere — cold builds stay deterministic.
    assert.deepEqual(buildContourThresholds('metric', '2d'), neutral);
  });

  test('buildContourThresholds validates like contourTileParams', () => {
    assert.throws(() => buildContourThresholds('nautical', '2d'));
    assert.throws(() => buildContourThresholds('metric', '4d'));
    assert.throws(() => buildContourThresholds('metric', '2d', NaN));
  });
});

suite('terrain log bias / config integrity (2026-10-07 rework spec)', () => {
  test('all thresholds are centralized in one frozen config with sane values', () => {
    const cfg = TERRAIN_CONTOUR_CONFIG;
    assert.deepEqual(Object.keys(cfg).sort(), ['adjustment', 'overviewZoomFloor', 'sampling']);
    const adj = cfg.adjustment;
    assert.equal(cfg.overviewZoomFloor, 10, 'overview zooms keep the neutral ladder');
    assert.equal(adj.maxAbsBias, 0.7, 'the terrain may shift the target about one ladder step');
    assert.truthy(adj.plateauElevation < adj.plateauCeiling, 'plateau knee below its ceiling');
    assert.truthy(adj.leverageFullRelief < adj.leverageVetoRelief, 'gentle band below the dissection veto');
    const anchors = adj.reliefAnchors;
    assert.equal(anchors[0][1], adj.maxAbsBias, 'the flattest anchor sits exactly at the cap');
    assert.equal(anchors.at(-1)[1], -adj.maxAbsBias, 'the most-dissected anchor sits exactly at the cap');
    for (let i = 1; i < anchors.length; i++) {
      assert.truthy(anchors[i][0] > anchors[i - 1][0], 'relief anchors ascend');
      assert.truthy(anchors[i][1] <= anchors[i - 1][1], 'more relief never means a coarser bias');
    }
    const s = cfg.sampling;
    assert.truthy(s.debounceMs >= 300, 'a settled view is sampled, not a flick');
    assert.truthy(s.maxTiles >= 4, 'sampling covers more than a corner');
    assert.truthy(s.minValidRatio > 0 && s.minValidRatio <= 1, 'valid-tile ratio is a fraction');
  });

  test('the bias is bounded and cliff-free across the stats plane', () => {
    const cap = TERRAIN_CONTOUR_CONFIG.adjustment.maxAbsBias;
    let prevRow = null;
    for (let mean = 0; mean <= 6000; mean += 100) {
      let prev = null;
      const row = [];
      for (let relief = 1; relief <= 600; relief += 5) {
        const bias = terrainLogBias(viewportStats(mean, relief * 8, relief, 13));
        assert.truthy(bias >= -cap && bias <= cap, `clamped at mean=${mean} relief=${relief}`);
        if (prev !== null) {
          assert.truthy(Math.abs(bias - prev) < 0.2, `no cliff along relief at mean=${mean} relief=${relief}`);
        }
        row.push(bias);
        prev = bias;
      }
      if (prevRow) {
        for (let i = 0; i < row.length; i++) {
          assert.truthy(Math.abs(row[i] - prevRow[i]) < 0.2, `no cliff along elevation at mean=${mean}`);
        }
      }
      prevRow = row;
    }
  });

  test('degenerate inputs fall back to 0 (never adapt on missing data)', () => {
    assert.equal(terrainLogBias(null), 0);
    assert.equal(terrainLogBias({}), 0);
    assert.equal(terrainLogBias({ meanElevation: NaN, reliefPerKm: 10, zoom: 13 }), 0);
    assert.equal(terrainLogBias({ meanElevation: 3000, reliefPerKm: undefined, zoom: 13 }), 0);
  });

  test('below the overview zoom floor the bias is always 0', () => {
    assert.equal(terrainLogBias(viewportStats(4750, 130, 12, 9.4)), 0, 'Tibet interior seen from z9.4');
    assert.equal(terrainLogBias(viewportStats(260, 920, 185, 8)), 0, '梧桐山 from the world view');
  });
});

suite('terrain log bias / scenario acceptance cases', () => {
  test('case A — ordinary hill country reads a negative (refining) bias', () => {
    assert.closeTo(terrainLogBias(viewportStats(260, 920, 185, 13.5)), -0.515, 0.01, '深圳梧桐山');
    assert.closeTo(terrainLogBias(viewportStats(850, 1500, 300, 13)), -0.55, 0.01, '黄山');
    assert.closeTo(terrainLogBias(viewportStats(700, 1300, 260, 13)), -0.54, 0.01, '泰山');
  });

  test('case B — gentle high plateaus read a positive (coarsening) bias', () => {
    assert.closeTo(terrainLogBias(viewportStats(1950, 260, 52, 12.5)), 0.257, 0.01, '滇中高原坝区');
    assert.closeTo(terrainLogBias(viewportStats(2750, 150, 50, 14)), 0.564, 0.01, '五台山台顶');
    assert.closeTo(terrainLogBias(viewportStats(2250, 220, 44, 12)), 0.455, 0.01, '威宁坝子');
    assert.closeTo(terrainLogBias(viewportStats(4750, 130, 12, 11)), 0.7, 0.01, '改则湖盆区 — at the cap');
    assert.closeTo(terrainLogBias(viewportStats(4600, 400, 33, 11)), 0.7, 0.01, '那曲盆谷 — at the cap');
  });

  test('case C — dissected high mountains: the elevation leverage is vetoed', () => {
    assert.closeTo(terrainLogBias(viewportStats(3200, 2200, 360, 12.5)), -0.589, 0.01, '阿尔卑斯 采尔马特');
    assert.closeTo(terrainLogBias(viewportStats(4200, 2400, 400, 12)), -0.612, 0.01, '喜马拉雅南坡');
    assert.closeTo(terrainLogBias(viewportStats(4400, 1900, 380, 12.5)), -0.601, 0.01, '横断山区');
    // The same dissection at low altitude reads the SAME bias — altitude
    // alone must never coarsen (the spec's core anti-pattern).
    assert.closeTo(
      terrainLogBias(viewportStats(500, 2200, 360, 12.5)),
      terrainLogBias(viewportStats(3200, 2200, 360, 12.5)),
      1e-12,
      'Zermatt-class relief at 500 m mean: identical',
    );
  });

  test('case D — plains reach the positive cap at any altitude', () => {
    assert.closeTo(terrainLogBias(viewportStats(30, 20, 2, 15)), 0.7, 0.01, '华北平原');
    assert.closeTo(terrainLogBias(viewportStats(300, 40, 4, 15)), 0.614, 0.01, 'coastal flat (relief 4: between the 2 and 10 anchors)');
  });

  test('the bias ignores the view mode — same ground in 2D and 3D', () => {
    const flat = viewportStats(2750, 150, 50, 14);
    assert.equal(terrainLogBias({ ...flat, mode: '3d' }), terrainLogBias(flat), '五台山台顶 in both modes');
  });
});

suite('selectContourInterval / spec pipeline (§6 API)', () => {
  test('case A — ordinary hill country keeps the fine end (20/50/100 m class; the 20 m floor is the 2026-10-07 second user decision)', () => {
    const wutong = viewportStats(260, 920, 185, 13.5);
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 13.5, terrainStats: wutong }), 100, '梧桐山 mid-zoom');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 15, terrainStats: { ...wutong, zoom: 15 } }), 20, '梧桐山 deep zoom');
    const huangshan = viewportStats(850, 1500, 300, 13);
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 13, terrainStats: huangshan }), 100);
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 15, terrainStats: { ...huangshan, zoom: 15 } }), 20);
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 13, terrainStats: viewportStats(700, 1300, 260, 13) }), 100, '泰山');
  });

  test('case B — gentle plateaus naturally take 100/200/500 m class intervals', () => {
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 12.5, terrainStats: viewportStats(1950, 260, 52, 12.5) }), 200, '滇中高原坝区');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 14, terrainStats: viewportStats(2750, 150, 50, 14) }), 100, '五台山台顶');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 12, terrainStats: viewportStats(2250, 220, 44, 12) }), 500, '威宁坝子');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 11, terrainStats: viewportStats(4750, 130, 12, 11) }), 500, '改则湖盆区');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 11, terrainStats: viewportStats(4600, 400, 33, 11) }), 500, '那曲盆谷');
  });

  test('case C — dissected high mountains return to fine intervals despite the altitude', () => {
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 12.5, terrainStats: viewportStats(3200, 2200, 360, 12.5) }), 100, '采尔马特 mid-zoom');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 15, terrainStats: viewportStats(3200, 2200, 360, 15) }), 20, '采尔马特 deep zoom');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 12, terrainStats: viewportStats(4200, 2400, 400, 12) }), 100, '喜马拉雅南坡');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 12.5, terrainStats: viewportStats(4400, 1900, 380, 12.5) }), 100, '横断山区');
  });

  test('case D — plains do not fill with hairlines at deep zoom', () => {
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 15, terrainStats: viewportStats(30, 20, 2, 15) }), 100, 'the coarse end of the deep band');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 13, terrainStats: viewportStats(30, 20, 2, 13) }), 500);
  });

  test('case E — the unit systems pick from their own ladders; the multiplier converts the final pair', () => {
    const wutong = viewportStats(260, 920, 185, 13.5);
    const dianzhong = viewportStats(1950, 260, 52, 12.5);
    assert.equal(selectContourInterval({ unit: 'imperial', mode: '2d', zoom: 13.5, terrainStats: wutong }), 500, '梧桐山 in feet');
    assert.equal(selectContourInterval({ unit: 'imperial', mode: '2d', zoom: 12.5, terrainStats: dianzhong }), 1000, '滇中 in feet');
    assert.equal(selectContourInterval({ unit: 'imperial', mode: '2d', zoom: 14, terrainStats: viewportStats(2750, 150, 50, 14) }), 500, '五台山 in feet');
    assert.equal(selectContourInterval({ unit: 'imperial', mode: '2d', zoom: 11, terrainStats: viewportStats(4750, 130, 12, 11) }), 2000, '改则 in feet');
    // The display-unit selection flows through the untouched multiplier:
    // the deep imperial band's 200 ft minor = 60.96 m of DEM elevation.
    assert.closeTo(200 * METERS_PER_FOOT, 60.96, 1e-9, 'the deep band\'s 200 ft minor = 60.96 m of real elevation');
    assert.closeTo(30.48 * CONTOUR_CONFIG.imperial.multiplier, 100, 1e-9, 'the unit seam itself is unchanged (30.48 m scales to the 100 ft isoline)');
  });

  test('neutral / degenerate / overview-floor views keep the neutral ladder', () => {
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 13.5, terrainStats: viewportStats(100, 480, 60, 13.5) }), 200, 'reference hill country: the geometric median');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 15, terrainStats: viewportStats(100, 480, 60, 15) }), 50);
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 14, terrainStats: null }), 50, 'no stats yet: neutral');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 9.5, terrainStats: viewportStats(4750, 130, 12, 9.5) }), 500, 'below the overview floor: the key-0 neutral value');
  });

  test('the modes stay independent: same stats, different ladders', () => {
    const everest = viewportStats(4200, 2400, 400, 15);
    assert.equal(selectContourInterval({ unit: 'metric', mode: '2d', zoom: 15, terrainStats: everest }), 20, '2D deep band [20,100]');
    assert.equal(selectContourInterval({ unit: 'metric', mode: '3d', zoom: 15, terrainStats: everest }), 50, '3D deep band [50,100] floors at 50');
  });

  test('selectContourInterval agrees with the built table on every zoom key', () => {
    const cases = [null, viewportStats(260, 920, 185, 13.5), viewportStats(4750, 130, 12, 11), viewportStats(30, 20, 2, 15)];
    for (const stats of cases) {
      const bias = terrainLogBias(stats);
      for (const unit of ['metric', 'imperial']) {
        for (const viewMode of CONTOUR_MODES) {
          const table = buildContourThresholds(unit, viewMode, bias);
          for (const key of Object.keys(table)) {
            assert.equal(
              selectContourInterval({ unit, mode: viewMode, zoom: Number(key), terrainStats: stats }),
              table[key][0],
              `${unit} ${viewMode} key ${key} (bias ${bias.toFixed(3)}): the spec entry point and the built table never disagree`,
            );
          }
        }
      }
    }
  });

  test('terrain.js exposes the live adaptation (bias 0 / table null before any map)', () => {
    const adaptation = getContourAdaptation();
    assert.equal(adaptation.bias, 0, 'neutral ladder before the first DEM sample');
    assert.isNull(adaptation.table);
    assert.isNull(getTerrainStats());
  });
});
suite('terrain sampling / viewport tile plan', () => {
  test('a city-scale viewport samples native z12 tiles', () => {
    const plan = planViewportTiles({ west: 114.10, east: 114.24, south: 22.55, north: 22.64 }, 12);
    assert.equal(plan.zoom, 12, '梧桐山-scale window fits at the native DEM zoom');
    assert.truthy(plan.tiles.length >= 1 && plan.tiles.length <= TERRAIN_CONTOUR_CONFIG.sampling.maxTiles);
    assert.truthy(plan.tiles.every((t) => t.z === plan.zoom), 'one sampling zoom per pass');
  });

  test('a regional window descends the ladder before exceeding the tile cap', () => {
    // ~100 km × 66 km around 滇中: more than the cap's worth of z12 tiles,
    // so the plan descends at least one step and stays within the cap.
    // (Mirrors the slippy-map tile math to count the native set independently.)
    const view = { west: 102.5, east: 103.5, south: 25.0, north: 25.6 };
    const countAt = (z) => {
      const n = 1 << z;
      const tx = (lng) => Math.floor(((lng + 180) / 360) * n);
      const ty = (lat) => {
        const s = Math.sin((lat * Math.PI) / 180);
        return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
      };
      return (tx(view.east) - tx(view.west) + 1) * (ty(view.south) - ty(view.north) + 1);
    };
    assert.truthy(countAt(12) > TERRAIN_CONTOUR_CONFIG.sampling.maxTiles, 'precondition: the native z12 set exceeds the cap');
    const plan = planViewportTiles(view, 12);
    assert.truthy(plan.zoom < 12, 'descended below the native DEM zoom');
    assert.truthy(plan.zoom >= TERRAIN_CONTOUR_CONFIG.overviewZoomFloor, 'never below the floor');
    assert.truthy(plan.tiles.length <= TERRAIN_CONTOUR_CONFIG.sampling.maxTiles);
    assert.truthy(plan.tiles.every((t) => t.z === plan.zoom), 'one sampling zoom per pass');
    assert.truthy(new Set(plan.tiles.map((t) => `${t.x}:${t.y}`)).size === plan.tiles.length, 'no duplicate tiles');
  });

  test('an outsized window strides the floor zoom into an even subset', () => {
    // ~900 km across: nothing under the floor fits, so the floor zoom strides.
    const plan = planViewportTiles({ west: 85, east: 95, south: 30, north: 38 }, 12);
    assert.equal(plan.zoom, TERRAIN_CONTOUR_CONFIG.overviewZoomFloor);
    assert.truthy(plan.tiles.length <= TERRAIN_CONTOUR_CONFIG.sampling.maxTiles, 'strided subset within the cap');
    const xs = [...new Set(plan.tiles.map((t) => t.x))];
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b), 'columns ascend in even strides');
    const ys = [...new Set(plan.tiles.map((t) => t.y))];
    assert.deepEqual(ys, [...ys].sort((a, b) => a - b), 'rows ascend in even strides');
  });

  test('antimeridian-crossing bounds are refused, not misplanned', () => {
    assert.isNull(planViewportTiles({ west: 170, east: -170, south: 60, north: 70 }, 12));
    assert.isNull(planViewportTiles({ west: 10, east: 9, south: 40, north: 45 }, 12));
  });
});

suite('contour protocol URL params / shape', () => {
  test('the built thresholds are plain numeric pairs under the table\'s own keys', () => {
    for (const units of ['metric', 'imperial']) {
      for (const viewMode of CONTOUR_MODES) {
        const params = contourTileParams(units, viewMode, -0.4);
        assert.deepEqual(
          Object.keys(params.thresholds).map(Number).sort((a, b) => a - b),
          Object.keys(CONTOUR_CONFIG[units].thresholds[viewMode]).map(Number).sort((a, b) => a - b),
          `${units} ${viewMode}: one entry per zoom key`,
        );
        for (const pair of Object.values(params.thresholds)) {
          assert.truthy(pair.length === 2 && pair.every((v) => Number.isFinite(v)), 'a URL-encodable numeric pair');
        }
        // The protocol URL encoder stringifies exactly this shape.
        assert.deepEqual(JSON.parse(JSON.stringify(params.thresholds)), params.thresholds, 'JSON round-trips');
      }
    }
  });
});

/* View mode manager ----------------------------------------------------------- */

/** A map double with camera state, eased/jumped history and event capture. */
function stubMap() {
  const state = { center: { lng: 10, lat: 40 }, zoom: 12, bearing: 0, pitch: 0, dragRotate: false, touchPitch: false };
  const calls = { easeTo: [], jumpTo: [], terrain: [] };
  const listeners = {};
  const apply = (o) => {
    if ('center' in o) state.center = { ...o.center };
    if ('zoom' in o) state.zoom = o.zoom;
    if ('bearing' in o) state.bearing = o.bearing;
    if ('pitch' in o) state.pitch = o.pitch;
  };
  return {
    state,
    calls,
    getCenter: () => ({ ...state.center }),
    getZoom: () => state.zoom,
    getBearing: () => state.bearing,
    getPitch: () => state.pitch,
    getLayer: () => null,
    queryRenderedFeatures: () => [],
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    once: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    easeTo: (o) => { calls.easeTo.push(o); apply(o); },
    jumpTo: (o) => { calls.jumpTo.push(o); apply(o); },
    dragRotate: { enable: () => { state.dragRotate = true; }, disable: () => { state.dragRotate = false; } },
    touchPitch: { enable: () => { state.touchPitch = true; }, disable: () => { state.touchPitch = false; } },
    fire: (ev, arg = {}) => {
      for (const fn of listeners[ev] || []) fn(arg);
    },
  };
}

function makeManager(mapStub, overrides = {}) {
  return createViewModeManager({
    getMap: () => mapStub,
    setTerrainEnabled: (on3d) => mapStub.calls.terrain.push(on3d),
    onModeChange: () => {},
    isTouch: () => false,
    prefersReducedMotion: () => false,
    ...overrides,
  });
}

suite('view mode / state machine', () => {
  test('default mode is 2D with terrain untouched', () => {
    const map = stubMap();
    const manager = makeManager(map);
    assert.equal(manager.getMode(), '2d');
    assert.deepEqual(map.calls.terrain, []);
  });

  test('2D → 3D: terrain on immediately, eased pitch, center/zoom/bearing kept, rotation opens', () => {
    const map = stubMap();
    map.state.bearing = 27;
    const manager = makeManager(map);
    manager.enter3D();
    assert.equal(manager.getMode(), '3d');
    assert.deepEqual(map.calls.terrain, [true]);
    assert.equal(map.state.pitch, DEFAULT_3D_PITCH);
    assert.truthy(DEFAULT_3D_PITCH >= 50 && DEFAULT_3D_PITCH <= 65, 'spec pitch band');
    assert.equal(map.state.bearing, 27, 'bearing never forced');
    assert.equal(map.state.center.lng, 10, 'center kept');
    assert.equal(map.state.zoom, 12, 'zoom kept (no fitBounds)');
    assert.equal(map.calls.easeTo.length, 1);
    assert.equal(map.calls.easeTo[0].duration > 0, true, 'smooth transition');
    assert.equal(map.state.dragRotate, true, '3D looks around');
    assert.equal(map.state.touchPitch, true);
  });

  test('3D → 2D: eased pitch/bearing to 0, terrain detaches at the ease end', async () => {
    const map = stubMap();
    const manager = makeManager(map);
    manager.enter3D({ animate: false });
    map.calls.terrain.length = 0;
    manager.enter2D();
    assert.equal(manager.getMode(), '2d');
    assert.deepEqual(map.calls.terrain, [], 'terrain still on while easing down');
    assert.equal(map.state.pitch, 0);
    assert.equal(map.state.bearing, 0, '2D is north-up again');
    assert.equal(map.state.zoom, 12, 'viewport not yanked');
    assert.equal(map.state.dragRotate, false, '2D stays flat north-up');
    map.fire('moveend');
    assert.deepEqual(map.calls.terrain, [false], 'DEM detaches after the ease');
  });

  test('animate: false jumps and detaches terrain in one step', () => {
    const map = stubMap();
    const manager = makeManager(map);
    manager.enter3D({ animate: false });
    map.calls.terrain.length = 0;
    manager.enter2D({ animate: false });
    assert.deepEqual(map.calls.terrain, [false], 'immediate detach');
    assert.deepEqual(map.calls.easeTo, [], 'no easing');
  });

  test('flipping back mid-transition voids the pending terrain detach', () => {
    const map = stubMap();
    const manager = makeManager(map);
    manager.enter3D({ animate: false });
    manager.enter2D();
    manager.enter3D({ animate: false });
    map.fire('moveend'); // the stale 2D ease lands late
    assert.equal(manager.getMode(), '3d');
    // Both 3D entries enable terrain; the stale moveend must NOT have
    // detached it on the way out.
    assert.equal(map.calls.terrain.includes(false), false, 'never detached');
  });

  test('re-entering the current mode is a no-op', () => {
    const map = stubMap();
    const manager = makeManager(map);
    manager.enter2D();
    assert.deepEqual(map.calls.easeTo, []);
    assert.deepEqual(map.calls.terrain, []);
    manager.enter3D();
    map.calls.easeTo.length = 0;
    manager.enter3D();
    assert.deepEqual(map.calls.easeTo, []);
  });

  test('restoreCamera returns to the captured viewport', () => {
    const map = stubMap();
    map.state.zoom = 14;
    const manager = makeManager(map);
    manager.enter3D({ animate: false });
    map.state.zoom = 9;
    manager.restoreCamera({ animate: false });
    assert.equal(map.state.zoom, 14, 'restored the pre-switch zoom');
    assert.equal(manager.getSavedCamera().zoom, 14);
  });

  test('no map yet: mode changes are refused, state stays 2D', () => {
    const manager = createViewModeManager({
      getMap: () => null,
      setTerrainEnabled: () => {},
      isTouch: () => false,
      prefersReducedMotion: () => false,
    });
    assert.equal(manager.enter3D(), '2d');
    assert.equal(manager.getMode(), '2d');
  });
});

suite('view mode / right-click shortcut', () => {
  test('a click on the empty map toggles the mode', () => {
    const map = stubMap();
    const manager = makeManager(map);
    const handled = manager.handleContextmenu({
      point: { x: 5, y: 5 },
      originalEvent: { clientX: 5, clientY: 5, target: document.body },
    });
    assert.equal(handled, true);
    assert.equal(manager.getMode(), '3d');
  });

  test('a right-click on the track never toggles (feature context-menu seam)', () => {
    const map = stubMap();
    map.getLayer = () => ({});
    map.queryRenderedFeatures = () => [{}];
    const manager = makeManager(map);
    const handled = manager.handleContextmenu({
      point: { x: 5, y: 5 },
      originalEvent: { clientX: 5, clientY: 5, target: document.body },
    });
    assert.equal(handled, false);
    assert.equal(manager.getMode(), '2d');
  });

  test('a right-click on a marker never toggles', () => {
    const map = stubMap();
    const manager = makeManager(map);
    const marker = document.createElement('div');
    marker.className = 'maplibregl-marker';
    const pin = document.createElement('span');
    marker.appendChild(pin);
    const handled = manager.handleContextmenu({
      point: { x: 5, y: 5 },
      originalEvent: { clientX: 5, clientY: 5, target: pin },
    });
    assert.equal(handled, false);
    assert.equal(manager.getMode(), '2d');
  });

  test('a right-button DRAG is not a click', () => {
    const map = stubMap();
    const manager = makeManager(map);
    // wireMap records the press origin on the canvas container.
    const canvasContainer = document.createElement('div');
    map.getCanvasContainer = () => canvasContainer;
    manager.wireMap(map);
    canvasContainer.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: 10, clientY: 10 }));
    const dragged = manager.handleContextmenu({
      point: { x: 60, y: 10 },
      originalEvent: { clientX: 60, clientY: 10, target: document.body },
    });
    assert.equal(dragged, false, 'travelled far — not a click');
    assert.equal(manager.getMode(), '2d');
    // A fresh, stationary press-click goes through again.
    canvasContainer.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: 10, clientY: 10 }));
    const clicked = manager.handleContextmenu({
      point: { x: 12, y: 10 },
      originalEvent: { clientX: 12, clientY: 10, target: document.body },
    });
    assert.equal(clicked, true);
  });

  test('touch devices only ever switch through the buttons', () => {
    const map = stubMap();
    const manager = makeManager(map, { isTouch: () => true });
    const handled = manager.handleContextmenu({
      point: { x: 5, y: 5 },
      originalEvent: { clientX: 5, clientY: 5, target: document.body },
    });
    assert.equal(handled, false);
    assert.equal(manager.getMode(), '2d');
  });
});

/* i18n coverage --------------------------------------------------------------- */

suite('terrain / i18n coverage', () => {
  const KEYS = [
    'viewMode', 'view2D', 'view3D', 'switchTo2D', 'switchTo3D',
    'terrain', 'hillshade', 'contours', 'terrainExaggeration', 'terrainHint2d',
    'terrainLoading', 'terrainUnavailable', 'demUnavailable', 'srcMapterhornTerrain',
  ];

  test('every Terra key resolves in all nine languages (never the raw key)', async () => {
    for (const { code } of language.getLanguages()) {
      await language.setLanguage(code);
      for (const key of KEYS) {
        const text = language.t(key);
        assert.truthy(text && text !== key, `${key} unresolved in ${code}`);
      }
    }
    await language.setLanguage('en');
  });

  test('the 2D/3D labels stay the conventional symbols everywhere', async () => {
    for (const { code } of language.getLanguages()) {
      await language.setLanguage(code);
      assert.equal(language.t('view2D'), '2D', `view2D in ${code}`);
      assert.equal(language.t('view3D'), '3D', `view3D in ${code}`);
    }
    await language.setLanguage('en');
  });
});

/* Language hot-rewrite -------------------------------------------------------- */

/* The contour label no longer follows the language at all (unit-system
 * suffix ruling): language:changed re-localizes only the DEM note, and the
 * old hot-rewrite wiring (and its test) is gone. The label expression's
 * language-independence is pinned by the per-pack loop above; the live
 * units:changed rewrite is covered by local regression tooling. */

/* 3D sky ---------------------------------------------------------------------- */

suite('3D sky / themed gradient', () => {
  /** Runs `fn` with data-theme set to `theme`, restoring the prior value. */
  const withTheme = (theme, fn) => {
    const saved = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', theme);
    try { fn(); } finally {
      if (saved === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', saved);
    }
  };
  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  test('both themes carry the spec sky constants', () => {
    for (const [theme, sky, horizon] of [
      ['light', '#9ccaf0', '#fafbfd'],
      ['dark', '#0d1014', '#171a1f'],
    ]) {
      withTheme(theme, () => {
        assert.equal(token('--map-sky'), sky, `--map-sky in ${theme}`);
        assert.equal(token('--map-sky-horizon'), horizon, `--map-sky-horizon in ${theme}`);
      });
    }
  });

  test('skyConfig() follows the theme and blends toward the horizon at 0.4', () => {
    withTheme('dark', () => {
      assert.equal(skyConfig()['sky-color'], '#0d1014');
      assert.equal(skyConfig()['horizon-color'], '#171a1f');
    });
    withTheme('light', () => {
      assert.equal(skyConfig()['sky-color'], '#9ccaf0');
      assert.equal(skyConfig()['horizon-color'], '#fafbfd');
    });
    assert.equal(skyConfig()['sky-horizon-blend'], 0.4);
  });

  test('skyConfig() pins fog and atmosphere OFF (a defined sky otherwise arms white terrain fog above 60° pitch)', () => {
    const config = skyConfig();
    assert.equal(config['fog-color'], 'transparent');
    assert.equal(config['fog-ground-blend'], 1, 'the library own no-fog value');
    assert.equal(config['atmosphere-blend'], 0);
  });
});
