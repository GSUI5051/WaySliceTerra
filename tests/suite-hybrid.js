/** Hybrid road-network overlay tests (the symbol/label alignment pass and
 * the 2026-10-04 persistence alignment):
 * the state machine (satellite-gating, prune, the PERSISTED toggle whose
 * localStorage value is the truth), the hang/prune/restack map passes
 * against a stub, the eight-layer set with its per-layer symbol contracts
 * (tunnel ghost, shared width table, service/track/path dashes), the
 * bilingual label text-fields and the language hot-rewrite. The natural
 * landmark layers living at the stack's tail have their own suite
 * (suite-hybrid-natural.js); the state-machine passes here assert their
 * lifecycle rides along (sources, paint order, visibility, prune). */
import { suite, test, assert } from './runner.js';
import {
  createHybridOverlay, initHybrid,
  HYBRID_SOURCE_ID, HYBRID_TILE_URL, HYBRID_LAYERS, HYBRID_ALL_LAYERS,
  HYBRID_PARK_FILL_LAYER, HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER,
  ROAD_OVERLAY_STORAGE_KEY, NATURAL_OVERLAY_STORAGE_KEY,
  hybridSourceDef, hybridLayerDefs, hybridLabelTextField, parkLabelsLayerDef, placeLabelsLayerDef,
} from '../js/map/hybrid.js';
import { HYBRID_NATURAL_LAYERS } from '../js/map/hybrid-natural.js';
import * as language from '../js/language/language.js';
import '../js/language/langs.js';

/* Map stub -------------------------------------------------------------------- */

/** A MapLibre style double: records source/layer mutations and visibility,
 * answers getLayer/getSource, and replays moveLayer insertions so paint
 * order is assertable. */
function stubMap() {
  const sources = new Set();
  const layers = []; // ids in paint order
  const calls = { addSource: 0, addLayer: 0, removeSource: 0, removeLayer: 0, moveLayer: 0, addImage: 0 };
  const visibility = {};
  const defs = {};
  const images = new Set();
  const layoutCalls = [];
  return {
    calls,
    layers: () => [...layers],
    hasLayer: (id) => layers.includes(id),
    visibility,
    defs,
    layoutCalls,
    images,
    getSource: (id) => (sources.has(id) ? {} : null),
    addSource: (id) => { calls.addSource++; sources.add(id); },
    removeSource: (id) => { calls.removeSource++; sources.delete(id); },
    getLayer: (id) => (layers.includes(id) ? {} : null),
    addLayer: (def, beforeId) => {
      calls.addLayer++;
      defs[def.id] = def;
      layers.splice(beforeId ? layers.indexOf(beforeId) : layers.length, 0, def.id);
    },
    removeLayer: (id) => { calls.removeLayer++; layers.splice(layers.indexOf(id), 1); },
    moveLayer: (id, beforeId) => {
      calls.moveLayer++;
      layers.splice(layers.indexOf(id), 1);
      layers.splice(beforeId ? layers.indexOf(beforeId) : layers.length, 0, id);
    },
    hasImage: (name) => images.has(name),
    addImage: (name) => { calls.addImage++; images.add(name); },
    removeImage: (name) => { images.delete(name); },
    triggerRepaint: () => {},
    setLayoutProperty: (id, key, value) => {
      layoutCalls.push({ id, key, value });
      if (key === 'visibility') visibility[id] = value;
    },
  };
}

/** The terrain-module + track-vector stack a hung overlay sits under.
 * Zeroes the mutation counters afterwards, so tests count only what the
 * controller itself does to the stub. */
function withBaseStack(map) {
  map.addLayer({ id: 'basemap-layer', type: 'raster' });
  map.addLayer({ id: 'terrain-hillshade', type: 'hillshade' });
  map.addLayer({ id: 'terrain-contour-lines', type: 'line' });
  map.addLayer({ id: 'terrain-contour-labels', type: 'symbol' });
  map.addLayer({ id: 'track-casing', type: 'line' });
  map.addLayer({ id: 'track-line', type: 'line' });
  map.calls.addLayer = 0;
}

/** A controller whose deferred passes run synchronously (unit seam). The
 * persisted toggle starts every controller from the stored-off baseline —
 * the storage value is global to the page, so without the seed one test's
 * toggle would leak into the next. */
function makeController(isSatellite) {
  seedRoadOverlay('off');
  return createHybridOverlay({ isSatellite, defer: (fn) => fn() });
}

/* Expression helpers ------------------------------------------------------------ */

/** A layer def by id from one fresh defs build. */
const defById = (id, lang) => hybridLayerDefs(lang).find((d) => d.id === id);

/** A line-width interpolate's [zoom, value] stop pairs. */
const widthStops = (def) => {
  const expr = def.paint['line-width'];
  const stops = [];
  for (let i = 3; i < expr.length; i += 2) stops.push([expr[i], expr[i + 1]]);
  return stops;
};

/** A match expression's [label, output] pairs (the fallback excluded). */
const matchPairs = (expr) => {
  const pairs = [];
  for (let i = 2; i < expr.length - 1; i += 2) pairs.push([expr[i], expr[i + 1]]);
  return pairs;
};

const tunnelClause = JSON.stringify(['!=', ['get', 'brunnel'], 'tunnel']);

/* Layer-set guards ------------------------------------------------------------ */

