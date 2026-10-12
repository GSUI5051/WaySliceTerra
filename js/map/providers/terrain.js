/**
 * Terrain provider catalog — the DEM seam of the Terra architecture.
 *
 * The terrain provider is deliberately SEPARATE from the basemap provider
 * (js/map/sources.js): a basemap paints the ground, a terrain provider lifts
 * it. They can be combined freely — any basemap entry works with any DEM —
 * and neither knows about the other. js/map/terrain.js consumes this catalog
 * and hangs the raster-dem source; nothing else in the app sees a DEM URL.
 *
 * The catalog is the swap point for future providers (custom DEM endpoints,
 * and the China variants — Tianditu/Xingtu DEM): add an entry, keep
 * js/map/terrain.js and js/map/demSource.js untouched. v1 ships only the
 * international default, per the Terra spec (no China providers yet).
 *
 * Mapterhorn (tiles.mapterhorn.com) is the default and only entry: a
 * keyless, registration-free global DEM built from Copernicus GLO-30,
 * terrarium-encoded 512px WebP tiles up to zoom 12. It is also the source
 * the contour system generates from (js/map/providers/contours.js) — one
 * DEM for terrain, hillshade and contours, one tile cache, via the
 * maplibre-contour DemSource singleton (js/map/demSource.js).
 */

/**
 * @typedef {Object} TerrainProvider
 * @property {string} id
 * @property {string} labelKey   i18n key for the display name
 * @property {string} url        DEM xyz template ({z}/{x}/{y}) — consumed by
 *                                  the maplibre-contour DemSource, which also
 *                                  serves terrain/hillshade through its
 *                                  shared-cache protocol
 * @property {'mapbox'|'terrarium'} encoding  DEM pixel encoding
 * @property {number} maxZoom    native DEM zoom — the DemSource caps fetches
 *                                  at it and overzooms above
 * @property {number} tileSize   native tile pixel size (512 for Mapterhorn)
 * @property {string} attribution  provider credit, shown in the map's
 *                                  attribution control while terrain renders
 */

/** @type {TerrainProvider[]} */
export const TERRAIN_PROVIDERS = [
  {
    id: 'mapterhorn',
    labelKey: 'srcMapterhornTerrain',
    url: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
    encoding: 'terrarium',
    maxZoom: 12,
    tileSize: 512,
    attribution: '<a href="https://mapterhorn.com/" target="_blank" rel="noreferrer">Mapterhorn</a>, <a href="https://spacedata.copernicus.eu/" target="_blank" rel="noreferrer">Copernicus DEM</a>',
  },
];

/** The DEM used while the user has not chosen one. An explicit choice always
 * beats this default. */
export const DEFAULT_TERRAIN_PROVIDER_ID = 'mapterhorn';

const STORAGE_KEY = 'wayslice-terrain';

/**
 * Terrain rendering settings, persisted as one JSON blob. The hillshade and
 * contour visibility are ONE shared pair across both view modes (2026-10-05,
 * user decision — same cognitive model as the road-overlay toggle: a switch
 * is a switch, and the view mode must not silently flip it behind the
 * user's back). Contours default on — they are the primary terrain
 * information in 2D; the hillshade defaults off to keep the flat map
 * readable (Terra spec). Exaggeration shapes the 3D mesh only and stays a
 * drawer-level preference. The contour INTERVAL tables remain per view mode
 * (providers/contours.js) — only the on/off state is shared.
 */
const DEFAULT_SETTINGS = Object.freeze({
  providerId: DEFAULT_TERRAIN_PROVIDER_ID,
  exaggeration: 1,
  layers: Object.freeze({ hillshade: false, contours: true }),
});

/** A stale saved provider id (catalog renamed, blob hand-edited) silently
 * falls back to the default — same policy as the basemap catalog. */
export function getTerrainProviderId() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (raw.providerId && TERRAIN_PROVIDERS.some((p) => p.id === raw.providerId)) {
      return raw.providerId;
    }
  } catch { /* ignore */ }
  return DEFAULT_TERRAIN_PROVIDER_ID;
}

export function getTerrainProvider() {
  return TERRAIN_PROVIDERS.find((p) => p.id === getTerrainProviderId())
    ?? TERRAIN_PROVIDERS.find((p) => p.id === DEFAULT_TERRAIN_PROVIDER_ID);
}

/** @returns {typeof DEFAULT_SETTINGS} the stored rendering settings with
 * defaults filled in and out-of-range values clamped */
export function loadTerrainSettings() {
  const settings = {
    ...DEFAULT_SETTINGS,
    providerId: getTerrainProviderId(),
    layers: { ...DEFAULT_SETTINGS.layers },
  };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    // v3 blob (the shared pair under `layers`): read as-is.
    if (raw.layers && typeof raw.layers === 'object') {
      if (typeof raw.layers.hillshade === 'boolean') settings.layers.hillshade = raw.layers.hillshade;
      if (typeof raw.layers.contours === 'boolean') settings.layers.contours = raw.layers.contours;
    }
    // v2 blob (per-mode pair under `modes`) predates the shared toggle: the
    // 2D entry seeds the shared pair — the app boots in 2D, so the migration
    // changes nothing on screen at boot, and flipping to 3D now carries the
    // pair along instead of swapping it (the new shared semantics).
    else if (raw.modes && typeof raw.modes === 'object') {
      const saved = raw.modes['2d'];
      if (saved && typeof saved === 'object') {
        if (typeof saved.hillshade === 'boolean') settings.layers.hillshade = saved.hillshade;
        if (typeof saved.contours === 'boolean') settings.layers.contours = saved.contours;
      }
    }
    // v1 blob (flat hillshade / contours keys) predates the per-mode split:
    // those keys governed the 3D view, the only mode that then rendered
    // terrain. They seed the shared pair directly.
    else {
      if (typeof raw.hillshade === 'boolean') settings.layers.hillshade = raw.hillshade;
      if (typeof raw.contours === 'boolean') settings.layers.contours = raw.contours;
    }
    const n = Number(raw.exaggeration);
    if (Number.isFinite(n)) settings.exaggeration = Math.min(3, Math.max(0, n));
  } catch { /* ignore */ }
  return settings;
}

/** Persists a partial settings patch over the current stored value. A
 * `layers` patch deep-merges, so `{ layers: { hillshade: true } }` leaves
 * contours untouched.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch */
export function saveTerrainSettings(patch) {
  const current = loadTerrainSettings();
  const merged = { ...current, ...patch };
  if (patch.layers) {
    merged.layers = { ...current.layers, ...(patch.layers || {}) };
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
  return merged;
}
