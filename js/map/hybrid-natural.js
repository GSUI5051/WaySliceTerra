/**
 * Natural landmarks on the hybrid road-network overlay (the peak/saddle/
 * volcano elevation + gating mechanism is the WaySlice project's
 * naturalOverlay.js, adopted verbatim):
 * eight natural point classes carried by the overlay (seven `natural=*` tags
 * plus the waterfall via its `waterway=waterfall` tag) — not a POI system
 * of their own. The split follows the spec's data rule (reuse the existing
 * pipeline; only add the minimal fetch logic a source cannot provide):
 *
 *   - `peak`, `saddle`, `volcano` are LIFTED OUT of the already-loaded
 *     planet tiles the roads draw from (the `mountain_peak` source layer,
 *     rank-rated, carrying ele/ele_ft and the full name:* set) — the
 *     WaySlice two-feed/one-display architecture. cliff/ridge (the line/area
 *     landforms that layer also carries) and duplicate tile-surface copies
 *     are dropped at the lift; each model carries its `rank`, which the
 *     gate table splits into the early "major" tier. The label (bilingual
 *     name + elevation, built through the shared unit formatter) is
 *     composed in JS into the feature's `label` property, so the style
 *     reads one plain property and language/unit switches rebuild instead
 *     of rewriting expressions.
 *   - `cave_entrance`, `spring`, `waterfall`, `rock`, `stone` are absent
 *     from the tile schema (verified against the live TileJSON/planet
 *     tiles), so a minimal viewport Overpass fetch feeds their GeoJSON
 *     source. One batched query per move-end when the view outgrows the
 *     cached box, silent failure — the overlay, the basemap and the track
 *     never notice. These five keep their own accepted layers (zoom-stepped
 *     bilingual text-fields). Waterfalls ride their OSM `waterway=waterfall`
 *     tag (the `natural=waterfall` alias is queried too — 2026-10-09, the
 *     user-requested eighth class).
 *
 * The trio's show/hide mechanism is WaySlice's, value for value: the
 * `gateClassFor` rank split (peak/volcano rank ≤ 2 lead as "-major" from
 * z8), the per-gate-class entry zooms, the class-curve icon/label sizes
 * (a 0 output hides before entry), and the sort-rank collision priority
 * where majors win and saddles lose. On top of it sit TWO Terra amendments
 * (user directive, 2026-10-04): once a landmark has been DRAWN it latches —
 * its placement moves ahead of every un-latched neighbor, so zooming IN
 * never hides it again — while zooming OUT still hides it through the size
 * curves normally; and above the tiles' maxzoom (overzoom) the feed only
 * ever ADDS to its model set — a starving or partial overzoomed lift can no
 * longer wipe it — so deep zooms keep every landmark the view has lifted,
 * and a lift at or below the maxzoom replaces the set authoritatively.
 */

import { getCurrentLanguage, t } from '../language/language.js';
import { getUnitSystem, METERS_PER_FOOT } from '../units/units.js';
import { formatElevation } from '../utils/format.js';
import { labelNameChain } from './labelLanguage.js';
import { naturalIconName } from './naturalIcons.js';

/** The GeoJSON source the Overpass viewport fetch feeds (the five small
 * classes, unchanged). */
export const HYBRID_NATURAL_SOURCE_ID = 'hybrid-natural-osm';

/** The GeoJSON source the tile lift feeds (peak/saddle/volcano, the WaySlice
 * two-feed/one-display split — this feed costs no network at all). */
export const HYBRID_NATURAL_TILE_SOURCE_ID = 'hybrid-natural-tiles';

/** Natural landmark layer ids in paint order — the tail of the overlay
 * stack, after the road/place labels, before the terrain module's layers.
 * The trio's one gate-table layer leads, the five small classes follow in
 * their own accepted layers. */
export const HYBRID_NATURAL_LAYERS = [
  'hybrid-natural-peaks',
  'hybrid-natural-cave',
  'hybrid-natural-minor',
];

/** The eight classes this feature set covers — no other `natural=*` value
 * ever reaches the layers (spec section 二; waterfalls join 2026-10-09 via
 * their `waterway=waterfall` tag). */
export const NATURAL_CLASSES = ['peak', 'saddle', 'volcano', 'cave_entrance', 'spring', 'waterfall', 'rock', 'stone'];

/** The classes the planet tiles provide (`mountain_peak` source-layer) —
 * the layer ALSO carries ridge/cliff, which the lift never lets through. */
export const NATURAL_TILE_CLASSES = ['peak', 'saddle', 'volcano'];

/** The planet TileJSON's maxzoom: above it the map overzooms the z14 tiles
 * and `querySourceFeatures` starves — the tile feed holds its last models
 * instead of wiping (the shown-stays-shown rule). */
export const NATURAL_TILE_MAX_ZOOM = 14;

/** The classes only the Overpass fetch can provide. */
export const NATURAL_OSM_CLASSES = ['cave_entrance', 'spring', 'waterfall', 'rock', 'stone'];

/** Per-class Overpass clauses where the bare `natural=*` statement doesn't
 * apply: waterfalls are tagged `waterway=waterfall` in OSM (the
 * `natural=waterfall` alias queried alongside it). */
const NATURAL_OSM_CLAUSES = {
  waterfall: 'node["waterway"="waterfall"];node["natural"="waterfall"];',
};

/** Per-layer zoom where the small classes' stepped text-fields open (the
 * trio's gates live in the gate table below, WaySlice-style). Both tiers'
 * names open at z14.5 — the per-class entry spreading happens in the size
 * curves below, not here. */
export const NATURAL_LAYER_NAME_ZOOMS = {
  'hybrid-natural-cave': 14.5,
  'hybrid-natural-minor': 14.5,
};

// 小类海拔与名字自文字门（z14.5）起同行同显（WaySlice 同显机制，2026-10-05 裁决）——无独立的每类海拔门。

/* ---- the WaySlice gate mechanism (peak/saddle/volcano) --------------------- */