suite('hybrid overlay / layer set', () => {
  test('exactly ten layers over one source, in paint order', () => {
    assert.deepEqual(HYBRID_LAYERS, [
      'hybrid-park-fill',
      'hybrid-road-tunnel', 'hybrid-road-casing', 'hybrid-road',
      'hybrid-road-service', 'hybrid-road-track', 'hybrid-road-path',
      'hybrid-road-labels',
      'hybrid-park-labels', 'hybrid-place-labels',
    ]);
    assert.deepEqual(hybridLayerDefs().map((d) => d.id), HYBRID_LAYERS, 'defs follow the id order');
  });

  test('the source is the keyless OpenFreeMap planet TileJSON', () => {
    const source = hybridSourceDef();
    assert.equal(source.type, 'vector');
    assert.equal(source.url, HYBRID_TILE_URL);
    assert.truthy(source.url.startsWith('https://'), 'https tiles');
    assert.truthy(!/[?&](key|apikey|api_key|token|access_token)=/i.test(source.url), 'keyless URL');
    assert.truthy(source.url.includes('openfreemap.org'), 'the OpenFreeMap host');
  });

  test('road/label/park data only — no buildings, no POI, no transit data (spec section 三 + the 2026-10-09 extension)', () => {
    const allowed = new Set(['transportation', 'transportation_name', 'place', 'park']);
    for (const def of hybridLayerDefs()) {
      assert.truthy(allowed.has(def['source-layer']), `${def.id}: source-layer ${def['source-layer']} is road/label/park data`);
      assert.truthy(def.type === 'line' || def.type === 'symbol' || def.type === 'fill', `${def.id}: flat type only`);
    }
    // The six line layers all read the transportation source-layer; the
    // park fill is the one fill; the labels split road / park / place
    // reads. (The POI layer tried on 2026-10-09 was removed the same day —
    // no `poi` source-layer may appear again without a fresh decision.)
    assert.deepEqual(
      hybridLayerDefs().filter((d) => d.type === 'line').map((d) => d['source-layer']),
      Array(6).fill('transportation'),
    );
    assert.deepEqual(
      hybridLayerDefs().filter((d) => d.type === 'fill').map((d) => d['source-layer']),
      ['park'],
    );
    assert.deepEqual(
      hybridLayerDefs().filter((d) => d.type === 'symbol').map((d) => d['source-layer']),
      ['transportation_name', 'park', 'place'],
    );
  });

  test('labels stand upright at pitch and pin to the terrain surface', () => {
    for (const def of hybridLayerDefs().filter((d) => d.type === 'symbol')) {
      assert.equal(def.layout['text-pitch-alignment'], 'viewport', `${def.id}: upright at pitch`);
      assert.equal(def.layout['symbol-height-anchor'], 'ground', `${def.id}: ground-anchored`);
      assert.equal(def.layout['text-font'][0], 'Noto Sans Regular', `${def.id}: the minimal style's glyph stack`);
    }
    const roads = defById('hybrid-road-labels');
    assert.equal(roads.layout['text-rotation-alignment'], 'map', 'road names follow their roads');
  });

  test('fresh defs per call — the caller may hand ownership to MapLibre', () => {
    const a = hybridLayerDefs();
    const b = hybridLayerDefs();
    const symA = a.find((d) => d.type === 'symbol');
    const symB = b.find((d) => d.type === 'symbol');
    assert.truthy(a[0] !== b[0], 'layer defs are new objects');
    assert.truthy(symA !== symB && symA.layout !== symB.layout, 'layout objects are not shared');
    assert.truthy(hybridSourceDef() !== hybridSourceDef(), 'source defs are new objects');
  });
});

/* Symbol alignment: line layers -------------------------------------------------- */

suite('hybrid overlay / line layer symbols', () => {
  test('tunnel ghost: brunnel=tunnel over the nine road classes, dimmed short dash', () => {
    const t = defById('hybrid-road-tunnel');
    assert.deepEqual(t.filter, ['all',
      ['==', ['get', 'brunnel'], 'tunnel'],
      ['match', ['get', 'class'],
        ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'track', 'path'], true, false],
    ]);
    assert.equal(t.minzoom, 8);
    assert.equal(t.paint['line-color'], '#ffffff');
    assert.equal(t.paint['line-opacity'], 0.6);
    assert.deepEqual(t.paint['line-dasharray'], [1.5, 1.5]);
    assert.deepEqual(widthStops(t), [[11, 1], [15, 1.5], [19, 3]]);
  });

  test('every surface line layer excludes tunnels — no double-draw with the ghost', () => {
    for (const def of hybridLayerDefs().filter((d) => d.type === 'line' && d.id !== 'hybrid-road-tunnel')) {
      assert.truthy(
        def.filter.some((clause) => JSON.stringify(clause) === tunnelClause),
        `${def.id}: filter carries brunnel ≠ tunnel`,
      );
    }
  });

  test('casing and pavement share the width table: minor z9 hairline and the z19 stops', () => {
    for (const [id, minorZ9, motorwayZ19] of [
      ['hybrid-road-casing', 1.4, 10.5],
      ['hybrid-road', 0.5, 7],
    ]) {
      const stops = widthStops(defById(id));
      assert.deepEqual(stops.map(([z]) => z), [5, 9, 13, 16, 19], `${id}: five stops incl. z19`);
      assert.deepEqual(matchPairs(stops[1][1]).find(([cls]) => cls === 'minor'), ['minor', minorZ9], `${id}: minor z9`);
      assert.deepEqual(matchPairs(stops[4][1]).find(([cls]) => cls === 'motorway'), ['motorway', motorwayZ19], `${id}: motorway z19`);
    }
    // Colors unchanged by the alignment pass.
    assert.equal(defById('hybrid-road-casing').paint['line-color'], 'rgba(30, 30, 30, 0.6)');
    assert.equal(defById('hybrid-road').paint['line-color'], 'rgba(255, 255, 255, 0.92)');
  });

  test('service roads: a solid thin line from z13', () => {
    const s = defById('hybrid-road-service');
    assert.equal(s.minzoom, 13);
    assert.truthy(!('line-dasharray' in s.paint), 'solid — no dasharray');
    assert.equal(s.paint['line-color'], '#ffffff');
    assert.equal(s.paint['line-opacity'], 0.6);
    assert.deepEqual(widthStops(s), [[13, 0.7], [16, 1.1], [19, 1.6]]);
  });

  test('tracks: the long dash from z12, always wider than a path at every stop', () => {
    const tr = defById('hybrid-road-track');
    assert.equal(tr.minzoom, 12);
    assert.deepEqual(tr.paint['line-dasharray'], [3, 1.5]);
    assert.equal(tr.paint['line-opacity'], 0.85);
    assert.deepEqual(widthStops(tr), [[12, 0.8], [14, 1.4], [16, 2], [19, 2.8]]);
  });

  test('path (renamed from hybrid-road-paths): the short dash, widths to z19', () => {
    const p = defById('hybrid-road-path');
    assert.equal(p.minzoom, 13);
    assert.deepEqual(p.paint['line-dasharray'], [1.5, 1]);
    assert.equal(p.paint['line-opacity'], 0.8);
    assert.deepEqual(widthStops(p), [[14, 1], [17, 2], [19, 3]]);
    assert.equal(defById('hybrid-road-paths'), undefined, 'the combined paths layer is gone');
  });
});

