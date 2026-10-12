/**
 * The maplibre-contour DemSource singleton — the bridge between the vendored
 * plugin (vendor/maplibre-contour) and the active DEM provider
 * (js/map/providers/terrain.js).
 *
 * One DemSource serves the whole elevation pipeline: its shared-cache DEM
 * protocol backs the raster-dem source (3D terrain + hillshade) and its
 * contour protocol generates the contour vector tiles from the SAME cached
 * DEM tiles — one download, one worker-side cache, no double traffic (the
 * spec's sharedDemProtocolUrl requirement). It runs its isoline computation
 * in a WebWorker, so contour generation never blocks the main thread.
 *
 * Like the MapLibre library itself, the plugin is LAZY: nothing downloads
 * until terrain first enables (getDemSource is called from js/map/terrain.js
 * only when hanging layers or re-pointing the contour source). The import of
 * the vendored MapLibre global is idempotent — ES module evaluation is
 * cached, so whichever module triggers it first pays the download.
 */

import { getTerrainProvider } from './providers/terrain.js';

/** The shared create-once promise; a failed creation resets it to retry. */
let creating = null;

/**
 * Resolves to the app's single DemSource, configured from the active terrain
 * provider and registered with MapLibre's protocol handlers. Concurrent
 * callers share one creation; a failed one (offline first enable, …) resets
 * so a later call retries.
 * @returns {Promise<import('../../vendor/maplibre-contour/index.mjs').DemSource>}
 */
export function getDemSource() {
  creating ??= createDemSource().catch((error) => {
    creating = null;
    throw error;
  });
  return creating;
}

/** @private */
async function createDemSource() {
  const [{ default: mlcontour }, maplibregl] = await Promise.all([
    import('../../vendor/maplibre-contour/index.mjs'),
    import('../../vendor/maplibre/maplibre-global.mjs').then(() => window.maplibregl),
  ]);
  const provider = getTerrainProvider();
  const demSource = new mlcontour.DemSource({
    url: provider.url,
    encoding: provider.encoding,
    maxzoom: provider.maxZoom,
    // Off-main-thread tile fetch + isoline generation (spec: worker: true).
    worker: true,
  });
  demSource.setupMaplibre(maplibregl);
  return demSource;
}
