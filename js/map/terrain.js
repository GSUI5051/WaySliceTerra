/**
 * Terrain rendering — the DEM, hillshade and contour lines on the shared
 * MapLibre style. View-mode state (js/map/viewMode.js) decides WHEN the 3D
 * mesh renders; this module owns WHAT terrain means on the style, in EITHER
 * view mode (Terra spec: the hillshade and the generated contours are map
 * layers, not 3D-only decorations):
 *
 *   terrain-dem        raster-dem source fed by the maplibre-contour
 *                      DemSource's shared-cache protocol — one DEM (from the
 *                      provider catalog, js/map/providers/terrain.js) serves
 *                      terrain, hillshade and contours through one worker
 *                      tile cache
 *   terrain-hillshade  hillshade layer over the basemap, under the track —
 *                      available in both modes behind one shared toggle
 *                      (default off to keep the flat map readable)
 *   terrain-contours   generated contour vector source (maplibre-contour
 *                      protocol URL) + line layers in the official example's
 *                      visual language: major 1px, minor 0.5px. The protocol
 *                      URL encodes the interval table (js/map/providers/
 *                      contours.js) for the CURRENT unit system AND view
 *                      mode — a unit or mode flip re-points it via setTiles
 *                      and the tiles regenerate, no source rebuild
 *   terrain-contour-labels  elevation numbers on the major contours, in the
 *                      unit system's own elevations (m in metric tiles, ft in
 *                      imperial tiles — never a conversion of the other mode)
 *
 * The 3D mesh (map.setTerrain) itself stays 3D-mode-only: the flat map never
 * displaces, but streams DEM tiles whenever the hillshade or contours are
 * on. The visibility toggles are the map-area buttons (wired in main.js
 * through toggleTerrainLayer / terrainLayerEnabled below); they are ONE
 * shared pair across both view modes, persisted in localStorage (the
 * settings drawer keeps only the mesh exaggeration). A mode flip re-picks
 * the contour interval table only — never the on/off state.
 *
 * The basemap may switch styles at any time and every setStyle wipes custom
 * sources/layers, so the whole hang re-runs as a mapView rehang hook after
 * each switch, and setTerrain is reapplied right with it. Layer order under
 * the track vectors: basemap → hillshade → contours → track casing → track.
 *
 * Outdoor basemaps (the catalog's outdoor group — they paint their own
 * contour lines) take the generated contours OFF entirely: not loaded, not
 * displayed, whatever the toggle says; the system prunes and re-hangs with
 * basemap switches.
 *
 * The contour interval is selected dynamically: after each pan settles,
 * terrain-analysis samples the
 * shared DEM over the viewport and turns the statistics into a log-space
 * bias; contours.js snaps each zoom band's geometric-median target against
 * the unit system's candidate ladder, terrain-adjusted by that bias. Gentle
 * high plateaus and plains coarsen, dissected mountains refine at any
 * altitude. The built table rides the same protocol URL the unit/mode flips
 * use, so an adaptation is the same cheap setTiles hot swap; it is derived
 * state only, never persisted.
 */
import { getMapInstance, getActiveSource, onStyleRehang, onMapStyleReady } from './mapView.js';
import {
  getTerrainProvider, loadTerrainSettings, saveTerrainSettings,
} from './providers/terrain.js';
import {
  contourTileParams, contourLabelField, CONTOUR_SOURCE_MAXZOOM,
} from './providers/contours.js';
import {
  TERRAIN_CONTOUR_CONFIG, terrainLogBias, computeTerrainStats,
} from './terrain-analysis.js';
import { isOutdoorBasemap } from './sources.js';
import { getDemSource } from './demSource.js';
import { getUnitSystem } from '../units/units.js';
import { t } from '../language/language.js';
import { on } from '../core/events.js';