/* Bilingual label text-fields ------------------------------------------------------ */

suite('hybrid overlay / bilingual label text-fields', () => {
  /** The main-name coalesce chain as plain keys (the trailing '' literal kept). */
  const chainKeys = (expr) => expr[1].slice(1).map((part) => (Array.isArray(part) ? part[1] : part));

  test('en header: name:en → int → latin → name, ref as the road fallback', () => {
    const road = hybridLabelTextField('hybrid-road-labels', 'en');
    assert.equal(road[0], 'format', 'a format expression with sections');
    assert.deepEqual(chainKeys(road), ['name:en', 'name_int', 'name:latin', 'name', 'ref', '']);
  });

  test('zh-CN header: zh-Hans → zh-CN → zh, then the universal tail (deduped)', () => {
    assert.deepEqual(chainKeys(hybridLabelTextField('hybrid-road-labels', 'zh-CN')),
      ['name:zh-Hans', 'name:zh-CN', 'name:zh', 'name:en', 'name_int', 'name:latin', 'name', 'ref', '']);
  });

  test('zh-TW header chain; places never fall back to ref', () => {
    assert.deepEqual(chainKeys(hybridLabelTextField('hybrid-place-labels', 'zh-TW')),
      ['name:zh-Hant', 'name:zh-TW', 'name:zh', 'name:en', 'name_int', 'name:latin', 'name', '']);
    assert.truthy(!chainKeys(hybridLabelTextField('hybrid-place-labels', 'en')).includes('ref'),
      'no ref fallback on the place layer');
  });

  test('secondary local name: SAME size as the main name, shown only when different', () => {
    const expr = hybridLabelTextField('hybrid-road-labels', 'de');
    const section = expr[expr.length - 1];
    assert.truthy(!('font-scale' in section), 'no font-scale — the local name keeps full size (bilingual-signpost convention)');
    assert.deepEqual(section['text-font'], ['literal', ['Noto Sans Regular']], 'the secondary section carries its font (literal-wrapped — MapLibre parses option values as expressions)');
    const secondary = expr[3];
    assert.equal(secondary[0], 'case', 'a gated section');
    const gate = secondary[1];
    assert.equal(gate[0], 'all', 'two conditions gate the secondary');
    const dedup = gate[2];
    assert.equal(dedup[0], '!=', 'hidden when equal');
    assert.equal(dedup[2][0], 'downcase', 'case-insensitive');
    assert.deepEqual(dedup[2][1], expr[1], 'the comparison runs against the same main chain section one shows');
  });

  test('places break onto two lines; road names keep one line with a space', () => {
    assert.deepEqual(hybridLabelTextField('hybrid-place-labels', 'en')[3][2],
      ['concat', '\n', ['get', 'name']]);
    assert.deepEqual(hybridLabelTextField('hybrid-road-labels', 'en')[3][2],
      ['concat', ' ', ['get', 'name']]);
  });

  test('an unknown code falls back to the en header', () => {
    assert.deepEqual(chainKeys(hybridLabelTextField('hybrid-road-labels', 'xx')),
      chainKeys(hybridLabelTextField('hybrid-road-labels', 'en')));
  });

  test('defs build their text-fields for the requested language', () => {
    for (const id of ['hybrid-road-labels', 'hybrid-place-labels']) {
      assert.deepEqual(defById(id, 'ja').layout['text-field'], hybridLabelTextField(id, 'ja'));
    }
  });
});

/* Label paint (alignment pass) ------------------------------------------------------- */

suite('hybrid overlay / label paint', () => {
  test('road labels: deep glyph + light halo with blur, size curve to z19', () => {
    const r = defById('hybrid-road-labels');
    assert.deepEqual(r.paint, {
      'text-color': 'rgba(45, 45, 45, 0.95)',
      'text-halo-color': 'rgba(255, 255, 255, 0.9)',
      'text-halo-width': 1.1,
      'text-halo-blur': 0.3,
    });
    assert.deepEqual(r.layout['text-size'],
      // 1.25× the spec's 10/12.5/14 baseline — the settled enlargement.
      ['interpolate', ['linear'], ['zoom'], 12, 12.5, 16, 15.625, 19, 17.5]);
    assert.equal(r.minzoom, 12);
    assert.equal(r.layout['symbol-placement'], 'line-center');
  });

  test('place labels: max-width 8, halo 1.2 + blur, z19 added to the size curve', () => {
    const p = defById('hybrid-place-labels');
    assert.equal(p.layout['text-max-width'], 8);
    assert.equal(p.paint['text-halo-width'], 1.2);
    assert.equal(p.paint['text-halo-blur'], 0.3);
    assert.equal(p.paint['text-color'], '#ffffff');
    const size = p.layout['text-size'];
    assert.equal(size[size.length - 2], 19, 'z19 is the last stop');
    assert.deepEqual(size[size.length - 1], ['match', ['get', 'class'],
      'city', 21.25, 'town', 18.75, 'village', 16.25,
      ['suburb', 'quarter', 'neighbourhood'], 15, 'hamlet', 13.75, 0]);
    // Spot-check the gate table at 1.25× the spec baseline: class entry,
    // mid anchors — the 0 gates and minzooms stay untouched.
    const stopAt = (zoom) => size[size.indexOf(zoom, 3) + 1];
    assert.deepEqual(stopAt(3), ['match', ['get', 'class'], 'city', 13.75, 0]);
    assert.deepEqual(stopAt(10), ['match', ['get', 'class'],
      'city', 16.875, 'town', 14.375, 'village', 11.875,
      ['suburb', 'quarter', 'neighbourhood'], 10.625, 0]);
    assert.deepEqual(stopAt(13), ['match', ['get', 'class'],
      'city', 19.375, 'town', 16.25, 'village', 13.125,
      ['suburb', 'quarter', 'neighbourhood'], 11.875, 'hamlet', 10.625, 0]);
    // The seven-settlement filter is untouched — peaks are NOT in scope.
    assert.deepEqual(p.filter, ['match', ['get', 'class'],
      ['city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood'], true, false]);
  });
});

