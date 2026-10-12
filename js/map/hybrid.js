/**
 * Hybrid road-network overlay — roads and place names over the satellite
 * imagery. Where the passes conflicted, the symbol/label alignment pass
 * wins.
 *
 * The catalog's satellite group (EOX Sentinel-2, Esri World Imagery) is
 * imagery-only: pure raster on the minimal style, no roads, no labels. This
 * module is the "hybrid" half — a MapLibre hybrid in the official example's
 * organization (imagery below, vector roads/labels floating on it), built on
 * OpenFreeMap's planet vector tiles (the keyless provider family the vector
 * basemaps and the glyph host already come from) with a hand-picked layer
 * set: tunnel ghost, road lines with casings, service roads, tracks and
 * paths (each its own dash), road name labels + place labels — both
 * bilingual (UI-language main name, local name as a smaller second read) —
 * and, since the 2026-10-09 scope extension, park areas (translucent green
 * fill) with their standing name labels. A curated
 * POI label set was tried alongside the same day and removed again by user
 * decision — the POI clutter hurt the exercise-analysis read; the overlay
 * carries no POI. Still no buildings, no Liberty style.
 *
 * State rules (spec; the toggle persists since the 2026-10-04 alignment):
 *   - The overlay is strictly Satellite-dependent. On any other basemap the
 *     source and layers are PRUNED (not loaded, no tile traffic), and the
 *     toggle reads off.
 *   - The toggle is PERSISTED under `wayslice-road-overlay` (the wayslice-*
 *     key family): the stored value is the truth. apply() reads it on every
 *     satellite sync, toggle() writes it, and NOTHING off-satellite ever
 *     rewrites it — leaving Satellite prunes the layers but keeps the
 *     choice, and returning to Satellite restores it (auto-mounting when
 *     it was left on). Refreshing the page restores it the same way; a
 *     missing or garbage value reads as off.
 *
 * The basemaps OUTSIDE the satellite group carry a SECOND face of this
 * button (2026-10-08, extended the same day): the natural landmark tail plus
 * the park name labels (2026-10-09 plan A — parks ride the natural face),
 * and on the standard raster maps also the settlement names (the same
 * 2026-10-09 pass: in 3D the raster tiles' baked labels melt into the
 * draped imagery, so the app's standing place labels take over there; 2D
 * would double them and the OpenFreeMap styles render place names of their
 * own in every mode — see placeOverlayEnabled in js/map/sources.js),
 * persisted under `wayslice-natural-overlay` — default ON, only an
 * explicit 'off' hides. On the OpenFreeMap vector styles the trio lifts
 * from the planet source the style already loads; on the plain raster
 * basemaps the face provisions the app's own keyless planet source for the
 * lift (MapLibre fetches tiles for layer-less sources — referenced by an
 * invisible feeder layer). A catalog entry gates the face with
 * `naturalOverlay` (js/map/sources.js): false disables the button
 * entirely, '3d' rides only the 3D view (the standard raster maps draw
 * their own natural markers into the tiles). hybridOverlayMode() tells the
 * faces apart for the control wiring; every viewmode:changed re-applies.
 *   - Toggle clicks flip LAYER VISIBILITY on Satellite — the source and
 *     layers stay hung, so on/off never rebuilds anything.
 *   - Every setStyle wipes custom layers, so the hang re-runs as a mapView
 *     rehang hook (same seam the terrain module uses). Raster→raster
 *     satellite switches (EOX ↔ Esri) don't setStyle but DO re-insert the
 *     opaque basemap layer above the hung layers, so apply() restacks on
 *     every basemap change too.
 *
 * Layer stack on the style (extended 2026-10-09):
 * basemap imagery → park fill → hybrid roads (tunnel ghost at the bottom,
 * then casing/pavement, service, track, path) → hybrid labels (road names →
 * park names → place names on top) → natural landmarks (seven `natural=*`
 * point classes, js/map/
 * hybrid-natural.js) → hillshade/contours (the terrain module's, unchanged)
 * → track vectors → markers. Vector lines and ground-anchored symbols drape
 * the DEM mesh natively, so the overlay hugs the 3D terrain with no extra
 * machinery — same as the contour lines it sits under.
 */
import { getMapInstance, getActiveSource, onStyleRehang, onMapStyleReady } from './mapView.js';
import { getViewMode } from './viewMode.js';
import { on } from '../core/events.js';
import { getCurrentLanguage } from '../language/language.js';
import { getUnitSystem } from '../units/units.js';
import { naturalOverlayEnabled, placeOverlayEnabled } from './sources.js';
import { labelNameChain } from './labelLanguage.js';
import {
  HYBRID_NATURAL_LAYERS, HYBRID_NATURAL_SOURCE_ID, HYBRID_NATURAL_TILE_SOURCE_ID,
  NATURAL_LAYER_NAME_ZOOMS,
  naturalLabelTextField, naturalLayerDefs, createNaturalFeatures,
} from './hybrid-natural.js';
import { registerNaturalIcons } from './naturalIcons.js';

export const HYBRID_SOURCE_ID = 'hybrid-roads';
/** OpenFreeMap's planet TileJSON (keyless; maxzoom 14, overzoom beyond).
 * The TileJSON's attribution (OpenFreeMap, © OpenMapTiles, OSM contributors)
 * reaches the attribution control on its own. */
export const HYBRID_TILE_URL = 'https://tiles.openfreemap.org/planet';

/** localStorage key of the persisted road-overlay toggle — the wayslice-*
 * key family (wayslice-basemap / wayslice-language / wayslice-terrain). */
export const ROAD_OVERLAY_STORAGE_KEY = 'wayslice-road-overlay';

/** localStorage key of the persisted natural-overlay toggle — the OpenFreeMap
 * basemaps' mountain button (the styles already carry their own roads, so
 * this face toggles the seven landmark classes only). Same key family. */