const DEM_SOURCE = 'terrain-dem';
const HILLSHADE_LAYER = 'terrain-hillshade';
const CONTOUR_SOURCE = 'terrain-contours';
const CONTOUR_LAYER = 'terrain-contour-lines';
const CONTOUR_LABEL_LAYER = 'terrain-contour-labels';
const CONTOUR_SOURCE_LAYER = 'contours';
/** Index (major) contours only — the level tag maplibre-contour writes: 0
 * minor, 1 major. The label layer filters on it (only index lines are
 * labeled, every view); the line layer reads the level for the 1px / 0.5px
 * width split. */
const CONTOUR_MAJOR = ['>', ['get', 'level'], 0];

/** Outdoor basemaps (OpenTopoMap, CyclOSM — the catalog's outdoor group)
 * paint their own contour lines, so the generated ones stay off them
 * entirely: not loaded, not displayed, whatever the terrain setting says.
 * Re-evaluated at every hang, so switching basemaps in any mode adds or
 * prunes the contour system on the fly. */
function contoursBlocked() {
  return isOutdoorBasemap(getActiveSource());
}

/** @private Removes the contour source and layers (the "not loaded" half of
 * the outdoor rule) — safe when nothing is hung yet. */
function pruneContours(map) {
  for (const layer of [CONTOUR_LABEL_LAYER, CONTOUR_LAYER]) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  if (map.getSource(CONTOUR_SOURCE)) map.removeSource(CONTOUR_SOURCE);
  contourTilesUrl = null;
}

/** Persisted settings (provider, per-mode layer toggles, exaggeration). */
let settings = loadTerrainSettings();
/** 3D terrain MESH rendering — driven by the view mode, off by default. */
let enabled = false;
/** The view mode the contour INTERVAL table follows (the layer toggles are
 * mode-independent). Delivered alongside the mesh flag by viewMode's
 * setTerrainEnabled(on3d, mode) — not read back from viewMode.js, which
 * imports this module (no import cycle). */
let mode = '2d';
/** The contour protocol URL the contour source currently carries — the
 * unit system + view mode + terrain bias pick the interval table, so flips
 * and adaptations re-point the source in place (setTiles) instead of
 * rebuilding it. */
let contourTilesUrl = null;
/** The live terrain log bias (0 = the neutral ladder; ±TERRAIN_CONTOUR_
 * CONFIG.adjustment.maxAbsBias) — derived from the viewport DEM stats
 * (js/map/terrain-analysis.js), never persisted, threaded into every
 * contour protocol URL build. */
let contourBias = 0;
/** The thresholds table the current URL encodes, with its unit system and
 * view mode — observability, and the `previous` table that damps interval
 * flapping through snapContourInterval's hysteresis (stale across a unit or
 * mode flip, so those never inherit it). */
let appliedTable = null;
let appliedUnit = null;
let appliedMode = null;
/** The stats behind the current bias — observability + the "stats ever
 * computed?" gate for the initial kick. */
let terrainStats = null;
/** Bumps per terrain-stats pass; an async DEM sample compares and bails
 * when a newer moveend superseded it (same pattern as applySeq). */
let contourSeq = 0;
/** The moveend debounce timer for the stats pass. */
let contourTimer = null;
/** Bumps per applyTerrain pass; async continuations (style gate, contour
 * plugin load) compare and bail when a newer pass superseded them. */
let applySeq = 0;
/** The map instance the per-map handlers (error/sourcedata/moveend) are
 * wired on — MapLibre instances are one-per-session here (lazy singleton),
 * but the guard keeps re-init harmless. */
let wiredMap = null;
/** DEM failure latch: one note per enable cycle, however many tile errors. */
let demFailed = false;
let noteEl = null;

/** @private True while any DEM-consuming rendering is wanted (the 3D mesh,
 * or the shared hillshade / generated contours) — gates the DEM state
 * note and its error latch. */
function demInUse() {
  return enabled || settings.layers.hillshade || (settings.layers.contours && !contoursBlocked());
}

/** @private MapLibre's built-in marker occlusion clears its covered flags
 * only for markers currently in the viewport (the cleanup rides
 * Marker._updateOpacity, which bails off-screen). Strip the rest, so a pin
 * parked outside the view cannot stay display:none (css/map.css) once
 * nothing can occlude it anymore — any pass that leaves the map without a
 * terrain mesh runs this (the flat 2D view can never occlude). */
