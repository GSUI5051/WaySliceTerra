/**
 * The camera-report hotkey — debug observability for renderer bug reports
 * (2026-10-08, born from the Everest contour-break diagnosis): pressing `
 * (Backquote) prints the live camera and terrain context as ONE jumpTo-ready
 * JSON line to the console and copies the JSON to the clipboard, so a view
 * reported elsewhere replays here exactly (a replay helper feeds the line
 * back verbatim).
 *
 * The contour interval is deliberately NOT carried: it is derived from
 * zoom + view mode + unit system + the terrain bias the camera itself
 * implies, so replaying the same camera re-derives it — the report only
 * carries the inputs.
 */

import { getMapInstance, getActiveSource } from './mapView.js';
import { getTerrainSettings, isTerrainEnabled } from './terrain.js';
import { getViewMode } from './viewMode.js';
import { getUnitSystem } from '../units/units.js';
import { getCurrentLanguage } from '../language/language.js';

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** The live camera + context object, or null before the map exists. The
 * camera fields (center/zoom/pitch/bearing) are jumpTo-compatible as-is. */
export function cameraReport() {
  const map = getMapInstance();
  if (!map) return null;
  const c = map.getCenter();
  return {
    center: [round(c.lng, 5), round(c.lat, 5)],
    zoom: round(map.getZoom(), 3),
    pitch: round(map.getPitch()),
    bearing: round(map.getBearing()),
    mode: getViewMode(),
    terrain: isTerrainEnabled(),
    exaggeration: getTerrainSettings().exaggeration,
    basemap: getActiveSource()?.id ?? null,
    units: getUnitSystem(),
    language: getCurrentLanguage(),
    viewport: [window.innerWidth, window.innerHeight],
  };
}

/** Prints the prefixed one-line report and best-effort copies the bare JSON
 * to the clipboard (silently skipped where the clipboard is unavailable). */
export function reportCamera() {
  const info = cameraReport();
  if (!info) {
    console.log('[WaySliceTerra] camera — map not created yet');
    return;
  }
  const json = JSON.stringify(info);
  console.log(`[WaySliceTerra] camera ${json}`);
  navigator.clipboard?.writeText(json)
    .then(() => console.log('[WaySliceTerra] camera JSON copied to clipboard'))
    .catch(() => { /* clipboard denied — the console line stands */ });
}

/** Wires the Backquote hotkey. Typing contexts and modifier chords are
 * ignored so the key never hijacks ordinary input. */
export function initCameraReport() {
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    reportCamera();
  });
}