export const NATURAL_OVERLAY_STORAGE_KEY = 'wayslice-natural-overlay';

/** The stored toggle, READ as the truth: 'on' means on, everything else
 * (missing, garbage, unavailable storage) means off. Never throws. */
function savedRoadOverlayOn() {
  try {
    return localStorage.getItem(ROAD_OVERLAY_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Persists the toggle as 'on' / 'off'; silently inert when localStorage is
 * unavailable (the choice degrades to session-only, never an error). */
function saveRoadOverlayOn(on) {
  try {
    localStorage.setItem(ROAD_OVERLAY_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable — nothing to persist */
  }
}

/** The stored natural toggle, READ as the truth — with the opposite default
 * from the roads: a missing or garbage value reads ON (the landmarks are
 * part of the OpenFreeMap basemaps' default read; first visit shows them),
 * only an explicit 'off' hides them. Never throws. */
function savedNaturalOverlayOn() {
  try {
    return localStorage.getItem(NATURAL_OVERLAY_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Persists the natural toggle as 'on' / 'off'; silently inert when
 * localStorage is unavailable. */
function saveNaturalOverlayOn(on) {
  try {
    localStorage.setItem(NATURAL_OVERLAY_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable — nothing to persist */
  }
}

/** The park/place layer ids added 2026-10-09. The park fill is the satellite
 * face's bottom layer (the green wash sits directly on the imagery, under
 * the road lines); the park name labels ride BOTH faces — the satellite
 * stack here and the natural face on every other basemap (plan A: parks are
 * the natural landmarks' polygon siblings, so the natural button toggles
 * them there). The place labels are the satellite stack's top label read AND
 * ride the natural face on the standard raster maps in 3D only (see
 * placeOverlayEnabled in js/map/sources.js). */
export const HYBRID_PARK_FILL_LAYER = 'hybrid-park-fill';
export const HYBRID_PARK_LABELS_LAYER = 'hybrid-park-labels';
export const HYBRID_PLACE_LABELS_LAYER = 'hybrid-place-labels';

/** Layer ids in paint order, all above the imagery, below the terrain
 * module's layers (spec: hillshade/contour sit ABOVE the road overlay).
 * The 2026-10-09 additions: the park fill leads (fills under everything),
 * the park name labels slot between the road names and the place names —
 * settlements keep the top of the label read. (A curated POI label layer
 * was tried between the two the same day and removed again by user
 * decision — the clutter hurt the exercise-analysis read.) */
export const HYBRID_LAYERS = [
  HYBRID_PARK_FILL_LAYER,
  'hybrid-road-tunnel',
  'hybrid-road-casing',
  'hybrid-road',
  'hybrid-road-service',
  'hybrid-road-track',
  'hybrid-road-path',
  'hybrid-road-labels',
  HYBRID_PARK_LABELS_LAYER,
  HYBRID_PLACE_LABELS_LAYER,
];

/** The full overlay stack: the road/label/park/poi layers plus the natural
 * landmark tail. Every prune/restack/visibility pass walks this list. */
export const HYBRID_ALL_LAYERS = [...HYBRID_LAYERS, ...HYBRID_NATURAL_LAYERS];

/** The label layers the language hot-rewrite touches (the park labels speak
 * the same bilingual dialect as road/place). */
const HYBRID_LABEL_LAYERS = ['hybrid-road-labels', HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER];

/** First existing layer the overlay inserts under — the terrain module's
 * stack when it is hung, else the track vectors. */
function restackAnchor(map) {
  for (const id of ['terrain-hillshade', 'terrain-contour-lines', 'terrain-contour-labels', 'track-casing']) {
    if (map.getLayer(id)) return id;
  }
  return undefined;
}

/** Fresh vector source def per use — MapLibre takes ownership. */
export function hybridSourceDef() {
  return { type: 'vector', url: HYBRID_TILE_URL };
}

/* Bilingual label text-fields -------------------------------------------------- */

/**
 * The bilingual text-field expression for one label layer: the main name in
 * the UI language (language header → universal tail → `ref` for roads → '')
 * plus the LOCAL name as a second section, SAME SIZE as the main name (the
 * real-world bilingual map / bilingual signpost convention — two scripts of
 * equal rank, no hierarchy by size), shown only when non-empty and different
 * from the main name (case-insensitive). Places and parks break the two
 * names onto two lines; road names keep them on the label's single line.
 * The name-key
 * chains are the shared ones in labelLanguage.js (the natural landmark
 * labels speak the same dialect).
 */
export function hybridLabelTextField(layerId, code = getCurrentLanguage()) {
  const chain = labelNameChain(code);
  if (layerId === 'hybrid-road-labels') chain.push('ref');
  const main = ['coalesce', ...chain.map((key) => ['get', key]), ''];
  const joiner = layerId === 'hybrid-road-labels' ? ' ' : '\n';
  const local = ['coalesce', ['get', 'name'], ''];
  const secondary = ['case',
    ['all',
      ['!=', local, ''],
      ['!=', ['downcase', local], ['downcase', main]],
    ],
    ['concat', joiner, ['get', 'name']],
    '',
  ];
  // MapLibre parses section-option values as expressions — the font stack
  // needs the literal wrapper or addLayer silently rejects the layer.
  return ['format', main, {}, secondary, { 'text-font': ['literal', ['Noto Sans Regular']] }];
}

/* Park and place label layers (2026-10-09) ---------------------------------------- */

/** The ground-anchor pair, hoisted for the label builders: glyphs never
 * sink into the DEM slope — the contour-label configuration. */
const GROUND_ANCHOR = {
  'symbol-height-anchor': 'ground',
  'symbol-height-offset': 0.1,
};

/** The imagery label palette (white glyph, dark halo) — the park and place
 * labels share the read; theme-independent like everything on this
 * overlay. */
const PLACE_LABEL_PAINT = {
  'text-color': '#ffffff',
  'text-halo-color': 'rgba(40, 40, 40, 0.9)',
  'text-halo-width': 1.2,
  'text-halo-blur': 0.3,
};

/**
 * The park name labels' rank-tiered size curve: one zoom interpolate whose
 * every stop is a rank-gate case (a 0 output hides), opening to everything
 * at z13.5. `rank` is the park layer's within-tile importance from 1 (it
 * rides the point features only — the layer def filters to points), so the
 * tiers bound the per-tile density at every zoom without assuming the class
 * enum (an open set — protection_title derivatives). A missing rank hides
 * until the open tier. Sizes stay a step under the same-zoom settlement
 * reads.
 */
const PARK_RANK_TIERS = [
  // zoom, maxRank shown (null = all), text-size
  [4, 2, 10.5],
  [6, 3, 11],
  [8, 5, 11.25],
  [10, 10, 11.25],
  [12, 20, 11.875],
  [13.5, null, 12.5],
];
const parkTextSizes = () => [
  'interpolate', ['linear'], ['zoom'],
  ...PARK_RANK_TIERS.flatMap(([zoom, maxRank, size]) => [
    zoom,
    maxRank == null ? size
      : ['case', ['<=', ['coalesce', ['get', 'rank'], 999], maxRank], size, 0],
  ]),
];

/**
 * The park name labels — planet's `park` source-layer, point features only
 * (name/rank ride the points; the nameless polygons are the fill layer's
 * geometry). Bilingual like the place labels, imagery palette, ground
 * anchored. The source id is a parameter: the satellite face passes the
 * overlay's own planet source, the natural face passes whichever planet
 * source the active basemap provides (the style's own on the OpenFreeMap
 * styles, the provisioned one on the raster basemaps).
 *
 * @param {string} [lang]  UI language the bilingual field is built for
 * @param {string} [sourceId]  the planet vector source the layer reads
 */
export function parkLabelsLayerDef(lang = getCurrentLanguage(), sourceId = HYBRID_SOURCE_ID) {
  return {
    id: HYBRID_PARK_LABELS_LAYER,
    type: 'symbol',
    source: sourceId,
    'source-layer': 'park',
    minzoom: 4,
    filter: ['==', ['geometry-type'], 'Point'],
    layout: {
      ...GROUND_ANCHOR,
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
      'text-field': hybridLabelTextField(HYBRID_PARK_LABELS_LAYER, lang),
      'text-font': ['Noto Sans Regular'],
      'text-max-width': 8,
      'text-size': parkTextSizes(),
    },
    paint: { ...PLACE_LABEL_PAINT },
  };
}

/** The place name labels' def — the satellite face's top label read, and
 * (2026-10-09) the natural face's settlement read on the standard raster
 * maps in 3D, where the tiles' baked labels melt into the draped imagery
 * (2D would double them; the OpenFreeMap styles render place names of their
 * own in every mode — see placeOverlayEnabled in js/map/sources.js). The
 * source id is a parameter, same resolution as the park labels. */
export function placeLabelsLayerDef(lang = getCurrentLanguage(), sourceId = HYBRID_SOURCE_ID) {
  return {
    id: HYBRID_PLACE_LABELS_LAYER,
    type: 'symbol',
    source: sourceId,
    'source-layer': 'place',
    minzoom: 3,
    // Settlement names only — the orientation minimum over imagery. The
    // per-class zoom gates live in the size curve (a 0 size hides); the
    // rank field refines collision at the busy mid-zooms. One zoom curve
    // with class-driven outputs — MapLibre allows only ONE zoom-based
    // step/interpolate per expression, so per-class gates cannot be
    // separate step expressions (the naive case-of-steps is rejected at
    // addLayer with a silent error event).
    filter: ['match', ['get', 'class'],
      ['city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood'], true, false],
    layout: {
      ...GROUND_ANCHOR,
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
      'text-field': hybridLabelTextField(HYBRID_PLACE_LABELS_LAYER, lang),
      'text-font': ['Noto Sans Regular'],
      'text-max-width': 8,
      // Every non-zero cell sits at 1.25× the alignment spec's section-九
      // baseline (the settled enlargement); the 0 gates — which is where
      // each class's per-class minzoom lives — are untouched.
      'text-size': ['interpolate', ['linear'], ['zoom'],
        3, ['match', ['get', 'class'], 'city', 13.75, 0],
        5, ['match', ['get', 'class'], 'city', 15, 'town', 11.875, 0],
        8, ['match', ['get', 'class'], 'city', 16.25, 'town', 13.75, 0],
        9, ['match', ['get', 'class'], 'city', 16.25, 'town', 13.75, 'village', 11.25, 0],
        10, ['match', ['get', 'class'], 'city', 16.875, 'town', 14.375, 'village', 11.875, ['suburb', 'quarter', 'neighbourhood'], 10.625, 0],
        11, ['match', ['get', 'class'], 'city', 17.5, 'town', 15, 'village', 12.5, ['suburb', 'quarter', 'neighbourhood'], 10.625, 0],
        12, ['match', ['get', 'class'], 'city', 18.75, 'town', 15.625, 'village', 12.5, ['suburb', 'quarter', 'neighbourhood'], 11.25, 0],
        13, ['match', ['get', 'class'], 'city', 19.375, 'town', 16.25, 'village', 13.125, ['suburb', 'quarter', 'neighbourhood'], 11.875, 'hamlet', 10.625, 0],
        16, ['match', ['get', 'class'], 'city', 20, 'town', 17.5, 'village', 15, ['suburb', 'quarter', 'neighbourhood'], 13.75, 'hamlet', 12.5, 0],
        19, ['match', ['get', 'class'], 'city', 21.25, 'town', 18.75, 'village', 16.25, ['suburb', 'quarter', 'neighbourhood'], 15, 'hamlet', 13.75, 0],
      ],
    },
    paint: { ...PLACE_LABEL_PAINT },
  };
}

/* Line layers ------------------------------------------------------------------ */

/** The casing and the pavement share one width table (px per class, each
 * cell "casing / pavement"; alignment spec section 四). The z5–z16 values
 * carry over from the initial build; the minor z9 hairline and every z19
 * stop are the alignment pass's additions. Planet tiles carry no minor
 * geometry at the low zooms — the z9 minor values only matter where
 * overzoomed tiles do have data. */
const SURFACE_WIDTH_ZOOMS = [5, 9, 13, 16, 19];
const SURFACE_WIDTHS = {
  motorway: { 5: [2.2, 1.1], 9: [3.4, 1.9], 13: [5, 3], 16: [9, 6], 19: [10.5, 7] },
  trunk: { 5: [2, 1], 9: [3.2, 1.7], 13: [4.6, 2.8], 16: [8.5, 5.5], 19: [10, 6.5] },
  primary: { 5: [1.8, 0.9], 9: [2.8, 1.5], 13: [4, 2.4], 16: [8, 5], 19: [9.5, 6] },
  secondary: { 9: [2.4, 1.3], 13: [3.6, 2.2], 16: [7, 4.4], 19: [8.5, 5.2] },
  tertiary: { 9: [2.2, 1.2], 13: [3.4, 2], 16: [6.5, 4], 19: [8, 4.6] },
  minor: { 9: [1.4, 0.5], 13: [2.6, 1.4], 16: [5, 2.8], 19: [6, 3.2] },
};

/** The class-driven width curve for one of the two surface layers — a single
 * zoom interpolate with match outputs (the one-zoom-curve-per-expression
 * rule). `slot`: 0 = casing, 1 = pavement. */
function surfaceWidth(slot) {
  const expr = ['interpolate', ['linear'], ['zoom']];
  for (const zoom of SURFACE_WIDTH_ZOOMS) {
    const match = ['match', ['get', 'class']];
    for (const [cls, stops] of Object.entries(SURFACE_WIDTHS)) {
      if (stops[zoom]) match.push(cls, stops[zoom][slot]);
    }
    match.push(0);
    expr.push(zoom, match);
  }
  return expr;
}

/** The classes drawn as cased solid roads. Tunnels stay on the ghost layer
 * only — every surface layer excludes `brunnel = tunnel`. */
const SURFACE_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'];
const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel'];

/**
 * The eight overlay layer defs, fresh objects per use (same ownership rule).
 * Styling notes: imagery is theme-independent, so the overlay is too — white
 * roads with a dark translucent casing (the classic hybrid read), both
 * themes alike. Tunnels render as a dimmed dashed "ghost" on their own layer
 * (the route is in the mountain, not on it — but it still drapes the DEM in
 * 3D); service roads, tracks and paths each get a layer of their own because
 * line-dasharray takes no data-driven expressions. Labels stand upright at
 * pitch (the Terra label convention, mapView.uprightProviderLabels) while
 * road names keep following their roads; the ground anchor + offset pair
 * pins glyphs to the DEM surface in 3D, the exact configuration the
 * terrain-contour-labels layer proved out.
 *
 * @param {string} [lang]  UI language the label text-fields are built for —
 *        defaults to the language current at call (mount) time.
 */
export function hybridLayerDefs(lang = getCurrentLanguage()) {
  // Two label palettes: the shared imagery read lives in the module-level
  // PLACE_LABEL_PAINT (place/park/poi — white glyph, dark halo); road names
  // sit ON the white road fill, where a white glyph would wash out — dark
  // glyph + light halo reads on the road and keeps its rim where the label
  // crosses open imagery (the Esri reference-overlay look). The 0.3 halo
  // blur softens both against crisp imagery edges.
  const roadLabelPaint = {
    'text-color': 'rgba(45, 45, 45, 0.95)',
    'text-halo-color': 'rgba(255, 255, 255, 0.9)',
    'text-halo-width': 1.1,
    'text-halo-blur': 0.3,
  };
  return [
    {
      // Park areas — the stack's bottom layer: the translucent green wash
      // sits directly on the imagery, under every road and label (roads
      // paint over parks, the hybrid convention). Polygons only — the
      // point copies of the same layer carry the names the park-labels
      // layer draws. The opacity decays with zoom: at street zooms a
      // wild-land wash would only tint the scenery.
      id: HYBRID_PARK_FILL_LAYER,
      type: 'fill',
      source: HYBRID_SOURCE_ID,
      'source-layer': 'park',
      minzoom: 4,
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
      paint: {
        'fill-color': '#43a047',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.22, 10, 0.16, 14, 0.12],
      },
    },
    {
      // Tunnel ghost — a dimmed dashed line reading "the route goes through
      // the mountain here". No surface layer doubles it (they all exclude
      // tunnels); at zooms where planet tiles don't carry the class yet the
      // layer simply has nothing to draw.
      id: 'hybrid-road-tunnel',
      type: 'line',
      source: HYBRID_SOURCE_ID,
      'source-layer': 'transportation',
      minzoom: 8,
      filter: ['all',
        ['==', ['get', 'brunnel'], 'tunnel'],
        ['match', ['get', 'class'],
          [...SURFACE_CLASSES, 'service', 'track', 'path'], true, false],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.6,
        'line-dasharray': [1.5, 1.5],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 15, 1.5, 19, 3],
      },
    },
    {
      id: 'hybrid-road-casing',
      type: 'line',
      source: HYBRID_SOURCE_ID,
      'source-layer': 'transportation',
      minzoom: 5,
      filter: ['all',
        ['match', ['get', 'class'], SURFACE_CLASSES, true, false],
        notTunnel,
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': 'rgba(30, 30, 30, 0.6)',
        'line-width': surfaceWidth(0),
      },
    },
    {
      id: 'hybrid-road',
      type: 'line',
      source: HYBRID_SOURCE_ID,
      'source-layer': 'transportation',
      minzoom: 5,
      filter: ['all',
        ['match', ['get', 'class'], SURFACE_CLASSES, true, false],
        notTunnel,
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': 'rgba(255, 255, 255, 0.92)',
        'line-width': surfaceWidth(1),
      },
    },
    {
      // Park grounds, attraction sites, parking spurs — drawn from z13 so
      // the fine grid never becomes noise at mid zooms.
      id: 'hybrid-road-service',
      type: 'line',
      source: HYBRID_SOURCE_ID,
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['all', ['==', ['get', 'class'], 'service'], notTunnel],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.6,
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 16, 1.1, 19, 1.6],
      },
    },
    {
      // Forest/maintenance roads WITH a roadbed — the long dash reads as a
      // track, clearly distinct from the path dashes below. Always a touch
      // wider than a path at every stop.
      id: 'hybrid-road-track',
      type: 'line',
      source: HYBRID_SOURCE_ID,
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['all', ['==', ['get', 'class'], 'track'], notTunnel],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.85,
        'line-dasharray': [3, 1.5],
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 14, 1.4, 16, 2, 19, 2.8],
      },
    },
    {
      // Hiking paths — the short dash. (Formerly hybrid-road-paths, which
      // carried track+path together; the split gives each its own dash.)
      id: 'hybrid-road-path',
      type: 'line',
      source: HYBRID_SOURCE_ID,
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['all', ['==', ['get', 'class'], 'path'], notTunnel],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.8,
        'line-dasharray': [1.5, 1],
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 17, 2, 19, 3],
      },
    },
    {
      id: 'hybrid-road-labels',
      type: 'symbol',
      source: HYBRID_SOURCE_ID,
      'source-layer': 'transportation_name',
      minzoom: 12,
      layout: {
        // One label per road piece at its center — line-center placement is
        // also what unlocks the ground anchor (see the contour labels).
        'symbol-placement': 'line-center',
        ...GROUND_ANCHOR,
        // Names follow their roads; the glyphs stand upright on screen.
        'text-rotation-alignment': 'map',
        'text-pitch-alignment': 'viewport',
        // No class filter — a named trail or service road gets its name too.
        'text-field': hybridLabelTextField('hybrid-road-labels', lang),
        'text-font': ['Noto Sans Regular'],
        // 1.25× the alignment spec's 10/12.5/14 baseline — the settled
        // enlargement keeps the labels readable over the imagery.
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 12.5, 16, 15.625, 19, 17.5],
      },
      paint: { ...roadLabelPaint },
    },
    parkLabelsLayerDef(lang),
    placeLabelsLayerDef(lang),
  ];
}