function clearCoveredMarkers(map) {
  if (map.terrain) return;
  for (const el of map.getContainer().querySelectorAll('.maplibregl-marker-covered')) {
    el.classList.remove('maplibregl-marker-covered');
  }
}

/** Wires the module to the app: the rehang hook, theme/language events and
 * the lazily created map. Call once from main.js. */
export function initTerrain() {
  onStyleRehang(() => applyTerrain());
  // A raster→raster basemap switch never setStyle — no wipe, no rehang — so
  // the outdoor rule re-evaluates on the basemap announcement instead.
  on('basemap:changed', () => applyTerrain());
  on('theme:changed', applyTerrainTheme);
  // Language flips re-localize the DEM note only — the contour labels are
  // language-INDEPENDENT since the unit-system suffix ruling
  // (contourLabelField: metric bare numbers, imperial feet prime), so the
  // old text-field rebuild here would write an identical expression.
  on('language:changed', () => {
    if (noteEl) refreshNote();
  });
  on('map:created', () => {
    const map = getMapInstance();
    if (!map || wiredMap === map) return;
    wiredMap = map;
    map.on('error', (e) => {
      if (e.sourceId !== DEM_SOURCE || !demInUse() || demFailed) return;
      demFailed = true;
      refreshNote();
    });
    // The loading note retires the moment the DEM metadata + first tiles
    // report loaded; 'sourcedata' also fires per tile, so this stays cheap.
    map.on('sourcedata', (e) => {
      if (e.sourceId !== DEM_SOURCE || !e.isSourceLoaded) return;
      if (demInUse() && !demFailed && noteEl?.dataset.state === 'loading') refreshNote();
    });
    // Terrain stats follow the viewport: each settled move (pan/zoom/mode
    // ease) re-samples the DEM under the view, debounced — the selected
    // intervals only move when the terrain character under the camera does.
    map.on('moveend', scheduleContourAdaptation);
    // Unit flips re-point the contour system in place: the interval table is
    // encoded in the source's protocol URL, so a setTiles with the new unit
    // system's URL regenerates the vector tiles (round-foot elevations in
    // imperial — not relabeled meter contours), and the label expression
    // rides along. No re-hang, no map rebuild.
    on('units:changed', () => {
      const m = getMapInstance();
      if (!m || !m.getSource(CONTOUR_SOURCE)) return;
      if (m.getLayer(CONTOUR_LABEL_LAYER)) {
        m.setLayoutProperty(CONTOUR_LABEL_LAYER, 'text-field', contourLabelField(getUnitSystem()));
      }
      getDemSource().then((demSource) => {
        syncContourTiles(m, demSource);
      }).catch(() => { /* surfaced by the DEM error note on the next enable */ });
    });
    // Everything hangs once the active style is ready — the initial empty
    // style included (armStyleGate's idle fallback covers it). The active
    // mode's contour table rides along from the first hang.
    applyTerrain();
  });
}

/** True when the map is currently rendering the 3D terrain MESH. The
 * hillshade / contour layers can be on in either mode. */
export function isTerrainEnabled() {
  return enabled;
}

/** Enables/disables the 3D mesh and adopts the view mode. Disabling returns
 * the surface to the flat 2D basemap: setTerrain(null) immediately, while
 * the hillshade/contour toggles keep rendering whatever they said before —
 * they are flat-map-compatible layers shared across modes. */
export function setTerrainEnabled(on3d, viewMode = mode) {
  enabled = !!on3d;
  mode = viewMode === '3d' ? '3d' : '2d';
  if (enabled) demFailed = false;
  applyTerrain();
}

/** Adopts the view mode WITHOUT touching the mesh. viewMode fires this the
 * moment a flip is decided — the animated 2D exit defers the mesh detach
 * itself to the ease's moveend (the track keeps hugging the ground while
 * the camera comes down). The layer toggles are mode-independent now, so
 * the flip's only live effect is the contour interval table: the encoded
 * generation params ride the view mode, and applyTerrain re-points the
 * contour source in place (setTiles). */