/**
 * The importance tier from the tiles' rank (1 notable … 5 minor): the two
 * terrain-landmark classes surface their top ranks earlier — a simple
 * two-tier split, deliberately not a ranking system. Verbatim from
 * WaySlice's naturalOverlay.js.
 */
export function gateClassFor(type, rank = 5) {
  if ((type === 'peak' || type === 'volcano') && rank <= 2) return `${type}-major`;
  return type;
}

/** The gate classes the trio layer carries, in collision-priority order. */
const GATE_CLASSES = ['peak-major', 'peak', 'volcano-major', 'volcano', 'saddle'];

/**
 * Per-gate-class entry zooms: the icon first, the label a notch later —
 * never all seven from the world view. peak/volcano majors lead from z8;
 * saddle enters at z12. Values verbatim from WaySlice's gate table.
 */
export const NATURAL_GATES = {
  'peak-major': { icon: 8, text: 10 },
  'peak': { icon: 11, text: 13 },
  'volcano-major': { icon: 8, text: 10 },
  'volcano': { icon: 10, text: 12.5 },
  'saddle': { icon: 12, text: 14 },
};

/** Builds a per-class size curve: one zoom interpolate whose every stop is
 * a match over the gate-class property, 0 = hidden. WaySlice's
 * roadOverlay.js classCurve, verbatim. */
function classCurve(classes, stops, key = 'gateClass') {
  return [
    'interpolate', ['linear'], ['zoom'],
    ...stops.flatMap(([zoom, ...values]) => [
      zoom,
      ['match', ['get', key],
        ...classes.flatMap((cls, i) => [cls, values[i]]),
        0],
    ]),
  ];
}

/** Icon sizes (fractions of the 24-unit sprite box → 12–16.8 px on screen).
 * A 0 output hides the class before its entry zoom. Values verbatim from
 * WaySlice's icon curve (trio columns). */
export const NATURAL_ICON_SIZES = classCurve(GATE_CLASSES, [
  // zoom, peak-major, peak, volcano-major, volcano, saddle
  [8, 0.5, 0, 0.5, 0, 0],
  [10, 0.55, 0, 0.55, 0.5, 0],
  [11, 0.55, 0.5, 0.55, 0.55, 0],
  [12, 0.6, 0.55, 0.6, 0.55, 0.5],
  [13, 0.6, 0.55, 0.6, 0.6, 0.55],
  [13.5, 0.6, 0.6, 0.6, 0.6, 0.55],
  [14.5, 0.65, 0.6, 0.65, 0.6, 0.6],
  [15.5, 0.65, 0.65, 0.65, 0.65, 0.6],
  [17, 0.7, 0.65, 0.7, 0.65, 0.65],
  [19, 0.7, 0.7, 0.7, 0.7, 0.7],
]);

/** Label sizes — landmarks read a step below settlement names. The first
 * stop sits at the layer minzoom with every column closed: MapLibre clamps
 * below the first stop, so an 11-zoom first row would silently open the
 * majors' labels at z8 — icons lead, labels join two zooms later. Values
 * verbatim from WaySlice's text curve (trio columns). */
export const NATURAL_TEXT_SIZES = classCurve(GATE_CLASSES, [
  // zoom, peak-major, peak, volcano-major, volcano, saddle
  [8, 0, 0, 0, 0, 0],
  [10, 11.25, 0, 11.25, 0, 0],
  [11, 11.875, 0, 11.875, 0, 0],
  [12.5, 11.875, 0, 11.875, 11.25, 0],
  [13, 11.875, 11.25, 11.875, 11.25, 0],
  [14, 12.5, 11.875, 12.5, 11.875, 11.25],
  [14.5, 12.5, 11.875, 12.5, 12.5, 11.875],
  [15.5, 13.125, 12.5, 13.125, 12.5, 12.5],
  [16.5, 13.125, 13.125, 13.125, 13.125, 13.125],
  [19, 13.75, 13.75, 13.75, 13.75, 13.75],
]);

/* ---- the small classes' entry tiering (2026-10-04 alignment) --------------- */

/**
 * The five small classes no longer flood in together: spring and the
 * waterfall lead (icons z13.5 — the two water features share the tier),
 * rock a zoom later (z14.5), stone last (z15.5) — with the cave at the
 * spring's tier. Text never leads its icon (each text gate = icon gate
 * + 1) and elevation rides with the name from the text gate. These
 * tables feed one zoom curve per property via classCurve keyed on the OSM
 * `class` — a single interpolate/step per expression with per-stop match
 * outputs (nesting per-class zoom expressions inside a `case` would be
 * silently rejected at addLayer).
 *
 * The 0.5-zoom pre-stops pin the HARD zeros: a class is exactly 0 at and
 * before the zoom before its entry (stone must be fully invisible at z15 —
 * not ramping in, not joining collision) and then ramps to its size at the
 * entry zoom. CAUTION: the pre-stop sits a full 0.5 zoom before the gate —
 * denser zero/gate stop pairs (0.1 gaps measured) are mis-bracketed by the
 * interpolate's zoom-stop search with expression-valued outputs and silently
 * leak a small non-zero size at the pre-gate zoom.
 */
const MINOR_CLASSES = ['spring', 'waterfall', 'rock', 'stone'];

/** Icon entry table (fractions of the 24-unit box → 12–15.6 px on screen;
 * every size stays at or below the trio's same-zoom column). spring and
 * waterfall follow the cave's icon ramp (0.5 → 0.6@15.5 → 0.65@19; the
 * 14/14.5/15 rows are collinear interpolations of that segment) so the
 * water features grow through the mid zooms; rock/stone unchanged. */
const MINOR_ICON_ROWS = [
  // zoom, spring, waterfall, rock, stone
  [13.5, 0.5, 0.5, 0, 0],
  [14, 0.525, 0.525, 0, 0],
  [14.5, 0.55, 0.55, 0.5, 0],
  [15, 0.575, 0.575, 0.5, 0],
  [15.5, 0.6, 0.6, 0.5, 0.5],
  [19, 0.65, 0.65, 0.65, 0.6],
];

