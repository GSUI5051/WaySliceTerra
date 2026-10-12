/**
 * Terrain analysis — the DEM-driven contour interval selection.
 *
 * The range tables (js/map/providers/contours.js) answer "at this zoom, in
 * this mode, which interval SPAN suits the view" — but they cannot answer
 * "how much relief does THIS viewport actually carry". The same neutral
 * ladder that reads beautifully on 深圳梧桐山 drowns a gentle Tibetan plateau
 * in lines and starves the Alps of the detail a hiker reads. This module
 * computes the continuous terrain correction for the selection:
 *
 *   target interval = √(lo × hi) of the active band × exp(terrainLogBias(stats))
 *
 * Inputs are ONLY the DEM tiles already serving the current viewport — never
 * place names, countries, or any gazetteer. The map's own view is the sole
 * input: sample the shared DEM cache over the visible bounds, take the
 * elevation statistics, and turn them into one log-space bias. The bias is a
 * pure function of the stats; the range tables, the candidate ladders and
 * the snapping live in providers/contours.js, and selectContourInterval
 * below ties the two together (it never touches a map or the DOM — the
 * suites drive it with plain fixtures).
 *
 * WHY MEAN ELEVATION ALONE IS NOT ENOUGH — the two classic failures:
 *   • Coarsening by altitude alone would exactly blight the maps that need
 *     the most detail. The Alps and the southeast flank of the Himalaya
 *     average well above 3000 m, yet they are cut into ridge-and-valley
 *     mazes; a positive bias there would erase the very information a
 *     hiker reads (spur vs gully vs bench). Altitude may only coarsen
 *     GENTLE ground — the dissection gate below enforces exactly that.
 *   • High mean + high relief = mountains; high mean + low relief =
 *     plateau. The labels behave completely differently, so the decision
 *     joins them.
 *
 * WHY RANGE MUST BE NORMALIZED — elevationRange alone is viewport-size
 * dependent: the same Alps slope spans 400 m of range in a 2 km window and
 * 2500 m in a 20 km one. Dividing by the viewport's ground width yields
 * relief per km — effectively the average slope across the view — which is
 * stable as the user zooms and comparable across regions. All relief
 * thresholds in TERRAIN_CONTOUR_CONFIG are in m/km. Very low relief at low
 * altitude (plains) also coarsens via the anchors themselves — a plain at
 * deep zoom must not fill with unreadable hairlines.
 *
 * Scenario targets (from the rework spec's acceptance cases; stats are
 * representative SRTM/Copernicus-scale figures):
 *   A  梧桐山 / 黄山 / 泰山        moderate mean, relief ≥ 150 m/km → negative
 *                                 bias: the fine end of each band
 *   B  云贵高原 / 五台山台顶 /
 *      青藏高原腹地（改则、那曲）  high mean + gentle ground → positive bias:
 *                                 100/200/500 m class intervals
 *   C  阿尔卑斯 / 喜马拉雅南坡 /
 *      横断山                      high mean, extreme relief → elevation
 *                                 leverage vetoed; relief pulls the target
 *                                 back to the fine end
 *   D  平原 / 极低起伏             tiny relief at any altitude → capped
 *                                 positive bias: sparse, readable lines
 *
 * The DEM reads go through the maplibre-contour DemSource singleton
 * (js/map/demSource.js) — the SAME shared tile cache terrain, hillshade and
 * the contour generator use, so a stats sample costs at most the tile
 * fetches the map itself was about to make anyway.
 */

import { getDemSource } from './demSource.js';
import { getTerrainProvider } from './providers/terrain.js';
import { contourBaseRange, snapContourInterval } from './providers/contours.js';

/**
 * Centralized thresholds for the dynamic contour adaptation. Elevations in
 * meters, relief in m of range per km of viewport width, log-bias values in
 * natural-log units. Tuning these numbers retunes the whole feature — no
 * table edits needed.
 */