export function setTerrainMode(next) {
  const nextMode = next === '3d' ? '3d' : '2d';
  if (nextMode === mode) return;
  mode = nextMode;
  applyTerrain();
}

/** The shared terrain layer toggle ('hillshade' | 'contours') — the
 * map-area buttons' pressed state, identical in both view modes. */
export function terrainLayerEnabled(key) {
  return !!settings.layers[key];
}

/** Flips one terrain layer toggle and persists it — one shared pair across
 * both view modes (2026-10-05 user decision, the road-overlay toggle's
 * model: a switch is a switch; the view mode never flips it silently).
 * Lives here, not in the drawer — this is the map-area button's entry point
 * (Terra spec: terrain visibility controls belong to the map viewport). */
export function toggleTerrainLayer(key) {
  if (key !== 'hillshade' && key !== 'contours') throw new Error(`unknown terrain layer: ${key}`);
  settings = saveTerrainSettings({ layers: { [key]: !settings.layers[key] } });
  applyTerrain();
  // Re-enabling contours on a map the camera has since moved: the stats are
  // stale (or were never sampled while the layers were off) — re-sample so
  // the intervals match the view from the first paint.
  if (key === 'contours' && settings.layers.contours) scheduleContourAdaptation();
}

/** @returns {typeof settings} a deep-ish copy of the current terrain settings. */
export function getTerrainSettings() {
  return {
    ...settings,
    layers: { ...settings.layers },
  };
}

/** Persists + live-applies a settings patch (drawer edits — exaggeration).
 * @param {Partial<typeof settings>} patch */
export function updateTerrainSettings(patch) {
  settings = saveTerrainSettings(patch);
  applyTerrain();
  return getTerrainSettings();
}

/** @private Builds the contour generation params for the CURRENT unit
 * system, view mode and terrain bias, threading the applied thresholds
 * table (same unit + mode only) into the build for snap hysteresis. */
function buildContourParams() {
  const unit = getUnitSystem();
  const previous = appliedUnit === unit && appliedMode === mode ? appliedTable : null;
  return contourTileParams(unit, mode, contourBias, previous);
}

/** @private Re-points the contour source's tiles URL whenever the encoded
 * generation params (unit system × view mode → terrain-adjusted interval
 * table) drifted from what the source carries — the unit/mode flips' and
 * terrain adaptations' hot swap. */
function syncContourTiles(map, demSource) {
  const params = buildContourParams();
  const url = demSource.contourProtocolUrl(params);
  if (contourTilesUrl === url) return;
  const source = map.getSource(CONTOUR_SOURCE);
  if (!source) return;
  contourTilesUrl = url;
  appliedTable = params.thresholds;
  appliedUnit = getUnitSystem();
  appliedMode = mode;
  source.setTiles([url]);
}

/** @private Hangs (or re-hangs) the DEM source and layers on the active
 * style, then applies terrain + visibility state. Safe on every style
 * generation: every step is idempotent. */