/* State machine --------------------------------------------------------------- */

/** The persisted toggle's storage seams for the unit page. localStorage is
 * available in the browser suite; every persistence test seeds its own value
 * so leftovers from other suites or earlier runs can never leak in. */
const storedRoadOverlay = () => localStorage.getItem(ROAD_OVERLAY_STORAGE_KEY);
const seedRoadOverlay = (value) => {
  if (value == null) localStorage.removeItem(ROAD_OVERLAY_STORAGE_KEY);
  else localStorage.setItem(ROAD_OVERLAY_STORAGE_KEY, value);
};

suite('hybrid overlay / state machine', () => {
  test('toggle on satellite: enabled flips, unavailable toggle is a no-op', () => {
    let satellite = true;
    const c = makeController(() => satellite);
    const map = stubMap();
    seedRoadOverlay(null);
    assert.equal(c.isEnabled(), false);
    assert.equal(c.toggle(), true);
    assert.equal(c.isEnabled(), true, 'on');
    c.apply(map);
    assert.equal(c.toggle(), true);
    assert.equal(c.isEnabled(), false, 'off');
    // Unavailable: toggle refuses, enabled reads false whatever the storage.
    satellite = false;
    assert.equal(c.toggle(), false, 'refused');
    assert.equal(c.isEnabled(), false, 'off-satellite always reads false');
  });

  test('toggle persists on/off; an unavailable toggle writes nothing', () => {
    let satellite = true;
    const c = makeController(() => satellite);
    seedRoadOverlay(null);
    c.toggle();
    assert.equal(storedRoadOverlay(), 'on', 'the flip wrote on');
    c.toggle();
    assert.equal(storedRoadOverlay(), 'off', 'the flip back wrote off');
    satellite = false;
    c.toggle();
    assert.equal(storedRoadOverlay(), 'off', 'a refused toggle writes nothing');
  });

  test('stored on: the first satellite entry hangs and shows without a click', () => {
    const c = makeController(() => true);
    const map = stubMap();
    withBaseStack(map);
    seedRoadOverlay('on');
    c.apply(map);
    assert.equal(c.isEnabled(), true, 'pressed straight from storage');
    assert.equal(map.calls.addSource, 3, 'sources hung from storage alone');
    assert.equal(map.calls.addLayer, HYBRID_ALL_LAYERS.length);
    for (const id of HYBRID_ALL_LAYERS) assert.equal(map.visibility[id], 'visible', id);
  });

  test('stored off, missing or garbage: satellite entry mounts nothing', () => {
    for (const value of ['off', null, 'ON', 'yes', '1', '']) {
      const c = makeController(() => true);
      const map = stubMap();
      withBaseStack(map);
      seedRoadOverlay(value);
      c.apply(map);
      assert.equal(map.calls.addSource, 0, `${JSON.stringify(value)}: nothing hung`);
      assert.equal(c.isEnabled(), false, `${JSON.stringify(value)}: reads off`);
      for (const id of HYBRID_ALL_LAYERS) assert.equal(map.visibility[id], undefined, `${JSON.stringify(value)}: ${id} untouched`);
    }
  });

  test('leaving satellite keeps the stored choice; returning restores it', () => {
    let satellite = true;
    const c = makeController(() => satellite);
    const map = stubMap();
    withBaseStack(map);
    seedRoadOverlay(null);
    c.toggle();
    c.apply(map);
    assert.equal(storedRoadOverlay(), 'on');
    // The basemap flip: the pressed state must be honest BEFORE any deferred
    // map pass — the map button refreshes in the same event tick — and
    // nothing rewrites the stored choice on the way out.
    satellite = false;
    assert.equal(c.isEnabled(), false, 'off-satellite reads false in the same tick');
    assert.equal(c.toggle(), false, 'toggle refused off-satellite');
    assert.equal(storedRoadOverlay(), 'on', 'the prune did not rewrite storage');
    c.apply(map);
    assert.equal(map.getSource(HYBRID_SOURCE_ID), null, 'pruned');
    assert.equal(storedRoadOverlay(), 'on', 'still on after the prune');
    // Back on satellite: the stored on restores — hung and visible again.
    satellite = true;
    assert.equal(c.isEnabled(), true, 'the storage read IS the pressed state');
    c.apply(map);
    assert.truthy(map.getSource(HYBRID_SOURCE_ID), 'restored from storage');
    assert.equal(map.calls.addSource, 6, '3 sources from each of the two hangs');
    for (const id of HYBRID_ALL_LAYERS) assert.equal(map.visibility[id], 'visible', id);
  });
});

