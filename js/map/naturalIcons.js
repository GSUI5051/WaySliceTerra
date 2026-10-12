/**
 * Map images for the hybrid overlay's natural landmarks:
 * eight glyphs, drawn onto
 * canvases and registered through map.addImage so the natural symbol layers
 * reference them as plain sprite images — no per-feature DOM, no sprite
 * pipeline, no new dependency (Path2D + canvas 2D only).
 *
 * Glyph look (spec section 十 + the 2026-10-04 alignment pass): peak is the
 * FILLED Lucide `triangle` — white; the volcano is the same triangle
 * family's TRUNCATED variant (the flat top reads as the crater) with three
 * eruption marks above it, filled in the heart-rate curve's red
 * (--series-hr, #ef4444 in both themes by spec); the waterfall is the OSM
 * wiki's Waterfall-14 glyph (wiki.openstreetmap.org, the user-requested
 * reference, 2026-10-09) rescaled from its 14-unit grid into this 24-unit
 * box, content-centered — the family's one non-Lucide shape. Shape carries
 * the distinction and color only reinforces it, so they stay tellable apart
 * in grayscale, in color-vision deficiency and at the small entry sizes.
 * The other five classes stay stroke drawings in the project's Lucide
 * dialect (24×24 grid, round strokes), every class distinguishable by
 * shape, nothing loud. Contrast over imagery keeps the overlay's read: a
 * dark rim under the glyph, the white-road/dark-casing pair — 2-unit white
 * strokes over a 2.9-unit dark pad (the 1:1.45 recipe).
 */

/** CSS pixels a glyph occupies on the map at icon-size 1 — the 24-unit
 * drawing grid maps 1:1 onto these, so the trio's icon-size fractions
 * (0.5–0.7) land the landmarks at 12–16.8 px on screen. */
export const NATURAL_ICON_SIZE = 24;
/** Device pixels per CSS pixel the canvases are drawn at. */
export const NATURAL_ICON_RATIO = 2;

/** The current theme's value of one CSS token (the mapView.themeColor read). */
function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Lucide's `triangle` — the filled summit mark peak (and, truncated, the
 * volcano's family) draws from. */
const TRIANGLE = ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z'];

/**
 * Path data per natural class, 24×24 user units. `kind: 'fill'` glyphs are
 * solid (rim stroke + fill over `paths`; optional `marks` are stroke-drawn
 * details painted after the fill); `kind: 'stroke'` glyphs are the two-pass
 * stroke drawings. A `colorToken` makes the glyph follow that CSS token at
 * raster time (currently the heart-rate CURVE color, which is fixed across
 * themes — a per-theme token would make registerNaturalIcons re-rasterize
 * on theme flips). All classes the overlay recognizes must have an entry —
 * the natural layer defs' icon-image matches key off these names.
 */