function applyTerrain() {
  const map = getMapInstance();
  if (!map) return;
  const seq = ++applySeq;
  onMapStyleReady(() => {
    if (seq !== applySeq || getMapInstance() !== map) return;
    const layers = settings.layers;
    if (!enabled && !layers.hillshade && !layers.contours) {
      // Nothing wants the DEM: flat map, decorative layers out of the way,
      // no mesh displacement, no stale occlusion flags.
      if (map.terrain) map.setTerrain(null);
      clearCoveredMarkers(map);
      if (map.getLayer(HILLSHADE_LAYER)) map.setLayoutProperty(HILLSHADE_LAYER, 'visibility', 'none');
      if (map.getLayer(CONTOUR_LAYER)) map.setLayoutProperty(CONTOUR_LAYER, 'visibility', 'none');
      if (map.getLayer(CONTOUR_LABEL_LAYER)) map.setLayoutProperty(CONTOUR_LABEL_LAYER, 'visibility', 'none');
      refreshNote();
      return;
    }
    // Layers first (the first enable also loads the contour plugin, so this
    // is async), then the terrain + visibility pass. A mode flip or basemap
    // swap racing the plugin load loses: the seq guard skips the stale pass
    // and the arriving state's own applyTerrain re-runs.
    hangTerrainLayers().then(() => {
      if (seq !== applySeq || getMapInstance() !== map) return;
      // The mesh only ever exists in 3D; the hillshade/contour layers work
      // over the flat basemap too.
      map.setTerrain(enabled ? { source: DEM_SOURCE, exaggeration: settings.exaggeration } : null);
      clearCoveredMarkers(map);
      // Keep the documented stack (basemap → hillshade → contours → track):
      // a raster→raster basemap switch re-inserts basemap-layer just below
      // the track vectors — which silently buries the already-hung terrain
      // layers under the opaque imagery. Restack ours above it (no-op when
      // the order is already right, e.g. after a full style rebuild). Each
      // moveLayer lands just below the anchor, stacking above the previous
      // one — so hillshade moves first, contours land on top of it.
      const anchor = map.getLayer('track-casing') ? 'track-casing' : undefined;
      for (const layer of [HILLSHADE_LAYER, CONTOUR_LAYER, CONTOUR_LABEL_LAYER]) {
        if (map.getLayer(layer)) map.moveLayer(layer, anchor);
      }
      // A unit or mode flip while the layers were pruned/hidden left the
      // encoded interval table stale — catch it up before showing.
      getDemSource().then((demSource) => {
        if (seq !== applySeq || getMapInstance() !== map) return;
        syncContourTiles(map, demSource);
      }).catch(() => { /* surfaced by the DEM error note */ });
      map.setLayoutProperty(HILLSHADE_LAYER, 'visibility', layers.hillshade ? 'visible' : 'none');
      // Outdoor basemaps carry their own contours: the layers are pruned by
      // the hang below, and the visibility stays off even if a racing hang
      // re-added them.
      const showContours = layers.contours && !contoursBlocked();
      if (map.getLayer(CONTOUR_LAYER)) {
        map.setLayoutProperty(CONTOUR_LAYER, 'visibility', showContours ? 'visible' : 'none');
      }
      if (map.getLayer(CONTOUR_LABEL_LAYER)) {
        map.setLayoutProperty(CONTOUR_LABEL_LAYER, 'visibility', showContours ? 'visible' : 'none');
      }
      // First hang with contours visible: prime the terrain stats (a moveend
      // never fires on a map nobody has moved yet, so booting straight into
      // plateau country would otherwise stay on the neutral ladder).
      if (showContours && !terrainStats) scheduleContourAdaptation();
      applyTerrainTheme();
      refreshNote();
    }).catch(() => {
      // Plugin load failure takes the whole elevation pipeline with it —
      // surface it through the same note a DEM failure uses.
      if (demInUse()) { demFailed = true; refreshNote(); }
    });
  });
}

/** @private Adds the DEM source + hillshade/contour layers if the style is
 * missing them (first enable, or after a basemap setStyle wiped them). The
 * first call loads the maplibre-contour plugin and spawns its worker, so
 * this is async; every step after the await re-checks the style's state so
 * a basemap swap racing the load lands harmlessly (worst case the fresh
 * style gets the layers hung a beat later by the rehang hook). */