/** @private The OpenFreeMap style's own planet vector source — matched by
 * URL, not by the style's source name (the same resolution the trio's lift
 * uses through its getRoadsSourceId seam). Null when the style doesn't
 * carry it. */
function stylePlanetSourceId(map) {
  if (typeof map?.getStyle !== 'function') return null;
  const styleSources = map.getStyle()?.sources ?? {};
  for (const [id, def] of Object.entries(styleSources)) {
    if (def?.type === 'vector' && def.url === HYBRID_TILE_URL) return id;
  }
  return null;
}

/** The natural face's lift-feeder layer. MapLibre only fetches tiles for
 * sources some layer references (the TileManager's `used` flag) — on the
 * plain raster basemaps the face's provisioned planet source would never
 * load and the trio's lift would starve. This layer references the source
 * while drawing nothing: a filter that matches no transportation class and
 * zero opacity. Mounted only next to a provisioned source; the OpenFreeMap
 * styles' own layers already mark theirs used. */
const NATURAL_LIFT_FEEDER_ID = 'natural-lift-feeder';
const naturalLiftFeederDef = () => ({
  id: NATURAL_LIFT_FEEDER_ID,
  type: 'line',
  source: HYBRID_SOURCE_ID,
  'source-layer': 'transportation',
  filter: ['==', ['get', 'class'], '__natural-lift-feeder__'],
  paint: { 'line-opacity': 0 },
});

