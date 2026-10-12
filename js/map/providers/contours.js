/**
 * Contour configuration — the interval candidate sets, the zoom/mode
 * recommendation ranges, and the builders that turn a terrain-adjusted
 * target into maplibre-contour source parameters and label expressions.
 * js/map/terrain.js consumes all of it; nothing else in the app sees a
 * contour parameter.
 *
 * The contours are GENERATED in the browser by the vendored maplibre-contour
 * (vendor/maplibre-contour — DemSource + its worker) from the same Mapterhorn
 * DEM the 3D terrain and hillshade read, through the DemSource singleton
 * (js/map/demSource.js). No remote contour tileset, no marching squares of
 * our own, no pre-generated data in the repo.
 *
 * THE INTERVAL PIPELINE:
 *
 *   zoom / 2D-3D  →  base range [lo, hi] from the tables below
 *   →  geometric-median target  √(lo × hi)
 *   →  DEM terrain adjustment as a log-space bias (terrainLogBias,
 *      js/map/terrain-analysis.js — the only module that knows about terrain)
 *   →  snap to the unit system's candidate ladder (log-nearest)
 *   →  the band's own index ratio  →  [minor, major] thresholds
 *   →  multiplier (display units → meters)  →  maplibre-contour layer
 *
 * Two independent axes, both literal, never derived from each other:
 *
 *   UNIT SYSTEM — the DEM carries meter elevations; the imperial `multiplier`
 *   scales them to feet BEFORE isolines are extracted, so imperial contours
 *   land on round-foot elevations (100 ft = 30.48 m) and read as
 *   100 / 200 / 500 ft — never on the meter contours relabeled 328 ft / 164
 *   ft. Interval SELECTION happens in display units (meters or feet, each
 *   against its own candidate ladder) and only the final pair flows through
 *   the multiplier — selection never converts across units.
 *
 *   VIEW MODE — the 2D and 3D tables answer different needs (Terra spec): the
 *   flat map leans on contour lines as primary terrain information, the 3D
 *   mesh already carries the relief so its contours stay supplementary.
 *   Both tables are hand-tuned per mode and unit system (latest hand-tuning
 *   pass: 2026-10-04) and carry RECOMMENDED RANGES [lo, hi] per zoom band —
 *   "at this zoom, in this mode, the interval should land between lo and hi"
 *   (snapping may pin exactly lo or hi; that is in range by design). A mode
 *   flip re-points the contour source's protocol URL — the table is encoded
 *   in it — so the tiles regenerate for the mode's own intervals.
 *
 * The [minor, major] pair maplibre-contour expects is BUILT from each band:
 *
 *   minor = the snapped candidate — the contour interval the user reads
 *   major = minor × the band's index ratio (hi / lo of its range — the
 *           hand-tuned index cadence of the old literal tables, preserved,
 *           e.g. the 5× every-fifth-line standard of the deep 2D bands)
 *
 * A positive log bias coarsens (plateau / plain), a negative one refines
 * (strongly dissected mountains); bias 0 is the neutral geometric median of
 * every band.
 */

import { METERS_PER_FOOT } from '../../units/units.js';

/**
 * The complete set of allowed FINAL display intervals per unit system — the
 * topo-standard ladder in each unit. Nothing outside these two sets may ever
 * reach the map (25 m / 40 m / 25 ft / 60 ft style values are forbidden by
 * the rework spec); the suites pin both literals. The metric ladder floors
 * at 20 m by user decision (2026-10-07, same day as the rework — the floor
 * went 10 → 50 → 20 through the day's three rulings; the 10 m rung stays
 * retired: under the ±0.7 bias clamp no band target ever reached it, so it
 * was dead code in the spec's original ladder too).
 */
export const METRIC_CONTOUR_INTERVALS = Object.freeze([20, 50, 100, 200, 500, 1000]);
export const IMPERIAL_CONTOUR_INTERVALS = Object.freeze([50, 100, 200, 500, 1000, 2000]);