export const TERRAIN_CONTOUR_CONFIG = Object.freeze({
  /** Map zoom under which no adaptation happens (bias stays 0): the range
   * tables' overview bands already carry the world view, and world-browsing
   * must not churn contour regeneration. Also the sampling ladder's floor. */
  overviewZoomFloor: 10,
  /** The continuous terrain correction (see terrainLogBias). */
  adjustment: Object.freeze({
    /** Relief anchors: [m/km → log bias], interpolated linearly in
     * log(relief) between neighbors and clamped outside the ends. Gentle
     * ground coarsens (positive), reference hill country around 60 m/km is
     * neutral, strongly dissected country refines (negative). The end
     * values equal ±maxAbsBias, so plains and ice-sheet-flat interiors sit
     * exactly at the cap. */
    reliefAnchors: Object.freeze([
      Object.freeze([2, 0.7]),
      Object.freeze([10, 0.5]),
      Object.freeze([30, 0.2]),
      Object.freeze([60, 0]),
      Object.freeze([150, -0.5]),
      Object.freeze([300, -0.55]),
      Object.freeze([600, -0.7]),
    ]),
    /** Mean viewport elevation where plateau-style coarsening begins. Below
     * this the anchors alone decide (ordinary hill country and plains).
     * 1500 m — the 云贵高原 surfaces sit at ~1900–2300 m and must be well
     * inside the leverage, while 泰山/黄山-class mountains (700–1900 m) stay
     * anchor-driven; strongly cut ground above it is vetoed by the
     * dissection gate anyway. */
    plateauElevation: 1500,
    /** Mean elevation where the leverage saturates (the Tibetan interior
     * averages ≥ 4500 m; anything above reads as the same plateau class). */
    plateauCeiling: 5200,
    /** Maximum log leverage the elevation term contributes at the ceiling —
     * large enough that 高原腹地 hits the positive cap together with its
     * gentle-relief anchor, small enough that 五台山台顶 (mean ≈ 2750 m)
     * lands one step up, not two. */
    plateauLeverage: 1.2,
    /** Relief below which the elevation leverage applies in full. */
    leverageFullRelief: 30,
    /** Relief at/above which the elevation leverage is fully VETOED —
     * ridge-and-valley mountain country keeps its fine contours whatever
     * the altitude. Smoothstep ramps between the two. */
    leverageVetoRelief: 120,
    /** Hard clamp on the total bias, both directions: the terrain may shift
     * the target about one ladder step up or down (×2 / ÷2), never more. */
    maxAbsBias: 0.7,
  }),
  /** Viewport sampling behavior. */
  sampling: Object.freeze({
    /** moveend debounce before stats are recomputed (a pan stop settles
     * first; the sampler may fetch/decode up to `maxTiles` DEM tiles). */
    debounceMs: 700,
    /** Sampling ladder cap: at most this many DEM tiles per stats pass.
     * The ladder descends zoom until the viewport fits; past the floor it
     * strides an even subset of tiles instead. */
    maxTiles: 25,
    /** Fraction of planned tiles that must decode for stats to count;
     * less than this (DEM offline, void tile 404s) keeps the current
     * bias — an under-sampled view must not steer intervals. */
    minValidRatio: 0.5,
  }),
});

/** Valid-DEM-elevation window, aligned with maplibre-contour's own
 * defaultIsValid — values outside are void/no-data, not terrain. */
const MIN_VALID_M = -12000;
const MAX_VALID_M = 9000;