/** @private Removes the overlay source and layers — the "not loaded" state
 * (any non-satellite basemap). Safe when nothing is hung. Includes the
 * natural landmark layers, the raster face's lift feeder, and the natural
 * landmark layers' two GeoJSON sources. */
function pruneHybrid(map) {
  for (const id of [...HYBRID_ALL_LAYERS, NATURAL_LIFT_FEEDER_ID]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [HYBRID_SOURCE_ID, HYBRID_NATURAL_SOURCE_ID, HYBRID_NATURAL_TILE_SOURCE_ID]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

/**
 * Builds the overlay controller. Map access and the style-readiness gate are
 * injectable so the state machine is unit-testable without MapLibre (the
 * viewMode.js pattern): `defer` runs the map pass once the active style is
 * ready — in the app that is mapView's onMapStyleReady, in tests a plain
 * synchronous call. `natural` carries the natural landmark lifecycle (icons
 * + layers + the Overpass fetcher); the default is an inert stub so the
 * state-machine suites stay map-stub-pure, the app singleton wires the real
 * one.
 *
 * The controller has TWO button faces, one per basemap family:
 *   - Satellite imagery → the road-network overlay (roads + labels + the
 *     natural tail), persisted under the road key, default OFF.
 *   - Every other basemap (`isNatural`) → the natural landmarks ONLY,
 *     persisted under the natural key, default ON. On the OpenFreeMap
 *     vector styles the trio lifts from the planet source the style itself
 *     already loads; on the plain raster basemaps the face provisions the
 *     app's own keyless planet source for the lift. Catalog entries gate
 *     the face via `naturalOverlay` (js/map/sources.js): false disables it
 *     entirely, '3d' rides only the 3D view (the standard raster maps draw
 *     their own natural markers into the tiles — 2D would double them, 3D
 *     wants the app's standing landmarks).
 * Both faces share the state rules: the localStorage value IS the state,
 * toggle clicks flip layer visibility (the hang never rebuilds), and the
 * map passes prune everything on an opted-out basemap. There is no
 * in-memory toggle state: isEnabled() reads storage live — so the button's
 * pressed state is already correct in the event tick where the basemap
 * change fires its refresh, before the deferred map pass runs. State
 * changes apply SYNCHRONOUSLY to every DOM reader; only the map work waits
 * for the style.
 *
 * @param {Object} deps
 * @param {() => boolean} deps.isSatellite  true while the ACTIVE basemap
 *        catalog entry is in the satellite group
 * @param {() => boolean} [deps.isNatural]  true while the ACTIVE basemap is
 *        an OpenFreeMap vector style (the natural-only button face)
 * @param {() => boolean} [deps.isPlace]  true while the natural face should
 *        also carry the settlement names — the standard raster maps in 3D
 *        (placeOverlayEnabled, js/map/sources.js); place rides ONLY there,
 *        never on the OpenFreeMap styles (they render place names of their
 *        own) and never in 2D (the raster tiles' baked labels would double)
 * @param {(fn: () => void) => void} deps.defer  style-readiness gate
 * @param {Object} [deps.natural]  landmark lifecycle hooks — enabled(map)
 *        after an enabled pass, disabled() on toggle-off/auto-off,
 *        pruned() when the overlay is torn down
 */
export function createHybridOverlay({ isSatellite, isNatural = () => false, isPlace = () => false, defer, natural = INERT_NATURAL }) {
  /** Bumps per apply; a stale deferred pass loses against a newer one. */
  let applySeq = 0;

  return {
    /** True when the button may be interacted with at all. */
    available: () => isSatellite() || isNatural(),
    /** The button's pressed state — only meaningful while available; each
     * face reads its own storage, so the live read keeps it honest on the
     * other family and off both (always false there). */
    isEnabled: () => {
      if (isSatellite()) return savedRoadOverlayOn();
      if (isNatural()) return savedNaturalOverlayOn();
      return false;
    },
    /** Flips the face's toggle and persists it; a no-op (reporting false,
     * writing nothing) while unavailable — the button is disabled there,
     * this guard covers programmatic calls. The two faces persist to two
     * independent keys: a satellite visit never touches the natural choice
     * and vice versa. */
    toggle() {
      if (isSatellite()) {
        saveRoadOverlayOn(!savedRoadOverlayOn());
        return true;
      }
      if (isNatural()) {
        saveNaturalOverlayOn(!savedNaturalOverlayOn());
        return true;
      }
      return false;
    },
    /** Syncs the map to the stored state. Idempotent on every call: hangs
     * the overlay when missing, restacks it over a re-inserted basemap
     * raster, flips visibility on toggle, prunes off both families. */
    apply(map) {
      const seq = ++applySeq;
      defer(() => {
        if (seq !== applySeq) return;
        if (isSatellite()) {
          applySatellite(map);
          return;
        }
        if (isNatural()) {
          applyNaturalOnly(map);
          return;
        }
        // Neither family: unloaded entirely — no source, no layers, no tile
        // traffic, no stale attribution. Both STORED choices are untouched:
        // returning to either family restores them.
        pruneHybrid(map);
        natural.pruned();
      });
    },
  };

  /** The satellite face: the full road + label + natural stack (spec). */
  function applySatellite(map) {
    if (!savedRoadOverlayOn()) {
      // On Satellite but off: keep the hang, flip visibility (the spec's
      // cheap-toggle rule) — re-enabling never recreates source/layers.
      for (const id of HYBRID_ALL_LAYERS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      }
      natural.disabled();
      return;
    }
    registerNaturalIcons(map);
    const alreadyHung = !!map.getSource(HYBRID_SOURCE_ID);
    if (!alreadyHung) {
      map.addSource(HYBRID_SOURCE_ID, hybridSourceDef());
      map.addSource(HYBRID_NATURAL_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const anchor = restackAnchor(map);
      for (const def of [...hybridLayerDefs(), ...naturalLayerDefs()]) {
        map.addLayer({ ...def, layout: { ...def.layout, visibility: 'none' } }, anchor);
      }
      // Fresh hang, fresh fetch ground — the (possibly just-wiped)
      // GeoJSON sources start empty until the view proves otherwise.
      natural.invalidate();
    } else {
      // A raster→raster basemap switch re-inserted the opaque basemap
      // layer above the hung overlay — restack under the terrain
      // module's layers, which restack above us in their own hook
      // (registered first). Each move targets the same anchor,
      // preserving paint order.
      const anchor = restackAnchor(map);
      for (const id of HYBRID_ALL_LAYERS) {
        if (map.getLayer(id)) map.moveLayer(id, anchor);
      }
    }
    // The same raster→raster switch buries the whole custom stack under
    // the fresh imagery (the re-inserted basemap layer lands just under
    // the track vectors, the terrain module's own restack only lifts its
    // own layers back above it). Walk the imagery back down to the
    // bottom of the custom stack — directly under the first overlay
    // layer. Idempotent when it never moved; the terrain module's later
    // restack is no-op against this position.
    if (map.getLayer('basemap-layer')) {
      const firstHybrid = HYBRID_LAYERS.find((id) => map.getLayer(id));
      if (firstHybrid) map.moveLayer('basemap-layer', firstHybrid);
    }
    for (const id of HYBRID_ALL_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    }
    natural.enabled(map);
  }

  /** The OpenFreeMap face: the natural landmark tail plus the park name
   * labels (2026-10-09 plan A — parks are the landmarks' polygon siblings,
   * the natural button toggles both), and on the standard raster maps also
   * the settlement names (`isPlace` — in 3D the tiles' baked labels melt
   * into the draped imagery; 2D would double them and the OpenFreeMap
   * styles render place names of their own, so place rides ONLY the
   * raster basemaps' 3D face). The basemap already draws its own
   * roads and labels, so nothing hangs above them but these label layers
   * and the three landmark layers (below the terrain module's stack and
   * the track vectors, the shared anchor) — and normally NO second planet
   * source is added: the park/place labels and the trio lift read the
   * planet source by one resolved id — the OpenFreeMap styles' own source
   * when present (same TileJSON, no extra tile traffic), else the face's
   * provisioned keyless source (plain raster basemaps — tiles load for the
   * viewport with no layer rendering them, which is the landmarks' data
   * cost by design). */
  function applyNaturalOnly(map) {
    const withPlace = isPlace();
    if (!savedNaturalOverlayOn()) {
      // Toggled off: keep the hang, flip visibility (the cheap-toggle
      // rule) — re-enabling never recreates source/layers.
      for (const id of [HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER, ...HYBRID_NATURAL_LAYERS]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      }
      natural.disabled();
      return;
    }
    registerNaturalIcons(map);
    if (!map.getSource(HYBRID_NATURAL_SOURCE_ID)) {
      map.addSource(HYBRID_NATURAL_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource(HYBRID_NATURAL_TILE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      let liftProvisioned = false;
      if (!stylePlanetSourceId(map) && !map.getSource(HYBRID_SOURCE_ID)) {
        map.addSource(HYBRID_SOURCE_ID, hybridSourceDef());
        liftProvisioned = true;
      }
      const anchor = restackAnchor(map);
      // The feeder rides directly under the landmark layers — it paints
      // nothing, it only marks the provisioned source used (see its def).
      if (liftProvisioned) map.addLayer(naturalLiftFeederDef(), anchor);
      // The label reads: park names everywhere the face rides, settlement
      // names only where the tiles' own 2D labels would otherwise double
      // them (the raster maps' 3D view). Park under place — settlements
      // keep the top of the label read, same as the satellite stack.
      const planetId = stylePlanetSourceId(map) ?? HYBRID_SOURCE_ID;
      const parkDef = parkLabelsLayerDef(getCurrentLanguage(), planetId);
      map.addLayer({ ...parkDef, layout: { ...parkDef.layout, visibility: 'none' } }, anchor);
      if (withPlace) {
        const placeDef = placeLabelsLayerDef(getCurrentLanguage(), planetId);
        map.addLayer({ ...placeDef, layout: { ...placeDef.layout, visibility: 'none' } }, anchor);
      }
      for (const def of naturalLayerDefs()) {
        map.addLayer({ ...def, layout: { ...def.layout, visibility: 'none' } }, anchor);
      }
      // Fresh hang, fresh fetch ground — the (possibly just-wiped)
      // GeoJSON sources start empty until the view proves otherwise.
      natural.invalidate();
    } else {
      // Already hung (a toggle flip or a repeat apply): keep paint order
      // under the terrain module's layers, same anchor rule as above.
      const anchor = restackAnchor(map);
      for (const id of [NATURAL_LIFT_FEEDER_ID, HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER, ...HYBRID_NATURAL_LAYERS]) {
        if (map.getLayer(id)) map.moveLayer(id, anchor);
      }
    }
    // A raster→raster basemap switch re-inserts the opaque basemap layer
    // above the hung face (no setStyle between raster basemaps) — walk it
    // back down under the face's bottom layer (the feeder when present).
    // Idempotent otherwise; the terrain module's own restack runs before
    // this (hook order).
    if (map.getLayer('basemap-layer')) {
      const first = [NATURAL_LIFT_FEEDER_ID, HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER, ...HYBRID_NATURAL_LAYERS].find((id) => map.getLayer(id));
      if (first) map.moveLayer('basemap-layer', first);
    }
    for (const id of [HYBRID_PARK_LABELS_LAYER, HYBRID_PLACE_LABELS_LAYER, ...HYBRID_NATURAL_LAYERS]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    }
    natural.enabled(map);
  }
}

/* App singleton -------------------------------------------------------------- */

/** The no-op landmark lifecycle the state-machine suites get when they don't
 * inject one. */
const INERT_NATURAL = { enabled() {}, disabled() {}, pruned() {}, invalidate() {} };

/** The app's Overpass viewport fetcher for the four tile-less classes. The
 * trio's lift source follows the active basemap: the overlay's own planet
 * source on Satellite; on the other basemaps the style's own planet source
 * when there is one (OpenFreeMap styles — same TileJSON, no extra tile
 * traffic), else the face's provisioned planet source (raster basemaps —
 * matched by URL, not by the style's source name). Null before any basemap
 * loads or on an opted-out source: the trio stays empty. */
const naturalFeatures = createNaturalFeatures({
  getRoadsSourceId: (map) => {
    const source = getActiveSource();
    if (source?.group === 'satellite') return HYBRID_SOURCE_ID;
    if (naturalOverlayEnabled(source, getViewMode() === '3d')) return stylePlanetSourceId(map) ?? HYBRID_SOURCE_ID;
    return null;
  },
});

/** The landmark hooks the singleton controller drives: eligibility follows
 * the overlay's on state, a fresh hang invalidates the fetch cache (the
 * source it fed was just recreated empty), the enabled pass arms both data
 * drivers — the Overpass viewport sync AND the trio's tile-lift rebuild
 * (labels are plain properties, so the rebuild is also what re-renders
 * them on language/unit switches). */
const APP_NATURAL = {
  enabled(map) {
    naturalFeatures.setEligible(true);
    naturalFeatures.attachTileFeed(map);
    naturalFeatures.rebuildTileFeed(map);
    naturalFeatures.sync(map);
  },
  disabled() {
    naturalFeatures.setEligible(false);
  },
  pruned() {
    naturalFeatures.setEligible(false);
    naturalFeatures.invalidate();
  },
  invalidate() {
    naturalFeatures.invalidate();
  },
};

const controller = createHybridOverlay({
  isSatellite: () => getActiveSource()?.group === 'satellite',
  isNatural: () => {
    const source = getActiveSource();
    return source?.group !== 'satellite' && naturalOverlayEnabled(source, getViewMode() === '3d');
  },
  isPlace: () => placeOverlayEnabled(getActiveSource(), getViewMode() === '3d'),
  defer: (fn) => onMapStyleReady(fn),
  natural: APP_NATURAL,
});

/** Re-writes the label layers' text-field to `code`'s bilingual chain — the
 * language hot-rewrite (alignment spec section 七; the park labels joined
 * 2026-10-09 and ride the same dialect wherever their face hangs them).
 * Applies to hidden layers too, so re-enabling after a switch shows the new
 * language at once. The natural landmark labels ride along (their own
 * builder, same language chain; the elevation suffix is rebuilt for the
 * CURRENT unit system, which is also what the units:changed listener below
 * re-runs this path for). */
export function applyHybridLabelLanguage(map, code) {
  for (const id of HYBRID_LABEL_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'text-field', hybridLabelTextField(id, code));
  }
  applyNaturalLabelLanguage(map, code);
}

/** @private Rebuilds the small classes' text-fields for a language + the
 * current unit system (hidden layers included, like the road labels), and
 * re-composes the trio's label properties through its rebuild — the labels
 * are plain `label` strings built by the shared unit formatter, so both
 * switches funnel here. 海拔行随名字同显，units 切换仍经此重建。 */
function applyNaturalLabelLanguage(map, code) {
  for (const id of HYBRID_NATURAL_LAYERS) {
    if (NATURAL_LAYER_NAME_ZOOMS[id] && map.getLayer(id)) {
      map.setLayoutProperty(id, 'text-field',
        naturalLabelTextField(NATURAL_LAYER_NAME_ZOOMS[id], code, getUnitSystem()));
    }
  }
  naturalFeatures.rebuildTileFeed(map);
}

/** Wires the overlay to the app: every basemap change (raster→raster ones
 * never rehang — this is the restack trigger), every style rehang (the
 * setStyle wipe recovery, spec section 六's re-registration mechanism),
 * every language switch (the label hot-rewrite above), and every unit
 * switch (the natural labels' elevation suffix — the road labels carry no
 * units). Call once from main.js, AFTER initTerrain: hook order is paint
 * order — the terrain module restacks its layers first, the overlay inserts
 * under them.
 *
 * @param {Object} [deps]  test seam — where the live map comes from
 * @param {() => Object} [deps.getMap]  defaults to mapView's getMapInstance
 */
export function initHybrid({ getMap = getMapInstance } = {}) {
  on('basemap:changed', () => {
    const map = getMap();
    if (map) controller.apply(map);
  });
  // The 3d-only basemaps (the standard raster maps) mount in 3D and prune
  // in 2D — every mode flip re-runs the state machine against the new mode.
  on('viewmode:changed', () => {
    const map = getMap();
    if (map) controller.apply(map);
  });
  onStyleRehang(() => {
    const map = getMap();
    if (map) controller.apply(map);
  });
  on('language:changed', () => {
    const map = getMap();
    if (map) applyHybridLabelLanguage(map, getCurrentLanguage());
  });
  on('units:changed', () => {
    const map = getMap();
    if (map) applyNaturalLabelLanguage(map, getCurrentLanguage());
  });
  // A glyph whose colorToken resolves per theme re-rasterizes on a theme
  // flip (registerNaturalIcons swaps only images whose color changed);
  // today's volcano red is theme-fixed, so this pass is a no-op — kept for
  // the mechanism.
  on('theme:changed', () => {
    const map = getMap();
    if (map) {
      registerNaturalIcons(map);
      map.triggerRepaint();
    }
  });
}

/** True while the active basemap is Satellite (the road button's enabled
 * state; false before the first basemap loads). */
export function hybridOverlayAvailable() {
  return controller.available();
}

/** The overlay's on state — false on basemaps outside both families,
 * whatever the toggles did. */
export function hybridOverlayEnabled() {
  return controller.isEnabled();
}

/** Which face the overlay button wears on the ACTIVE basemap: 'roads' on
 * the satellite imagery (the road-network toggle), 'natural' on every other
 * basemap (the seven landmark classes plus the park name labels — vector
 * OpenFreeMap styles lift from the style's own planet source, raster
 * basemaps from the face's own), null on an opted-out source or before any
 * basemap loads (the button is disabled there). The map-area control reads
 * this to pick the button's icon and label. */
export function hybridOverlayMode() {
  const source = getActiveSource();
  if (source?.group === 'satellite') return 'roads';
  if (naturalOverlayEnabled(source, getViewMode() === '3d')) return 'natural';
  return null;
}

/** Flips the overlay (the map-area button's entry point) — whichever face
 * the active basemap wears: the road toggle on Satellite, the natural
 * landmarks on the OpenFreeMap styles. */
export function toggleHybridOverlay() {
  if (!controller.toggle()) return;
  const map = getMapInstance();
  if (map) controller.apply(map);
}