async function hangTerrainLayers() {
  const map = getMapInstance();
  if (!map) return;
  const demSource = await getDemSource();
  if (getMapInstance() !== map) return;
  const provider = getTerrainProvider();
  // Under the track vectors, over whatever basemap the style carries.
  const beforeId = map.getLayer('track-casing') ? 'track-casing' : undefined;
  if (!map.getSource(DEM_SOURCE)) {
    map.addSource(DEM_SOURCE, {
      type: 'raster-dem',
      // The DemSource's shared-cache protocol: terrain, hillshade and the
      // contour generator all read the same cached DEM tiles.
      tiles: [demSource.sharedDemProtocolUrl],
      encoding: provider.encoding,
      maxzoom: provider.maxZoom,
      tileSize: provider.tileSize,
      attribution: provider.attribution,
    });
  }
  if (!map.getLayer(HILLSHADE_LAYER)) {
    map.addLayer({
      id: HILLSHADE_LAYER,
      type: 'hillshade',
      source: DEM_SOURCE,
      layout: { visibility: 'none' },
      paint: hillshadePaint(),
    }, beforeId);
  }
  // The outdoor rule's "not loaded" half: no contour source, no contour
  // layers at all — and whatever a previous (non-outdoor) basemap hung is
  // pruned, so tile traffic and attribution stop with the switch.
  if (contoursBlocked()) {
    pruneContours(map);
    return;
  }
  if (!map.getSource(CONTOUR_SOURCE)) {
    // The URL encodes the CURRENT unit system × view mode terrain-adjusted
    // interval table; syncContourTiles re-points it on later flips and
    // adaptations.
    const params = buildContourParams();
    contourTilesUrl = demSource.contourProtocolUrl(params);
    appliedTable = params.thresholds;
    appliedUnit = getUnitSystem();
    appliedMode = mode;
    map.addSource(CONTOUR_SOURCE, {
      type: 'vector',
      // Generated by maplibre-contour from the shared DEM cache.
      tiles: [contourTilesUrl],
      maxzoom: CONTOUR_SOURCE_MAXZOOM,
      attribution: provider.attribution,
    });
  }
  if (!map.getLayer(CONTOUR_LAYER)) {
    map.addLayer({
      id: CONTOUR_LAYER,
      type: 'line',
      source: CONTOUR_SOURCE,
      'source-layer': CONTOUR_SOURCE_LAYER,
      // Round caps/joins keep the tile-boundary splits invisible.
      layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: contourPaint(),
    }, beforeId);
  }
  if (!map.getLayer(CONTOUR_LABEL_LAYER)) {
    map.addLayer({
      id: CONTOUR_LABEL_LAYER,
      type: 'symbol',
      source: CONTOUR_SOURCE,
      'source-layer': CONTOUR_SOURCE_LAYER,
      // Labels on the major contours only — every view labels just the
      // index lines (2026-10-08 user clarification, pulling back the
      // every-contour experiment); the interval tables thin them further
      // at low zoom and MapLibre's collision dedupes the rest.
      filter: CONTOUR_MAJOR,
      layout: {
        visibility: 'none',
        // line-center: one label per contour piece at its center. It is also
        // what unlocks the terrain lift below — plain line placement projects
        // glyphs flat (they float off the 3D model at pitch), while
        // line-center honors symbol-height-offset, pinning each glyph to the
        // terrain surface.
        'symbol-placement': 'line-center',
        'symbol-height-anchor': 'ground',
        // A hand's width above the ground so the glyph never sinks into it;
        // far below one pixel at map zooms, so the label still reads as
        // glued to the slope.
        'symbol-height-offset': 0.1,
        // The glyphs follow the contour's direction — the classic paper
        // topo-map convention (2026-10-07 user decision): numbers read
        // ALONG the line, and MapLibre's default keep-upright drops the
        // ones that would land upside-down. Rotation 'map' tracks the
        // line in the north-up plane. Pitch 'viewport' (2026-10-08 user
        // correction): at 3D pitch the glyphs stay standing on screen
        // instead of lying flat into the map plane — anchored to the
        // terrain point above, like signs stuck on the slope, readable
        // from any camera angle. The suffix is each system's paper-map
        // convention (contourLabelField): metric labels bare numbers,
        // imperial feet with a prime — a carried 米 would rotate sideways,
        // since MapLibre's upright-CJK vertical writing never applies to
        // line placement in the vendored 6.13.0.
        'text-rotation-alignment': 'map',
        'text-pitch-alignment': 'viewport',
        'text-field': contourLabelField(getUnitSystem()),
        'text-font': ['Noto Sans Regular'],
        // 14 px, constant across zooms like the width band. The quiet
        // 11 px MapTiler-outdoor numeral read too small against the
        // contour texture (2026-10-08 same-day ruling back up): A/B'd
        // at 14 vs 15, where 15 adds nothing visible, so 14 it is.
        'text-size': 14,
      },
      paint: contourLabelPaint(),
    }, beforeId);
  }
}