/**
 * The pure mapping from viewport terrain statistics to the contour interval
 * log bias: positive coarsens (fewer, thicker-spaced lines), negative
 * refines, 0 = the neutral geometric median of every band. Degenerate or
 * missing stats and views below the overview floor return 0 — an
 * under-sampled view must not steer intervals. Deliberately dumb data in,
 * one number out; every threshold lives in TERRAIN_CONTOUR_CONFIG.
 *
 * The bias joins the two terrain dimensions the spec's failure cases hinge
 * on (RELIEF first, elevation as a gated amplifier):
 *
 *   1. relief anchors   gentle ground (plains, plateau surfaces) coarsens,
 *                       reference hill country is neutral, dissection
 *                       refines — regardless of altitude
 *   2. plateau leverage mean elevation above the knee adds coarsening
 *                       leverage, but ONLY in proportion to gentleness —
 *                       strongly dissected views veto it entirely, so the
 *                       Alps and the Himalaya flanks stay anchor-driven
 *
 * `mode` ('2d' | '3d') rides along in the stats for observability but does
 * not change the bias: the terrain is the same ground in both view modes,
 * and the modes already tune their own range tables. Relief thresholds are
 * mode-independent by the same argument.
 *
 * @param {null | {
 *   meanElevation: number, reliefPerKm: number, zoom?: number,
 *   mode?: '2d'|'3d',
 * }} terrainStats  viewport elevation statistics (see computeTerrainStats)
 * @returns {number} the log bias, clamped to ±adjustment.maxAbsBias
 */
export function terrainLogBias(terrainStats) {
  if (!terrainStats) return 0;
  const cfg = TERRAIN_CONTOUR_CONFIG;
  const { meanElevation, reliefPerKm, zoom } = terrainStats;
  if (!Number.isFinite(meanElevation) || !Number.isFinite(reliefPerKm)) return 0;
  if (Number.isFinite(zoom) && zoom < cfg.overviewZoomFloor) return 0;
  const adj = cfg.adjustment;
  let bias = reliefAnchorBias(adj.reliefAnchors, reliefPerKm)
    + plateauLeverage(meanElevation, reliefPerKm, adj);
  const cap = adj.maxAbsBias;
  return Math.max(-cap, Math.min(cap, bias));
}

/** @private Log-x / linear-y interpolation over the relief anchors (see
 * TERRAIN_CONTOUR_CONFIG.adjustment.reliefAnchors), clamped at both ends. */
