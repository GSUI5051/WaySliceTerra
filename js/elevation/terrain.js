/**
 * DEM track sampling math — coordinate mapping, tile planning and bilinear
 * interpolation over decoded DEM tiles. Pure functions only: no DOM, no
 * fetch, no shared state, so every rule here is directly unit-testable with
 * synthetic tiles.
 *
 * The tiles come from the app's single DEM pipeline (js/map/demSource.js —
 * the maplibre-contour DemSource that also serves 3D terrain, hillshade and
 * the contour generator from one shared cache). That layer hands out decoded
 * tiles: a `{width, height, data}` record whose `data` is a row-major
 * Float32Array of meters, one value per pixel. This module adds what that
 * layer does not provide: which tiles a track's points need (including the
 * bilinear neighbours), where each point sits inside them, and how to read a
 * continuous elevation out of the pixel grid.
 *
 * Sampling follows the pixel-center convention: pixel k of a tile sits at
 * continuous tile coordinate k, so a point at pixel fraction fx interpolates
 * between floor(fx) and floor(fx)+1. Windows that cross a tile's last
 * column/row read the adjacent tile's first column/row (they are part of the
 * fetch set) instead of wrapping around to the tile's own first pixels,
 * keeping samples continuous across tile seams. A missing adjacent tile
 * (ocean 404, world edge) degrades to an edge-clamped interpolation — never
 * a wrap, never a fabricated zero.
 */
import { getTerrainProvider } from '../map/providers/terrain.js';

/**
 * The DEM geometry the track-sampling path reads: the active terrain
 * provider's native zoom and tile pixel size (Mapterhorn: z12, 512 px).
 * Resolved per call, so a future provider switch carries this feature along.
 * @returns {{zoom:number, tileSize:number}}
 */
export function trackDemSource() {
  const provider = getTerrainProvider();
  return { zoom: provider.maxZoom, tileSize: provider.tileSize };
}

/** Web Mercator latitude limit — the tile grid's documented bound
 *  (±85.0511287). Points beyond it have no tile. */
const MAX_ABS_LAT = 85.0511287;

/** Plausible-elevation window, aligned with maplibre-contour's own
 *  defaultIsValid: Terrarium nodata decodes far outside it (−32768), so
 *  anything outside the window is an invalid pixel (no sample), never a
 *  value. */
export const ELEVATION_MIN_M = -12000;
export const ELEVATION_MAX_M = 9000;

/**
 * WGS84 lon/lat → continuous Web Mercator tile coordinates at `zoom`.
 * Longitude wraps around the antimeridian; latitude outside the Web
 * Mercator bound, or non-finite input, yields null (the caller reports the
 * point as unsampleable — it is never coerced to a valid coordinate).
 * @param {number} lon  degrees
 * @param {number} lat  degrees
 * @param {number} zoom
 * @returns {{x:number, y:number}|null}
 */
export function lonLatToTileFraction(lon, lat, zoom = trackDemSource().zoom) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > MAX_ABS_LAT) return null;
  const wrapped = (((lon + 180) % 360) + 360) % 360 - 180;
  const n = 2 ** zoom;
  const x = (n * (wrapped + 180)) / 360;
  const latRad = (lat * Math.PI) / 180;
  const y = (n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/** Tile cache/storage key for a tile at the source's zoom. */
export function tileKey(x, y, zoom = trackDemSource().zoom) {
  return `${zoom}/${x}/${y}`;
}

/**
 * @typedef {Object} DemSample
 * @property {number} tx  Integer tile x at the source zoom.
 * @property {number} ty  Integer tile y.
 * @property {number} fx  Continuous pixel x within the tile, [0, tileSize).
 * @property {number} fy  Continuous pixel y within the tile.
 */

/**
 * Maps track points onto tiles: one DemSample per valid point plus the
 * de-duplicated tile list the batch must fetch. The list contains the tiles
 * the points fall on AND the eastern/southern/diagonal neighbours their
 * bilinear windows reach into (a point on the last pixel column also needs
 * column 0 of the tile to the east — that neighbour is exactly what makes
 * interpolation seamless across seams). No tile outside the point set's
 * footprint is ever requested.
 * @param {{lat:number, lon:number}[]} points
 * @param {{zoom:number, tileSize:number}} [source]
 * @returns {{samples:(DemSample|null)[], tiles:{x:number,y:number}[]}}
 */
export function buildSamples(points, source = trackDemSource()) {
  const size = source.tileSize;
  const maxIndex = 2 ** source.zoom - 1;
  /** @type {Map<string, {x:number,y:number}>} */
  const tiles = new Map();
  const add = (x, y) => tiles.set(tileKey(x, y, source.zoom), { x, y });
  /** @type {(DemSample|null)[]} */
  const samples = new Array(points.length).fill(null);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const f = p && lonLatToTileFraction(p.lon, p.lat, source.zoom);
    if (!f) continue;
    const tx = Math.floor(f.x);
    const ty = Math.floor(f.y);
    if (tx < 0 || ty < 0 || tx > maxIndex || ty > maxIndex) continue;
    const fx = size * (f.x - tx);
    const fy = size * (f.y - ty);
    samples[i] = { tx, ty, fx, fy };
    add(tx, ty);
    const xOver = Math.floor(fx) + 1 >= size; // window reaches past the last column
    const yOver = Math.floor(fy) + 1 >= size;
    if (xOver && tx < maxIndex) add(tx + 1, ty);
    if (yOver && ty < maxIndex) add(tx, ty + 1);
    if (xOver && yOver && tx < maxIndex && ty < maxIndex) add(tx + 1, ty + 1);
  }
  return { samples, tiles: [...tiles.values()] };
}