/** @private Hillshade paint from theme tokens (re-read on theme flips). */
function hillshadePaint() {
  return {
    'hillshade-exaggeration': 0.35,
    'hillshade-shadow-color': themeColor('--map-hillshade-shadow'),
    'hillshade-highlight-color': themeColor('--map-hillshade-highlight'),
    'hillshade-accent-color': themeColor('--map-hillshade-accent'),
  };
}

/** @private Which contour palette the ACTIVE basemap takes: on the imagery
 * basemaps — the catalog's two satellite rasters (EOX Sentinel-2, Esri World
 * Imagery) and the OpenFreeMap Dark vector style — the default browns sink
 * into the texture or the near-black ground, so the layers read the
 * dedicated high-visibility --map-contour-imagery* tokens; everywhere else
 * (the pale maps: OSM raster, OpenFreeMap Bright/Positron) the deep warm
 * --map-contour pair (css/tokens.css, shared :root — both palettes are
 * basemap-driven, not theme-driven, because no basemap changes with the
 * theme). Re-resolved on every paint application, so the basemap:changed →
 * applyTerrain pass recolors a live map for free. */
function contourTokens() {
  const source = getActiveSource();
  if (source?.group === 'satellite' || source?.id === 'OpenFreeMapDark') {
    return { line: '--map-contour-imagery', label: '--map-contour-imagery-strong' };
  }
  return { line: '--map-contour', label: '--map-contour-strong' };
}

/** @private Contour paint — the MapLibre official example's visual language,
 * tuned by hand (2026-09-29): between z12 and z16 the lines thin out, major
 * (level=1) 1.2 → 0.9 px, minor (level=0) 0.6 → 0.45 px, constant outside
 * that band. One token color for both; the token colors are already
 * translucent (per basemap class — see contourTokens), so no extra
 * line-opacity is layered on top. */
function contourPaint() {
  return {
    'line-color': themeColor(contourTokens().line),
    'line-width': ['interpolate', ['linear'], ['zoom'],
      12, ['match', ['get', 'level'], 1, 1.2, 0.6],
      16, ['match', ['get', 'level'], 1, 0.9, 0.45],
    ],
  };
}

/** @private Label paint — the strong-line color with a casing-white halo
 * (--map-track-casing is the shared "contrast rim" cartographic constant,
 * identical in both themes); the rim also keeps the imagery scheme's yellow
 * glyphs separable over bright rock and concrete. */
function contourLabelPaint() {
  return {
    'text-color': themeColor(contourTokens().label),
    'text-halo-color': themeColor('--map-track-casing'),
    'text-halo-width': 1.2,
  };
}

/** @private */
function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** @private Re-reads the themed layer colors after a theme flip. */
function applyTerrainTheme() {
  const map = getMapInstance();
  if (!map) return;
  if (map.getLayer(HILLSHADE_LAYER)) {
    for (const [key, value] of Object.entries(hillshadePaint())) {
      map.setPaintProperty(HILLSHADE_LAYER, key, value);
    }
  }
  if (map.getLayer(CONTOUR_LAYER)) {
    for (const [key, value] of Object.entries(contourPaint())) {
      map.setPaintProperty(CONTOUR_LAYER, key, value);
    }
  }
  if (map.getLayer(CONTOUR_LABEL_LAYER)) {
    for (const [key, value] of Object.entries(contourLabelPaint())) {
      map.setPaintProperty(CONTOUR_LABEL_LAYER, key, value);
    }
  }
}

/* Dynamic contour interval adaptation --------------------------------------- */