export const NATURAL_ICON_DEFS = {
  // The summit — the filled Lucide triangle, white over any imagery.
  peak: { kind: 'fill', paths: TRIANGLE },
  // The volcano — the triangle family's truncated variant: the flat top IS
  // the crater, the three marks above it the eruption. Same heart-rate
  // curve's red as before, but the SHAPE alone now separates it from peak.
  volcano: {
    kind: 'fill',
    paths: ['M8.5 5 3 20h18L15.5 5z'],
    marks: ['M12 2.2v2', 'M8.3 3.2l-1.4-1.4', 'M15.7 3.2l1.4-1.4'],
    colorToken: '--series-hr',
  },
  // Two summits with a col between — the pass a trail crests.
  saddle: { kind: 'stroke', paths: ['M4 18 9 9l3 4.5L15 9l5 9z'] },
  // A cave mouth: a low half-circle arch seated on the ground + the floor
  // line (radius 7.5: the arch still reads at the minimum entry size).
  cave: { kind: 'stroke', paths: ['M4.5 20a7.5 7.5 0 0 1 15 0', 'M2.5 20h19'] },
  // Lucide "droplet" — the water source.
  spring: { kind: 'stroke', paths: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'] },
  // The waterfall — the OSM wiki's Waterfall-14 glyph (wiki.openstreetmap.org
  // w/images/7/72/Waterfall-14.svg, the user-requested reference): falling
  // streams over a wavy pool line, rescaled ×19/14 from its 14-unit grid and
  // content-centered on this box (2026-10-09). Filled like the summit family.
  waterfall: { kind: 'fill', paths: ['m 3.179 16.071 c 0.87 0 2.482 1.357 3.257 1.357 0.726 0 2.436 -1.357 3.257 -1.357 s 2.532 1.357 3.257 1.357 c 0.871 0 2.477 -1.357 3.256 -1.357 0.87 -0.039 2.581 1.357 3.257 1.357 v 2.714 c -0.82 0 -2.484 -1.357 -3.257 -1.357 -0.772 0 -2.436 1.357 -3.256 1.357 -0.779 0 -2.436 -1.357 -3.257 -1.357 -0.827 0 -2.482 1.357 -3.257 1.357 -0.869 0 -2.435 -1.357 -3.257 -1.357 z m 0 -10.857 c 1.485 0 2.716 0.407 2.716 2.375 l -0.001 3.393 c 0 2.714 2.036 4.071 3.393 4.071 0 0 -0.679 -1.357 -0.679 -4.071 v -3.393 c 0 -1.242 -0.881 -1.775 -1.358 -2.375 1.485 0 2.716 0.407 2.716 2.375 v 3.393 c 0 2.714 2.036 4.071 3.393 4.071 0 0 -0.679 -1.357 -0.679 -4.071 l 0.136 -3.393 c 0.05 -1.241 -1.016 -1.775 -1.493 -2.375 1.483 0 2.714 0.407 2.714 2.375 v 3.393 c 0 2.714 2.036 4.071 3.393 4.071 0 0 -0.679 -1.357 -0.679 -4.071 v -3.393 c 0 -4.071 -4.071 -5.089 -5.429 -5.089 h -9.5 l 0.001 2.714 z'] },
  // Faceted boulder + a through ridge line anchored at both ends.
  rock: { kind: 'stroke', paths: ['M7.5 4.5 15 3l5 7.5-2.5 9-9.5 1L3 12z', 'M7.5 4.5 10 12l7.5 7'] },
  // Irregular small pebble + an inner highlight arc — the smallest,
  // quietest volume of the family.
  stone: { kind: 'stroke', paths: ['M9 8a3.5 3.5 0 0 1 6 0l1.7 4.6A4.8 4.8 0 0 1 12 18a4.8 4.8 0 0 1-4.7-6.8z', 'M9.3 13.5a2.8 2.8 0 0 0 1.8 3.9'] },
};

/** The sprite image name for one natural class (`hybrid-nat-` prefix — every
 * custom image on the style belongs to this overlay). */
export function naturalIconName(naturalClass) {
  return `hybrid-nat-${naturalClass}`;
}

/**
 * The fill color one def renders in under the CURRENT theme: white by
 * default, the profile's per-theme heart-rate red for the volcano.
 * @param {Object} def  one NATURAL_ICON_DEFS entry
 */
export function iconFillColor(def) {
  return def.colorToken ? themeColor(def.colorToken) : '#ffffff';
}

/* The two-pass stroke recipe (alignment pass): the dark rim reads over any
 * imagery, the white stroke carries the glyph — 2.9 units under, 2 units
 * over (1:1.45). */
const RIM_UNITS = 2.9;
const RIM_COLOR = 'rgba(24, 26, 28, 0.9)';
const STROKE_UNITS = 2;
const STROKE_COLOR = 'rgba(255, 255, 255, 0.95)';

/**
 * Draws one glyph def onto a 2D context scaled so the 24-unit grid fills
 * `px` device pixels. Shared by the sprite rasterizer and the acceptance
 * tools' blow-up rasterizer so both speak the exact same recipe.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} def  one NATURAL_ICON_DEFS entry
 * @param {number} px  device-pixel edge length of the drawing
 */
function drawIcon(ctx, def, px) {
  ctx.scale(px / 24, px / 24);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const bodies = def.paths.map((d) => new Path2D(d));
  const marks = (def.marks ?? []).map((d) => new Path2D(d));
  // The dark rim under the glyph — under EVERY path (bodies and stroke
  // details alike), so the details hold on imagery the same way the
  // bodies do.
  ctx.lineWidth = RIM_UNITS;
  ctx.strokeStyle = RIM_COLOR;
  for (const shape of [...bodies, ...marks]) ctx.stroke(shape);
  if (def.kind === 'fill') {
    ctx.fillStyle = iconFillColor(def);
    for (const shape of bodies) ctx.fill(shape);
    ctx.lineWidth = STROKE_UNITS;
    ctx.strokeStyle = STROKE_COLOR;
    for (const shape of marks) ctx.stroke(shape);
  } else {
    ctx.lineWidth = STROKE_UNITS;
    ctx.strokeStyle = STROKE_COLOR;
    for (const shape of bodies) ctx.stroke(shape);
  }
}

/**
 * Renders one glyph def into the {width, height, data} image object
 * map.addImage accepts (RGBA, premultiplied — canvas output already is).
 * Browser-only: the unit suites exercise the registry, not canvas.
 * @param {Object} def  one NATURAL_ICON_DEFS entry
 */
function renderIcon(def) {
  const px = NATURAL_ICON_SIZE * NATURAL_ICON_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  drawIcon(ctx, def, px);
  const image = ctx.getImageData(0, 0, px, px);
  return { width: px, height: px, data: image.data };
}

/**
 * Blow-up raster of one glyph at an arbitrary pixel size — the acceptance
 * tools render their icon strips and grayscale strips through this, so the
 * judged pixels come from the same recipe the map shows. Browser-only.
 * @param {string} type  one NATURAL_ICON_DEFS key
 * @param {number} [px]  device-pixel edge length (default 96)
 * @returns {{width: number, height: number, data: Uint8ClampedArray}|null}
 */
export function rasterizeNaturalIcon(type, px = 96) {
  const def = NATURAL_ICON_DEFS[type];
  if (!def) return null;
  const size = Math.max(1, Math.round(px));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawIcon(ctx, def, size);
  return { width: size, height: size, data: ctx.getImageData(0, 0, size, size).data };
}

/** Per-map raster color of each registered image — the theme-flip detector:
 * a theme-dependent glyph (the volcano red) re-rasterizes only when its
 * color actually changed, so the frequent apply() passes stay no-ops. */
const registeredFills = new WeakMap();

/**
 * Registers all seven glyph images on the style. Idempotent per theme, and
 * theme-flip-safe: when a theme-dependent glyph's color changed, its image
 * is removed and re-added under the same name (callers follow with
 * triggerRepaint). A setStyle wipes images along with layers; the overlay's
 * next apply() re-registers everything fresh.
 */
export function registerNaturalIcons(map) {
  let fills = registeredFills.get(map);
  if (!fills) {
    fills = {};
    registeredFills.set(map, fills);
  }
  for (const [naturalClass, def] of Object.entries(NATURAL_ICON_DEFS)) {
    const name = naturalIconName(naturalClass);
    const fill = iconFillColor(def);
    if (map.hasImage(name)) {
      if (fills[name] === fill) continue;
      map.removeImage(name);
    }
    map.addImage(name, renderIcon(def), { pixelRatio: NATURAL_ICON_RATIO });
    fills[name] = fill;
  }
}
