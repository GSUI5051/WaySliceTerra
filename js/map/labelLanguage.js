/**
 * The bilingual name-key chains shared by every hybrid overlay label builder
 * (road/place labels in hybrid.js, natural landmark labels in
 * hybrid-natural.js). Pulled out so both builders speak exactly one fallback
 * dialect — the localization rules live here and nowhere else.
 */

/** Name keys tried first per UI language (alignment spec section 七). Only
 * colon-form `name:xx` keys (the current schema) — `name_int` is the one
 * underscore field kept, the other legacy underscore keys are never used. */
export const LABEL_LANGUAGE_HEADERS = {
  en: ['name:en'],
  de: ['name:de'],
  es: ['name:es'],
  fr: ['name:fr'],
  it: ['name:it'],
  ja: ['name:ja'],
  ko: ['name:ko'],
  'zh-CN': ['name:zh-Hans', 'name:zh-CN', 'name:zh'],
  'zh-TW': ['name:zh-Hant', 'name:zh-TW', 'name:zh'],
};

/** Universal fallbacks tried after the language header; header keys already
 * present are skipped when the chain is built. */
export const LABEL_NAME_TAIL = ['name:en', 'name_int', 'name:latin', 'name'];

/**
 * The full name-key chain for one UI language: the language header followed
 * by the universal tail, deduped. Callers append their own final fallbacks
 * (roads: `ref`) and wrap the keys in `get` expressions.
 *
 * @param {string} code  UI language code
 * @returns {string[]} property keys, best first
 */
export function labelNameChain(code) {
  const header = LABEL_LANGUAGE_HEADERS[code] ?? LABEL_LANGUAGE_HEADERS.en;
  const chain = [...header];
  for (const key of LABEL_NAME_TAIL) {
    if (!chain.includes(key)) chain.push(key);
  }
  return chain;
}