/** Snap stickiness in log space: the interval currently applied to the map
 * survives a re-selection unless the new candidate is closer to the target
 * by more than this. A viewport parked on a snap boundary must not
 * flip-flop contour tile regeneration on every small pan (~10 % of the
 * ~0.8–0.9 log spacing between adjacent candidates). */
export const CONTOUR_SNAP_HYSTERESIS = 0.1;

const CANDIDATES = { metric: METRIC_CONTOUR_INTERVALS, imperial: IMPERIAL_CONTOUR_INTERVALS };

/**
 * Per-unit-system contour configuration, handed to
 * demSource.contourProtocolUrl() (see providers/terrain.js's provider for
 * the DEM the isolines come from). The two entries are separate literals on
 * purpose — an imperial interval must never be computed from a metric one.
 *
 * `thresholds` maps view mode ('2d' / '3d') → zoom → [lo, hi] RECOMMENDED
 * INTERVAL RANGE in display units. Keys mark the zoom AT WHICH the range
 * activates and stay identical across unit systems AND modes so all tables
 * stay structurally parallel; a missing key inherits the next lower one, so
 * key 0 covers every zoom below 10.
 *
 * Range rules (mirrored by suite-terrain.js): both endpoints standard topo
 * round values, lo strictly below hi, and no band's endpoints coarser than
 * the one below it (the bands refine monotonically on zoom-in).
 */
export const CONTOUR_CONFIG = {
  metric: {
    /** DEM elevations are meters: isolines at round meter elevations. */
    multiplier: 1,
    /** view mode → zoom → [lo, hi] recommended interval range, meters. The
     * deep 2D band floors at the 20 m ladder floor (2026-10-07 second user
     * decision, same day as the rework — back from the day's 50 m floor). */
    thresholds: {
      '2d': {
        0: [500, 1000],
        10: [100, 1000],
        11: [100, 500],
        12: [100, 500],
        13: [100, 500],
        14: [20, 100],
        15: [20, 100],
        16: [20, 100],
      },
      '3d': {
        0: [50, 1000],
        10: [50, 1000],
        11: [50, 1000],
        12: [50, 500],
        13: [50, 100],
        14: [50, 100],
        15: [50, 100],
        16: [50, 100],
      },
    },
  },
  imperial: {
    /** Scale DEM meters to feet first, so isolines fall on round-foot
     * elevations — the exact inverse of the shared METERS_PER_FOOT factor. */
    multiplier: 1 / METERS_PER_FOOT,
    /** view mode → zoom → [lo, hi] recommended interval range, feet — an
     * independent round-foot ladder, not the metric table converted. Both
     * tables floor at the 100 ft fine end (≈ 30 m): the 2D table in its
     * deepest three bands (z14–16), the 3D table from its overview band on.
     * Every table repeats its z15 range at z16 so the built intervals can
     * never step coarser across the z15→z16 tile-generation boundary. */
    thresholds: {
      '2d': {
        0: [1000, 2000],
        10: [500, 2000],
        11: [500, 2000],
        12: [500, 2000],
        13: [500, 2000],
        14: [100, 500],
        15: [100, 500],
        16: [100, 500],
      },
      '3d': {
        0: [100, 2000],
        10: [100, 1000],
        11: [100, 1000],
        12: [100, 1000],
        13: [100, 200],
        14: [100, 200],
        15: [100, 200],
        16: [100, 200],
      },
    },
  },
};

/** View modes that carry a contour interval table — the keys every unit
 * system's `thresholds` must parallel (mirrored by suite-terrain.js). */
export const CONTOUR_MODES = ['2d', '3d'];

/** Zoom cap of the generated contour vector source — contour tiles are
 * generated up to here (overzooming the z12 DEM, per the MapLibre official
 * example) and MapLibre upscales them above. 16, not the example's 15:
 * thresholds keyed at 16 only take effect on tiles actually GENERATED at
 * z16 — with a z15 source the deepest interval band would be dead code. */
export const CONTOUR_SOURCE_MAXZOOM = 16;

