/** Natural landmark overlay tests (the
 * peak/saddle/volcano elevation + gating mechanism is WaySlice's
 * naturalOverlay.js adopted verbatim — these tests pin its values): the
 * eight-class coverage and the ridge/cliff exclusion (now at the tile
 * lift), the WaySlice gate table / class curves / rank split / collision
 * priority for the trio, the small classes' 2026-10-04 entry tiering
 * (spring/waterfall → rock → stone, text a zoom behind each icon, hard zeros before
 * every gate), the JS-composed bilingual + elevation label across all four
 * name×elevation combinations and both unit systems, the robust elevation
 * tag parser (bare/explicit/feet/ele_ft/garbage → canonical meters), the
 * Overpass query + element parser, the viewport fetcher's
 * cache/abort/silent failure plus the cache retention and fresh-hang
 * replay, and (2026-10-05) the staggered hedged race that replaced the
 * serial mirror walk: per-attempt ceilings, the fast-fail cascade, the
 * sticky winner, same-box in-flight dedup, preemption linkage and the
 * latch's gate check, plus the tile-feed rebuild drivers. The map-image
 * rendering itself is exercised by the browser verification scripts. */
import { suite, test, assert } from './runner.js';
import {
  HYBRID_NATURAL_SOURCE_ID, HYBRID_NATURAL_TILE_SOURCE_ID, HYBRID_NATURAL_LAYERS,
  NATURAL_CLASSES, NATURAL_TILE_CLASSES, NATURAL_OSM_CLASSES,
  NATURAL_LAYER_NAME_ZOOMS,
  NATURAL_GATES, NATURAL_ICON_SIZES, NATURAL_TEXT_SIZES, gateClassFor,
  parseElevationTag, parseFeetTag, parseElevationMeters,
  localizedName, buildNaturalLabel, peaksFromTileFeatures, buildPeakFeatureCollection,
  naturalLabelTextField, naturalLayerDefs,
  naturalFeatureFromOsm, overpassNaturalQuery,
  createNaturalFeatures, OVERPASS_ELEMENT_CAP,
} from '../js/map/hybrid-natural.js';
import { createHybridOverlay, HYBRID_SOURCE_ID, HYBRID_ALL_LAYERS, ROAD_OVERLAY_STORAGE_KEY } from '../js/map/hybrid.js';
import {
  NATURAL_ICON_DEFS, naturalIconName, registerNaturalIcons, iconFillColor,
  rasterizeNaturalIcon, NATURAL_ICON_SIZE,
} from '../js/map/naturalIcons.js';
import * as language from '../js/language/language.js';
import { setPreference, getPreference } from '../js/theme/theme.js';
import { setUnitSystem, getUnitSystem } from '../js/units/units.js';
import '../js/language/langs.js';

/* Fixtures & stubs ---------------------------------------------------------------- */

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** A bounds object answering the LngBounds API padBounds reads. */
function mkBounds(s, w, n, e) {
  return { getSouth: () => s, getWest: () => w, getNorth: () => n, getEast: () => e };
}

/** A maplibre tile feature shaped like mountain_peak output. */
function mkTileFeature(cls, lon, lat, props = {}) {
  return {
    properties: { class: cls, rank: 5, ...props },
    geometry: { type: 'Point', coordinates: [lon, lat] },
  };
}

/** A map stub with the data-layer surface the fetcher and the tile feed
 * touch (sources with setData, zoom/bounds, move-end/idle handlers, image
 * registration, querySourceFeatures) PLUS the layer surface the overlay
 * state machine drives. */
function naturalStubMap({ zoom = 14, bounds = mkBounds(22.3, 114.1, 22.5, 114.3), tileFeatures = [], renderedFeatures = [] } = {}) {
  const sources = {};
  const handlers = {};
  const setDataCalls = [];
  const images = new Set();
  const removals = [];
  const layers = [];
  const visibility = {};
  const defs = {};
  const calls = { addSource: 0, addLayer: 0 };
  return {
    sources,
    handlers,
    setDataCalls,
    images,
    removals,
    bounds,
    tileFeatures,
    renderedFeatures,
    calls,
    visibility,
    defs,
    setBounds(value) { this.bounds = value; },
    getSource: (id) => sources[id] ?? null,
    addSource: (id) => {
      calls.addSource++;
      sources[id] = { setData: (data) => { setDataCalls.push({ id, data }); } };
    },
    removeSource: (id) => { delete sources[id]; },
    getLayer: (id) => (layers.includes(id) ? defs[id] ?? {} : null),
    addLayer: (def, beforeId) => {
      calls.addLayer++;
      defs[def.id] = def;
      layers.splice(beforeId ? layers.indexOf(beforeId) : layers.length, 0, def.id);
    },
    removeLayer: (id) => { layers.splice(layers.indexOf(id), 1); },
    moveLayer: (id, beforeId) => {
      layers.splice(layers.indexOf(id), 1);
      layers.splice(beforeId ? layers.indexOf(beforeId) : layers.length, 0, id);
    },
    hasLayer: (id) => layers.includes(id),
    layers: () => [...layers],
    setLayoutProperty: (id, key, value) => {
      if (key === 'visibility') visibility[id] = value;
    },
    getZoom: () => zoom,
    setZoom: (value) => { zoom = value; },
    getBounds() { return this.bounds; },
    querySourceFeatures(id, opts) {
      return id === HYBRID_SOURCE_ID && opts?.sourceLayer === 'mountain_peak' ? this.tileFeatures : [];
    },
    queryRenderedFeatures(opts) {
      return opts?.layers?.[0] === 'hybrid-natural-peaks' ? this.renderedFeatures : [];
    },
    on: (type, fn) => { (handlers[type] ??= []).push(fn); },
    hasImage: (name) => images.has(name),
    addImage: (name) => { images.add(name); },
    removeImage: (name) => { images.delete(name); removals.push(name); },
  };
}

/** A controller whose deferred passes run synchronously (the unit seam),
 * with a natural-hook recorder. The persisted toggle starts every controller
 * from the stored-off baseline — the storage value is global to the page,
 * so without the seed one test's toggle would leak into the next. */
function makeController(isSatellite, natural) {
  localStorage.setItem(ROAD_OVERLAY_STORAGE_KEY, 'off');
  const calls = { enabled: [], disabled: 0, pruned: 0, invalidated: 0 };
  const hooks = natural ?? {
    enabled: (map) => calls.enabled.push(map),
    disabled: () => { calls.disabled++; },
    pruned: () => { calls.pruned++; },
    invalidate: () => { calls.invalidated++; },
  };
  const controller = createHybridOverlay({ isSatellite, defer: (fn) => fn(), natural: hooks });
  return { controller, calls };
}

/** The full name-key chain out of a text-field's leading coalesce. */
const chainKeys = (nameExpr) => nameExpr.slice(1).map((part) => (Array.isArray(part) ? part[1] : part));

/* Class coverage ------------------------------------------------------------------ */

suite('natural landmarks / class coverage', () => {
  test('exactly the eight spec classes, no others', () => {
    assert.deepEqual(NATURAL_CLASSES,
      ['peak', 'saddle', 'volcano', 'cave_entrance', 'spring', 'waterfall', 'rock', 'stone']);
  });

  test('the tile/Overpass split covers all eight with no overlap', () => {
    assert.deepEqual([...NATURAL_TILE_CLASSES].sort(), ['peak', 'saddle', 'volcano']);
    assert.deepEqual([...NATURAL_OSM_CLASSES].sort(),
      ['cave_entrance', 'rock', 'spring', 'stone', 'waterfall']);
    assert.deepEqual([...NATURAL_TILE_CLASSES, ...NATURAL_OSM_CLASSES].sort(), [...NATURAL_CLASSES].sort());
  });

  test('three symbol layers; the small-class filters never drag landforms in', () => {
    assert.deepEqual(naturalLayerDefs().map((d) => d.id), HYBRID_NATURAL_LAYERS);
    for (const def of naturalLayerDefs()) {
      assert.equal(def.type, 'symbol', `${def.id}: symbol, not DOM markers`);
      if (def.filter) {
        for (const cls of def.filter[2]) {
          assert.truthy(NATURAL_CLASSES.includes(cls), `${def.id}: ${cls} is a spec class`);
          assert.truthy(!['ridge', 'cliff', 'valley', 'gorge', 'scree', 'dune'].includes(cls),
            `${def.id}: ${cls} is not an excluded landform`);
        }
      }
    }
    assert.deepEqual(naturalLayerDefs().filter((d) => d.filter).flatMap((d) => d.filter[2]).sort(),
      ['cave_entrance', 'rock', 'spring', 'stone', 'waterfall'],
      'the small classes ride filters; the trio is pre-filtered at the lift');
  });

  test('sources: the trio on its own tile-lift GeoJSON, the small classes on the Overpass one', () => {
    const trio = naturalLayerDefs().find((d) => d.id === 'hybrid-natural-peaks');
    assert.equal(trio.source, HYBRID_NATURAL_TILE_SOURCE_ID);
    assert.equal(trio['source-layer'], undefined, 'geojson has no source-layer');
    assert.equal(trio.filter, undefined, 'the lift pre-filters — no layer filter');
    assert.equal(trio.minzoom, 8, 'the gate table opens the majors at z8');
    for (const def of naturalLayerDefs().filter((d) => d.id !== 'hybrid-natural-peaks')) {
      assert.equal(def.source, HYBRID_NATURAL_SOURCE_ID, `${def.id}: the Overpass source`);
    }
  });

  test('no DOM markers by construction: every def is a style symbol layer', () => {
    for (const def of naturalLayerDefs()) {
      assert.equal(def.type, 'symbol', def.id);
      assert.truthy(!('element' in def) && !('marker' in def), def.id);
    }
  });
});

/* The WaySlice gate mechanism (peak/saddle/volcano) --------------------------------- */