/* Natural face (OpenFreeMap basemaps) ------------------------------------------ */

/** The natural face's storage seams; every persistence test seeds its own
 * value so leftovers from other suites or earlier runs can never leak in. */
const storedNaturalOverlay = () => localStorage.getItem(NATURAL_OVERLAY_STORAGE_KEY);
const seedNaturalOverlay = (value) => {
  if (value == null) localStorage.removeItem(NATURAL_OVERLAY_STORAGE_KEY);
  else localStorage.setItem(NATURAL_OVERLAY_STORAGE_KEY, value);
};

/** A natural-face controller (an OpenFreeMap basemap is active), deferred
 * passes synchronous, with a landmark-hook recorder. `withPlace` simulates
 * the raster-maps' 3D face (placeOverlayEnabled true — the default here so
 * the raster tests exercise the place hang); the OpenFreeMap-style test
 * passes false (the styles render place names of their own). */
function makeNaturalController({ withPlace = true } = {}) {
  seedRoadOverlay('off');
  seedNaturalOverlay(null);
  const calls = { enabled: [], disabled: 0, pruned: 0, invalidated: 0 };
  const controller = createHybridOverlay({
    isSatellite: () => false,
    isNatural: () => true,
    isPlace: () => withPlace,
    defer: (fn) => fn(),
    natural: {
      enabled: (map) => calls.enabled.push(map),
      disabled: () => { calls.disabled++; },
      pruned: () => { calls.pruned++; },
      invalidate: () => { calls.invalidated++; },
    },
  });
  return { controller, calls };
}

