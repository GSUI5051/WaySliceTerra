# Vendored: MapLibre GL JS

- Library: MapLibre GL JS, **version 6.13.0** (pinned single version)
- Source: official npm release package `maplibre-gl@6.13.0`
  (`https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-6.13.0.tgz`),
  files copied unmodified from its `dist/` directory
- License: **BSD-3-Clause** — copyright MapLibre contributors; the license
  text ships in the npm package and is published at
  <https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt>.
  Project homepage: <https://maplibre.org>

## Files

| File | Role |
| --- | --- |
| `maplibre-gl.mjs` | ES-module entry (minified release build, self-contained) |
| `maplibre-gl-worker.mjs` | WebWorker chunk spawned by the entry at runtime (resolved relative to `import.meta.url`, with a `?v=<version>` cache-busting query since 6.13.0 — so entry and worker must stay side by side) |
| `maplibre-gl.css` | required stylesheet for controls/markers (see below: wrapped in `@layer maplibre`) |
| `maplibre-global.mjs` | two-line project adapter (NOT part of the upstream package): mounts the ES-module namespace as the `window.maplibregl` global so the rest of the app can keep a library-loaded check |

`maplibre-gl-shared.mjs` (vendored up to 6.11.2) is gone: since 6.13.0 the
worker is self-contained again, the shared chunk upstream ships is an empty
deprecated placeholder, and the entry no longer references it.

Upstream ships no UMD/single-file build since the v6 major (ESM only), which
is why the global mount is a tiny shim next to the unmodified dist files.
Serving note: the `.mjs` files must be delivered as JavaScript
(`text/javascript`) — including when requested with the `?v=` query string
the entry appends to the worker URL; any static file server with a normal
MIME table works.

## Local modification (CSS only): `@layer maplibre` wrap

`maplibre-gl.css` is the pristine upstream stylesheet wrapped in
`@layer maplibre { … }` so the application's unlayered styles always win the
cascade against every vendor rule regardless of specificity — this is what
lets the shared `.btn`/`.btn-elevated` classes color the MapLibre zoom
buttons (js/map/mapView.js) without `!important` overrides. The JS files are
unmodified. **Re-vendoring a newer MapLibre must re-apply this wrap.**
