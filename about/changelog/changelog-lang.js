/**
 * The changelog page's loader — decides WHICH language file to load and
 * renders it. Only two versions exist, one per file:
 * changelog-zh.js (simplified Chinese) and changelog-en.js (English). A
 * zh-CN OR zh-TW interface choice loads the Chinese file.
 *
 * The choice is read from the app's 'wayslice-language' localStorage key.
 * With NO saved choice (fresh/incognito browser) — or a stale code that is
 * no longer a catalog language — the page mirrors the app's initial
 * detection chain: any Chinese browser language loads the Chinese file,
 * anything else the English one.
 *
 * The page listens for storage events, so a language or theme switch in the
 * app (the story dialog stays open above the drawer) applies here live:
 * a switch loads the other language file on demand — until then it is never
 * fetched. Theme follows the same 'wayslice-theme' preference the app shell
 * boots with.
 */

/** Resolves the language-file kind for an app language code.
 * @param {string|null} saved  the 'wayslice-language' localStorage value
 * @param {readonly string[]} [candidates]  browser language tags
 *   (navigator.languages), consulted only when `saved` carries no usable
 *   choice — mirroring the app's pickInitialLanguage chain
 * @returns {'zh'|'en'} */
export function resolveChangelogPackFile(saved, candidates = []) {
  // An explicit, current choice always wins.
  if (saved === 'zh-CN' || saved === 'zh-TW') return 'zh';
  if (saved === 'en') return 'en';
  // No usable choice (fresh browser, incognito, stale code): follow the
  // browser's own languages — any Chinese variant counts as Chinese.
  for (const tag of candidates) {
    if (tag && tag.toLowerCase().startsWith('zh')) return 'zh';
  }
  return 'en';
}

/** Language file per kind, relative to this page. */
const PACK_FILES = {
  zh: './changelog-zh.js',
  en: './changelog-en.js',
};

/** @private Import promise cache — each language file loads at most once. */
const loadedPacks = new Map();

/** Loads a language file; a switch loads the other one on demand. The
 *  promise resolves to the pack OBJECT, not the module namespace.
 * @param {'zh'|'en'} kind
 * @returns {Promise<object>} */
function loadPack(kind) {
  if (!loadedPacks.has(kind)) {
    const exportName = kind === 'zh' ? 'CHANGELOG_ZH_CN' : 'CHANGELOG_EN';
    loadedPacks.set(kind, import(PACK_FILES[kind]).then((mod) => mod[exportName]));
  }
  return loadedPacks.get(kind);
}

/**
 * Renders one pack into the page anchors.
 * @param {{title: HTMLElement, tagline: HTMLElement, lede: HTMLElement,
 *   sections: HTMLElement}} els
 * @param {object} pack  the loaded changelog-zh.js / changelog-en.js pack object
 */
export function renderChangelog(els, pack) {
  els.title.textContent = pack.heading;
  els.tagline.textContent = pack.tagline;
  els.lede.textContent = pack.lede;
  els.sections.replaceChildren(
    ...pack.sections.map((section) => {
      const h = document.createElement('h2');
      h.textContent = section.h;
      const box = document.createElement('section');
      box.appendChild(h);
      for (const text of section.ps) {
        const p = document.createElement('p');
        p.textContent = text;
        box.appendChild(p);
      }
      return box;
    }),
  );
}

/** @private Re-applies the app's theme preference to this document. */
function applyTheme() {
  let pref = 'system';
  try { pref = localStorage.getItem('wayslice-theme') || 'system'; } catch { /* ignore */ }
  if (pref !== 'light' && pref !== 'dark') pref = 'system';
  const dark = pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.themePref = pref;
  root.style.colorScheme = dark ? 'dark' : 'light';
}

// ---- page bootstrap (the test suite imports this module for the pure parts)
const els = {
  title: document.getElementById('story-page-title'),
  tagline: document.getElementById('story-page-tagline'),
  lede: document.getElementById('story-page-lede'),
  sections: document.getElementById('story-sections'),
};

if (els.title && els.tagline && els.lede && els.sections) {
  // Inside the story dialog's iframe the sheet head already carries the
  // title, so the page's own header hides (css/story.css).
  if (window.self !== window.top) document.body.classList.add('story-embedded');

  // Out-of-order loads must not let a stale pack overwrite a newer choice:
  // only the newest render() call may touch the DOM.
  let renderSeq = 0;

  async function render() {
    const seq = ++renderSeq;
    let saved = null;
    try { saved = localStorage.getItem('wayslice-language'); } catch { /* ignore */ }
    const candidates = navigator.languages || [navigator.language || 'en'];
    const pack = await loadPack(resolveChangelogPackFile(saved, candidates));
    if (seq !== renderSeq) return;
    document.title = pack.title;
    document.documentElement.lang = pack.htmlLang;
    renderChangelog(els, pack);
  }

  render();
  applyTheme();

  // The app (the parent document of the iframe, or another tab) writes these
  // keys; storage events only fire in OTHER same-origin documents, which is
  // exactly this page.
  window.addEventListener('storage', (e) => {
    if (e.key === 'wayslice-theme' || e.key === null) applyTheme();
    if (e.key === 'wayslice-language' || e.key === null) render();
  });
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', applyTheme);
}
