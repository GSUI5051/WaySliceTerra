/**
 * The story dialog — the About section's popup opened from the settings
 * drawer. Desktop presents the
 * same window as the dual-variable analysis dialog; phones get an 80 vh
 * popup (the geometry lives in css/story.css).
 *
 * The content is a standalone page under /about hosted in an iframe, so each
 * page keeps its own two-version language pack and its own
 * theme boot — it follows language and theme changes through localStorage
 * storage events on its own. The src is re-set on every open, so the page
 * re-resolves both preferences at load time even without an open listener.
 * The drawer stays open underneath, like the heart-rate zone editor.
 *
 * The same window hosts all About entries: the author's story, the changelog
 * and the privacy statement — standalone pages built exactly like the story
 * page (each in its own /about directory with its own pack + loader),
 * swapped in via the open argument — identical geometry and chrome, other
 * iframe content.
 */
import { t } from '../language/language.js';
import { icon } from './icons.js';
import { on } from '../core/events.js';

/** The About pages this one window can host: the iframe src (site-absolute —
 *  the per-language entry pages live one directory down, so a relative path
 *  would resolve against e.g. /ja/ and miss) and the language key naming the
 *  entry — the same key the drawer row uses. */
const PAGES = {
  story: { src: '/about/story/story.html', key: 'storyQuotes' },
  changelog: { src: '/about/changelog/changelog.html', key: 'changelogPage' },
  privacy: { src: '/about/privacy/privacy.html', key: 'privacyPage' },
};

let dialog = null;
let frame = null;
let closeBtn = null;
let title = null;
let opener = null;

/** Wires the story dialog. @param {HTMLDialogElement} storyDialog */
export function initStoryDialog(storyDialog) {
  dialog = storyDialog;
  frame = dialog.querySelector('#story-frame');
  closeBtn = dialog.querySelector('#story-close');
  title = dialog.querySelector('#story-title');

  closeBtn.innerHTML = icon('x');
  closeBtn.setAttribute('aria-label', t('close'));
  closeBtn.addEventListener('click', () => dialog.close());
  // Clicks on the ::backdrop land on the dialog element itself — the same
  // close-on-backdrop behavior as the drawer and the analysis windows.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    opener?.setAttribute('aria-expanded', 'false');
    opener?.focus();
  });
  on('language:changed', () => {
    closeBtn.setAttribute('aria-label', t('close'));
    // The iframe hears the same change through its own storage listener;
    // nothing to do here beyond the aria-label.
  });
}

/**
 * Opens the story dialog over the still-open settings drawer. Call it
 * without arguments for the author's story; pass 'changelog' or 'privacy'
 * to host one of the About section's other pages in the same window —
 * identical geometry and chrome, other iframe content.
 */
export function openStoryDialog(page = 'story') {
  const target = PAGES[page] || PAGES.story;
  opener = document.activeElement;
  // Re-set the src on every open: the page re-resolves language and theme
  // from localStorage at load time.
  frame.src = target.src;
  // The sheet head and the iframe's accessible name carry the same
  // localized entry label. The h2 keeps its data-i18n attribute: with the
  // dialog closed a language change re-applies it (the story title), and
  // every open re-resolves the title here anyway.
  frame.title = title.textContent = t(target.key);
  opener?.setAttribute('aria-expanded', 'true');
  dialog.showModal();
  closeBtn.focus();
}