/** Label sizes: 0 before each class's text zoom, then the shared shape the
 * small classes always had (11.5 at the gate → 12.5 at z16 → 13.75 at z19). */
const MINOR_TEXT_ROWS = [
  // zoom, spring, waterfall, rock, stone
  [13.5, 0, 0, 0, 0],
  [14, 0, 0, 0, 0],
  [14.5, 11.5, 11.5, 0, 0],
  [15, 11.5, 11.5, 0, 0],
  [15.5, 11.5, 11.5, 11.5, 0],
  [16, 12.5, 12.5, 12.5, 0],
  [16.5, 12.5, 12.5, 12.5, 11.5],
  [19, 13.75, 13.75, 13.75, 13.75],
];

/** Fresh curve objects per defs build (the caller hands ownership to
 * MapLibre). Keyed on the OSM features' `class` property. */
function minorIconCurve() {
  return classCurve(MINOR_CLASSES, MINOR_ICON_ROWS, 'class');
}
function minorTextCurve() {
  return classCurve(MINOR_CLASSES, MINOR_TEXT_ROWS, 'class');
}

/** The cave's single-class curves — a plain zoom interpolate each (one
 * class, no match needed): icon 0.5 → 0.6 → 0.65, text gated one zoom
 * behind with the shared shape and the hard 0 at the layer minzoom. */
function caveIconCurve() {
  return ['interpolate', ['linear'], ['zoom'], 13.5, 0.5, 15.5, 0.6, 19, 0.65];
}
function caveTextCurve() {
  return ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.5, 11.5, 16, 12.5, 19, 13.75];
}

/** Collision priority: majors win, saddles lose. Latched landmarks (see the
 * shown-stays-shown rule in the tile feed) subtract LATCH_BOOST to place
 * ahead of everything un-latched — once shown, zooming in must not hide
 * them behind a later-placed neighbor. */
const SORT_RANK = Object.fromEntries(GATE_CLASSES.map((cls, i) => [cls, i + 1]));
const LATCH_BOOST = 20;

/* ---- elevation parsing (the WaySlice full mechanism) ------------------------ */

/** Verbatim from WaySlice: bare numbers are meters (the OSM convention),
 * explicit meters/feet units are honored, leading-dot decimals accepted,
 * everything else (empty, non-numeric, unsupported unit) is null. */
const ELEVATION_TAG_RE = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(m|meter|metre|meters|metres|ft|foot|feet|')?$/i;

/**
 * Parses a raw OSM `ele=*` value into meters.
 * @param {string|number|null} raw
 * @returns {number|null} canonical meters
 */
export function parseElevationTag(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = ELEVATION_TAG_RE.exec(s);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] || 'm').toLowerCase();
  if (unit === 'ft' || unit === 'foot' || unit === 'feet' || unit === "'") {
    return value * METERS_PER_FOOT;
  }
  return value;
}

/**
 * The feet-only aux sources (`ele:ft=*`, the tiles' numeric `ele_ft`) are
 * unitless numbers whose SEMANTICS are feet — a different parse from `ele`.
 * @param {string|number|null} raw
 * @returns {number|null} canonical meters
 */
export function parseFeetTag(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) return null;
  const value = Number(s);
  return Number.isFinite(value) ? value * METERS_PER_FOOT : null;
}

/**
 * Canonical elevationMeters for a feature's tags. `ele` wins whenever it
 * parses; `ele:ft`/`ele_ft` is the aux source used only in its absence —
 * the two are never averaged and never both shown. Null = unavailable,
 * which only means the label loses its elevation line. (Terra's canonical
 * entry point, WaySlice's exact behavior.)
 *
 * @param {Object} tags  raw OSM tags or tile feature properties
 * @returns {number|null} canonical meters
 */
export function parseElevationMeters(tags) {
  const primary = parseElevationTag(tags?.ele);
  if (primary != null) return primary;
  return parseFeetTag(tags?.['ele:ft'] ?? tags?.ele_ft);
}

/* ---- the tile lift (peak/saddle/volcano) ------------------------------------- */

/**
 * The stable identity of one landmark — the lift's dedup key AND the
 * shown-stays-shown latch key (rendered features carry the same class +
 * coordinates back).
 */
function peakKey(cls, lon, lat) {
  return `${cls}@${lon.toFixed(5)},${lat.toFixed(5)}`;
}

/** Above the tile maxzoom the overzoomed tile cache cannot be queried
 * reliably: measured on the live planet source, `querySourceFeatures`
 * answers with nothing in a steady state — and, mid-transition, with the
 * PARTIAL set of whatever ancestor tiles happen to still be renderable. A
 * replace there is how deep zoom-ins used to lose the very landmarks they
 * zoomed toward (a z12 → z15 jump shrank the source from 307 models to the
 * 71 a transient lift returned, wiping the summit at the view's center).
 * Above the maxzoom the lift therefore only ever ADDS: merge by the same
 * class + rounded-coordinate key the lift dedups on, kept models winning so
 * ranks and names stay stable. A lift at or below the maxzoom replaces the
 * set authoritatively again, which also bounds the accumulation to one
 * deep-zoom excursion. */
function mergeModels(kept, lifted) {
  if (!lifted.length) return kept;
  const out = new Map(kept.map((m) => [peakKey(m.type, m.lon, m.lat), m]));
  for (const m of lifted) {
    const key = peakKey(m.type, m.lon, m.lat);
    if (!out.has(key)) out.set(key, m);
  }
  return [...out.values()];
}

/**
 * Lifts the peak family out of the ALREADY-LOADED planet tiles — the same
 * source the road lines draw from, so this costs no network at all.
 * cliff/ridge (line/area landforms the tile layer also carries) and every
 * non-point geometry are excluded; dedup keys on class + rounded
 * coordinates, since overlapping tiles surface the same summit twice.
 * Verbatim from WaySlice's peaksFromTileFeatures.
 *
 * @param {Array<{properties?: Object, geometry?: Object}>} features
 */