suite('natural landmarks / the WaySlice gate mechanism', () => {
  /** Reads one zoom stop's class→value map out of a classCurve expression. */
  const at = (expr, zoom) => {
    for (let i = 3; i < expr.length; i += 2) {
      if (expr[i] === zoom) {
        const match = expr[i + 1];
        const out = {};
        for (let j = 2; j < match.length - 1; j += 2) out[match[j]] = match[j + 1];
        return out;
      }
    }
    return undefined;
  };
  const curveZooms = (expr) => {
    const zooms = [];
    for (let i = 3; i < expr.length; i += 2) zooms.push(expr[i]);
    return zooms;
  };

  test('the gate table is WaySlice\'s, value for value', () => {
    assert.deepEqual(NATURAL_GATES, {
      'peak-major': { icon: 8, text: 10 },
      'peak': { icon: 11, text: 13 },
      'volcano-major': { icon: 8, text: 10 },
      'volcano': { icon: 10, text: 12.5 },
      'saddle': { icon: 12, text: 14 },
    });
  });

  test('gateClassFor: rank ≤ 2 majors for the terrain landmarks only', () => {
    assert.equal(gateClassFor('peak', 1), 'peak-major');
    assert.equal(gateClassFor('peak', 2), 'peak-major');
    assert.equal(gateClassFor('peak', 3), 'peak');
    assert.equal(gateClassFor('peak', undefined), 'peak', 'rankless features ride the base gate');
    assert.equal(gateClassFor('volcano', 1), 'volcano-major');
    assert.equal(gateClassFor('saddle', 1), 'saddle', 'saddle has no major tier');
  });

  test('icon curve: 0 hides before entry, WaySlice sizes at every stop', () => {
    assert.equal(at(NATURAL_ICON_SIZES, 8)['peak-major'], 0.5, 'majors lead at z8');
    assert.equal(at(NATURAL_ICON_SIZES, 8).peak, 0);
    assert.equal(at(NATURAL_ICON_SIZES, 10).peak, 0, 'plain peaks still closed at z10');
    assert.equal(at(NATURAL_ICON_SIZES, 10).volcano, 0.5);
    assert.equal(at(NATURAL_ICON_SIZES, 11).peak, 0.5, 'peaks open at z11');
    assert.equal(at(NATURAL_ICON_SIZES, 11).saddle, 0, 'saddle closed at z11');
    assert.equal(at(NATURAL_ICON_SIZES, 12).saddle, 0.5, 'saddle opens at z12');
    assert.equal(at(NATURAL_ICON_SIZES, 19)['peak-major'], 0.7);
    assert.equal(at(NATURAL_ICON_SIZES, 19).saddle, 0.7);
  });

  test('text curve: all-zero first stop (the clamping guard), labels join later', () => {
    for (const [cls] of Object.entries(NATURAL_GATES)) {
      assert.equal(at(NATURAL_TEXT_SIZES, 8)[cls], 0, `${cls}: closed at the layer minzoom`);
    }
    assert.equal(at(NATURAL_TEXT_SIZES, 10)['peak-major'], 11.25, 'majors label from z10');
    assert.equal(at(NATURAL_TEXT_SIZES, 11).peak, 0, 'plain peaks label later than icons');
    assert.equal(at(NATURAL_TEXT_SIZES, 13).peak, 11.25, 'plain peaks label from z13');
    assert.equal(at(NATURAL_TEXT_SIZES, 12.5).volcano, 11.25);
    assert.equal(at(NATURAL_TEXT_SIZES, 13).saddle, 0, 'saddle label closed at z13');
    assert.equal(at(NATURAL_TEXT_SIZES, 14).saddle, 11.25, 'saddle labels from z14');
  });

  test('curves never close after opening — zooming in cannot re-hide a class', () => {
    // The shown-stays-shown rule's size-curve basis: once a column's value
    // leaves 0, every deeper stop stays above 0 (icons AND labels).
    const columnsOf = (expr) => {
      const columns = {};
      for (let i = 3; i < expr.length; i += 2) {
        const match = expr[i + 1];
        for (let j = 2; j < match.length - 1; j += 2) {
          (columns[match[j]] ??= []).push(match[j + 1]);
        }
      }
      return columns;
    };
    for (const [exprName, expr] of [['icons', NATURAL_ICON_SIZES], ['labels', NATURAL_TEXT_SIZES]]) {
      for (const [cls, values] of Object.entries(columnsOf(expr))) {
        let opened = false;
        for (const value of values) {
          if (value > 0) opened = true;
          else assert.truthy(!opened, `${exprName}/${cls}: closed again after opening at ${values.join(',')}`);
        }
        assert.truthy(opened, `${exprName}/${cls}: the class opens somewhere`);
      }
    }
  });

  test('one zoom curve per expression, keyed on gateClass', () => {
    for (const [expr, rows] of [
      [NATURAL_ICON_SIZES, [8, 10, 11, 12, 13, 13.5, 14.5, 15.5, 17, 19]],
      [NATURAL_TEXT_SIZES, [8, 10, 11, 12.5, 13, 14, 14.5, 15.5, 16.5, 19]],
    ]) {
      assert.equal(expr[0], 'interpolate');
      assert.deepEqual(curveZooms(expr), rows, 'the WaySlice stop rows');
      for (let i = 4; i < expr.length; i += 2) {
        assert.deepEqual(expr[i].slice(0, 2), ['match', ['get', 'gateClass']]);
      }
    }
  });

  test('the trio layer layout is WaySlice\'s single-layer shape + Terra\'s 3D anchors', () => {
    const trio = naturalLayerDefs().find((d) => d.id === 'hybrid-natural-peaks');
    const l = trio.layout;
    assert.deepEqual(l['text-field'], ['get', 'label'], 'the label is a plain property');
    assert.deepEqual(l['icon-image'], ['concat', 'hybrid-nat-', ['get', 'naturalClass']]);
    assert.equal(l['icon-allow-overlap'], false);
    assert.equal(l['icon-padding'], 2);
    assert.deepEqual(l['symbol-sort-key'], ['get', 'sortRank'], 'collision: majors win');
    assert.equal(l['text-anchor'], 'top');
    assert.deepEqual(l['text-offset'], [0, 0.6]);
    assert.equal(l['text-max-width'], 9);
    assert.equal(l['text-optional'], true);
    assert.equal(l['text-allow-overlap'], false);
    assert.equal(l['text-padding'], 2);
    assert.equal(trio.paint['icon-opacity'], 0.95);
    assert.deepEqual(trio.paint['text-halo-color'], 'rgba(40, 40, 40, 0.9)', 'the place-label paint');
    // Terra-3D necessities on top of the 2D mechanism:
    assert.equal(l['symbol-height-anchor'], 'ground', 'drapes the terrain');
    assert.equal(l['text-pitch-alignment'], 'viewport', 'upright at pitch');
  });
});

/* Elevation parser (the WaySlice full mechanism) ------------------------------------- */

suite('natural landmarks / elevation parser', () => {
  test('the five canonical forms all parse to canonical meters', () => {
    const cases = [
      [{ ele: '1234' }, 1234],
      [{ ele: '1234 m' }, 1234],
      [{ ele: '4042 ft' }, 4042 * 0.3048],
      [{ ele: "4042'" }, 4042 * 0.3048],
      [{ 'ele:ft': '4042' }, 4042 * 0.3048],
    ];
    for (const [tags, expected] of cases) {
      const value = parseElevationMeters(tags);
      assert.truthy(Math.abs(value - expected) < 1e-9, `${JSON.stringify(tags)} → ${expected}, got ${value}`);
    }
  });

  test('the tiles\' numeric ele_ft is the aux source for tile-lifted features', () => {
    assert.equal(parseElevationMeters({ ele: 944, ele_ft: 3097 }), 944, 'ele wins over the tile feet');
    assert.equal(parseElevationMeters({ ele_ft: 3097 }), 3097 * 0.3048);
    assert.equal(parseFeetTag('4042'), 4042 * 0.3048);
    assert.equal(parseFeetTag('4042 ft'), null, 'the aux source is unitless by semantics');
    assert.equal(parseElevationTag('.5'), 0.5, 'leading-dot decimals');
    assert.equal(parseElevationTag('  944 FT '), 944 * 0.3048, 'case-insensitive units');
  });

  test('both sources present: ele wins as canonical, ele:ft never duplicates', () => {
    assert.equal(parseElevationMeters({ ele: '1234', 'ele:ft': '4042' }), 1234);
    // Conflicting sources are not averaged either — ele stays the one value.
    assert.equal(parseElevationMeters({ ele: '1000', 'ele:ft': '999' }), 1000);
  });

  test('garbage never becomes a number: null, not a crash, not a fake 0', () => {
    for (const tags of [
      { ele: '' }, { ele: 'abc' }, { ele: 'N/A' }, { ele: '12 km' },
      { ele: '1,234' }, { ele: '12 m²' }, { ele: null }, {},
      { ele: '12.3.4' }, { 'ele:ft': 'abc' },
    ]) {
      assert.equal(parseElevationMeters(tags), null, JSON.stringify(tags));
    }
  });

  test('whitespace, case, decimals and negatives are tolerated', () => {
    assert.equal(parseElevationMeters({ ele: '  944  ' }), 944);
    assert.equal(parseElevationMeters({ ele: '944 M' }), 944);
    assert.equal(parseElevationMeters({ ele: '944.5' }), 944.5);
    assert.equal(parseElevationMeters({ ele: '-5' }), -5);
    assert.equal(parseElevationMeters({ 'ele:ft': ' 4042 ' }), 4042 * 0.3048, 'the aux source is bare numbers');
    assert.equal(parseElevationMeters({ 'ele:ft': '4042 FT' }), null, 'units in the aux source are garbage by its semantics');
  });

  test('ele:ft only rescues features whose ele is absent or unparseable', () => {
    assert.equal(parseElevationMeters({ ele: 'junk', 'ele:ft': '100' }), 100 * 0.3048);
    assert.equal(parseElevationMeters({ ele: 'junk' }), null);
  });
});