/**
 * The active [lo, hi] recommended interval range for one zoom in one mode —
 * the same step semantics maplibre-contour applies to the thresholds table
 * (the greatest zoom key ≤ zoom wins; key 0 covers everything below it).
 *
 * @param {'metric'|'imperial'} unitSystem  from getUnitSystem()
 * @param {'2d'|'3d'} viewMode  from getViewMode()
 * @param {number} zoom  the map (or tile) zoom
 * @returns {[number, number]} the recommended range, display units
 */
export function contourBaseRange(unitSystem, viewMode, zoom) {
  const thresholds = lookupThresholds(unitSystem, viewMode);
  if (!Number.isFinite(zoom)) throw new Error('zoom must be a finite number');
  const keys = Object.keys(thresholds).map(Number).sort((a, b) => a - b);
  let pair = thresholds[keys[0]];
  for (const key of keys) {
    if (key <= zoom) pair = thresholds[key];
    else break;
  }
  return [pair[0], pair[1]];
}

/**
 * Snaps a display-unit interval target to the unit system's candidate
 * ladder by LOG distance — |log(candidate / target)|, not absolute
 * difference, because the ladders are ~geometric sequences (target 70 must
 * weigh 50 vs 100 by ratio, not pick 50 for being 20 instead of 30 away).
 * Exact log ties (the target on a √(lo × hi) boundary) resolve to the
 * FINER candidate — detail-biased, and deterministic under float dust via
 * the epsilon in the comparison.
 *
 * `current` (optional) is the interval the map currently carries: it
 * survives unless the winner beats it by more than CONTOUR_SNAP_HYSTERESIS
 * in log distance (the anti-flap margin; pass null for a cold build).
 *
 * @param {number} target  the terrain-adjusted interval target, display units
 * @param {'metric'|'imperial'} unitSystem
 * @param {number} [current]  the currently applied interval, if any
 * @returns {number} an element of the unit system's candidate ladder
 */
export function snapContourInterval(target, unitSystem, current = null) {
  const candidates = CANDIDATES[unitSystem];
  if (!candidates) throw new Error(`unknown unit system: ${unitSystem}`);
  if (!Number.isFinite(target) || target <= 0) throw new Error(`invalid interval target: ${target}`);
  let best = candidates[0];
  let bestDistance = Math.abs(Math.log(target / best));
  for (let i = 1; i < candidates.length; i++) {
    const distance = Math.abs(Math.log(target / candidates[i]));
    if (distance < bestDistance - 1e-12) {
      best = candidates[i];
      bestDistance = distance;
    }
  }
  if (current != null && candidates.includes(current)) {
    const currentDistance = Math.abs(Math.log(target / current));
    if (currentDistance <= bestDistance + CONTOUR_SNAP_HYSTERESIS) return current;
  }
  return best;
}

/**
 * Builds the full [minor, major] thresholds table for one unit system in one
 * view mode under one terrain log bias: every zoom key of the range table
 * gets its own geometric-median target, adjusted and snapped — so the whole
 * LOD ladder shifts together with the terrain under the view while each band
 * keeps its own hand-tuned span (and snapping keeps the ladder monotonic:
 * finer bands stay finer or equal, never stepping backwards).
 *
 * @param {'metric'|'imperial'} unitSystem  from getUnitSystem()
 * @param {'2d'|'3d'} viewMode  from getViewMode() — picks the range table
 * @param {number} [logBias=0]  the terrain adjustment in log space (see
 *   terrainLogBias): positive coarsens, negative refines, 0 = neutral
 * @param {Object.<string, [number, number]>} [previous]  the thresholds
 *   table currently applied to the map (same unit system AND view mode) —
 *   each band's applied interval rides snapContourInterval's hysteresis.
 *   Passing a table from another unit/mode is a caller bug; it would pin
 *   intervals to a foreign ladder.
 * @returns {Object.<string, [number, number]>} zoom key → [minor, major],
 *   display units — a fresh object; the config literals are never exposed
 */