suite('hybrid overlay / natural face (every non-satellite basemap)', () => {
  test('default on, no style vector source (raster basemap): the face provisions its own planet source', () => {
    const { controller: c, calls } = makeNaturalController();
    const map = stubMap();
    withBaseStack(map);
    c.apply(map); // no click: the missing storage reads ON
    assert.equal(c.isEnabled(), true, 'first visit reads on');
    assert.equal(map.calls.addSource, 3, 'two geojson sources + OUR planet source for the lift');
    assert.truthy(map.getSource(HYBRID_SOURCE_ID), 'the lift ground on a raster basemap');
    assert.equal(map.calls.addLayer, HYBRID_NATURAL_LAYERS.length + 3, 'landmarks + park + place + the invisible lift feeder');
    assert.equal(map.defs[HYBRID_PARK_LABELS_LAYER].source, HYBRID_SOURCE_ID, 'the park labels ride the provisioned source');
    assert.equal(map.defs[HYBRID_PLACE_LABELS_LAYER].source, HYBRID_SOURCE_ID, 'the place labels ride the provisioned source');
    for (const id of [HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER, ...HYBRID_NATURAL_LAYERS]) assert.equal(map.visibility[id], 'visible', id);
    // Paint order: the basemap raster → (feeder) → park → place → landmarks
    // → terrain → track. Settlements keep the top of the label read.
    assert.deepEqual(map.layers(), [
      'basemap-layer',
      'natural-lift-feeder',
      HYBRID_PARK_LABELS_LAYER,
      HYBRID_PLACE_LABELS_LAYER,
      ...HYBRID_NATURAL_LAYERS,
      'terrain-hillshade', 'terrain-contour-lines', 'terrain-contour-labels',
      'track-casing', 'track-line',
    ]);
    const feeder = map.defs['natural-lift-feeder'];
    assert.equal(feeder.source, HYBRID_SOURCE_ID, 'the feeder references the lift source');
    assert.deepEqual(feeder.filter, ['==', ['get', 'class'], '__natural-lift-feeder__'],
      'never matches — it draws nothing');
    assert.equal(feeder.paint['line-opacity'], 0);
    assert.equal(calls.enabled.length, 1, 'the landmark lifecycle rides');
    assert.equal(calls.invalidated, 1, 'fresh hang, fresh fetch ground');
  });

  test('default on, OpenFreeMap style: the style source serves the lift — no second planet copy', () => {
    const { controller: c } = makeNaturalController({ withPlace: false });
    const map = stubMap();
    map.getStyle = () => ({ sources: { openmaptiles: { type: 'vector', url: HYBRID_TILE_URL } } });
    withBaseStack(map);
    c.apply(map);
    assert.equal(map.calls.addSource, 2, 'the two geojson sources only');
    assert.equal(map.getSource(HYBRID_SOURCE_ID), null, 'nothing of ours — the style has the tiles');
    assert.equal(map.calls.addLayer, HYBRID_NATURAL_LAYERS.length + 1, 'park labels + landmarks — no feeder, NO place');
    assert.equal(map.getLayer('natural-lift-feeder'), null);
    assert.equal(map.getLayer(HYBRID_PLACE_LABELS_LAYER), null,
      'place never rides the OpenFreeMap styles — they render place names of their own');
    assert.equal(map.defs[HYBRID_PARK_LABELS_LAYER].source, 'openmaptiles',
      'the park labels re-point at the style source');
    for (const id of [HYBRID_PARK_LABELS_LAYER, ...HYBRID_NATURAL_LAYERS]) assert.equal(map.visibility[id], 'visible', id);
  });

  test('a re-inserted basemap layer is walked back under the face (raster→raster)', () => {
    const { controller: c } = makeNaturalController();
    const map = stubMap();
    withBaseStack(map);
    c.apply(map);
    map.removeLayer('basemap-layer');
    map.addLayer({ id: 'basemap-layer', type: 'raster' }, 'track-casing');
    assert.truthy(map.layers().indexOf('basemap-layer') > map.layers().indexOf('hybrid-natural-peaks'),
      'the fresh imagery buried the face');
    c.apply(map);
    assert.deepEqual(map.layers(), [
      'basemap-layer',
      'natural-lift-feeder',
      HYBRID_PARK_LABELS_LAYER,
      HYBRID_PLACE_LABELS_LAYER,
      ...HYBRID_NATURAL_LAYERS,
      'terrain-hillshade', 'terrain-contour-lines', 'terrain-contour-labels',
      'track-casing', 'track-line',
    ], 'paint order restored');
  });

  test('only an explicit off hides: missing and garbage read on', () => {
    for (const value of [null, 'garbage', 'ON', '1', '']) {
      const { controller: c } = makeNaturalController();
      seedNaturalOverlay(value);
      assert.equal(c.isEnabled(), true, `${JSON.stringify(value)} reads on`);
    }
    const { controller: c } = makeNaturalController();
    seedNaturalOverlay('off');
    assert.equal(c.isEnabled(), false, "an explicit 'off' hides");
  });

  test('explicit off skips the mount; toggling keeps the hang and flips visibility', () => {
    const { controller: c, calls } = makeNaturalController();
    seedNaturalOverlay('off');
    const map = stubMap();
    withBaseStack(map);
    c.apply(map);
    assert.equal(map.calls.addSource, 0, 'nothing hung while off');
    assert.equal(calls.disabled, 1);
    c.toggle();
    assert.equal(storedNaturalOverlay(), 'on', 'the flip wrote on');
    c.apply(map);
    assert.equal(map.calls.addSource, 3, 'the first hang (incl. the lift source)');
    assert.equal(map.calls.addLayer, HYBRID_NATURAL_LAYERS.length + 3);
    c.toggle();
    c.apply(map);
    assert.equal(storedNaturalOverlay(), 'off', 'the flip back wrote off');
    for (const id of [HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER, ...HYBRID_NATURAL_LAYERS]) assert.equal(map.visibility[id], 'none', id);
    assert.equal(map.calls.addSource, 3, 'toggle off is not a prune');
    assert.equal(map.calls.removeSource, 0);
    c.toggle();
    c.apply(map);
    assert.equal(map.calls.addSource, 3, 're-enable reuses the sources');
    assert.equal(map.calls.addLayer, HYBRID_NATURAL_LAYERS.length + 3, 're-enable reuses the layers');
    for (const id of [HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER, ...HYBRID_NATURAL_LAYERS]) assert.equal(map.visibility[id], 'visible', id);
  });

  test('the two faces persist to two independent keys', () => {
    let satellite = false;
    let natural = true;
    const c = createHybridOverlay({ isSatellite: () => satellite, isNatural: () => natural, defer: (fn) => fn() });
    seedRoadOverlay(null);
    seedNaturalOverlay(null);
    // The natural face's flip writes ONLY the natural key.
    c.toggle();
    assert.equal(storedNaturalOverlay(), 'off', 'default-on flipped to off');
    assert.equal(storedRoadOverlay(), null, 'the natural face never touches the road key');
    // The road face's flip writes ONLY the road key.
    satellite = true;
    natural = false;
    assert.equal(c.isEnabled(), false, 'the road face reads its own (missing) off');
    c.toggle();
    assert.equal(storedRoadOverlay(), 'on');
    assert.equal(storedNaturalOverlay(), 'off', 'the road face never touches the natural key');
  });

  test('off both families: unavailable, refused, and the prune keeps the stored choice', () => {
    let natural = true;
    const calls = { enabled: [], disabled: 0, pruned: 0, invalidated: 0 };
    const c = createHybridOverlay({
      isSatellite: () => false,
      isNatural: () => natural,
      isPlace: () => true,
      defer: (fn) => fn(),
      natural: {
        enabled: (map) => calls.enabled.push(map),
        disabled: () => { calls.disabled++; },
        pruned: () => { calls.pruned++; },
        invalidate: () => { calls.invalidated++; },
      },
    });
    seedRoadOverlay(null);
    seedNaturalOverlay(null);
    const map = stubMap();
    withBaseStack(map);
    c.apply(map); // hang while the natural face is active
    assert.equal(map.calls.addSource, 3);
    natural = false;
    assert.equal(c.isEnabled(), false, 'off both families reads false in the same tick');
    assert.equal(c.toggle(), false, 'toggle refused');
    c.apply(map);
    assert.equal(map.getSource('hybrid-natural-osm'), null, 'natural source pruned');
    assert.equal(map.getSource('hybrid-natural-tiles'), null, 'tile-lift source pruned too');
    for (const id of [HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER, ...HYBRID_NATURAL_LAYERS, 'natural-lift-feeder']) {
      assert.equal(map.getLayer(id), null, `${id} pruned`);
    }
    assert.equal(calls.pruned, 1);
    assert.equal(storedNaturalOverlay(), null, 'the prune wrote nothing — the missing value keeps reading on');
    // Returning to the family restores from storage.
    natural = true;
    assert.equal(c.isEnabled(), true);
    c.apply(map);
    assert.truthy(map.getSource('hybrid-natural-osm'), 'restored from storage');
    assert.equal(map.calls.addSource, 6, '3 sources from each of the two hangs');
    for (const id of [HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER, ...HYBRID_NATURAL_LAYERS]) assert.equal(map.visibility[id], 'visible', id);
  });
});

/* Map passes ------------------------------------------------------------------ */