/* Tile lift -------------------------------------------------------------------------- */

suite('natural landmarks / tile lift', () => {
  test('keeps only the trio as points; ridge/cliff and geometry never pass', () => {
    const lifted = peaksFromTileFeatures([
      mkTileFeature('peak', 114.17, 22.58, { name: 'Wutong', ele: 944, rank: 1 }),
      mkTileFeature('volcano', 138.72, 35.36, { ele: 100 }),
      mkTileFeature('saddle', 114.18, 22.59),
      mkTileFeature('ridge', 114.16, 22.57),
      mkTileFeature('cliff', 114.15, 22.56),
      mkTileFeature('beach', 114.14, 22.55),
      { properties: { class: 'peak' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
      { properties: { class: 'peak' } },
    ]);
    assert.deepEqual(lifted.map((m) => m.type).sort(), ['peak', 'saddle', 'volcano']);
    assert.equal(lifted.find((m) => m.type === 'peak').rank, 1);
    assert.equal(lifted.find((m) => m.type === 'saddle').rank, 5, 'rankless defaults to the minor tier');
  });

  test('overlapping tiles dedup on class + rounded coordinates', () => {
    assert.equal(peaksFromTileFeatures([
      mkTileFeature('peak', 114.000001, 22.5),
      mkTileFeature('peak', 114.0000009, 22.5),
      mkTileFeature('peak', 114.001, 22.5),
      mkTileFeature('volcano', 114.000001, 22.5),
    ]).length, 3, 'same summit twice collapses, a different class does not');
  });
});

/* Label composition (bilingual + elevation, JS-side) ---------------------------------- */

suite('natural landmarks / label composition', () => {
  test('name + elevation: the two-line stack through the shared formatter', async () => {
    await language.setLanguage('en');
    setUnitSystem('metric');
    assert.equal(buildNaturalLabel('Mount Example', 'Mount Example', 842), 'Mount Example\n842 m',
      'local equals main → no second line, elevation stacked');
    assert.equal(buildNaturalLabel('Mount Example', 'Example Mount', 842), 'Mount Example\nExample Mount\n842 m',
      'a differing local name takes the middle line');
  });

  test('every missing piece drops its line — four combinations, never a fake name', () => {
    setUnitSystem('metric');
    assert.equal(buildNaturalLabel('Mount Example', 'Example Mount', null), 'Mount Example\nExample Mount');
    assert.equal(buildNaturalLabel('Mount Example', 'Mount Example', null), 'Mount Example');
    assert.equal(buildNaturalLabel('', '', 842), '842 m', 'anonymous landmarks announce their height');
    assert.equal(buildNaturalLabel('', '', null), '', 'bare icon — never the internal natural tag');
  });

  test('imperial renders feet through the shared formatter, whatever the raw tag was', async () => {
    await language.setLanguage('en');
    setUnitSystem('imperial');
    assert.equal(buildNaturalLabel('', '', 842).endsWith('ft'), true, buildNaturalLabel('', '', 842));
    setUnitSystem('metric');
    assert.equal(getUnitSystem(), 'metric', 'restored');
  });

  test('buildPeakFeatureCollection composes gateClass, sortRank and the localized label', async () => {
    await language.setLanguage('zh-CN');
    setUnitSystem('metric');
    const fc = buildPeakFeatureCollection([
      { type: 'peak', lon: 114.17, lat: 22.58, rank: 1, tags: { class: 'peak', name: '梧桐山', 'name:zh-Hans': '梧桐山', 'name:en': 'Mount Wutong', ele: 944 } },
      { type: 'saddle', lon: 114.18, lat: 22.59, rank: 4, tags: { class: 'saddle' } },
    ]);
    const [peak, saddle] = fc.features;
    assert.equal(peak.properties.gateClass, 'peak-major', 'rank 1 leads as major');
    assert.equal(peak.properties.sortRank, 1, 'majors win collisions');
    assert.equal(peak.properties.naturalClass, 'peak');
    assert.equal(peak.properties.label, '梧桐山\n944 米', 'zh main name; the suffix is the zh pack unitM');
    assert.equal(saddle.properties.gateClass, 'saddle');
    assert.equal(saddle.properties.sortRank, 5, 'saddle loses collisions');
    assert.equal(saddle.properties.label, '', 'nameless, ele-less → bare icon');
    await language.setLanguage('en');
    setUnitSystem('metric');
  });

  test('localizedName walks the shared fallback chain', () => {
    const tags = { name: ' Local ', 'name:en': 'Local' };
    assert.equal(localizedName({ 'name:ja': '日本語名', name: 'Local' }, 'ja'), '日本語名');
    assert.equal(localizedName({ name: 'Local' }, 'zh-CN'), 'Local', 'no zh fields → falls to the raw name');
    assert.equal(localizedName({}, 'en'), '', 'nameless → the tag never becomes a name');
    assert.truthy(!localizedName(tags, 'en').includes('undefined'));
  });
});

/* Small classes (stepped text-fields, elevation inline with the name) ------- */

suite('natural landmarks / small-class label text-fields', () => {
  const defById = (id, lang, unit) => naturalLayerDefs(lang, unit).find((d) => d.id === id);
  const fieldOf = (id, lang, unit) => defById(id, lang, unit).layout['text-field'];
  // The single full branch is tf[4] = format(main, secondary, eleSection) —
  // the main-name coalesce and the local-name secondary live one format
  // level down.
  const mainOf = (tf) => tf[4][1];
  const secondaryOf = (tf) => tf[4][3];

  test('step shape: "" → name-zoom stacked full (elevation rides with the name)', () => {
    const tf = fieldOf('hybrid-natural-cave', 'en', 'metric');
    assert.deepEqual(tf, ['step', ['zoom'], '', 14.5, tf[4]], 'one text stop — no elevation gate');
    assert.equal(tf[4][0], 'format', 'the single branch is a format expression');
    assert.deepEqual(tf[4][1], mainOf(tf), 'the main chain');
    assert.deepEqual(tf[4][3], secondaryOf(tf), 'the same secondary');
    assert.deepEqual(tf[4][4], { 'text-font': ['literal', ['Noto Sans Regular']] },
      'the section font is literal-wrapped (the addLayer silent-rejection trap)');
    const eleSection = tf[4][5];
    assert.equal(eleSection[0], 'case');
    assert.deepEqual(eleSection[2], ['concat', '\n', eleSection[3]], 'stacked via newline when both exist');
    const minor = fieldOf('hybrid-natural-minor', 'en', 'metric');
    assert.deepEqual(minor.slice(0, 4), ['step', ['zoom'], '', 14.5]);
    assert.equal(minor.length, 5, 'no second stop — no per-tier elevation gate');
  });

  test('bilingual secondary: the place-label mechanism reused verbatim', () => {
    const secondary = secondaryOf(fieldOf('hybrid-natural-cave', 'zh-CN', 'metric'));
    assert.equal(secondary[0], 'case');
    const gate = secondary[1];
    assert.equal(gate[0], 'all', 'two conditions gate the secondary');
    assert.equal(gate[1][0], '!=', 'hidden when the local name is absent');
    const dedup = gate[2];
    assert.equal(dedup[0], '!=', 'hidden when equal to the main name');
    assert.equal(dedup[2][0], 'downcase', 'case-insensitive');
    assert.deepEqual(secondary[2], ['concat', '\n', ['get', 'name']], 'places break onto two lines');
  });

  test('name chain: en header → universal tail, zh-CN header with the zh steps', () => {
    assert.deepEqual(chainKeys(mainOf(fieldOf('hybrid-natural-cave', 'en', 'metric'))),
      ['name:en', 'name_int', 'name:latin', 'name', '']);
    assert.deepEqual(chainKeys(mainOf(fieldOf('hybrid-natural-minor', 'zh-CN', 'metric'))),
      ['name:zh-Hans', 'name:zh-CN', 'name:zh', 'name:en', 'name_int', 'name:latin', 'name', '']);
  });

  test('metric: raw meters; imperial: ×1/0.3048 — and the small-class zoom gates hold', () => {
    const metric = fieldOf('hybrid-natural-minor', 'en', 'metric')[4][5][3];
    assert.deepEqual(metric[2][1][1][1], ['get', 'ele'], 'metric rounds the raw meters');
    assert.equal(metric[2][3], 'm');
    const imperial = fieldOf('hybrid-natural-minor', 'en', 'imperial')[4][5][3];
    assert.deepEqual(imperial[2][1][1][1], ['*', ['get', 'ele'], 1 / 0.3048], 'the units.js metersToFeet factor');
    assert.equal(imperial[2][3], 'ft');
    // Gates: both small layers open at the spring tier z13.5; the stepped
    // fields open at the name zoom 14.5.
    assert.equal(defById('hybrid-natural-cave', 'en', 'metric').minzoom, 13.5);
    assert.equal(defById('hybrid-natural-minor', 'en', 'metric').minzoom, 13.5);
    assert.deepEqual(fieldOf('hybrid-natural-minor', 'en', 'metric').slice(0, 4), ['step', ['zoom'], '', 14.5]);
    assert.deepEqual(fieldOf('hybrid-natural-cave', 'en', 'metric').slice(0, 4), ['step', ['zoom'], '', 14.5]);
  });

  test('defaults follow the live language/unit singletons', async () => {
    await language.setLanguage('de');
    const german = naturalLabelTextField(13);
    assert.deepEqual(chainKeys(mainOf(german)), ['name:de', 'name:en', 'name_int', 'name:latin', 'name', '']);
    await language.setLanguage('en');
  });
});

/* Small-class entry tiering (2026-10-04 alignment) -------------------------------------- */

suite('natural landmarks / small-class entry tiering', () => {
  /** One class's column of a classCurve interpolate, evaluated at an
   * arbitrary zoom (linear between stops, clamped at the ends). */
  const columnAt = (expr, zoom, cls) => {
    const stops = [];
    for (let i = 3; i < expr.length; i += 2) {
      const match = expr[i + 1];
      let value = match[match.length - 1];
      for (let j = 2; j < match.length - 1; j += 2) {
        if (match[j] === cls) value = match[j + 1];
      }
      stops.push([expr[i], value]);
    }
    if (zoom <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (zoom <= stops[i][0]) {
        const [z0, v0] = stops[i - 1];
        const [z1, v1] = stops[i];
        return v0 + (v1 - v0) * ((zoom - z0) / (z1 - z0));
      }
    }
    return stops[stops.length - 1][1];
  };
  const zoomsOf = (expr) => {
    const out = [];
    for (let i = 3; i < expr.length; i += 2) out.push(expr[i]);
    return out;
  };
  const minorDef = naturalLayerDefs('en', 'metric').find((d) => d.id === 'hybrid-natural-minor');
  const icons = minorDef.layout['icon-size'];
  const texts = minorDef.layout['text-size'];

  test('icon gates: spring leads at z13.5, rock a zoom later, stone last — hard zeros before entry', () => {
    assert.equal(icons[0], 'interpolate', 'ONE zoom curve');
    for (let i = 4; i < icons.length; i += 2) {
      assert.deepEqual(icons[i].slice(0, 2), ['match', ['get', 'class']],
        'every stop is a match on class (the addLayer silent-rejection rule)');
    }
    const zs = zoomsOf(icons);
    for (let i = 1; i < zs.length; i++) assert.truthy(zs[i] > zs[i - 1], 'stops strictly increase');
    assert.equal(columnAt(icons, 13.5, 'spring'), 0.5, 'spring opens at the layer minzoom');
    assert.equal(columnAt(icons, 13.5, 'waterfall'), 0.5, 'waterfall shares the spring tier (the water pair)');
    assert.equal(columnAt(icons, 14, 'rock'), 0, 'rock hard-zero before its gate');
    assert.equal(columnAt(icons, 14.5, 'rock'), 0.5, 'rock opens at 14.5');
    assert.equal(columnAt(icons, 15, 'stone'), 0, 'stone is EXACTLY invisible at z15 (no ramp-in)');
    assert.equal(columnAt(icons, 15.5, 'stone'), 0.5, 'stone opens at 15.5');
    assert.equal(columnAt(icons, 19, 'spring'), 0.65);
    assert.equal(columnAt(icons, 19, 'waterfall'), 0.65);
    assert.equal(columnAt(icons, 19, 'rock'), 0.65);
    assert.equal(columnAt(icons, 19, 'stone'), 0.6);
  });

  test('text gates: one zoom behind the icon, then the shared 12.5@16 / 13.75@19 shape', () => {
    assert.equal(columnAt(texts, 14, 'spring'), 0, 'no text before the gate');
    assert.equal(columnAt(texts, 14.5, 'spring'), 11.5);
    assert.equal(columnAt(texts, 15, 'rock'), 0, 'rock text waits for 15.5');
    assert.equal(columnAt(texts, 15.5, 'rock'), 11.5);
    assert.equal(columnAt(texts, 16, 'spring'), 12.5, 'the z16 anchor');
    assert.equal(columnAt(texts, 16, 'rock'), 12.5);
    assert.equal(columnAt(texts, 16, 'stone'), 0, 'stone text hard-zero at z16');
    assert.equal(columnAt(texts, 16.5, 'stone'), 11.5);
    assert.equal(columnAt(texts, 19, 'stone'), 13.75, 'the z19 anchor');
  });

  test('every class: text gate = icon gate + 1 — text never leads', () => {
    // The 0.5 pre-stop carries the hard zero (denser zero/gate stop pairs
    // are mis-bracketed by MapLibre's interpolate — see MINOR_ICON_ROWS).
    for (const [cls, iconGate] of [['spring', 13.5], ['waterfall', 13.5], ['rock', 14.5], ['stone', 15.5]]) {
      assert.equal(columnAt(texts, iconGate + 0.5, cls), 0, `${cls}: text hard-zero at the pre-stop`);
      assert.truthy(columnAt(texts, iconGate + 1, cls) > 0, `${cls}: text opens one zoom after the icon`);
    }
    assert.equal(NATURAL_LAYER_NAME_ZOOMS['hybrid-natural-minor'], 14.5,
      "spring's stepped text-field opens at its text gate");
  });

  test('minor curves never close after opening either (the zoom-in rule)', () => {
    for (const [name, expr] of [['icons', icons], ['labels', texts]]) {
      for (const cls of ['spring', 'waterfall', 'rock', 'stone']) {
        let opened = false;
        for (let i = 3; i < expr.length; i += 2) {
          const match = expr[i + 1];
          let value = match[match.length - 1];
          for (let j = 2; j < match.length - 1; j += 2) {
            if (match[j] === cls) value = match[j + 1];
          }
          if (value > 0) opened = true;
          else assert.truthy(!opened, `${name}/${cls} closed again after opening`);
        }
        assert.truthy(opened, `${name}/${cls} opens somewhere`);
      }
    }
  });

  test('small icons never outgrow the trio at the same zoom; both small layers paint at 0.95', () => {
    // The trio's LOWEST column per zoom (saddle) is the ceiling the small
    // classes must respect (spec B.4).
    for (const [zoom, trioMin] of [[13.5, 0.55], [14.5, 0.6], [15.5, 0.6], [19, 0.7]]) {
      for (const cls of ['spring', 'waterfall', 'rock', 'stone']) {
        const v = columnAt(icons, zoom, cls);
        assert.truthy(v <= trioMin, `${cls}@${zoom}: ${v} <= trio min ${trioMin}`);
      }
    }
    for (const def of naturalLayerDefs().filter((d) => d.id !== 'hybrid-natural-peaks')) {
      assert.equal(def.paint['icon-opacity'], 0.95, `${def.id}: the trio's icon opacity`);
    }
  });

  test('the cave curve: icons 0.5 → 0.6 → 0.65, text with a hard 0 at the minzoom', () => {
    const def = naturalLayerDefs('en', 'metric').find((d) => d.id === 'hybrid-natural-cave');
    assert.deepEqual(def.layout['icon-size'],
      ['interpolate', ['linear'], ['zoom'], 13.5, 0.5, 15.5, 0.6, 19, 0.65]);
    assert.deepEqual(def.layout['text-size'],
      ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.5, 11.5, 16, 12.5, 19, 13.75],
      'the leading 0 is the clamping guard (minzoom 13.5 < text gate 14.5)');
    assert.deepEqual(def.layout['text-field'].slice(0, 4), ['step', ['zoom'], '', 14.5]);
  });

  test('the tiering constants: minzooms 13.5, name zooms 14.5', () => {
    for (const def of naturalLayerDefs().filter((d) => d.id !== 'hybrid-natural-peaks')) {
      assert.equal(def.minzoom, 13.5, `${def.id}: the spring tier opens the layer`);
    }
    assert.deepEqual(NATURAL_LAYER_NAME_ZOOMS, { 'hybrid-natural-cave': 14.5, 'hybrid-natural-minor': 14.5 });
  });
});

/* Overpass element parser ----------------------------------------------------------- */

suite('natural landmarks / overpass elements', () => {
  test('query: the five tile-less classes only, nodes only, one batched call', () => {
    const q = overpassNaturalQuery({ s: 1, w: 2, n: 3, e: 4 });
    assert.truthy(q.startsWith('[out:json][timeout:20][bbox:1,2,3,4];'),
      'json + timeout preamble with the global bbox (south,west,north,east)');
    for (const cls of NATURAL_OSM_CLASSES) {
      if (cls === 'waterfall') {
        assert.truthy(q.includes('node["waterway"="waterfall"];'), 'waterfall rides its waterway tag');
        assert.truthy(q.includes('node["natural"="waterfall"];'), 'the natural=waterfall alias queried too');
        continue;
      }
      assert.truthy(q.includes(`node["natural"="${cls}"];`), `${cls}: bare statement, scoped by the global bbox`);
    }
    for (const cls of NATURAL_TILE_CLASSES) {
      assert.truthy(!q.includes(`"${cls}"`), `${cls} rides the tiles — never queried`);
    }
    assert.truthy(q.endsWith(`out body ${OVERPASS_ELEMENT_CAP} qt;`), 'capped body output');
  });

  test('node features keep class, name* tags and canonical ele', () => {
    const feature = naturalFeatureFromOsm({
      type: 'node', id: 42, lat: 22.5, lon: 114.2,
      tags: { natural: 'spring', name: 'Cold Spring', 'name:zh-Hans': '冷泉', ele: '842' },
    });
    assert.equal(feature.type, 'Feature');
    assert.equal(feature.id, 42);
    assert.deepEqual(feature.geometry, { type: 'Point', coordinates: [114.2, 22.5] });
    assert.deepEqual(feature.properties, {
      class: 'spring', name: 'Cold Spring', 'name:zh-Hans': '冷泉', ele: 842,
    });
  });

  test('waterfalls arrive via waterway=waterfall (the natural= alias matches too)', () => {
    const primary = naturalFeatureFromOsm({
      type: 'node', id: 7, lat: 63.5321, lon: -19.5114,
      tags: { waterway: 'waterfall', name: 'Skógafoss', ele: '60' },
    });
    assert.equal(primary.properties.class, 'waterfall', 'the waterway tag maps to the class');
    assert.deepEqual([primary.properties.name, primary.properties.ele], ['Skógafoss', 60]);
    const alias = naturalFeatureFromOsm({
      type: 'node', id: 8, lat: 43.0828, lon: -79.0742,
      tags: { natural: 'waterfall', name: 'Horseshoe Falls' },
    });
    assert.equal(alias.properties.class, 'waterfall', 'the natural alias matches the same class');
    // A foreign waterway value is not a waterfall.
    assert.equal(naturalFeatureFromOsm({ type: 'node', id: 9, lat: 1, lon: 2, tags: { waterway: 'river' } }), null,
      'waterway=river stays out');
  });

  test('foreign natural values, non-nodes and tagless nodes never enter', () => {
    assert.equal(naturalFeatureFromOsm({ type: 'node', id: 1, lat: 1, lon: 2, tags: { natural: 'cliff' } }), null, 'cliff excluded');
    assert.equal(naturalFeatureFromOsm({ type: 'node', id: 1, lat: 1, lon: 2, tags: { natural: 'ridge' } }), null, 'ridge excluded');
    assert.equal(naturalFeatureFromOsm({ type: 'node', id: 1, lat: 1, lon: 2, tags: { natural: 'beach' } }), null);
    assert.equal(naturalFeatureFromOsm({ type: 'way', id: 1, tags: { natural: 'spring' } }), null, 'ways are not points');
    assert.equal(naturalFeatureFromOsm({ type: 'node', id: 1, lat: 1, lon: 2 }), null, 'no tags, no class');
    assert.equal(naturalFeatureFromOsm(null), null);
  });

  test('the four name×elevation combinations all become renderable features', () => {
    const both = naturalFeatureFromOsm({ type: 'node', id: 1, lat: 1, lon: 2, tags: { natural: 'rock', name: 'Old Harry', ele: '100' } });
    assert.deepEqual([both.properties.name, both.properties.ele], ['Old Harry', 100]);
    const named = naturalFeatureFromOsm({ type: 'node', id: 2, lat: 1, lon: 2, tags: { natural: 'rock', name: 'Old Harry' } });
    assert.equal(named.properties.name, 'Old Harry');
    assert.equal(named.properties.ele, undefined, 'elevation simply absent');
    const anonymousEle = naturalFeatureFromOsm({ type: 'node', id: 3, lat: 1, lon: 2, tags: { natural: 'stone', ele: '50' } });
    assert.equal(anonymousEle.properties.name, undefined);
    assert.equal(anonymousEle.properties.ele, 50);
    const bare = naturalFeatureFromOsm({ type: 'node', id: 4, lat: 1, lon: 2, tags: { natural: 'stone' } });
    assert.deepEqual(bare.properties, { class: 'stone' }, 'icon-only feature');
  });
});

/* Viewport fetcher ------------------------------------------------------------------ */

suite('natural landmarks / viewport fetcher', () => {
  test('fetches the padded view when eligible, deep enough, outside the cache', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ elements: [] }) }); },
    });
    const map = naturalStubMap();
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    natural.setEligible(true);
    await natural.sync(map);
    await tick();
    assert.equal(calls.length, 1, 'one fetch');
    assert.truthy(calls[0].url.includes('overpass'), 'an overpass endpoint');
    assert.truthy(calls[0].init.body.startsWith('data=%5Bout%3Ajson%5D'), 'form-encoded query');
    // Inside the cached box: free.
    await natural.sync(map);
    await tick();
    assert.equal(calls.length, 1, 'cached view costs nothing');
    // Outgrowing the cache refetches.
    map.setBounds(mkBounds(10, 10, 12, 12));
    await natural.sync(map);
    await tick();
    assert.equal(calls.length, 2, 'view outgrew the cache');
  });

  test('guards: ineligible, shallow zoom, missing source — no fetch', async () => {
    const calls = [];
    const fetchImpl = (url, init) => { calls.push(init); return Promise.resolve({ ok: true, json: () => Promise.resolve({ elements: [] }) }); };
    // Ineligible: no fetch even with source + depth.
    const ineligible = createNaturalFeatures({ fetchImpl });
    const map = naturalStubMap();
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    await ineligible.sync(map);
    await tick();
    assert.equal(calls.length, 0, 'not eligible yet');
    // Missing source: the fetcher has nothing to feed.
    const noSource = createNaturalFeatures({ fetchImpl });
    const bareMap = naturalStubMap();
    noSource.setEligible(true);
    await noSource.sync(bareMap);
    await tick();
    assert.equal(calls.length, 0, 'no source to feed');
    // Below the fetch gate: the classes aren't visible yet.
    const shallow = createNaturalFeatures({ fetchImpl });
    const shallowMap = naturalStubMap({ zoom: 11 });
    shallowMap.addSource(HYBRID_NATURAL_SOURCE_ID);
    shallow.setEligible(true);
    await shallow.sync(shallowMap);
    await tick();
    assert.equal(calls.length, 0, 'below the fetch gate');
  });

  test('results land as parsed features; foreign elements and ways drop out', async () => {
    let respond;
    const natural = createNaturalFeatures({
      fetchImpl: () => new Promise((resolve) => { respond = resolve; }),
    });
    const map = naturalStubMap();
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    natural.setEligible(true);
    await natural.sync(map);
    respond({ ok: true, json: () => Promise.resolve({ elements: [
      { type: 'node', id: 1, lat: 22.4, lon: 114.2, tags: { natural: 'cave_entrance', name: 'Cave', ele: '100 m' } },
      { type: 'node', id: 2, lat: 22.4, lon: 114.2, tags: { natural: 'peak', name: 'Not Mine' } },
      { type: 'way', id: 3, tags: { natural: 'spring' } },
    ] }) });
    await tick();
    assert.equal(map.setDataCalls.length, 1);
    const { id, data } = map.setDataCalls[0];
    assert.equal(id, HYBRID_NATURAL_SOURCE_ID);
    assert.equal(data.type, 'FeatureCollection');
    assert.equal(data.features.length, 1, 'only the cave entrance survives');
    assert.equal(data.features[0].properties.class, 'cave_entrance');
    assert.equal(data.features[0].properties.ele, 100, 'canonical meters');
  });

  test('a newer sync supersedes the in-flight one (aborted signal, one landing)', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: (url, init) => { calls.push(init); return new Promise(() => {}); },
    });
    const map = naturalStubMap();
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    natural.setEligible(true);
    await natural.sync(map);
    map.setBounds(mkBounds(40, 40, 42, 42));
    await natural.sync(map);
    assert.equal(calls.length, 2, 'both issued');
    assert.truthy(calls[0].signal.aborted, 'the superseded fetch was aborted');
    assert.truthy(!calls[1].signal.aborted, 'the live fetch runs on');
  });

  test('every endpoint failing stays silent — no throw, no data, retry next sync', async () => {
    let attempts = 0;
    const natural = createNaturalFeatures({
      fetchImpl: () => { attempts++; return Promise.resolve({ ok: false, status: 504 }); },
    });
    const map = naturalStubMap();
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    natural.setEligible(true);
    await natural.sync(map);
    await tick();
    assert.equal(attempts, 5, 'the whole five-mirror chain tried');
    assert.equal(map.setDataCalls.length, 0, 'nothing landed');
    // Recovery: a working endpoint on the next move-end.
    const recover = createNaturalFeatures({
      fetchImpl: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ elements: [
        { type: 'node', id: 9, lat: 22.4, lon: 114.2, tags: { natural: 'stone' } },
      ] }) }),
    });
    const map2 = naturalStubMap();
    map2.addSource(HYBRID_NATURAL_SOURCE_ID);
    recover.setEligible(true);
    await recover.sync(map2);
    await tick();
    assert.equal(map2.setDataCalls.length, 1, 'recovered on the next sync');
  });

  test('disabling aborts the in-flight fetch; the move-end driver is attached once', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: (url, init) => { calls.push(init); return new Promise(() => {}); },
    });
    const map = naturalStubMap();
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    natural.setEligible(true);
    await natural.sync(map);
    assert.equal(calls.length, 1);
    assert.equal(map.handlers.moveend.length, 1, 'one driver');
    natural.setEligible(false);
    assert.truthy(calls[0].signal.aborted, 'disabled aborts in-flight');
    // The driver fires sync on move-end; ineligible → no fetch.
    map.handlers.moveend[0]();
    await tick();
    assert.equal(calls.length, 1);
    // Re-enable + a move: the driver path fetches again.
    natural.setEligible(true);
    map.handlers.moveend[0]();
    await tick();
    assert.equal(calls.length, 2, 'the same driver serves re-enabled fetches');
    await natural.sync(map);
    assert.equal(map.handlers.moveend.length, 1, 'still exactly one driver');
  });

  test('heavy payloads truncate at the cap and stay one FeatureCollection', async () => {
    const elements = Array.from({ length: OVERPASS_ELEMENT_CAP + 500 }, (_, i) => ({
      type: 'node', id: i, lat: 22 + (i % 10) / 100, lon: 114 + i / 1000, tags: { natural: 'stone' },
    }));
    const natural = createNaturalFeatures({
      fetchImpl: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ elements }) }),
    });
    const map = naturalStubMap();
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    natural.setEligible(true);
    await natural.sync(map);
    await tick();
    assert.equal(map.setDataCalls.length, 1);
    assert.equal(map.setDataCalls[0].data.features.length, OVERPASS_ELEMENT_CAP, 'capped');
  });

  test('cache retention: invalidate keeps the viewport cache; a fresh hang replays it fetch-free', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: () => { calls.push(1); return Promise.resolve({ ok: true, json: () => Promise.resolve({ elements: [
        { type: 'node', id: 1, lat: 22.4, lon: 114.2, tags: { natural: 'spring', name: 'Kept' } },
      ] }) }); },
    });
    const map = naturalStubMap();
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    natural.setEligible(true);
    await natural.sync(map);
    await tick();
    assert.equal(calls.length, 1, 'the one fetch');
    assert.equal(map.setDataCalls.length, 1, 'data landed');
    // Fresh hang: invalidate() + the source recreated empty, view unchanged
    // (inside the cached box).
    natural.invalidate();
    assert.equal(natural.hasCache(), true, 'invalidate keeps the viewport cache');
    map.removeSource(HYBRID_NATURAL_SOURCE_ID);
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    await natural.sync(map);
    await tick();
    assert.equal(calls.length, 1, 'zero fetch on the replay');
    assert.equal(map.setDataCalls.length, 2, 'the cached features were replayed');
    assert.equal(map.setDataCalls[1].data.features[0].properties.name, 'Kept', 'the same features came back');
    // A view that OUTGROWS the cached box still refetches and replaces it.
    map.setBounds(mkBounds(40, 40, 42, 42));
    await natural.sync(map);
    await tick();
    assert.equal(calls.length, 2, 'outside the box the fetch returns');
    assert.equal(map.setDataCalls.length, 3, 'the new payload replaces the cache');
  });

  test('cache retention: displayed data is not replayed again and hits cost nothing', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: () => { calls.push(1); return Promise.resolve({ ok: true, json: () => Promise.resolve({ elements: [] }) }); },
    });
    const map = naturalStubMap();
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    natural.setEligible(true);
    await natural.sync(map);
    await tick();
    assert.equal(calls.length, 1);
    assert.equal(map.setDataCalls.length, 1);
    await natural.sync(map);
    await tick();
    assert.equal(calls.length, 1, 'cache hit, zero fetch');
    assert.equal(map.setDataCalls.length, 1, 'already displayed — no replay');
  });
});