export function peaksFromTileFeatures(features) {
  const out = new Map();
  for (const f of features) {
    const cls = f.properties?.class;
    if (!NATURAL_TILE_CLASSES.includes(cls)) continue;
    if (!f.geometry || f.geometry.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const key = peakKey(cls, lon, lat);
    if (out.has(key)) continue;
    out.set(key, { type: cls, lon, lat, tags: { ...f.properties }, rank: Number(f.properties.rank) || 5 });
  }
  return [...out.values()];
}

/**
 * The localized display name, using the SAME fallback chain the road,
 * place and small-class labels build their expressions from. Returns ''
 * for nameless features — the internal natural=* tag never becomes a name.
 * @param {Record<string, unknown>} tags
 * @param {string} code  UI language code
 */
export function localizedName(tags, code) {
  for (const key of labelNameChain(code)) {
    const value = tags?.[key];
    if (typeof value === 'string' && value) return value;
  }
  return '';
}

/**
 * Label text, Terra's accepted bilingual composition on WaySlice's
 * elevation line: the localized name, the LOCAL name as a second line only
 * when it differs (case-insensitive), the shared-formatter elevation last.
 * Any missing piece drops its line; both missing → '' (bare icon, and the
 * internal natural=* tag never becomes a name).
 *
 * @param {string} mainName  the UI-language name ('' when nameless)
 * @param {string} localName  the raw local `name` field
 * @param {number|null} meters  canonical elevation
 */
export function buildNaturalLabel(mainName, localName, meters) {
  const secondary = localName && mainName && localName.toLowerCase() !== mainName.toLowerCase()
    ? `\n${localName}`
    : '';
  if (mainName) {
    return meters != null ? `${mainName}${secondary}\n${formatElevation(meters)}` : `${mainName}${secondary}`;
  }
  if (meters != null) return formatElevation(meters);
  return '';
}

/** Model → render feature: the label is built HERE, with the current UI
 * language and unit system, so the style reads one plain property. A
 * LATCHED landmark places ahead of everything un-latched (the
 * shown-stays-shown rule: once drawn, zooming in must not bury it under a
 * later-placed neighbor); zooming out hides it through the size curves as
 * normal, which is also what re-arms its gate on the way back up. */
function toPeakFeature(model, latched) {
  const gate = gateClassFor(model.type, model.rank);
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [model.lon, model.lat] },
    properties: {
      naturalClass: model.type,
      gateClass: gate,
      sortRank: latched ? SORT_RANK[gate] - LATCH_BOOST : SORT_RANK[gate],
      label: buildNaturalLabel(
        localizedName(model.tags, getCurrentLanguage()),
        typeof model.tags.name === 'string' ? model.tags.name : '',
        parseElevationMeters(model.tags),
      ),
    },
  };
}

/** All lifted models → the display FeatureCollection. `latchedKeys` (the
 * keys of landmarks already shown to the user) promotes their placement —
 * pass null in tests/tests without latch state. */
export function buildPeakFeatureCollection(models, latchedKeys) {
  return {
    type: 'FeatureCollection',
    features: models.map((m) => toPeakFeature(m, latchedKeys?.has(peakKey(m.type, m.lon, m.lat)) ?? false)),
  };
}

/* ---- the small classes' stepped label text-fields (unchanged) ----------------- */

/** meters→feet, the exact units.js metersToFeet factor — the map-label
 * expression mirrors formatElevation (integer, no grouping separator). */
const METERS_TO_FEET = 1 / 0.3048;

/**
 * The elevation segment ("944 m" / "3097 ft") read from the canonical `ele`
 * property — '' whenever the property is not a number, so an unparseable or
 * missing elevation degrades to a name/icon label instead of poisoning the
 * whole expression. The unit SYSTEM is baked at build time (the contour
 * label pattern): units:changed rebuilds the text-field.
 */
function naturalElevationExpr(unit) {
  const value = ['get', 'ele'];
  const isNumber = ['==', ['typeof', value], 'number'];
  const rounded = ['round', unit === 'imperial' ? ['*', value, METERS_TO_FEET] : value];
  return ['case', isNumber,
    ['concat', ['to-string', rounded], ' ', unit === 'imperial' ? t('unitFt') : t('unitM')],
    ''];
}

/**
 * The small classes' text-field — the place-label bilingual read on a zoom
 * step: main name in the UI language plus the LOCAL name as a second line,
 * SAME SIZE, shown only when non-empty and different from the main name
 * (case-insensitive) — the exact mechanism hybridLabelTextField builds for
 * road/place labels. 海拔与名字自文字门起同显（同显机制，无独立海拔门）。
 *
 * @param {number} nameZoom  zoom where text starts for this layer
 * @param {string} [lang]  UI language for the name chain
 * @param {'metric'|'imperial'} [unit]  elevation display unit system
 */
export function naturalLabelTextField(nameZoom, lang = getCurrentLanguage(), unit = getUnitSystem()) {
  const sectionFont = { 'text-font': ['literal', ['Noto Sans Regular']] };
  const main = ['coalesce', ...labelNameChain(lang).map((key) => ['get', key]), ''];
  const local = ['coalesce', ['get', 'name'], ''];
  // The local name as a second line, only when present and not a repeat of
  // the main name — byte-for-byte the place labels' secondary gate (the
  // coalesce guards; the concat reads the raw field, as the original does).
  const secondary = ['case',
    ['all',
      ['!=', local, ''],
      ['!=', ['downcase', local], ['downcase', main]],
    ],
    ['concat', '\n', ['get', 'name']],
    '',
  ];
  const ele = naturalElevationExpr(unit);
  const hasMain = ['!=', main, ''];
  const hasEle = ['!=', ele, ''];
  // 同显：名字（无名则海拔独占）与海拔一行不分支地同时出现；
  // eleSection 的换行在无名时不缩进（concat 由 hasMain 门控）。
  const eleSection = ['case', ['all', hasMain, hasEle], ['concat', '\n', ele], ele];
  const full = ['format', main, {}, secondary, sectionFont, eleSection, sectionFont];
  return ['step', ['zoom'], '', nameZoom, full];
}