/** True for a decoded elevation inside the plausible terrain window. */
export function isValidElevation(ele) {
  return Number.isFinite(ele) && ele >= ELEVATION_MIN_M && ele <= ELEVATION_MAX_M;
}

/**
 * One decoded DEM tile as the shared DemSource pipeline produces it: meters
 * in a row-major Float32Array. Tests build synthetics with the same shape.
 * @typedef {Object} DemTile
 * @property {Float32Array} data
 * @property {number} width
 * @property {number} height
 */

/** @private Elevation of one pixel of one tile, or null when invalid. */
function pixelElevation(tile, ix, iy) {
  const ele = tile.data[iy * tile.width + ix];
  return isValidElevation(ele) ? ele : null;
}

/**
 * Bilinear elevation for one sample from a fetched-tile store. The store
 * maps `tileKey(x, y)` → DemTile; absent entries are fetch failures.
 *
 * The four window pixels resolve independently, each falling back to the
 * adjacent tile when it lies past the tile's last column/row. Degradations,
 * in order: an invalid PRIMARY pixel (the tile is there but the pixel is
 * nodata) or a missing primary tile → null (honest failure — a missing
 * sample is never reported as 0); a missing neighbour tile/pixel → the
 * nearest available window pixel (edge clamp, no wrap-around).
 * @param {Map<string, DemTile|null>} tiles
 * @param {DemSample} sample
 * @param {{zoom:number, tileSize:number}} [source]
 * @returns {number|null} meters
 */
export function sampleElevation(tiles, sample, source = trackDemSource()) {
  const size = source.tileSize;
  const primary = tiles.get(tileKey(sample.tx, sample.ty, source.zoom));
  if (!primary) return null;
  const x0 = Math.floor(sample.fx);
  const y0 = Math.floor(sample.fy);
  const dx = sample.fx - x0;
  const dy = sample.fy - y0;
  const xOver = x0 + 1 >= size;
  const yOver = y0 + 1 >= size;

  const neighbour = (ox, oy) =>
    tiles.get(tileKey(sample.tx + ox, sample.ty + oy, source.zoom)) ?? null;

  const p00 = pixelElevation(primary, x0, y0);
  if (p00 == null) return null;
  const east = xOver ? neighbour(1, 0) : null;
  const south = yOver ? neighbour(0, 1) : null;
  const diag = xOver || yOver
    ? neighbour(xOver ? 1 : 0, yOver ? 1 : 0)
    : null;
  const p10 = xOver
    ? (east ? pixelElevation(east, 0, y0) : null)
    : pixelElevation(primary, x0 + 1, y0);
  const p01 = yOver
    ? (south ? pixelElevation(south, x0, 0) : null)
    : pixelElevation(primary, x0, y0 + 1);
  const p11 = !xOver && !yOver
    ? pixelElevation(primary, x0 + 1, y0 + 1)
    : (diag ? pixelElevation(diag, xOver ? 0 : x0 + 1, yOver ? 0 : y0 + 1) : null);

  // Edge clamp: a window pixel the data cannot provide collapses onto its
  // nearest available neighbour (p10/p01 onto p00, p11 onto the clamped
  // p10), so the bilinear weights always stay a partition of 1 and no
  // sample ever wraps around or invents a value.
  const c10 = p10 ?? p00;
  const c01 = p01 ?? p00;
  const c11 = p11 ?? c10;

  return (
    p00 * (1 - dx) * (1 - dy) +
    c10 * dx * (1 - dy) +
    c01 * (1 - dx) * dy +
    c11 * dx * dy
  );
}