/* Viewport fetcher — the staggered hedged race (2026-10-05) --------------------------- */

suite('natural landmarks / viewport fetcher — the hedged race', () => {
  const Z_URL = 'https://z.overpass-api.de/api/interpreter';
  const LZ4_URL = 'https://lz4.overpass-api.de/api/interpreter';
  const RAMBLER_URL = 'https://overpass.osm.rambler.ru/cgi/interpreter';
  /** A node that answers with one stone feature. */
  const okStone = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ elements: [{ type: 'node', id: 1, lat: 22.4, lon: 114.2, tags: { natural: 'stone' } }] }),
  });
  /** A fetch stub shaped like the real thing on abort: rejects when its
   * signal fires (a plain never-settling promise would ignore the abort). */
  const hangUntilAborted = (signal) => new Promise((_, reject) => {
    if (signal.aborted) { reject(new Error('AbortError')); return; }
    signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
  });
  const readyMap = () => {
    const map = naturalStubMap();
    map.addSource(HYBRID_NATURAL_SOURCE_ID);
    return map;
  };

  test('P1: a hung first endpoint can no longer starve the chain — the stagger starts the next mirror and it wins', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: (url, init) => {
        calls.push({ url, signal: init.signal });
        if (url === Z_URL) return new Promise(() => {}); // hung forever (dead first mirror)
        return okStone();
      },
      hedgeMs: 1,
    });
    const map = readyMap();
    natural.setEligible(true);
    await natural.sync(map);
    await tick();
    assert.equal(map.setDataCalls.length, 1, 'the chain still delivered');
    assert.equal(map.setDataCalls[0].data.features.length, 1, 'from the second mirror');
    assert.equal(calls[0].url, Z_URL, 'path 0 was the hung endpoint');
    assert.equal(calls[1].url, LZ4_URL, 'the hedge handed off to mirror 2');
    assert.truthy(calls[0].signal.aborted, 'the hung loser was aborted at settle');
  });

  test('fast-fail cascade: a rejected mirror starts the next one immediately, off the stagger beat', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: (url) => {
        calls.push({ url, t: Date.now() });
        if (url === Z_URL) return Promise.resolve({ ok: false, status: 504 });
        return okStone();
      },
      hedgeMs: 200, // the beat must NOT be what starts mirror 2
    });
    const map = readyMap();
    natural.setEligible(true);
    await natural.sync(map);
    await tick();
    assert.equal(calls.length, 2, 'mirror 2 was reached');
    const diff = calls[1].t - calls[0].t;
    assert.truthy(diff < 200, `cascade diff ${diff}ms must beat the ${200}ms stagger`);
    assert.equal(map.setDataCalls.length, 1, 'mirror 2 answered');
    await new Promise((r) => setTimeout(r, 220));
    assert.equal(calls.length, 2, 'the settled chain fired no further stagger beats');
  });

  test('per-attempt ceiling: a hung mirror is aborted on its OWN timeout and the chain moves on', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: (url, init) => {
        calls.push({ url, signal: init.signal, t: Date.now() });
        if (url === Z_URL) return hangUntilAborted(init.signal);
        return okStone();
      },
      hedgeMs: 5000,       // the stagger must NOT be what rescues this chain
      attemptTimeoutMs: 10, // the per-attempt ceiling is
    });
    const map = readyMap();
    natural.setEligible(true);
    await natural.sync(map);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(calls.length, 2, 'mirror 2 was reached');
    assert.truthy(calls[0].signal.aborted, 'the hung attempt hit its own ceiling');
    const diff = calls[1].t - calls[0].t;
    assert.truthy(diff < 5000, `the cascade came from the ceiling (${diff}ms), not the beat`);
    assert.equal(map.setDataCalls.length, 1, 'the next mirror served the data');
  });

  test('sticky winner: the next chain starts at the mirror that answered last', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: (url) => {
        calls.push(url);
        if (url === Z_URL || url === LZ4_URL) return new Promise(() => {}); // both hung
        if (url === RAMBLER_URL) return okStone();
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ elements: [] }) });
      },
      hedgeMs: 1,
    });
    const map = readyMap();
    natural.setEligible(true);
    await natural.sync(map);
    await tick();
    assert.equal(map.setDataCalls.length, 1, 'the third mirror won the first chain');
    assert.equal(calls.length, 3, 'z + lz4 + rambler, no further paths');
    assert.equal(calls[2], RAMBLER_URL, 'rambler (original index 2) won');
    // Second sync, a new viewport outside the cache: rambler leads.
    map.setBounds(mkBounds(40, 40, 42, 42));
    await natural.sync(map);
    await tick();
    assert.equal(calls[3], RAMBLER_URL, 'the sticky start leads the next chain');
    assert.equal(calls.length, 4, 'and the sticky winner alone served it');
  });

  test('same-box dedup: an identical in-flight sync is not superseded; a different box still aborts it', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: (url, init) => { calls.push({ url, signal: init.signal }); return new Promise(() => {}); },
    });
    const map = readyMap();
    natural.setEligible(true);
    await natural.sync(map);
    await natural.sync(map); // the same bounds again — a style re-hang, say
    assert.equal(calls.length, 1, 'the duplicate sync rode the in-flight request');
    map.setBounds(mkBounds(40, 40, 42, 42));
    await natural.sync(map);
    assert.equal(calls.length, 2, 'a changed view refetches');
    assert.truthy(calls[0].signal.aborted, 'the old request was aborted');
    assert.truthy(!calls[1].signal.aborted, 'the new request runs on');
  });

  test('preemption aborts EVERY launched path and a stale winner never lands (seq guard)', async () => {
    const calls = [];
    const staleResolvers = [];
    let phase = 'stale';
    const natural = createNaturalFeatures({
      fetchImpl: (url, init) => {
        calls.push({ url, signal: init.signal });
        if (phase === 'stale') {
          return new Promise((resolve) => staleResolvers.push(() => resolve({
            ok: true,
            json: () => Promise.resolve({ elements: [{ type: 'node', id: 1, lat: 22.4, lon: 114.2, tags: { natural: 'stone' } }] }),
          })));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ elements: [{ type: 'node', id: 2, lat: 40.9, lon: 40.9, tags: { natural: 'rock' } }] }),
        });
      },
      hedgeMs: 5,
    });
    const map = readyMap();
    natural.setEligible(true);
    await natural.sync(map);
    await new Promise((r) => setTimeout(r, 8)); // the 5ms stagger has started path 2 (maybe more)
    const staleCount = calls.length;
    assert.truthy(staleCount >= 2, `several paths in flight (got ${staleCount})`);
    phase = 'live';
    map.setBounds(mkBounds(40, 40, 42, 42));
    await natural.sync(map); // preemption
    assert.truthy(calls.slice(0, staleCount).every((c) => c.signal.aborted),
      'every in-flight stale signal aborted');
    await tick();
    assert.equal(map.setDataCalls.length, 1, 'only the live sync landed');
    assert.equal(map.setDataCalls[0].data.features[0].properties.class, 'rock', 'the new viewport\'s data');
    // The stale chain still wins its own race afterwards — it must NOT land.
    staleResolvers.forEach((resolve) => resolve());
    await tick();
    assert.equal(map.setDataCalls.length, 1, 'the stale winner stayed silent');
  });

  test('latch gate: a pre-gate (zero-size) rendered feature never latches — the gate zoom decides', () => {
    const natural = createNaturalFeatures({ fetchImpl: () => new Promise(() => {}) });
    const map = naturalStubMap({
      tileFeatures: [
        mkTileFeature('peak', 114.17, 22.58, { name: 'Wutong', ele: 944 }), // rank 5 → gate 'peak', icon 11
        mkTileFeature('volcano', 114.18, 22.59, { ele: 800 }), // rank 5 → gate 'volcano', icon 10
      ],
      renderedFeatures: [
        { properties: { naturalClass: 'peak', gateClass: 'peak' }, geometry: { type: 'Point', coordinates: [114.17, 22.58] } },
        { properties: { naturalClass: 'volcano' }, geometry: { type: 'Point', coordinates: [114.18, 22.59] } }, // no gateClass
      ],
    });
    map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    map.addSource(HYBRID_SOURCE_ID);
    map.addLayer({ id: 'hybrid-natural-peaks', type: 'symbol' });
    natural.setEligible(true);
    const sortRankOf = (call, cls) => call.data.features.find((f) => f.properties.naturalClass === cls).properties.sortRank;
    // z10: the peak's gate (11) is closed — queried at size 0 but never SEEN.
    map.setZoom(10);
    natural.rebuildTileFeed(map);
    assert.equal(sortRankOf(map.setDataCalls[0], 'peak'), 2, 'z10 < gate 11: not latched');
    assert.equal(sortRankOf(map.setDataCalls[0], 'volcano'), 4, 'no gateClass: never latches');
    // z11: the peak's gate opens — now it has been drawn, it latches.
    map.setZoom(11);
    natural.rebuildTileFeed(map);
    assert.equal(sortRankOf(map.setDataCalls[1], 'peak'), 2 - 20, 'z11 = gate: seen → latched');
    assert.equal(sortRankOf(map.setDataCalls[1], 'volcano'), 4, 'still guarded by the missing gateClass');
  });

  test('no extra paths: a winning first mirror keeps the chain at one request', async () => {
    const calls = [];
    const natural = createNaturalFeatures({
      fetchImpl: (url) => { calls.push(url); return okStone(); },
      hedgeMs: 5,
    });
    const map = readyMap();
    natural.setEligible(true);
    await natural.sync(map);
    await new Promise((r) => setTimeout(r, 40)); // several beats would have fired
    assert.equal(calls.length, 1, 'the winner settled the chain — no stagger beats launched');
    assert.equal(map.setDataCalls.length, 1);
  });
});

