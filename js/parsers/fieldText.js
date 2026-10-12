/**
 * Shared field-text decoding for the XML parsers (gpx / tcx / kml): element
 * text → primitive value, with the encoding edge cases handled in one place.
 *
 * Number('') is 0, so an empty element (<ele/>) must become null and not a
 * fabricated 0 reading — the empty guard in numberOrNull is load-bearing.
 * (FIT is the one parser not served here: the vendor decoder hands over Date
 * instances and numbers, not XML text.)
 */

/**
 * @param {string|null|undefined} text  raw textContent of a field element
 * @returns {number|null} finite number, null when absent/blank/non-finite
 */
export function numberOrNull(text) {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * @param {string|null|undefined} text  ISO 8601 / RFC 3339 timestamp text
 * @returns {number|null} unix ms, null when absent/unparsable
 */
export function timeOrNull(text) {
  if (text == null) return null;
  const t = Date.parse(text.trim());
  return Number.isFinite(t) ? t : null;
}
