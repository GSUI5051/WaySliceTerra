/**
 * Basemap catalog. Sources are grouped for the selector and carry their own
 * attribution strings (required by the providers). Tile availability is a
 * provider concern — the app never auto-switches sources to match the theme.
 */
/**
 * @typedef {Object} MapSource
 * @property {string} id
 * @property {string} labelKey      i18n key for the display name
 * @property {'street'|'outdoor'|'satellite'|'minimal'} group
 * @property {string} [url]         tile URL template ({z}/{x}/{y}, plus the
 *                                  Leaflet-era {s}/{r} markers where a provider
 *                                  offers them); omitted by vector-only
 *                                  providers that serve no raster tiles
 * @property {string} [overlayUrl]  transparent label overlay stacked on the base
 * @property {number} maxZoom
 * @property {string} attribution
 * @property {string[]} [subdomains]
 * @property {string} [styleUrl]  provider MapLibre style JSON (vector basemap):
 *                                rendered via map.setStyle instead of a raster
 *                                source; attribution then comes from the
 *                                style's TileJSON and needs no raster `url`
 * @property {boolean} [crossOrigin] not supported by MapLibre: raster tiles are
 *                                   uploaded as WebGL textures, which the browser
 *                                   security model restricts to CORS-enabled
 *                                   providers, and there is no opt-out
 * @property {string} [hintKey]     optional i18n key for a hint line
 * @property {boolean|'3d'} [naturalOverlay]  the natural face's overlay
 *                                  gating (js/map/hybrid.js): the face
 *                                  carries the seven natural landmark
 *                                  classes plus the park name labels
 *                                  (2026-10-09 plan A). false = the
 *                                  button is disabled on this basemap
 *                                  entirely; '3d' = the overlay only rides
 *                                  the 3D view (the standard raster maps
 *                                  draw their own natural markers and park
 *                                  names into the tiles — 2D would double
 *                                  them, 3D wants the app's standing
 *                                  landmarks); unset = every view mode
 */

/** @type {MapSource[]} */
export const MAP_SOURCES = [
  {
    id: 'osm',
    labelKey: 'srcOsm',
    group: 'street',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    // The standard raster maps draw their own natural markers into the tiles:
    // 2D keeps them alone, 3D wants the app's standing landmarks (the tile
    // markers melt into the draped raster).
    naturalOverlay: '3d',
  },
  {
    id: 'OpenFreeMapBright',
    labelKey: 'srcOpenFreeMapBright',
    group: 'street',
    // OpenFreeMap (per openfreemap.org's quick start): free vector styles, no
    // API key. Same shape as TFAtlas — the style JSON is self-contained and
    // its TileJSON attribution (OpenFreeMap, © OpenMapTiles, data ©
    // OpenStreetMap contributors) reaches the attribution control on its own.
    // Planet tiles are native z14 with overzoom up to maxZoom.
    styleUrl: 'https://tiles.openfreemap.org/styles/bright',
    maxZoom: 19,
    attribution: '&copy; <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
  },
  {
    id: 'opentopomap',
    labelKey: 'srcOpenTopoMap',
    group: 'outdoor',
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, SRTM | style: &copy; <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a> (CC-BY-SA)',
    // The standard raster maps draw their own natural markers into the tiles:
    // 2D keeps them alone, 3D wants the app's standing landmarks (the tile
    // markers melt into the draped raster).
    naturalOverlay: '3d',
  },
  {
    id: 'cyclosm',
    labelKey: 'srcCyclosm',
    group: 'outdoor',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
	subdomains:['a', 'b', 'c'],
    maxZoom: 19,
    attribution: '© CyclOSM',
    // The standard raster maps draw their own natural markers into the tiles:
    // 2D keeps them alone, 3D wants the app's standing landmarks (the tile
    // markers melt into the draped raster).
    naturalOverlay: '3d',
  },
  {
    id: 'EOXSentinel2',
    labelKey: 'srcEOXSentinel2',
    group: 'satellite',
    // Sentinel-2 cloudless 2025 by EOX (tiles.maps.eox.at WMTS). The layer
    // comes in two TileMatrixSets — WGS84 (EPSG:4326) and g/GoogleMapsCompatible
    // (EPSG:3857) — and MapLibre renders in Web Mercator (its coordinate-system
    // doc: EPSG:3857 is the display projection), so the _3857 layer variant is
    // the only one that aligns. WMTS REST axis order {TileMatrix}/{TileRow}/
    // {TileCol} = {z}/{y}/{x}, kept as with Esri. The server upsamples past
    // the native z14 imagery and serves CORS `*`.
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg',
    maxZoom: 19,
    attribution: '<a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless</a> by EOX IT Services (Contains modified Copernicus Sentinel data 2025)',
  },
  {
    id: 'esri-imagery',
    labelKey: 'srcEsriImagery',
    group: 'satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
  },
  {
    id: 'OpenFreeMapPositron',
    labelKey: 'srcOpenFreeMapPositron',
    group: 'minimal',
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    maxZoom: 19,
    attribution: '&copy; <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
  },
  {
    id: 'OpenFreeMapDark',
    labelKey: 'srcOpenFreeMapDark',
    group: 'minimal',
    styleUrl: 'https://tiles.openfreemap.org/styles/dark',
    maxZoom: 19,
    attribution: '&copy; <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    hintKey: 'srcOpenFreeMapDarkHint',
  },
];