/* Tile feed --------------------------------------------------------------------------- */

suite('natural landmarks / tile feed (the WaySlice rebuild)', () => {
  test('the lift source is injectable — the OpenFreeMap styles feed the trio from their OWN planet source', () => {
    const natural = createNaturalFeatures({
      fetchImpl: () => new Promise(() => {}),
      getRoadsSourceId: () => 'style-planet-source',
    });
    const peak = mkTileFeature('peak', 114.17, 22.58, { name: 'Mount Wutong', ele: 944, rank: 1 });
    const map = naturalStubMap();
    // The style's source carries the same mountain_peak source-layer under
    // its own id — the resolver's job is to hand that id to the lift.
    map.querySourceFeatures = (id, opts) => (id === 'style-planet-source' && opts?.sourceLayer === 'mountain_peak' ? [peak] : []);
    map.addSource('style-planet-source');
    map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    natural.setEligible(true);
    natural.rebuildTileFeed(map);
    const call = map.setDataCalls.find((c) => c.id === HYBRID_NATURAL_TILE_SOURCE_ID);
    assert.equal(call.data.features.length, 1, 'lifted from the injected source');
    assert.equal(call.data.features[0].properties.naturalClass, 'peak');
  });

  test('a null lift source (no basemap yet / unmatched style) empties the trio silently', () => {
    const natural = createNaturalFeatures({
      fetchImpl: () => new Promise(() => {}),
      getRoadsSourceId: () => null,
    });
    const map = naturalStubMap({ tileFeatures: [mkTileFeature('peak', 114.17, 22.58)] });
    map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    natural.setEligible(true);
    natural.rebuildTileFeed(map);
    const call = map.setDataCalls.find((c) => c.id === HYBRID_NATURAL_TILE_SOURCE_ID);
    assert.deepEqual(call.data.features, [], 'nothing to lift from — empty, silent');
  });


  test('rebuild lifts the trio into gate-tagged features with composed labels', async () => {
    await language.setLanguage('en');
    setUnitSystem('metric');
    const natural = createNaturalFeatures({ fetchImpl: () => new Promise(() => {}) });
    const map = naturalStubMap({
      tileFeatures: [
        mkTileFeature('peak', 114.17, 22.58, { name: 'Mount Wutong', ele: 944, rank: 1 }),
        mkTileFeature('ridge', 114.16, 22.57),
      ],
    });
    map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    map.addSource(HYBRID_SOURCE_ID);
    natural.setEligible(true);
    natural.rebuildTileFeed(map);
    assert.equal(map.setDataCalls.length, 1);
    const { id, data } = map.setDataCalls[0];
    assert.equal(id, HYBRID_NATURAL_TILE_SOURCE_ID);
    assert.equal(data.features.length, 1, 'the ridge never passes the lift');
    const props = data.features[0].properties;
    assert.deepEqual(props, {
      naturalClass: 'peak',
      gateClass: 'peak-major',
      sortRank: 1,
      label: 'Mount Wutong\n944 m',
    });
  });

  test('guards: ineligible or missing sources rebuild nothing', () => {
    const natural = createNaturalFeatures({ fetchImpl: () => new Promise(() => {}) });
    const map = naturalStubMap({ tileFeatures: [mkTileFeature('peak', 1, 1)] });
    map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    map.addSource(HYBRID_SOURCE_ID);
    natural.rebuildTileFeed(map);
    assert.equal(map.setDataCalls.length, 0, 'not eligible');
    natural.setEligible(true);
    natural.rebuildTileFeed(map);
    assert.equal(map.setDataCalls.length, 1, 'eligible rebuilds');
    const bare = naturalStubMap({ tileFeatures: [mkTileFeature('peak', 1, 1)] });
    bare.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    natural.rebuildTileFeed(bare);
    assert.equal(bare.setDataCalls.length, 1, 'no roads source → an empty collection, no crash');
    assert.equal(bare.setDataCalls[0].data.features.length, 0);
  });

  test('attachTileFeed arms move-end + idle exactly once and debounces the rebuild', async () => {
    const natural = createNaturalFeatures({ fetchImpl: () => new Promise(() => {}), rebuildDebounceMs: 5 });
    const map = naturalStubMap({
      tileFeatures: [mkTileFeature('volcano', 138.7, 35.3, { ele: 100 })],
    });
    map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    map.addSource(HYBRID_SOURCE_ID);
    natural.setEligible(true);
    natural.attachTileFeed(map);
    assert.equal(map.handlers.moveend.length, 1, 'the camera driver, once');
    assert.equal(map.handlers.idle.length, 1, 'the idle driver, once');
    // Burst of camera events inside the debounce window → one rebuild.
    map.handlers.moveend[0]();
    map.handlers.idle[0]();
    map.handlers.moveend[0]();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(map.setDataCalls.length, 1, 'debounced to one');
    const props = map.setDataCalls[0].data.features[0].properties;
    assert.equal(props.naturalClass, 'volcano');
    assert.equal(props.gateClass, 'volcano', 'rankless volcano rides the base gate');
    assert.equal(props.label, '100 m', 'anonymous → elevation-only label');
    // Ineligible camera events rebuild nothing further.
    natural.setEligible(false);
    map.handlers.moveend[0]();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(map.setDataCalls.length, 1);
  });

  test('a unit switch recomposes the labels through the same rebuild', async () => {
    await language.setLanguage('en');
    setUnitSystem('metric');
    const natural = createNaturalFeatures({ fetchImpl: () => new Promise(() => {}) });
    const map = naturalStubMap({ tileFeatures: [mkTileFeature('peak', 114.17, 22.58, { name: 'Mount Wutong', ele: 944 })] });
    map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    map.addSource(HYBRID_SOURCE_ID);
    natural.setEligible(true);
    natural.rebuildTileFeed(map);
    assert.equal(map.setDataCalls[0].data.features[0].properties.label, 'Mount Wutong\n944 m');
    setUnitSystem('imperial');
    natural.rebuildTileFeed(map);
    const relabel = map.setDataCalls[1].data.features[0].properties.label;
    assert.equal(relabel.endsWith('ft'), true, relabel);
    setUnitSystem('metric');
  });

  test('overzoom: above the tile maxzoom a starving lift holds the last models (zooming in never wipes)', () => {
    const natural = createNaturalFeatures({ fetchImpl: () => new Promise(() => {}) });
    const map = naturalStubMap({
      zoom: 16,
      tileFeatures: [mkTileFeature('peak', 114.17, 22.58, { name: 'Mount Wutong', ele: 944 })],
    });
    map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    map.addSource(HYBRID_SOURCE_ID);
    map.addLayer({ id: 'hybrid-natural-peaks', type: 'symbol' });
    natural.setEligible(true);
    natural.rebuildTileFeed(map);
    assert.equal(map.setDataCalls[0].data.features.length, 1, 'lifted normally while the raw query has data');
    // The overzoomed raw query starves → the cache carries the landmarks.
    map.tileFeatures = [];
    natural.rebuildTileFeed(map);
    assert.equal(map.setDataCalls[1].data.features.length, 1, 'zooming in never wipes');
    assert.equal(map.setDataCalls[1].data.features[0].properties.label, map.setDataCalls[0].data.features[0].properties.label);
    // A fresh controller (new session) has no cache — the wipe only hit stale state.
    const fresh = createNaturalFeatures({ fetchImpl: () => new Promise(() => {}) });
    const z16 = naturalStubMap({ zoom: 16, tileFeatures: [] });
    z16.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    z16.addSource(HYBRID_SOURCE_ID);
    z16.addLayer({ id: 'hybrid-natural-peaks', type: 'symbol' });
    fresh.setEligible(true);
    fresh.rebuildTileFeed(z16);
    assert.equal(z16.setDataCalls[0].data.features.length, 0);
  });

  test('overzoom: a PARTIAL lift only adds — the models never shrink above the tile maxzoom', async () => {
    await language.setLanguage('en');
    setUnitSystem('metric');
    const natural = createNaturalFeatures({ fetchImpl: () => new Promise(() => {}) });
    const map = naturalStubMap({
      zoom: 12,
      tileFeatures: [
        mkTileFeature('peak', 114.17, 22.58, { name: 'Summit', ele: 702 }),
        mkTileFeature('peak', 114.18, 22.59, { name: 'Neighbour', ele: 640 }),
        mkTileFeature('saddle', 114.19, 22.60, {}),
      ],
    });
    map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    map.addSource(HYBRID_SOURCE_ID);
    map.addLayer({ id: 'hybrid-natural-peaks', type: 'symbol' });
    natural.setEligible(true);
    natural.rebuildTileFeed(map);
    assert.equal(map.setDataCalls[0].data.features.length, 3, 'a maxzoom lift is authoritative');
    // z15: the overzoomed query answers with ONE transient ancestor-tile
    // feature (the shape that used to shrink the source and wipe the summit).
    map.setZoom(15);
    map.tileFeatures = [mkTileFeature('peak', 114.30, 22.70, { ele: 200 })];
    natural.rebuildTileFeed(map);
    const merged = map.setDataCalls[1].data.features;
    assert.equal(merged.length, 4, 'the transient lift adds, never replaces');
    const keys = merged.map((f) => `${f.properties.naturalClass}@${f.geometry.coordinates.join(',')}`);
    assert.equal(new Set(keys).size, 4, 'the union stays deduped');
    assert.equal(merged.some((f) => f.properties.label === 'Summit\n702 m'), true, 'kept models keep their composed labels');
    // Steady overzoom starvation: still the same four.
    map.tileFeatures = [];
    natural.rebuildTileFeed(map);
    assert.equal(map.setDataCalls[2].data.features.length, 4, 'a starving lift keeps the union');
    // A duplicate in the transient lift never doubles a kept landmark.
    map.tileFeatures = [mkTileFeature('peak', 114.17, 22.58, { name: 'Summit', ele: 702 })];
    natural.rebuildTileFeed(map);
    assert.equal(map.setDataCalls[3].data.features.length, 4, 'the kept model wins its key');
    // Zooming back to the maxzoom: the authoritative lift replaces the union.
    map.setZoom(14);
    map.tileFeatures = [mkTileFeature('peak', 114.17, 22.58, { name: 'Summit', ele: 702 })];
    natural.rebuildTileFeed(map);
    assert.equal(map.setDataCalls[4].data.features.length, 1, 'a maxzoom lift replaces the deep-zoom union');
  });

  test('shown-stays-shown: a drawn landmark latches — placement ahead of un-latched neighbors', () => {
    const natural = createNaturalFeatures({ fetchImpl: () => new Promise(() => {}) });
    const map = naturalStubMap({
      tileFeatures: [
        mkTileFeature('peak', 114.17, 22.58, { name: 'Wutong', ele: 944, rank: 1 }),
        mkTileFeature('volcano', 114.18, 22.59, { ele: 800, rank: 1 }),
      ],
    });
    map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID);
    map.addSource(HYBRID_SOURCE_ID);
    map.addLayer({ id: 'hybrid-natural-peaks', type: 'symbol' });
    natural.setEligible(true);
    natural.rebuildTileFeed(map);
    const [first] = map.setDataCalls[0].data.features;
    const find = (data, cls) => data.features.find((f) => f.properties.naturalClass === cls);
    assert.equal(find(map.setDataCalls[0].data, 'volcano').properties.sortRank, 3, 'un-latched: the WaySlice rank');
    // The peak was DRAWN (the rendered stub answers for it) → next rebuild
    // latches it. Rendered features carry gateClass — the latch's gate check
    // (2026-10-05) reads it to tell "seen" from "merely loaded".
    map.renderedFeatures = [{
      properties: { naturalClass: 'peak', gateClass: 'peak-major' },
      geometry: { type: 'Point', coordinates: [114.17, 22.58] },
    }];
    natural.rebuildTileFeed(map);
    assert.equal(find(map.setDataCalls[1].data, 'peak').properties.sortRank, 1 - 20, 'latched places ahead of everything');
    assert.equal(find(map.setDataCalls[1].data, 'volcano').properties.sortRank, 3, 'the un-drawn volcano stays un-latched');
    // The gate still owns zoom-out: the curves close below the entry zoom (pinned above).
  });
});

