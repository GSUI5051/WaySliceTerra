/** About pages tests: the zh→zh-CN / other→en resolution rule and pack parity
 *  for the story, changelog and privacy pages. */
import { suite, test, assert } from './runner.js';
import { resolveStoryPackFile, renderStory } from '../about/story/story-lang.js';
import { STORY_ZH_CN } from '../about/story/story-zh.js';
import { STORY_EN } from '../about/story/story-en.js';
import { resolveChangelogPackFile, renderChangelog } from '../about/changelog/changelog-lang.js';
import { CHANGELOG_ZH_CN } from '../about/changelog/changelog-zh.js';
import { CHANGELOG_EN } from '../about/changelog/changelog-en.js';
import { resolvePrivacyPackFile, renderPrivacy } from '../about/privacy/privacy-lang.js';
import { PRIVACY_ZH_CN } from '../about/privacy/privacy-zh.js';
import { PRIVACY_EN } from '../about/privacy/privacy-en.js';

suite('story / language file resolution', () => {
  test('zh-CN and zh-TW choices both load the Chinese file', () => {
    assert.equal(resolveStoryPackFile('zh-CN', []), 'zh');
    assert.equal(resolveStoryPackFile('zh-TW', ['en-US']), 'zh');
  });

  test('no saved choice follows the browser language (incognito fix)', () => {
    // A fresh/incognito browser has no saved choice; the story must mirror
    // the app's own initial detection instead of defaulting to English.
    assert.equal(resolveStoryPackFile(null, ['zh-CN', 'zh']), 'zh');
    assert.equal(resolveStoryPackFile(null, ['zh-TW', 'zh']), 'zh');
    assert.equal(resolveStoryPackFile(null, ['zh']), 'zh');
    assert.equal(resolveStoryPackFile(null, ['zh-Hant-TW', 'zh-TW']), 'zh');
    assert.equal(resolveStoryPackFile(undefined, ['en-US', 'en']), 'en');
    assert.equal(resolveStoryPackFile(null, []), 'en');
    assert.equal(resolveStoryPackFile(null), 'en');
  });

  test('a stale saved code falls through to browser detection', () => {
    // 'ja' stands in for any stale saved code from before the compliance
    // trim: the app ignores a stale choice and detects from the browser,
    // so the story does the same instead of forcing English.
    assert.equal(resolveStoryPackFile('ja', ['zh-CN']), 'zh');
    assert.equal(resolveStoryPackFile('ja', ['en-US']), 'en');
    assert.equal(resolveStoryPackFile('', ['en-US']), 'en');
  });

  test('an explicit English choice stays English even for a zh browser', () => {
    assert.equal(resolveStoryPackFile('en', ['zh-CN', 'zh']), 'en');
  });
});

suite('story / pack parity', () => {
  test('both versions cover the same sections with the same shape', () => {
    // The English pack mirrors the Chinese one section for section,
    // paragraph for paragraph — the author edits the zh pack as the source
    // of truth and the en pack is re-synced to it.
    assert.equal(STORY_ZH_CN.sections.length, STORY_EN.sections.length);
    STORY_ZH_CN.sections.forEach((section, i) => {
      const mirror = STORY_EN.sections[i];
      assert.truthy(section.h);
      assert.truthy(mirror.h);
      assert.equal(section.ps.length, mirror.ps.length, `section ${i}`);
      for (const text of section.ps) assert.truthy(text);
      for (const text of mirror.ps) assert.truthy(text);
    });
  });

  test('renderStory builds one section per entry, heading + paragraphs', () => {
    const els = {
      title: document.createElement('h1'),
      tagline: document.createElement('p'),
      lede: document.createElement('p'),
      sections: document.createElement('div'),
    };
    renderStory(els, STORY_ZH_CN);
    assert.equal(els.title.textContent, STORY_ZH_CN.heading);
    assert.equal(els.tagline.textContent, STORY_ZH_CN.tagline);
    assert.equal(els.lede.textContent, STORY_ZH_CN.lede);
    assert.equal(els.sections.children.length, STORY_ZH_CN.sections.length);
    const first = els.sections.children[0];
    assert.equal(first.children[0].tagName, 'H2');
    assert.equal(first.children[0].textContent, STORY_ZH_CN.sections[0].h);
    assert.equal(first.children.length, 1 + STORY_ZH_CN.sections[0].ps.length);
  });
});