/* ---- layer defs ---------------------------------------------------------------- */

/** The small classes' tiers: which classes ride which layer, both entering
 * at the spring's z13.5 — the per-class spreading lives in the curves above
 * (spring/waterfall icons lead at the minzoom, rock a zoom later, stone
 * last). */
const NATURAL_TIERS = [
  { id: 'hybrid-natural-cave', classes: ['cave_entrance'], minzoom: 13.5 },
  { id: 'hybrid-natural-minor', classes: ['spring', 'waterfall', 'rock', 'stone'], minzoom: 13.5 },
];

/** class → icon sprite key (the icon registry's names). */
const ICON_KEYS = { cave_entrance: 'cave' };

/** Icon-image match for one tier's classes, fallback = the first class. */
function iconMatch(classes) {
  const match = ['match', ['get', 'class']];
  for (const cls of classes) match.push(cls, naturalIconName(ICON_KEYS[cls] ?? cls));
  match.push(naturalIconName(ICON_KEYS[classes[0]] ?? classes[0]));
  return match;
}

/** The label palette — the place-label read (white glyph, dark halo), since
 * these labels sit directly on imagery like the place names do. Same values
 * as WaySlice's ROAD_OVERLAY_LABEL_PAINT_PLACE. */
const NATURAL_LABEL_PAINT = {
  'text-color': '#ffffff',
  'text-halo-color': 'rgba(40, 40, 40, 0.9)',
  'text-halo-width': 1.2,
  'text-halo-blur': 0.3,
};

/** Ground anchor for terrain draping — the exact pair the overlay's labels
 * and the contour labels proved out (glyphs never sink into the slope).
 * Terra-3D necessity; WaySlice's 2D mechanism needs no anchor. */
const GROUND_ANCHOR = {
  'symbol-height-anchor': 'ground',
  'symbol-height-offset': 0.1,
};

/**
 * The three natural landmark layer defs, fresh objects per use (the caller
 * hands ownership to MapLibre). The trio renders through ONE gate-table
 * layer reading the lifted features' plain properties (label/gateClass/
 * sortRank) — language-independent, exactly WaySlice's single-layer shape,
 * plus Terra's ground anchor and upright-at-pitch for the 3D terrain. The
 * small classes keep their zoom-stepped bilingual text-fields.
 *
 * @param {string} [lang]  for the small classes' text-fields
 * @param {'metric'|'imperial'} [unit]
 */
export function naturalLayerDefs(lang = getCurrentLanguage(), unit = getUnitSystem()) {
  const trioDef = {
    // The peak family — lifted tile features, gated by the WaySlice table:
    // majors from z8, every class's column closes its own entry (the 0
    // size outputs), collision sorts majors first. The label is the plain
    // `label` property the rebuild composes — this def is language- and
    // unit-independent by design.
    id: 'hybrid-natural-peaks',
    type: 'symbol',
    source: HYBRID_NATURAL_TILE_SOURCE_ID,
    minzoom: 8,
    layout: {
      ...GROUND_ANCHOR,
      'icon-image': ['concat', 'hybrid-nat-', ['get', 'naturalClass']],
      'icon-size': NATURAL_ICON_SIZES,
      'icon-allow-overlap': false,
      'icon-padding': 2,
      'symbol-sort-key': ['get', 'sortRank'],
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-pitch-alignment': 'viewport',
      'text-rotation-alignment': 'viewport',
      'text-anchor': 'top',
      'text-offset': [0, 0.6],
      'text-max-width': 9,
      'text-optional': true,
      'text-allow-overlap': false,
      'text-padding': 2,
      'text-size': NATURAL_TEXT_SIZES,
    },
    paint: {
      'icon-opacity': 0.95,
      ...NATURAL_LABEL_PAINT,
    },
  };
  const smallDefs = NATURAL_TIERS.map((tier) => {
    const cave = tier.id === 'hybrid-natural-cave';
    return {
      id: tier.id,
      type: 'symbol',
      source: HYBRID_NATURAL_SOURCE_ID,
      minzoom: tier.minzoom,
      filter: ['match', ['get', 'class'], tier.classes, true, false],
      layout: {
        ...GROUND_ANCHOR,
        'icon-image': iconMatch(tier.classes),
        // 24-unit box → 12–15.6 px on screen; the 0 outputs carry the
        // per-class entry gates (spring z13.5, rock z14.5, stone z15.5).
        'icon-size': cave ? caveIconCurve() : minorIconCurve(),
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
        'text-field': naturalLabelTextField(NATURAL_LAYER_NAME_ZOOMS[tier.id], lang, unit),
        'text-font': ['Noto Sans Regular'],
        // Upright at pitch — the place-label convention over imagery.
        'text-rotation-alignment': 'viewport',
        'text-pitch-alignment': 'viewport',
        'text-anchor': 'top',
        'text-offset': [0, 1.05],
        'text-max-width': 8,
        'text-optional': true,
        'text-size': cave ? caveTextCurve() : minorTextCurve(),
      },
      paint: { 'icon-opacity': 0.95, ...NATURAL_LABEL_PAINT },
    };
  });
  return [trioDef, ...smallDefs];
}

/* ---- Overpass fetch (the five tile-less classes; the staggered hedged
   race since 2026-10-05 — the query shape, cap and endpoints are unchanged) ---- */

