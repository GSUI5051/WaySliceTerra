/**
 * View mode — the 2D ↔ 3D state machine of the Terra map.
 *
 * A real mode, not a pitch hack: the manager owns the mode state, the camera
 * transitions, the interaction handlers each mode allows, and the desktop
 * right-click shortcut, and drives terrain rendering through js/map/terrain.js.
 * The spec's ViewModeManager surface — enter2D / enter3D / toggle / getMode /
 * restoreCamera — lives on the factory below, which takes its map and side
 * effects as injectable dependencies so the camera rules are unit-testable
 * without MapLibre.
 *
 * Mode rules (Terra spec):
 *   2D  pitch 0, north-up, flat basemap, no terrain — the classic WaySlice map.
 *   3D  DEM terrain on, default pitch ~55°, current bearing kept (never forced
 *       to a fixed heading), exaggeration starts at 1; rotation and touch-pitch
 *       open up because looking around is the point here.
 *   Transitions preserve center and zoom (no fitBounds — that would yank the
 *   user's viewport), animate smoothly, and never reload the track.
 *
 * Right-click (desktop only): a right-click on the EMPTY map toggles the mode.
 * A right-click on a marker (waypoint pin, sector handle) or on a track
 * feature does NOT — those belong to a future feature context menu, and the
 * event structure below keeps that seam intact (comments at the checks).
 * A right-button DRAG is not a click and never toggles. Touch devices only
 * ever switch through the visible 2D/3D button.
 */
import { wantsCooperativeGestures } from './gestures.js';
import { getMapInstance } from './mapView.js';
import { setTerrainEnabled, setTerrainMode } from './terrain.js';
import { emit, on } from '../core/events.js';
import { t } from '../language/language.js';

/** Entering 3D pitches the camera to this (spec: roughly 50–65°). */
export const DEFAULT_3D_PITCH = 55;

/** Right-button travel beyond this many pixels means "drag", not "click". */
const DRAG_THRESHOLD_PX = 8;

const TRANSITION_MS = 650;

/**
 * Builds a view-mode manager. All map/side-effect dependencies are
 * injectable; the app singleton wires the real ones in initViewMode().
 *
 * @param {Object} deps
 * @param {() => object|null} deps.getMap  the MapLibre instance (or null
 *        before the lazy first track)
 * @param {(on3d: boolean, mode: '2d'|'3d') => void} deps.setTerrainEnabled
 *        terrain renderer — the mode rides along so the terrain module can
 *        apply the arriving mode's own layer states
 * @param {(mode: '2d'|'3d') => void} [deps.onModeChange]
 * @param {() => boolean} [deps.isTouch]  true on touch-only devices (no
 *        right-click); defaults to the coarse-pointer media query
 * @param {() => boolean} [deps.prefersReducedMotion]  animations become jumps
 * @param {number} [deps.pitch3d]
 */