suite('hybrid overlay / map passes', () => {
  test('first enable hangs all three sources + the full stack under the terrain layers, visible', () => {
    const c = makeController(() => true);
    const map = stubMap();
    withBaseStack(map);
    c.toggle();
    c.apply(map);
    assert.equal(map.calls.addSource, 3, 'roads vector + overpass geojson + tile-lift geojson');
    assert.equal(map.calls.addLayer, HYBRID_ALL_LAYERS.length);
    // Paint order: imagery → roads → labels → natural landmarks →
    // hillshade/contours → track.
    assert.deepEqual(map.layers(), [
      'basemap-layer',
      ...HYBRID_ALL_LAYERS,
      'terrain-hillshade', 'terrain-contour-lines', 'terrain-contour-labels',
      'track-casing', 'track-line',
    ]);
    for (const id of HYBRID_ALL_LAYERS) assert.equal(map.visibility[id], 'visible', id);
  });

  test('the anchor falls through to the track vectors when no terrain layers exist', () => {
    const c = makeController(() => true);
    const map = stubMap();
    map.addLayer({ id: 'basemap-layer', type: 'raster' });
    map.addLayer({ id: 'track-casing', type: 'line' });
    map.addLayer({ id: 'track-line', type: 'line' });
    c.toggle();
    c.apply(map);
    assert.deepEqual(map.layers(), ['basemap-layer', ...HYBRID_ALL_LAYERS, 'track-casing', 'track-line']);
  });

  test('toggle off keeps the hang and flips visibility — re-enable never rebuilds', () => {
    const c = makeController(() => true);
    const map = stubMap();
    withBaseStack(map);
    c.toggle();
    c.apply(map);
    c.toggle();
    c.apply(map);
    for (const id of HYBRID_ALL_LAYERS) assert.equal(map.visibility[id], 'none', id);
    assert.truthy(map.getSource(HYBRID_SOURCE_ID), 'source stays hung');
    assert.equal(map.calls.addSource, 3, 'no source rebuild');
    assert.equal(map.calls.addLayer, HYBRID_ALL_LAYERS.length, 'no layer rebuild');
    assert.equal(map.calls.removeSource, 0, 'toggle is not a prune');
    c.toggle();
    c.apply(map);
    assert.equal(map.calls.addSource, 3, 're-enable reuses the sources');
    assert.equal(map.calls.addLayer, HYBRID_ALL_LAYERS.length, 're-enable reuses the layers');
    for (const id of HYBRID_ALL_LAYERS) assert.equal(map.visibility[id], 'visible', id);
  });

  test('leaving satellite prunes everything; re-entering mounts nothing while the stored choice is off', () => {
    let satellite = true;
    const c = makeController(() => satellite);
    const map = stubMap();
    withBaseStack(map);
    seedRoadOverlay(null);
    c.toggle();
    c.apply(map);
    satellite = false;
    c.apply(map);
    assert.equal(map.getSource(HYBRID_SOURCE_ID), null, 'source pruned');
    assert.equal(map.getSource('hybrid-natural-osm'), null, 'natural source pruned too');
    assert.equal(map.getSource('hybrid-natural-tiles'), null, 'the tile-lift source pruned too');
    for (const id of HYBRID_ALL_LAYERS) assert.equal(map.getLayer(id), null, `${id} pruned`);
    // The user's stored choice is off (or missing): back on satellite the
    // button is enabled but nothing pre-loads.
    seedRoadOverlay('off');
    satellite = true;
    c.apply(map);
    assert.equal(map.getSource(HYBRID_SOURCE_ID), null, 'no preload while off');
    assert.equal(map.calls.addSource, 3, 'still just the original hang');
  });

  test('a raster→raster satellite switch restacks the overlay over the re-inserted imagery', () => {
    const c = makeController(() => true);
    const map = stubMap();
    withBaseStack(map);
    c.toggle();
    c.apply(map);
    // EOX → Esri: no setStyle, the basemap layer is re-inserted under the
    // track vectors — on top of the hung overlay until apply() restacks.
    map.removeLayer('basemap-layer');
    map.addLayer({ id: 'basemap-layer', type: 'raster' }, 'track-casing');
    assert.equal(map.layers().indexOf('basemap-layer') > map.layers().indexOf('hybrid-road'), true, 'imagery buried the overlay');
    c.apply(map);
    assert.deepEqual(map.layers(), [
      'basemap-layer',
      ...HYBRID_ALL_LAYERS,
      'terrain-hillshade', 'terrain-contour-lines', 'terrain-contour-labels',
      'track-casing', 'track-line',
    ], 'paint order restored');
  });

  test('stale passes lose: two applies in flight run the newer state only', () => {
    let satellite = true;
    const deferred = [];
    const c = createHybridOverlay({ isSatellite: () => satellite, defer: (fn) => deferred.push(fn) });
    const map = stubMap();
    withBaseStack(map);
    c.toggle();
    c.apply(map);
    satellite = false;
    c.apply(map);
    // Replay out of order — the first (stale) pass must bail.
    deferred.reverse().forEach((fn) => fn());
    assert.equal(map.getSource(HYBRID_SOURCE_ID), null, 'the newer (prune) pass won');
    assert.equal(map.calls.addSource, 0, 'the stale enable never hung anything');
  });
});

/* Singleton-level guards -------------------------------------------------------- */

suite('hybrid overlay / app singleton (no map yet)', () => {
  test('unavailable before any basemap loads — the button boots disabled', async () => {
    const { hybridOverlayAvailable, hybridOverlayEnabled, toggleHybridOverlay } = await import('../js/map/hybrid.js');
    assert.equal(hybridOverlayAvailable(), false, 'no active source yet');
    assert.equal(hybridOverlayEnabled(), false);
    toggleHybridOverlay();
    assert.equal(hybridOverlayEnabled(), false, 'toggle refused — stays off');
  });

  test('roadOverlay resolves in all nine languages (never the raw key)', async () => {
    for (const { code } of language.getLanguages()) {
      await language.setLanguage(code);
      const text = language.t('roadOverlay');
      assert.truthy(text && text !== 'roadOverlay', `roadOverlay unresolved in ${code}`);
    }
    await language.setLanguage('en');
    assert.equal(language.t('roadOverlay'), 'Roads');
  });

  test('naturalOverlay resolves in all nine languages (never the raw key)', async () => {
    for (const { code } of language.getLanguages()) {
      await language.setLanguage(code);
      const text = language.t('naturalOverlay');
      assert.truthy(text && text !== 'naturalOverlay', `naturalOverlay unresolved in ${code}`);
    }
    await language.setLanguage('en');
    assert.equal(language.t('naturalOverlay'), 'Natural landmarks');
  });
});