suite('changelog / content pack', () => {
  test('both versions carry the same days, newest first', () => {
    // The section headings are the dates — nothing but YYYY-MM-DD — and the
    // days run newest first. The English pack mirrors the Chinese one day
    // for day, paragraph for paragraph.
    assert.equal(CHANGELOG_ZH_CN.htmlLang, 'zh-CN');
    assert.equal(CHANGELOG_EN.htmlLang, 'en');
    assert.equal(CHANGELOG_ZH_CN.sections.length, CHANGELOG_EN.sections.length);
    let previous = null;
    CHANGELOG_ZH_CN.sections.forEach((section, i) => {
      assert.truthy(/^\d{4}-\d{2}-\d{2}$/.test(section.h), `heading is a date: ${section.h}`);
      assert.equal(section.h, CHANGELOG_EN.sections[i].h, `same day ${i}`);
      if (previous) assert.truthy(previous > section.h, `newest first: ${previous} > ${section.h}`);
      previous = section.h;
      const mirror = CHANGELOG_EN.sections[i];
      assert.truthy(section.ps.length);
      assert.equal(section.ps.length, mirror.ps.length, `section ${i}`);
      for (const text of section.ps) assert.truthy(text);
      for (const text of mirror.ps) assert.truthy(text);
    });
  });

  test('renderChangelog builds one section per entry, heading + paragraphs', () => {
    const els = {
      title: document.createElement('h1'),
      tagline: document.createElement('p'),
      lede: document.createElement('p'),
      sections: document.createElement('div'),
    };
    renderChangelog(els, CHANGELOG_ZH_CN);
    assert.equal(els.title.textContent, CHANGELOG_ZH_CN.heading);
    assert.equal(els.tagline.textContent, CHANGELOG_ZH_CN.tagline);
    assert.equal(els.lede.textContent, CHANGELOG_ZH_CN.lede);
    assert.equal(els.sections.children.length, CHANGELOG_ZH_CN.sections.length);
    // The per-entry shape below applies to every day the packs carry, and
    // stays skipped while they carry none.
    if (CHANGELOG_ZH_CN.sections.length) {
      const first = els.sections.children[0];
      assert.equal(first.children[0].tagName, 'H2');
      assert.equal(first.children[0].textContent, CHANGELOG_ZH_CN.sections[0].h);
      assert.equal(first.children.length, 1 + CHANGELOG_ZH_CN.sections[0].ps.length);
    }
  });

  test('the loader resolves languages like the story page', () => {
    assert.equal(resolveChangelogPackFile('zh-TW', []), 'zh');
    assert.equal(resolveChangelogPackFile(null, ['zh-CN', 'zh']), 'zh');
    assert.equal(resolveChangelogPackFile('en', ['zh']), 'en');
    assert.equal(resolveChangelogPackFile(null), 'en');
  });
});

suite('privacy / content pack', () => {
  test('both versions cover the same sections with the same shape', () => {
    assert.equal(PRIVACY_ZH_CN.htmlLang, 'zh-CN');
    assert.equal(PRIVACY_EN.htmlLang, 'en');
    assert.equal(PRIVACY_ZH_CN.sections.length, PRIVACY_EN.sections.length);
    PRIVACY_ZH_CN.sections.forEach((section, i) => {
      const mirror = PRIVACY_EN.sections[i];
      assert.truthy(section.h);
      assert.truthy(mirror.h);
      assert.equal(section.ps.length, mirror.ps.length, `section ${i}`);
      for (const text of section.ps) assert.truthy(text);
      for (const text of mirror.ps) assert.truthy(text);
    });
  });

  test('renderPrivacy builds one section per entry, heading + paragraphs', () => {
    const els = {
      title: document.createElement('h1'),
      tagline: document.createElement('p'),
      lede: document.createElement('p'),
      sections: document.createElement('div'),
    };
    renderPrivacy(els, PRIVACY_ZH_CN);
    assert.equal(els.title.textContent, PRIVACY_ZH_CN.heading);
    assert.equal(els.tagline.textContent, PRIVACY_ZH_CN.tagline);
    assert.equal(els.lede.textContent, PRIVACY_ZH_CN.lede);
    assert.equal(els.sections.children.length, PRIVACY_ZH_CN.sections.length);
    const first = els.sections.children[0];
    assert.equal(first.children[0].tagName, 'H2');
    assert.equal(first.children[0].textContent, PRIVACY_ZH_CN.sections[0].h);
    assert.equal(first.children.length, 1 + PRIVACY_ZH_CN.sections[0].ps.length);
  });

  test('the loader resolves languages like the story page', () => {
    assert.equal(resolvePrivacyPackFile('zh-TW', []), 'zh');
    assert.equal(resolvePrivacyPackFile(null, ['zh-CN', 'zh']), 'zh');
    assert.equal(resolvePrivacyPackFile('en', ['zh']), 'en');
    assert.equal(resolvePrivacyPackFile(null), 'en');
  });
});
