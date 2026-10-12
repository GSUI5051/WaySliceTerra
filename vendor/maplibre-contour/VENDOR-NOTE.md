# Vendored: maplibre-contour

- Library: maplibre-contour, **version 0.1.1** (pinned single version)
- Source: official npm release package `maplibre-contour@0.1.1`
  (`https://registry.npmjs.org/maplibre-contour/-/maplibre-contour-0.1.1.tgz`),
  file copied unmodified from its `dist/` directory
- License: **BSD-3-Clause** — copyright Michael Barry (onthegomap); the
  license text ships alongside this note as `LICENSE` and in the npm package.
  Project homepage: <https://github.com/onthegomap/maplibre-contour>

## Files

| File | Role |
| --- | --- |
| `index.mjs` | the complete ES-module build (`dist/index.mjs`): DemSource, protocol handlers, isoline generation, and the WebWorker chunk **inlined as a blob** — `worker: true` self-registers a worker from `URL.createObjectURL`, so this one file is all the library needs |
| `LICENSE` | upstream BSD-3-Clause text, required for redistribution |

## Integration notes

- Loaded lazily via dynamic import together with the vendored MapLibre
  (`js/map/demSource.js`); the browser test suite never imports it.
- `DemSource.setupMaplibre(maplibregl)` registers two custom protocols,
  `<id>-shared` (raster-dem tiles through the shared worker cache) and
  `<id>-contour` (generated contour vector tiles). The generated-tile
  parameters (multiplier, thresholds, keys, buffer, overzoom) are encoded
  into the protocol URL, so changing intervals = new URL =
  `VectorTileSource.setTiles` — no source re-creation.