/** Endpoint chain in fallback order: private.coffee and the VK mail.ru
 * mirror are the CDN-friendly entry points, z/lz4 are the Overpass
 * project's own named instances, rambler is the classic worldwide mirror.
 * The canonical overpass-api.de interpreter is deliberately absent — its
 * per-client rate limits (429) make it the worst first hop. Overpass
 * instances differ in reachability per network — every failure (HTTP,
 * timeout, CORS) just falls through to the next host. */
const OVERPASS_ENDPOINTS = [
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.osm.rambler.ru/cgi/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/** Server-side element cap — stones and rocks come in swarms; the query
 * truncates instead of letting one busy viewport balloon the payload. */
export const OVERPASS_ELEMENT_CAP = 4000;

/** The one batched viewport query: nodes only, only the five classes the
 * tiles lack (the tile classes would double-draw), newest-last ordering.
 * The bounding box rides ONE global [bbox:...] setting that scopes every
 * statement in the union — the per-statement filters stay bare. */
export function overpassNaturalQuery(bbox) {
  const box = `[bbox:${bbox.s},${bbox.w},${bbox.n},${bbox.e}]`;
  const clauses = NATURAL_OSM_CLASSES
    .map((c) => NATURAL_OSM_CLAUSES[c] ?? `node["natural"="${c}"];`)
    .join('');
  return `[out:json][timeout:20]${box};(${clauses});out body ${OVERPASS_ELEMENT_CAP} qt;`;
}

/**
 * One Overpass element → one GeoJSON point feature, or null for anything
 * this feature set does not cover (non-nodes, foreign tag values).
 * Waterfalls come through their `waterway=waterfall` tag (the
 * `natural=waterfall` alias matches the same class).
 * `name`/`name:*` tags are copied verbatim so the label expression runs the
 * tile features' exact fallback chain; `ele` carries canonical meters and is
 * simply absent when nothing parseable exists. */
export function naturalFeatureFromOsm(element) {
  if (!element || element.type !== 'node') return null;
  const { lat, lon, tags } = element;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !tags) return null;
  let naturalClass = tags.natural;
  if (tags.waterway === 'waterfall') naturalClass = 'waterfall';
  if (!NATURAL_OSM_CLASSES.includes(naturalClass)) return null;
  const properties = { class: naturalClass };
  for (const [key, value] of Object.entries(tags)) {
    if (key === 'name' || key.startsWith('name:')) properties[key] = value;
  }
  const ele = parseElevationMeters(tags);
  if (ele !== null) properties.ele = ele;
  return {
    type: 'Feature',
    id: element.id,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties,
  };
}

function defaultFetch(url, init) {
  return fetch(url, init);
}

function padBounds(b, pad) {
  const latPad = (b.getNorth() - b.getSouth()) * pad;
  const lonPad = (b.getEast() - b.getWest()) * pad;
  return {
    s: Math.max(-85.051129, b.getSouth() - latPad),
    n: Math.min(85.051129, b.getNorth() + latPad),
    w: Math.max(-180, b.getWest() - lonPad),
    e: Math.min(180, b.getEast() + lonPad),
  };
}

function boundsContains(outer, inner) {
  const eps = 1e-9;
  return outer.s <= inner.s + eps && outer.n >= inner.n - eps
    && outer.w <= inner.w + eps && outer.e >= inner.e - eps;
}

/** The road source the trio lifts from — hybrid.js owns the constant, but
 * importing it here would be a cycle; the literal is pinned by tests. */
const ROADS_SOURCE_ID = 'hybrid-roads';
const ROADS_MOUNTAIN_LAYER = 'mountain_peak';

/**
 * The Overpass viewport fetcher + the trio's tile-lift feed. One fetch in
 * flight ever: a sync over a DIFFERENT box supersedes (and aborts) the old,
 * while a repeat sync over the SAME box dedups onto the live request instead
 * of killing it (the style re-hang / repeated-apply case). Results only land
 * while still eligible. The cache is ONE padded bbox WITH its features — the
 * fetcher refetches when the view outgrows it, otherwise rides move-ends
 * for free, and (the 2026-10-04 alignment) SURVIVES fresh hangs: invalidate()
 * keeps it, and a sync that finds the recreated source empty inside the
 * cached box replays the features fetch-free, so leaving and re-entering
 * satellite on the same ground costs no Overpass request at all.
 *
 * The tile feed is the WaySlice rebuild loop: debounced on move-end AND
 * idle (freshly loaded tiles may carry summits the first pass missed), it
 * re-lifts the peak family from the loaded tiles and setData's the trio
 * source — labels composed fresh, so language/unit switches funnel through
 * the same rebuild.
 *
 * `fetchImpl` is the test seam. All failures are silent: the five viewport
 * classes just don't appear, nothing else on the map changes.
 *
 * @param {Object} [deps]
 * @param {(url: string, init: object) => Promise<Response>} [deps.fetchImpl]
 * @param {number} [deps.minFetchZoom]  below this the small classes aren't
 *        visible yet (their layers open at z13.5) — no point querying
 * @param {number} [deps.bboxPad]  fetch margin around the view, fraction of span
 * @param {number} [deps.attemptTimeoutMs]  per-attempt abort ceiling — one
 *        hung mirror burns only its own slot, never the whole chain
 * @param {number} [deps.hedgeMs]  the stagger between the chain's starts
/** @param {number} [deps.rebuildDebounceMs]  the tile rebuild's debounce
 * @param {(map: Object) => string|null} [deps.getRoadsSourceId]  the vector
 *        source the trio lifts the peak family from. The default is the
 *        hybrid overlay's own planet source; on the OpenFreeMap basemaps the
 *        app injects the STYLE's own planet source id (same TileJSON — the
 *        lift costs no extra tile traffic there). Null/absent source = no
 *        lift, the trio just stays empty. */