function reliefAnchorBias(anchors, reliefPerKm) {
  if (reliefPerKm <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (reliefPerKm >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    if (reliefPerKm <= anchors[i][0]) {
      const [r0, b0] = anchors[i - 1];
      const [r1, b1] = anchors[i];
      const t = Math.log(reliefPerKm / r0) / Math.log(r1 / r0);
      return b0 + (b1 - b0) * t;
    }
  }
  return last[1];
}

/** @private The elevation term: log-linear leverage from the plateau knee to
 * the ceiling, scaled by how GENTLE the view is (smoothstep 1 → 0 between
 * leverageFullRelief and leverageVetoRelief). Zero below the knee or on
 * dissected ground. */
function plateauLeverage(meanElevation, reliefPerKm, adj) {
  if (meanElevation <= adj.plateauElevation) return 0;
  const ramp = (reliefPerKm - adj.leverageFullRelief) / (adj.leverageVetoRelief - adj.leverageFullRelief);
  const t = Math.min(1, Math.max(0, ramp));
  const gentleness = 1 - t * t * (3 - 2 * t);
  if (gentleness <= 0) return 0;
  const rise = Math.log(meanElevation / adj.plateauElevation)
    / Math.log(adj.plateauCeiling / adj.plateauElevation);
  return adj.plateauLeverage * Math.min(1, Math.max(0, rise)) * gentleness;
}

/**
 * The spec's interval-selection entry point: one pure call from
 * {unit, mode, zoom, terrainStats} to the display-unit contour interval the
 * map should carry — the caller never judges terrain itself. The pipeline:
 * the mode's range table gives the band for this zoom, the DEM statistics
 * give the log bias, their product is the target, and the unit system's
 * candidate ladder supplies the nearest legal value (log distance). No
 * hysteresis here — that is an application concern (buildContourThresholds
 * in providers/contours.js threads the currently applied table through the
 * snap); this function answers "what does the terrain ask for" exactly.
 *
 * @param {Object} input
 * @param {'metric'|'imperial'} input.unit  the unit system
 * @param {'2d'|'3d'} input.mode  the view mode — picks the range table
 * @param {number} input.zoom  the map zoom
 * @param {null | Object} [input.terrainStats]  viewport statistics (see
 *   computeTerrainStats); null/missing → the neutral ladder
 * @returns {number} the display-unit interval, an element of the unit
 *   system's candidate ladder
 */
export function selectContourInterval({ unit, mode, zoom, terrainStats = null }) {
  const [lo, hi] = contourBaseRange(unit, mode, zoom);
  const target = Math.sqrt(lo * hi) * Math.exp(terrainLogBias(terrainStats));
  return snapContourInterval(target, unit);
}

/* Web Mercator tile math (tile coordinates are fractional; x grows east,
 * y grows south — standard slippy-map tiling). */
function lngToTileX(lng, z) {
  return ((lng + 180) / 360) * (1 << z);
}

function latToTileY(lat, z) {
  const s = Math.sin((Math.min(85.0511, Math.max(-85.0511, lat)) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * (1 << z);
}

/**
 * Plans the DEM tile set for one viewport: the finest sampling zoom (from
 * the provider's native zoom down to the overview floor) whose tile set
 * covers the bounds within `maxTiles`, falling back to an even stride of
 * the floor-zoom tiles for outsized windows. Pure — exported for tests.
 *
 * @param {{ west: number, south: number, east: number, north: number }} view
 * @param {number} demMaxZoom  the provider's native DEM zoom (Mapterhorn: 12)
 * @returns {null | { zoom: number, tiles: {z: number, x: number, y: number}[] }}
 *   null when the bounds cross the antimeridian (unmapped here by design —
 *   the caller keeps the current bias)
 */
export function planViewportTiles(view, demMaxZoom) {
  if (!(view.east > view.west) || !(view.north > view.south)) return null;
  const cfg = TERRAIN_CONTOUR_CONFIG;
  const top = Math.max(cfg.overviewZoomFloor, Math.min(demMaxZoom, 20));
  const collect = (z) => {
    const max = 1 << z;
    const x0 = Math.max(0, Math.min(max - 1, Math.floor(lngToTileX(view.west, z))));
    const x1 = Math.max(0, Math.min(max - 1, Math.floor(lngToTileX(view.east, z))));
    const y0 = Math.max(0, Math.min(max - 1, Math.floor(latToTileY(view.north, z))));
    const y1 = Math.max(0, Math.min(max - 1, Math.floor(latToTileY(view.south, z))));
    return { x0, x1, y0, y1 };
  };
  for (let z = top; z >= cfg.overviewZoomFloor; z--) {
    const { x0, x1, y0, y1 } = collect(z);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= cfg.sampling.maxTiles) {
      const tiles = [];
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) tiles.push({ z, x, y });
      }
      return { zoom: z, tiles };
    }
  }
  // Outsized window at the floor zoom: stride an even subset (≤ ~√maxTiles
  // per axis) — an under-sampled but unbiased sketch is exactly what an
  // overview deserves (and the bias floor usually zeroes this regime out).
  const z = cfg.overviewZoomFloor;
  const { x0, x1, y0, y1 } = collect(z);
  const axisCap = Math.ceil(Math.sqrt(cfg.sampling.maxTiles));
  const stepX = Math.max(1, Math.ceil((x1 - x0 + 1) / axisCap));
  const stepY = Math.max(1, Math.ceil((y1 - y0 + 1) / axisCap));
  const tiles = [];
  for (let x = x0; x <= x1; x += stepX) {
    for (let y = y0; y <= y1; y += stepY) tiles.push({ z, x, y });
  }
  return { zoom: z, tiles };
}

/**
 * Samples the DEM under the map's CURRENT viewport and returns the terrain
 * statistics terrainLogBias reads, or null when there is nothing to act on
 * (overview zoom, crossed bounds, too few tiles decoded). Tiles come from
 * the DemSource's shared cache — terrain, hillshade and the contour
 * generator warm it already, so a pass costs little beyond the first visit
 * to an area. Only tiles overlapping the viewport contribute: each tile's
 * pixel rect is clipped to the bounds, so stats describe exactly what the
 * user sees, not the tile squares. elevationStdDev rides along as a
 * stability companion to the range (the selection itself reads
 * reliefPerKm — the range normalized by the viewport's ground width).
 *
 * @param {Object} map  a MapLibre map instance (getBounds/getZoom)
 * @returns {Promise<null | {
 *   meanElevation: number, minElevation: number, maxElevation: number,
 *   elevationRange: number, elevationStdDev: number, reliefPerKm: number,
 *   zoom: number, samplingZoom: number, sampledTiles: number,
 *   plannedTiles: number, centerLng: number, centerLat: number,
 *   computedAt: number,
 * }>} null when stats are unavailable or untrustworthy for this view
 */