/**
 * The basemap used while the user has not chosen one: OpenStreetMap.
 * An explicit choice always beats the default.
 */
export const DEFAULT_SOURCE_ID = 'osm';

/**
 * True for basemaps that carry their own contour lines (the outdoor group:
 * OpenTopoMap, CyclOSM). On them the app's generated contours stay off
 * entirely — not loaded, not displayed, whatever the terrain setting says —
 * so the two contour renderings never double-draw. js/map/terrain.js consults
 * this with the active source (mapView.getActiveSource) at every hang.
 * @param {MapSource} [source]  the active basemap catalog entry (null-safe)
 * @returns {boolean}
 */
export function isOutdoorBasemap(source) {
  return source?.group === 'outdoor';
}

/**
 * Whether the natural landmark overlay may show for this basemap in the
 * given view mode:
 *   - `naturalOverlay: false` → never (opted out entirely);
 *   - `naturalOverlay: '3d'`  → only while the 3D view is active. The
 *     standard raster maps (OSM, OpenTopoMap, CyclOSM) draw their own peak
 *     markers INTO the tiles — in 2D the app's overlay would double them,
 *     so it stays off; in 3D those tile markers just melt into the draped
 *     raster texture, so the app's standing 3D landmarks are wanted there;
 *   - unset                   → every view mode.
 * @param {MapSource} [source]  the active basemap catalog entry (null-safe;
 *        no basemap yet = no overlay)
 * @param {boolean} is3d  true while the 3D view is active
 * @returns {boolean}
 */
export function naturalOverlayEnabled(source, is3d) {
  if (source == null) return false;
  if (source.naturalOverlay === false) return false;
  if (source.naturalOverlay === '3d') return !!is3d;
  return true;
}

/**
 * Whether the natural face should also carry the settlement name labels for
 * this basemap in the given view mode (2026-10-09): exactly the basemaps
 * whose tiles draw their own place labels (`naturalOverlay: '3d'` — OSM,
 * OpenTopoMap, CyclOSM), in the 3D view only. In 3D the raster tiles' baked
 * labels melt into the draped imagery and the app's standing place labels
 * take over; in 2D the overlay would double them; and the OpenFreeMap
 * vector styles render place names of their own in every mode, so place
 * never rides there (their natural face carries the park names only).
 * @param {MapSource} [source]  the active basemap catalog entry (null-safe)
 * @param {boolean} is3d  true while the 3D view is active
 * @returns {boolean}
 */
export function placeOverlayEnabled(source, is3d) {
  return source?.naturalOverlay === '3d' && !!is3d;
}
const STORAGE_KEY = 'wayslice-basemap';

const GROUP_ORDER = ['street', 'outdoor', 'satellite', 'minimal'];

/** The active source id: the saved choice, else the default. */
export function getSavedSourceId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && MAP_SOURCES.some((s) => s.id === id)) return id;
  } catch { /* ignore */ }
  return DEFAULT_SOURCE_ID;
}

/**
 * @returns {MapSource} the saved source, or the default
 */
export function getSavedSource() {
  return MAP_SOURCES.find((s) => s.id === getSavedSourceId())
    ?? MAP_SOURCES.find((s) => s.id === DEFAULT_SOURCE_ID);
}

/** Persists the user's explicit source choice. @param {string} id */
export function saveSource(id) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

/**
 * Sources grouped in selector display order.
 * @returns {{groupKey:string, sources:MapSource[]}[]}
 */
export function groupedSources() {
  return GROUP_ORDER
    .map((group) => ({ group, groupKey: `group${group[0].toUpperCase()}${group.slice(1)}`, sources: MAP_SOURCES.filter((s) => s.group === group) }))
    .filter((g) => g.sources.length > 0);
}

/**
 * Converts a catalog template into a MapLibre raster source definition.
 * Sources with a label overlay get a second call with `source.overlayUrl`.
 *
 * MapLibre expands neither {s} nor {r}: subdomains become parallel complete
 * URLs in the `tiles` array, and {r} becomes '@2x' on high-DPI screens
 * (devicePixelRatio ≥ 2 — the same condition under which Leaflet substituted
 * it) or an empty string elsewhere. Both variants are 256 logical px per
 * tile; the @2x files simply carry double density, keeping retina screens
 * crisp. No shipped source uses {r} right now, but providers come and go.
 *
 * Esri's {z}/{y}/{x} axis order is provider-defined and kept as-is; MapLibre
 * substitutes by name.
 *
 * @param {MapSource} source
 * @param {string} [url]  defaults to the base `source.url`
 * @param {boolean} [retina]  defaults to the live devicePixelRatio
 * @returns {{type:'raster', tiles:string[], tileSize:number, maxzoom:number, attribution:string}}
 */
export function createRasterSource(source, url = source.url, retina = (window.devicePixelRatio || 1) >= 2) {
  const template = url.replace('{r}', retina ? '@2x' : '');
  const subdomains = Array.isArray(source.subdomains)
    ? source.subdomains
    : String(source.subdomains || 'abc').split('');
  const tiles = template.includes('{s}')
    ? subdomains.map((s) => template.replace('{s}', s))
    : [template];
  return {
    type: 'raster',
    tiles,
    tileSize: 256,
    maxzoom: source.maxZoom,
    attribution: source.attribution,
  };
}