/** @private Debounced moveend entry: one DEM stats pass per settled view. */
function scheduleContourAdaptation() {
  if (contourTimer) clearTimeout(contourTimer);
  contourTimer = setTimeout(() => {
    contourTimer = null;
    updateContourAdaptation();
  }, TERRAIN_CONTOUR_CONFIG.sampling.debounceMs);
}

/** @private Samples the viewport DEM and re-points the contour tiles when
 * the terrain bias moved the selected intervals. Every exit keeps the
 * current bias: overview zoom lands here explicitly (the neutral ladder
 * owns those bands), blocked/hidden contours have nothing to adapt, and an
 * unavailable or under-sampled DEM must not steer intervals. */
async function updateContourAdaptation() {
  const map = getMapInstance();
  const seq = ++contourSeq;
  if (!map || !settings.layers.contours || contoursBlocked()) return;
  if (map.getZoom() < TERRAIN_CONTOUR_CONFIG.overviewZoomFloor) {
    applyContourBias(0, map);
    return;
  }
  let stats = null;
  try {
    stats = await computeTerrainStats(map);
  } catch {
    stats = null; // demSource creation failure etc. — surfaced by the DEM note
  }
  if (seq !== contourSeq || getMapInstance() !== map) return;
  if (!stats) return;
  // The stats object rides the view mode for observability only — the bias
  // itself is mode-independent (same ground, see terrain-analysis.js).
  stats.mode = mode;
  terrainStats = stats;
  applyContourBias(terrainLogBias(stats), map);
}

/** @private Applies a (possibly unchanged) terrain bias: only a changed
 * built table re-points the contour source, through the same setTiles swap
 * the unit and mode flips use (the snap hysteresis inside the build already
 * damps boundary flapping; syncContourTiles dedupes identical URLs). */
function applyContourBias(bias, map) {
  if (bias === contourBias) return;
  contourBias = bias;
  getDemSource().then((demSource) => {
    if (getMapInstance() === map) syncContourTiles(map, demSource);
  }).catch(() => { /* surfaced by the DEM error note on the next pass */ });
}

/** The live contour adaptation state — observability for tests and the tmp
 * tools: the terrain log bias behind the current contour table (0 = the
 * neutral ladder, before any map or below the overview zoom floor) and the
 * thresholds table the current protocol URL encodes (null before the first
 * hang; its unit system and view mode are the live ones). */
export function getContourAdaptation() {
  return {
    bias: contourBias,
    table: appliedTable ? { ...appliedTable } : null,
  };
}

/** The most recent viewport terrain stats behind that bias, or null before
 * the first sample (also null below the overview zoom floor). */
export function getTerrainStats() {
  return terrainStats ? { ...terrainStats } : null;
}

/* DEM state note ------------------------------------------------------------ */

/** @private The loading / unavailable note over the map. One element per
 * map, shown while the DEM is in use (mesh, hillshade or contours) — the
 * "loading…" retires when the DEM tiles report loaded, "unavailable" latches
 * after a DEM error until the next mesh enable. */
function refreshNote() {
  const map = getMapInstance();
  if (!map) return;
  if (!noteEl) {
    noteEl = document.createElement('div');
    noteEl.className = 'map-terrain-note';
    noteEl.setAttribute('aria-live', 'polite');
    noteEl.hidden = true;
    map.getContainer().appendChild(noteEl);
  }
  if (!demInUse()) {
    noteEl.hidden = true;
    noteEl.dataset.state = '';
    return;
  }
  if (demFailed) {
    noteEl.dataset.state = 'error';
    noteEl.textContent = t('terrainUnavailable');
    noteEl.hidden = false;
    return;
  }
  // Loaded → silent; still streaming → the loading pill.
  const loaded = map.getSource(DEM_SOURCE)
    && typeof map.isSourceLoaded === 'function'
    && map.isSourceLoaded(DEM_SOURCE);
  noteEl.hidden = !!loaded;
  if (!loaded) {
    noteEl.dataset.state = 'loading';
    noteEl.textContent = t('terrainLoading');
  }
}