export async function computeTerrainStats(map) {
  const zoom = map.getZoom();
  if (!Number.isFinite(zoom) || zoom < TERRAIN_CONTOUR_CONFIG.overviewZoomFloor) return null;
  const bounds = map.getBounds();
  const view = {
    west: bounds.getWest(), south: bounds.getSouth(),
    east: bounds.getEast(), north: bounds.getNorth(),
  };
  const plan = planViewportTiles(view, getTerrainProvider().maxZoom);
  if (!plan || !plan.tiles.length) return null;
  const demSource = await getDemSource();
  const settled = await Promise.all(plan.tiles.map(async (tile) => {
    try {
      return { tile, dem: await demSource.getDemTile(tile.z, tile.x, tile.y) };
    } catch {
      return null; // offline tile / provider hiccup — counted against the ratio
    }
  }));

  const n = 1 << plan.zoom;
  const tileDeg = 360 / n;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  let sampledTiles = 0;
  for (const entry of settled) {
    if (!entry || !entry.dem || !entry.dem.data) continue;
    const { tile, dem } = entry;
    const width = dem.width;
    const height = dem.height;
    const data = dem.data;
    const lon0 = tile.x * tileDeg - 180;
    const px0 = Math.max(0, Math.min(width - 1, Math.floor(((view.west - lon0) / tileDeg) * width)));
    const px1 = Math.max(0, Math.min(width - 1, Math.ceil(((view.east - lon0) / tileDeg) * width) - 1));
    const py0 = Math.max(0, Math.min(height - 1, Math.floor((latToTileY(view.north, plan.zoom) - tile.y) * height)));
    const py1 = Math.max(0, Math.min(height - 1, Math.ceil((latToTileY(view.south, plan.zoom) - tile.y) * height) - 1));
    if (px1 < px0 || py1 < py0) continue;
    // Cap the per-tile scan near ~256×256 samples: stats need coverage, not
    // every pixel (min/max on a step grid is within DEM noise).
    const step = Math.max(1, Math.ceil(Math.max(px1 - px0 + 1, py1 - py0 + 1) / 256));
    let tileCount = 0;
    for (let py = py0; py <= py1; py += step) {
      const row = py * width;
      for (let px = px0; px <= px1; px += step) {
        const v = data[row + px];
        if (!Number.isFinite(v) || v < MIN_VALID_M || v > MAX_VALID_M) continue;
        tileCount++;
        count++;
        sum += v;
        sumSq += v * v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (tileCount > 0) sampledTiles++;
  }
  if (sampledTiles / plan.tiles.length < TERRAIN_CONTOUR_CONFIG.sampling.minValidRatio) return null;
  if (!count) return null;

  const extentKm = ((view.east - view.west) * 111.32 * Math.cos((((view.north + view.south) / 2) * Math.PI) / 180));
  if (!(extentKm > 0)) return null;
  const meanElevation = sum / count;
  const maxElevation = max;
  const minElevation = min;
  const variance = Math.max(0, sumSq / count - meanElevation * meanElevation);
  return {
    meanElevation,
    minElevation,
    maxElevation,
    elevationRange: maxElevation - minElevation,
    elevationStdDev: Math.sqrt(variance),
    reliefPerKm: (maxElevation - minElevation) / extentKm,
    zoom,
    samplingZoom: plan.zoom,
    sampledTiles,
    plannedTiles: plan.tiles.length,
    centerLng: (view.east + view.west) / 2,
    centerLat: (view.north + view.south) / 2,
    computedAt: Date.now(),
  };
}