/* Language hot-rewrite ------------------------------------------------------------ */

suite('hybrid overlay / language hot-rewrite', () => {
  test('language:changed rewrites all three hung label layers in place — hidden ones too', async () => {
    const map = stubMap();
    map.addLayer({ id: 'hybrid-road-labels', type: 'symbol' });
    map.addLayer({ id: 'hybrid-place-labels', type: 'symbol' });
    map.addLayer({ id: HYBRID_PARK_LABELS_LAYER, type: 'symbol' });
    initHybrid({ getMap: () => map });
    await language.setLanguage('zh-CN');
    let calls = map.layoutCalls.filter((c) => c.key === 'text-field');
    assert.equal(calls.length, 3, 'all three label layers rewritten');
    assert.deepEqual(calls.find((c) => c.id === 'hybrid-road-labels').value,
      hybridLabelTextField('hybrid-road-labels', 'zh-CN'));
    assert.deepEqual(calls.find((c) => c.id === 'hybrid-place-labels').value,
      hybridLabelTextField('hybrid-place-labels', 'zh-CN'));
    assert.deepEqual(calls.find((c) => c.id === HYBRID_PARK_LABELS_LAYER).value,
      hybridLabelTextField(HYBRID_PARK_LABELS_LAYER, 'zh-CN'), 'the park labels speak the bilingual dialect');
    // A hidden layer still rewrites — re-enabling shows the new language.
    map.setLayoutProperty('hybrid-place-labels', 'visibility', 'none');
    await language.setLanguage('ja');
    calls = map.layoutCalls.filter((c) => c.key === 'text-field');
    assert.equal(calls.length, 6, 'the hidden layer was rewritten all the same');
    const placeCalls = calls.filter((c) => c.id === 'hybrid-place-labels');
    assert.deepEqual(placeCalls[placeCalls.length - 1].value,
      hybridLabelTextField('hybrid-place-labels', 'ja'));
    await language.setLanguage('en');
  });
});

/* Park and place label layers (2026-10-09) -------------------------------------------------------- */

suite('hybrid overlay / park and place layers (2026-10-09)', () => {
  test('park fill: the bottom layer, polygons only, opacity decays with zoom', () => {
    const f = defById(HYBRID_PARK_FILL_LAYER);
    assert.equal(f.type, 'fill');
    assert.equal(f['source-layer'], 'park');
    assert.equal(f.minzoom, 4, 'the park layer opens at z4');
    assert.deepEqual(f.filter, ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
      'the nameless polygons are the fill geometry');
    assert.deepEqual(f.paint['fill-opacity'],
      ['interpolate', ['linear'], ['zoom'], 4, 0.22, 10, 0.16, 14, 0.12]);
    assert.equal(hybridLayerDefs()[0].id, HYBRID_PARK_FILL_LAYER, 'the wash sits under every road and label');
  });

  test('park labels: point features only, rank-tiered size curve, bilingual field', () => {
    const p = parkLabelsLayerDef('en');
    assert.equal(p.id, HYBRID_PARK_LABELS_LAYER);
    assert.equal(p['source-layer'], 'park');
    assert.equal(p.minzoom, 4);
    assert.deepEqual(p.filter, ['==', ['geometry-type'], 'Point'], 'name/rank ride the point features only');
    assert.equal(p.source, HYBRID_SOURCE_ID, 'the satellite face default source');
    assert.equal(p.layout['text-field'][0], 'format', 'the bilingual format expression');
    // The rank tiers: one interpolate, every early stop a case(rank ≤ N),
    // the z13.5 stop opens to everything.
    const size = p.layout['text-size'];
    assert.equal(size[0], 'interpolate');
    const stops = [];
    for (let i = 3; i < size.length; i += 2) stops.push([size[i], size[i + 1]]);
    assert.deepEqual(stops.map(([z]) => z), [4, 6, 8, 10, 12, 13.5]);
    for (const [, out] of stops.slice(0, -1)) {
      assert.equal(out[0], 'case', 'each early stop rank-gates');
      assert.equal(out[3], 0, 'a 0 output hides the over-rank parks');
    }
    assert.deepEqual(stops[0][1][1], ['<=', ['coalesce', ['get', 'rank'], 999], 2], 'z4: national tier only');
    assert.equal(stops[0][1][2], 10.5);
    assert.deepEqual(stops[2][1][1], ['<=', ['coalesce', ['get', 'rank'], 999], 5], 'z8: rank ≤ 5');
    assert.equal(stops[2][1][2], 11.25);
    assert.equal(stops[stops.length - 1][1], 12.5, 'z13.5 opens to everything');
    // The imagery palette — the shared place read.
    assert.deepEqual(p.paint, {
      'text-color': '#ffffff',
      'text-halo-color': 'rgba(40, 40, 40, 0.9)',
      'text-halo-width': 1.2,
      'text-halo-blur': 0.3,
    });
  });

  test('park and place labels: source id is a parameter — the natural face re-points it', () => {
    assert.equal(parkLabelsLayerDef('en', 'openmaptiles').source, 'openmaptiles');
    assert.equal(placeLabelsLayerDef('en', 'openmaptiles').source, 'openmaptiles');
    assert.equal(placeLabelsLayerDef().id, HYBRID_PLACE_LABELS_LAYER);
    // The bilingual second line: parks join the place labels' two-line read.
    assert.deepEqual(parkLabelsLayerDef('en').layout['text-field'][3][2],
      ['concat', '\n', ['get', 'name']]);
    assert.deepEqual(placeLabelsLayerDef('en').layout['text-field'][3][2],
      ['concat', '\n', ['get', 'name']]);
  });
});