/* Lifecycle hooks & icons ------------------------------------------------------------ */

suite('natural landmarks / overlay lifecycle & icons', () => {
  test('enabled/disabled/pruned/invalidate ride the state machine', () => {
    let satellite = true;
    const { controller, calls } = makeController(() => satellite);
    const map = naturalStubMap();
    map.addLayer({ id: 'basemap-layer', type: 'raster' });
    map.addLayer({ id: 'track-casing', type: 'line' });
    controller.toggle();
    controller.apply(map);
    assert.equal(calls.invalidated, 1, 'fresh hang invalidates the cache');
    assert.equal(calls.enabled.length, 1, 'enabled(map) closes the pass');
    assert.equal(calls.enabled[0], map);
    controller.toggle();
    controller.apply(map);
    assert.equal(calls.disabled, 1, 'toggle-off disables the fetcher');
    controller.toggle();
    controller.apply(map);
    assert.equal(calls.disabled, 1, 're-enable does not double-disable');
    satellite = false;
    controller.apply(map);
    assert.equal(calls.pruned, 1, 'leaving satellite prunes the fetcher');
  });

  test('the natural layers hang between the place labels and the terrain stack', () => {
    const { controller } = makeController(() => true);
    const map = naturalStubMap();
    map.addLayer({ id: 'basemap-layer', type: 'raster' });
    map.addLayer({ id: 'terrain-hillshade', type: 'hillshade' });
    map.addLayer({ id: 'track-casing', type: 'line' });
    controller.toggle();
    controller.apply(map);
    const order = map.layers();
    assert.equal(order.indexOf('hybrid-place-labels') < order.indexOf('hybrid-natural-peaks'), true, 'natural tail after the labels');
    assert.equal(order.indexOf('hybrid-natural-minor') < order.indexOf('terrain-hillshade'), true, 'below the terrain module');
    assert.equal(order.indexOf('hybrid-natural-minor') < order.indexOf('track-casing'), true, 'below the track vectors');
    assert.deepEqual(order.filter((id) => id.startsWith('hybrid-natural')), HYBRID_NATURAL_LAYERS);
  });

  test('icons: eight glyphs registered once, rehang-safe, on the 24-unit box', () => {
    assert.equal(Object.keys(NATURAL_ICON_DEFS).length, 8, 'one glyph per class');
    for (const cls of NATURAL_CLASSES) {
      const key = cls === 'cave_entrance' ? 'cave' : cls;
      assert.truthy(NATURAL_ICON_DEFS[key], `glyph for ${cls}`);
    }
    assert.equal(NATURAL_ICON_SIZE, 24, 'the 24-unit drawing grid — 12–16.8 px on screen for the trio');
    const map = naturalStubMap();
    registerNaturalIcons(map);
    assert.equal(map.images.size, 8);
    registerNaturalIcons(map);
    assert.equal(map.images.size, 8, 'idempotent');
    assert.equal(naturalIconName('peak'), 'hybrid-nat-peak', 'the overlay-owned prefix');
  });

  test('peak and volcano: same triangle family, different shapes — the red stays secondary', () => {
    // The peak keeps the filled Lucide triangle verbatim.
    assert.deepEqual(NATURAL_ICON_DEFS.peak.paths,
      ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z'], 'the Lucide triangle');
    assert.equal(NATURAL_ICON_DEFS.peak.kind, 'fill');
    assert.equal(iconFillColor(NATURAL_ICON_DEFS.peak), '#ffffff');
    // The volcano is the TRUNCATED family variant (flat top = crater) with
    // three eruption marks: SHAPE carries the distinction — tellable apart
    // in grayscale and at the small entry sizes — and the red only
    // reinforces it.
    const volcano = NATURAL_ICON_DEFS.volcano;
    assert.equal(volcano.kind, 'fill');
    assert.truthy(volcano.paths.join(' ') !== NATURAL_ICON_DEFS.peak.paths.join(' '), 'not the same triangle');
    assert.truthy(volcano.paths[0].includes('20h18'), 'the truncated cone body');
    assert.equal(volcano.marks?.length, 3, 'three eruption marks above the crater');
    assert.equal(volcano.colorToken, '--series-hr', 'the heart-rate CURVE color');
    // --series-hr is spec-fixed across themes (#ef4444) — the same red under
    // either theme (the -text siblings' per-theme split is NOT used).
    const prev = getPreference();
    setPreference('light');
    assert.equal(iconFillColor(volcano), '#ef4444', 'light theme: the curve red');
    setPreference('dark');
    assert.equal(iconFillColor(volcano), '#ef4444', 'dark theme: the same curve red');
    setPreference(prev);
  });

  test('rasterizeNaturalIcon: the blow-up raster exit for the strip acceptance tools', () => {
    const image = rasterizeNaturalIcon('volcano', 96);
    assert.equal(image.width, 96);
    assert.equal(image.height, 96);
    assert.equal(image.data.length, 96 * 96 * 4, 'RGBA');
    assert.truthy([...image.data].some((v) => v > 0), 'the raster actually drew');
    for (const cls of ['peak', 'saddle', 'cave', 'spring', 'rock', 'stone']) {
      const img = rasterizeNaturalIcon(cls, 48);
      assert.truthy(img && img.width === 48 && img.data.length === 48 * 48 * 4, `${cls} rasterizes`);
    }
    assert.equal(rasterizeNaturalIcon('unknown', 48), null, 'unknown classes have no glyph');
  });

  test('a theme flip re-rasterizes nothing — every glyph is theme-fixed', () => {
    const prev = getPreference();
    setPreference('light');
    const map = naturalStubMap();
    registerNaturalIcons(map);
    assert.equal(map.images.size, 8);
    assert.equal(map.removals.length, 0, 'first registration adds, never removes');
    registerNaturalIcons(map);
    assert.equal(map.removals.length, 0, 'idempotent within a theme');
    setPreference('dark');
    registerNaturalIcons(map);
    assert.equal(map.removals.length, 0, 'the curve red does not move with the theme');
    assert.equal(map.images.size, 8);
    setPreference(prev);
  });

  test('the full overlay stack carries the three-layer natural tail — no per-feature machinery', () => {
    assert.equal(HYBRID_ALL_LAYERS.length, 13, 'park fill + eight road/label + park labels + three natural layers');
    assert.deepEqual([...new Set(HYBRID_ALL_LAYERS)], HYBRID_ALL_LAYERS, 'unique ids');
    assert.deepEqual(HYBRID_ALL_LAYERS.slice(-3), HYBRID_NATURAL_LAYERS, 'natural is the stack tail');
  });
});