export function buildContourThresholds(unitSystem, viewMode, logBias = 0, previous = null) {
  const thresholds = lookupThresholds(unitSystem, viewMode);
  if (!Number.isFinite(logBias)) throw new Error(`invalid terrain log bias: ${logBias}`);
  const scale = Math.exp(logBias);
  const built = {};
  for (const key of Object.keys(thresholds)) {
    const [lo, hi] = thresholds[key];
    // Contour ladders are log sequences, so the band's neutral target is the
    // geometric median √(lo × hi) — never the arithmetic mean.
    const target = Math.sqrt(lo * hi) * scale;
    const minor = snapContourInterval(target, unitSystem, previous?.[key]?.[0] ?? null);
    built[key] = [minor, minor * (hi / lo)];
  }
  return built;
}

/**
 * Builds the full maplibre-contour protocol-URL options for one unit system
 * in one view mode: the unit system's multiplier + that mode's terrain-
 * adjusted thresholds table, plus the vector-tile shape the layers expect
 * (`ele` / `level` properties on a `contours` source-layer) and the example's
 * seam/quality parameters.
 *
 * @param {'metric'|'imperial'} unitSystem  from getUnitSystem()
 * @param {'2d'|'3d'} viewMode  from getViewMode() — picks the range table
 * @param {number} [logBias=0]  the terrain adjustment in log space (see
 *   buildContourThresholds); defaults to 0 — the neutral LOD ladder
 * @param {Object.<string, [number, number]>} [previous]  the currently
 *   applied thresholds table for hysteresis (see buildContourThresholds)
 * @returns {object} options for DemSource.contourProtocolUrl()
 */
export function contourTileParams(unitSystem, viewMode, logBias = 0, previous = null) {
  const thresholds = buildContourThresholds(unitSystem, viewMode, logBias, previous);
  return {
    multiplier: CONTOUR_CONFIG[unitSystem].multiplier,
    thresholds,
    elevationKey: 'ele',
    levelKey: 'level',
    contourLayer: 'contours',
    // The official example's seam/quality parameters — buffer smooths
    // generated lines across tile boundaries, overzoom (the 512px DEM's
    // recommended setting) keeps high-zoom lines off pixel staircases.
    buffer: 1,
    overzoom: 1,
  };
}

/** @private Shared unit/mode validation for the range + build entry points. */
function lookupThresholds(unitSystem, viewMode) {
  const config = CONTOUR_CONFIG[unitSystem];
  if (!config) throw new Error(`unknown unit system: ${unitSystem}`);
  const thresholds = config.thresholds[viewMode];
  if (!thresholds) throw new Error(`unknown view mode: ${viewMode}`);
  return thresholds;
}

/**
 * Builds the `text-field` expression for the elevation labels on the index
 * (major) contours: the elevation the CURRENT contour configuration actually
 * generated — meter values in metric tiles, foot values in imperial tiles —
 * so the label can never show a cross-unit conversion artifact. The suffix
 * convention is each system's own paper-map one (2026-10-07 user ruling,
 * after USGS and real-world topo sheets): metric labels are BARE elevation
 * numbers (国标高程注记, Swiss sheets), imperial flags feet with a prime —
 * 3300'. Both run along the line (terrain.js's alignment ruling); a carried
 * 米 would rotate sideways, because MapLibre line placement rotates every
 * glyph and its upright-CJK vertical writing is point-placement-only in the
 * vendored 6.13.0 — the same reason metric stays bare in every language.
 * The label is therefore language-INDEPENDENT: only units:changed rebuilds
 * it.
 *
 * @param {'metric'|'imperial'} unitSystem  from getUnitSystem()
 * @returns {Array} a MapLibre expression
 */
export function contourLabelField(unitSystem) {
  // round + to-string (not number-format): integer labels with no locale
  // grouping separators, the same integer rounding the app's formatElevation
  // prints, and it also absorbs the multiplier's float dust.
  const elevation = ['to-string', ['round', ['get', 'ele']]];
  // USGS-style feet prime, attached with no space (3300').
  return unitSystem === 'imperial' ? ['concat', elevation, "'"] : elevation;
}