export function createViewModeManager({
  getMap,
  setTerrainEnabled,
  onModeChange = () => {},
  isTouch = () => wantsCooperativeGestures(),
  prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  pitch3d = DEFAULT_3D_PITCH,
}) {
  let mode = '2d';
  /** Camera captured on every exit-from / enter-into a mode — restoreCamera's
   * datum and the "never yank the viewport" guarantee. */
  let savedCamera = null;
  /** Increments per transition; a pending 3D→2D terrain detach is voided
   * when the user flips modes again mid-animation. */
  let transitionSeq = 0;
  /** Where the current right-button press started (screen px), for the
   * drag/click discrimination. */
  let rightDown = null;

  const manager = {
    /** @returns {'2d'|'3d'} */
    getMode() {
      return mode;
    },

    /** The camera captured at the last mode switch, for callers that need to
     * put the user back exactly where they were. */
    getSavedCamera() {
      return savedCamera ? { ...savedCamera, center: [...savedCamera.center] } : null;
    },

    /** Returns the viewport to the camera captured at the last mode switch
     * (a documented seam for future mode-independent camera resets). */
    restoreCamera(opts = {}) {
      const m = getMap();
      if (!m || !savedCamera) return mode;
      if (opts.animate === false || prefersReducedMotion()) m.jumpTo({ ...savedCamera });
      else m.easeTo({ ...savedCamera, duration: opts.duration ?? TRANSITION_MS });
      return mode;
    },

    enter2D(opts = {}) {
      const m = getMap();
      if (!m || mode === '2d') return mode;
      mode = '2d';
      const seq = ++transitionSeq;
      savedCamera = snapshot(m);
      // Rotation closes with the third dimension: 2D is the flat north-up
      // map again (bearing back to 0 — the 2D invariant).
      applyInteractionHandlers(m, false);
      // The layer states adopt 2D immediately (the mode event below refreshes
      // the map buttons and they must read the 2D pair, not the outgoing 3D
      // one); only the MESH detach waits for the ease to land.
      setTerrainMode('2d');
      if (opts.animate === false || prefersReducedMotion()) {
        m.jumpTo({ center: savedCamera.center, zoom: savedCamera.zoom, bearing: 0, pitch: 0 });
        setTerrainEnabled(false, '2d');
      } else {
        // The DEM detaches when the ease lands, so the track keeps hugging
        // the ground while the camera comes down; a mode flip mid-flight
        // voids the detach.
        m.once('moveend', () => {
          if (seq === transitionSeq) setTerrainEnabled(false, '2d');
        });
        m.easeTo({ center: savedCamera.center, zoom: savedCamera.zoom, bearing: 0, pitch: 0, duration: opts.duration ?? TRANSITION_MS });
      }
      onModeChange(mode);
      return mode;
    },

    enter3D(opts = {}) {
      const m = getMap();
      if (!m || mode === '3d') return mode;
      mode = '3d';
      ++transitionSeq; // voids a pending 2D terrain detach
      savedCamera = snapshot(m);
      // Terrain attaches immediately — DEM tiles stream in under the ease.
      // The mode rides along so the terrain module applies THIS mode's own
      // hillshade/contour states (js/map/terrain.js setTerrainEnabled).
      setTerrainEnabled(true, '3d');
      applyInteractionHandlers(m, true);
      // Center, zoom and bearing stay exactly as they are; only pitch moves.
      if (opts.animate === false || prefersReducedMotion()) m.jumpTo({ pitch: pitch3d });
      else m.easeTo({ pitch: pitch3d, duration: opts.duration ?? TRANSITION_MS });
      onModeChange(mode);
      return mode;
    },

    setMode(next, opts) {
      return next === '3d' ? manager.enter3D(opts) : manager.enter2D(opts);
    },

    toggle(opts) {
      return manager.setMode(mode === '2d' ? '3d' : '2d', opts);
    },

    /**
     * The desktop right-click shortcut. Returns true when it consumed the
     * event (mode toggled). The rejection branches ARE the future feature
     * context-menu seam: markers and track features leave the event alone,
     * so a context menu can later claim them without touching this module.
     * @param {{point: {x:number,y:number}, originalEvent?: MouseEvent}} e
     * @returns {boolean}
     */
    handleContextmenu(e) {
      // Touch devices switch through the visible buttons only.
      if (isTouch()) return false;
      const oe = e.originalEvent;
      // A right-button DRAG is not a right-click: discard when the pointer
      // travelled meaningfully between press and release.
      if (rightDown && oe && Number.isFinite(oe.clientX)
          && Math.hypot(oe.clientX - rightDown[0], oe.clientY - rightDown[1]) > DRAG_THRESHOLD_PX) {
        rightDown = null;
        return false;
      }
      rightDown = null;
      // Waypoint pins and sector handles are DOM markers; their right-clicks
      // belong to the future feature context menu — never toggle here.
      const target = oe && oe.target;
      if (target instanceof Element && target.closest('.maplibregl-marker')) return false;
      // Track right-clicks are reserved for the same future menu; only the
      // empty map background toggles the view mode.
      const m = getMap();
      if (m && typeof m.queryRenderedFeatures === 'function'
          && m.getLayer && m.getLayer('track-hit')
          && m.queryRenderedFeatures(e.point, { layers: ['track-hit'] }).length) {
        return false;
      }
      manager.toggle();
      return true;
    },

    /** Wires the map-level handlers: the right-click toggle and the browser
     * context-menu suppression on the map canvas. Call once per map (the
     * app singleton does it at the lazy map creation). */
    wireMap(m) {
      const canvasContainer = m.getCanvasContainer();
      canvasContainer.addEventListener('pointerdown', (e) => {
        if (e.button === 2) rightDown = [e.clientX, e.clientY];
      });
      // The browser menu must never appear on the map background — the
      // right-click means "toggle the view mode".
      canvasContainer.addEventListener('contextmenu', (e) => e.preventDefault());
      m.on('contextmenu', (e) => {
        if (e.originalEvent && e.originalEvent.cancelable) e.originalEvent.preventDefault();
        manager.handleContextmenu(e);
      });
    },
  };

  function snapshot(m) {
    const c = m.getCenter();
    return { center: [c.lng, c.lat], zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() };
  }

  /** 2D pins the map flat and north-up (rotation + touch pitch off, as the
   * map has always been configured here); 3D opens both so the terrain can
   * be looked around. Optional-chained so test doubles without handlers
   * pass through. */
  function applyInteractionHandlers(m, is3d) {
    if (is3d) {
      m.dragRotate?.enable();
      m.touchPitch?.enable();
    } else {
      m.dragRotate?.disable();
      m.touchPitch?.disable();
    }
  }

  return manager;
}

/* App singleton -------------------------------------------------------------- */

let manager = null;

/**
 * Boots the app's view-mode manager and wires the single 2D/3D button. The
 * right-click shortcut attaches itself when the lazily created map arrives.
 *
 * The button is an ACTION, not a radio pair (Terra spec): its label names
 * the DESTINATION mode — "3D" while the map is flat, "2D" while terrain is
 * up. The 2D/3D symbols need no translation anywhere in the world; the
 * titles/aria-labels carry the localized "Switch to …" sentence. This module
 * owns the button's text and title outright — no data-i18n attributes on it,
 * or the static translation pass would clobber the mode-dependent label on
 * every language change.
 *
 * @param {{button: HTMLElement}} controls
 */
export function initViewMode({ button }) {
  manager = createViewModeManager({
    getMap: getMapInstance,
    setTerrainEnabled,
    onModeChange: (mode) => emit('viewmode:changed', { mode }),
  });
  on('map:created', ({ map }) => manager.wireMap(map));

  button.addEventListener('click', () => manager.toggle());
  on('viewmode:changed', refreshControls);
  on('language:changed', refreshControls);
  refreshControls();

  function refreshControls() {
    const to3d = manager.getMode() === '2d';
    button.textContent = to3d ? t('view3D') : t('view2D');
    const label = t(to3d ? 'switchTo3D' : 'switchTo2D');
    button.title = label;
    button.setAttribute('aria-label', label);
  }
}

/** @returns {'2d'|'3d'} the current view mode ('2d' before boot). */
export function getViewMode() {
  return manager ? manager.getMode() : '2d';
}

/** Flips the current view mode (the map right-click routes here too). */
export function toggleViewMode() {
  manager?.toggle();
}