export function createNaturalFeatures({
  fetchImpl = defaultFetch,
  minFetchZoom = 12,
  bboxPad = 0.35,
  // Staggered hedged race (2026-10-05): every attempt carries its OWN
  // ceiling, the chain staggers its starts (hedgeMs), a fast failure starts
  // the next mirror immediately, and the last winner stays first in line —
  // see fetchData.
  attemptTimeoutMs = 15000,
  hedgeMs = 3000,
  rebuildDebounceMs = 300,
  getRoadsSourceId = () => ROADS_SOURCE_ID,
} = {}) {
  let eligible = false;
  /** The ONE padded-bbox viewport cache, WITH the features it produced —
   * OSM moves glacially, so the cache survives toggle-offs, prunes and
   * fresh hangs (only a fetch that outgrows the box replaces it). */
  let cached = null;
  /** Whether the display source currently holds the cached data. A fresh
   * hang recreates the GeoJSON sources EMPTY while the view may sit inside
   * the cached box — sync() replays the cached features into the source
   * (fetch-free) instead of waiting for a move that would never come. */
  let displayed = false;
  let seq = 0;
  let inflight = null;
  /** The box the in-flight request was launched for — the same-box dedup
   * key. Assigned at launch, cleared with `inflight` in its finally. */
  let inflightBox = null;
  let rebuildTimer = null;
  /** The trio's last lifted models — carried across zooms above the tile
   * maxzoom, where the raw tile query starves (the overzoom wipe). */
  let liftedModels = [];
  /** Landmarks the user has already SEEN drawn: once shown, zooming in
   * never hides them (their placement outranks un-latched neighbors).
   * Zooming out hides through the size curves normally. */
  const latchedKeys = new Set();
  /** Per-driver attach guards — the fetch driver and the tile-lift driver
   * each arm their own listeners exactly once per map. */
  const fetchAttached = new WeakSet();
  const tileAttached = new WeakSet();

  const abortInflight = () => {
    if (inflight) {
      inflight.abort();
      inflight = null;
    }
  };

  /** The endpoint that won the last completed race, by ORIGINAL array index
   * — the next chain starts there (an endpoint that answered keeps
   * answering). Session-only: never persisted; an all-mirrors failure
   * leaves it untouched. */
  let stickyStart = 0;

  /**
   * The staggered hedged race over the endpoint chain (2026-10-05, per the
   * code-review P1). The chain starts at `stickyStart` and walks the array
   * in order (wrapping); position i maps to original index
   * `(stickyStart + i) % n`. Path 0 fires immediately; path i fires at its
   * stagger beat (i × hedgeMs after chain start) OR as soon as any running
   * attempt has rejected — the fast-fail cascade, which keeps quick
   * failures no worse than the old serial polling. EVERY attempt carries
   * its own AbortController + attemptTimeoutMs ceiling, so a hung mirror
   * can no longer burn the whole budget alone (the old code timed the
   * whole chain with one controller, and a dead first endpoint starved
   * mirrors 2-5 entirely). The first JSON response settles the chain: the
   * losers are aborted, the untriggered beats are cancelled, the winner's
   * original index becomes the next sticky start. All mirrors rejecting →
   * the chain rejects (the caller stays silent, per the sync() semantics).
   * A preemption abort (new viewport / setEligible(false)) aborts every
   * launched path, blocks further starts, and settles the chain at once.
   */
  async function fetchData(bbox, signal) {
    const body = `data=${encodeURIComponent(overpassNaturalQuery(bbox))}`;
    const n = OVERPASS_ENDPOINTS.length;
    const start = stickyStart;
    const launched = new Array(n).fill(null);  // per-attempt AbortControllers, position-ordered
    const timers = [];                         // stagger beats + per-attempt ceilings, all cleared at settle
    let settled = false;
    let failures = 0;
    let lastError = null;
    let resolveChain = null;
    let rejectChain = null;
    /** The chain's fate — resolved by the first winner, rejected by the
     * n-th failure or an outer abort. Managed by hand: the launched set
     * grows over time (stagger + cascade), so a one-shot Promise.any over
     * a snapshot would miss every later path. */
    const chain = new Promise((resolve, reject) => { resolveChain = resolve; rejectChain = reject; });

    const abortAll = () => { for (const c of launched) c?.abort(); };
    const onOuterAbort = () => {
      abortAll();
      if (!settled) {
        settled = true;
        rejectChain(new Error('overpass chain preempted'));
      }
    };
    signal.addEventListener('abort', onOuterAbort, { once: true });

    const tryLaunchNext = () => {
      const i = launched.findIndex((c) => c === null);
      if (i >= 0) launch(i);
    };

    const launch = (i) => {
      if (settled || signal.aborted) return;
      const controller = new AbortController();
      launched[i] = controller;
      const winnerIndex = (start + i) % n;
      timers.push(setTimeout(() => controller.abort(), attemptTimeoutMs));
      const attempt = (async () => {
        const res = await fetchImpl(OVERPASS_ENDPOINTS[winnerIndex], {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`overpass responded ${res.status}`);
        return await res.json();
      })();
      attempt.then(
        (data) => {
          if (settled) return;
          settled = true;
          stickyStart = winnerIndex;
          abortAll();
          resolveChain(data);
        },
        (error) => {
          lastError = error;
          failures++;
          tryLaunchNext(); // 失败级联：立即起跑下一路，不等错峰节拍
          if (failures >= n && !settled) {
            settled = true;
            rejectChain(lastError ?? new Error('no overpass endpoint reached'));
          }
        },
      );
    };

    launch(0);
    for (let i = 1; i < n; i++) {
      timers.push(setTimeout(() => tryLaunchNext(), i * hedgeMs));
    }

    try {
      return await chain;
    } finally {
      for (const timer of timers) clearTimeout(timer);
      signal.removeEventListener('abort', onOuterAbort);
    }
  }

  /** @private The WaySlice rebuild, plus Terra's shown-stays-shown rule:
   * re-lift the trio from the loaded tiles and setData. Above the tile
   * maxzoom the raw query starves or answers partially (see mergeModels) —
   * the lift only adds there, so zooming in never wipes the landmarks; a
   * lift at or below the maxzoom replaces the set authoritatively. Before
   * composing, everything the PREVIOUS pass actually drew latches (its
   * placement moves to the front of the collision queue); zooming out
   * re-hides through the size curves, which is also what re-arms the gate on
   * the way back up. */
  function rebuildTileFeed(map) {
    if (!eligible || !map?.getSource(HYBRID_NATURAL_TILE_SOURCE_ID)) return;
    const roadsId = getRoadsSourceId(map);
    const roads = roadsId ? map.getSource(roadsId) : null;
    const lifted = roads
      ? peaksFromTileFeatures(map.querySourceFeatures(roadsId, { sourceLayer: ROADS_MOUNTAIN_LAYER }))
      : [];
    const models = map.getZoom() > NATURAL_TILE_MAX_ZOOM
      ? mergeModels(liftedModels, lifted)
      : lifted;
    liftedModels = models;
    if (map.getLayer('hybrid-natural-peaks')) {
      // MapLibre queries ZERO-SIZE symbols too, so a feature sitting before
      // its icon gate (size-curve output 0) still answers here — the gate
      // check is what separates "actually SEEN" from "merely loaded";
      // without it the first pre-gate pass would latch the class it never
      // drew (code-review P3).
      const zoom = map.getZoom();
      for (const f of map.queryRenderedFeatures({ layers: ['hybrid-natural-peaks'] })) {
        const gate = NATURAL_GATES[f.properties?.gateClass];
        if (!gate || zoom < gate.icon) continue; // 门未开 = 尚未被看见
        const [lon, lat] = f.geometry?.coordinates ?? [];
        if (Number.isFinite(lon) && Number.isFinite(lat)) latchedKeys.add(peakKey(f.properties.naturalClass, lon, lat));
      }
    }
    map.getSource(HYBRID_NATURAL_TILE_SOURCE_ID).setData(buildPeakFeatureCollection(models, latchedKeys));
  }

  return {
    /** The overlay's enable/disable signal; disabling aborts any in-flight
     * fetch and stops the tile rebuilds but keeps fetched data (the
     * cheap-toggle rule keeps the hang). */
    setEligible(value) {
      eligible = value;
      if (!value) {
        abortInflight();
        if (rebuildTimer) {
          clearTimeout(rebuildTimer);
          rebuildTimer = null;
        }
      }
    },
    /** The trio's model set and latch reset (a fresh hang recreated the
     * sources empty), but the Overpass viewport cache STAYS — OSM data
     * moves glacially and refetching after every style round-trip would be
     * pure waste. `displayed` drops: sync() replays the cache into the new
     * source when the view is still inside the cached box. */
    invalidate() {
      liftedModels = [];
      latchedKeys.clear();
      displayed = false;
    },
    /** Moves the OVERPASS data to the view: attaches the move-end driver
     * once per map, then fetches only when eligible, deep enough, and
     * outside the cached box — with one exception: a view inside the cached
     * box whose display source is empty (a fresh hang) gets the cached
     * features REPLAYED fetch-free, so the data never waits for a move.
     * Idempotent. */
    sync(map) {
      if (!map) return;
      if (!fetchAttached.has(map)) {
        fetchAttached.add(map);
        map.on('moveend', () => this.sync(map));
      }
      if (!eligible || !map.getSource(HYBRID_NATURAL_SOURCE_ID)) return;
      if (map.getZoom() < minFetchZoom) return;
      const want = padBounds(map.getBounds(), bboxPad);
      if (cached && boundsContains(cached.box, want)) {
        if (!displayed) {
          displayed = true;
          map.getSource(HYBRID_NATURAL_SOURCE_ID)
            .setData({ type: 'FeatureCollection', features: cached.features });
        }
        return;
      }
      // Same-box dedup: padBounds is deterministic, so a repeat sync over
      // the same view produces byte-identical s/w/n/e — the in-flight
      // request is left alone instead of being aborted and re-sent (the
      // style re-hang / repeated apply that used to kill its own data).
      if (inflight && inflightBox
        && inflightBox.s === want.s && inflightBox.w === want.w
        && inflightBox.n === want.n && inflightBox.e === want.e) {
        return;
      }
      abortInflight();
      const controller = new AbortController();
      inflight = controller;
      inflightBox = want;
      const run = ++seq;
      (async () => {
        try {
          const json = await fetchData(want, controller.signal);
          if (run !== seq || !eligible) return;
          const features = (json?.elements ?? []).slice(0, OVERPASS_ELEMENT_CAP)
            .map(naturalFeatureFromOsm)
            .filter(Boolean);
          cached = { box: want, features };
          displayed = true;
          map.getSource(HYBRID_NATURAL_SOURCE_ID)?.setData({ type: 'FeatureCollection', features });
        } catch {
          // Silent by design (spec section 二十 #22): the five viewport
          // classes stay absent until the next move-end; nothing else on the
          // map — basemap, roads, track — is touched.
        } finally {
          if (inflight === controller) {
            inflight = null;
            inflightBox = null;
          }
        }
      })();
    },
    /** Arms the trio's tile-lift drivers (move-end + idle, once per map)
     * and schedules the first rebuild — the idle pass catches summits in
     * tiles that finish after the first move-end. */
    attachTileFeed(map) {
      if (!map || tileAttached.has(map)) return;
      tileAttached.add(map);
      const onCamera = () => {
        if (!eligible || rebuildTimer) return;
        rebuildTimer = setTimeout(() => {
          rebuildTimer = null;
          rebuildTileFeed(map);
        }, rebuildDebounceMs);
      };
      map.on('moveend', onCamera);
      map.on('idle', onCamera);
      onCamera();
    },
    /** Re-lifts the trio right now — the language and unit switches funnel
     * here, since the label strings carry both the name choice and the
     * elevation formatting. */
    rebuildTileFeed(map) {
      rebuildTileFeed(map);
    },
    /* Test seams. */
    isEligible: () => eligible,
    hasCache: () => cached != null,
  };
}
