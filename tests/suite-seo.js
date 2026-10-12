/** SEO / GEO surface tests: per-language entry pages (generated locally
 * from index.html), the hreflang cluster, canonical + og/twitter
 * + JSON-LD metadata, sitemap / robots.txt / llms.txt, and old-domain
 * hygiene. These guard the domain https://waysliceterra.com —
 * every URL the site ships must use it and nothing may point at the old
 * wayslice.com. */
import { suite, test, assert } from './runner.js';

const DOMAIN = 'https://waysliceterra.com';
const LANGS = ['de', 'es', 'fr', 'it', 'ja', 'ko', 'zh-CN', 'zh-TW'];
const LOCALES = { de: 'de_DE', es: 'es_ES', fr: 'fr_FR', it: 'it_IT', ja: 'ja_JP', ko: 'ko_KR', 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW' };
const PACK_FILE = { de: 'lang-de', es: 'lang-es', fr: 'lang-fr', it: 'lang-it', ja: 'lang-ja', ko: 'lang-ko', 'zh-CN': 'lang-zh-CN', 'zh-TW': 'lang-zh-TW' };

const fetchText = async (path) => {
  const res = await fetch(path);
  assert.equal(res.status, 200, `fetch ${path}`);
  return res.text();
};

/** Parses `key: 'value',` fields out of a language pack's source — the same
 *  contract the generator relies on. */
const packField = (src, key) => src.match(new RegExp(`^\\s*${key}: '(.*)',$`, 'm'))?.[1];

function assertHreflangCluster(html, label) {
  const links = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)];
  assert.equal(links.length, 10, `${label}: hreflang link count (x-default + 9 languages)`);
  const got = new Map(links.map(([, l, h]) => [l, h]));
  assert.equal(got.get('x-default'), `${DOMAIN}/`, `${label}: x-default → root`);
  assert.equal(got.get('en'), `${DOMAIN}/`, `${label}: en → root`);
  for (const l of LANGS) assert.equal(got.get(l), `${DOMAIN}/${l}/`, `${label}: ${l} → its entry page`);
}

function assertNoOldDomain(html, label) {
  // Scheme-prefixed forms only — the head comment legitimately MENTIONS the
  // old domain by name when warning against reusing its verification code.
  assert.truthy(!/["'(]https?:\/\/wayslice\.com/.test(html), `${label}: no old-domain URL`);
}

const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

suite('seo / language packs expose meta strings', () => {
  test('every pack and the template carry appTitle + metaDescription', async () => {
    const files = [...Object.values(PACK_FILE), 'lang-en', 'lang-template'];
    for (const f of files) {
      const src = await fetchText(`/js/language/${f}.js`);
      const title = packField(src, 'appTitle');
      const desc = packField(src, 'metaDescription');
      assert.truthy(title && title.startsWith('WaySlice Terra — '), `${f}: appTitle present, brand-led`);
      assert.truthy(desc && desc.length >= 80 && desc.length <= 400, `${f}: metaDescription ${desc && desc.length} chars`);
      assert.truthy(/nothing is uploaded|不上传|不上傳|アップロードされません|업로드되지|nichts wird hochgeladen|nada se sube|rien n’est envoyé|nulla viene caricato/.test(desc), `${f}: description carries the local-only promise`);
    }
  });

  test('en pack metaDescription mirrors the root page verbatim', async () => {
    const [src, index] = await Promise.all([fetchText('/js/language/lang-en.js'), fetchText('/index.html')]);
    const rootDesc = index.match(/<meta name="description" content="(.*)">/)[1];
    assert.equal(packField(src, 'metaDescription'), rootDesc);
  });
});

suite('seo / generated language pages', () => {
  test('all eight pages exist, are localized, and match their pack', async () => {
    const enSrc = await fetchText('/js/language/lang-en.js');
    const enDesc = packField(enSrc, 'metaDescription');
    for (const lang of LANGS) {
      const html = await fetchText(`/${lang}/index.html`);
      const src = await fetchText(`/js/language/${PACK_FILE[lang]}.js`);
      const title = packField(src, 'appTitle');
      const desc = packField(src, 'metaDescription');
      assert.truthy(html.includes(`<html lang="${lang}">`), `${lang}: html lang`);
      assert.truthy(html.includes(`<title>${title}</title>`), `${lang}: localized title`);
      assert.truthy(html.includes(`content="${desc}">`), `${lang}: localized description`);
      assert.truthy(!html.includes(`content="${enDesc}">`), `${lang}: no leftover en description`);
      assert.truthy(html.includes(`<meta name="wayslice-initial-language" content="${lang}">`), `${lang}: boot hint`);
      assert.truthy(html.includes(`<link rel="canonical" href="${DOMAIN}/${lang}/">`), `${lang}: canonical`);
      assert.truthy(html.includes(`<meta property="og:url" content="${DOMAIN}/${lang}/">`), `${lang}: og:url`);
      assert.truthy(html.includes(`<meta property="og:locale" content="${LOCALES[lang]}">`), `${lang}: og:locale`);
      assert.truthy(!html.includes(`<meta property="og:locale:alternate" content="${LOCALES[lang]}">`), `${lang}: own locale not in alternates`);
      assertHreflangCluster(html, lang);
      assert.truthy(!/href="css\//.test(html) && !/src="js\//.test(html) && !/href="icons\//.test(html), `${lang}: assets site-absolute`);
      const ld = jsonLd(html);
      assert.equal(ld.url, `${DOMAIN}/${lang}/`, `${lang}: json-ld url`);
      assert.equal(ld.description, desc, `${lang}: json-ld description`);
      assert.deepEqual(ld.inLanguage, [lang], `${lang}: json-ld inLanguage`);
      assertNoOldDomain(html, lang);
    }
  });

  test('every /{lang}/ URL serves its generated index', async () => {
    // Byte-level staleness is asserted by the generator's --check mode;
    // here we pin that each directory URL resolves. Note python
    // http.server serves /de/ → /de/index.html the same as GitHub Pages.
    for (const lang of LANGS) {
      const res = await fetch(`/${lang}/`);
      assert.equal(res.status, 200, `${lang}/ serves index.html`);
    }
  });
});

suite('seo / root page metadata', () => {
  test('canonical, hreflang cluster, og image and no verification meta', async () => {
    const html = await fetchText('/index.html');
    assert.truthy(html.includes(`<link rel="canonical" href="${DOMAIN}/">`), 'canonical');
    assertHreflangCluster(html, 'root');
    assert.truthy(html.includes(`<meta property="og:image" content="${DOMAIN}/screenshots/og-image.jpg">`), 'og:image');
    assert.truthy(html.includes('<meta property="og:image:width" content="1200">'), 'og:image width');
    assert.truthy(html.includes('<meta property="og:image:height" content="630">'), 'og:image height');
    assert.truthy(html.includes('<meta property="og:locale" content="en_US">'), 'og:locale');
    assert.equal(html.match(/og:locale:alternate/g)?.length, 8, 'og:locale:alternate count');
    // Bing verification: the site is verified through the Google Search
    // Console import, so no msvalidate.01 meta belongs on the page.
    assert.truthy(!/<meta name="msvalidate\.01"/.test(html), 'no bing verification meta');
    assertNoOldDomain(html, 'root');
  });

  test('JSON-LD WebApplication: repository, license, languages, category', async () => {
    const ld = jsonLd(await fetchText('/index.html'));
    assert.equal(ld['@type'], 'WebApplication');
    assert.equal(ld.url, `${DOMAIN}/`);
    assert.equal(ld.applicationCategory, 'SportsApplication');
    assert.equal(ld.license, 'https://spdx.org/licenses/MIT');
    assert.equal(ld.author.name, 'GSUI5051');
    assert.deepEqual(ld.sameAs, ['https://github.com/GSUI5051/WaySliceTerra']);
    assert.deepEqual(ld.inLanguage, ['en', 'zh-CN', 'zh-TW', 'de', 'es', 'fr', 'it', 'ja', 'ko']);
    assert.truthy(Array.isArray(ld.featureList) && ld.featureList.length >= 4, 'featureList');
    assert.equal(ld.offers.price, '0');
  });
});

suite('seo / site files', () => {
  test('sitemap.xml: new domain only, 12 URLs, language cluster per entry', async () => {
    const xml = await fetchText('/sitemap.xml');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const urls = [...doc.querySelectorAll('url')];
    assert.equal(urls.length, 12, 'url count (9 language pages + 3 about pages)');
    for (const url of urls) {
      const loc = url.querySelector('loc').textContent;
      assert.truthy(loc.startsWith(DOMAIN), `loc on new domain: ${loc}`);
    }
    const locs = urls.map((u) => u.querySelector('loc').textContent);
    for (const lang of LANGS) assert.truthy(locs.includes(`${DOMAIN}/${lang}/`), `sitemap lists /${lang}/`);
    for (const p of ['/about/story/story.html', '/about/privacy/privacy.html', '/about/changelog/changelog.html']) {
      assert.truthy(locs.includes(`${DOMAIN}${p}`), `sitemap lists ${p}`);
    }
    assertNoOldDomain(xml, 'sitemap');
  });

  test('language entries carry the full xhtml:link cluster', async () => {
    const xml = await fetchText('/sitemap.xml');
    // 9 language URLs × 10 links each (x-default + 9 languages); the 3 about
    // pages carry none.
    const links = xml.match(/<xhtml:link /g)?.length ?? 0;
    assert.equal(links, 90, 'xhtml:link alternates total');
    for (const lang of LANGS) {
      const entry = xml.split(`<loc>${DOMAIN}/${lang}/</loc>`)[1]?.split('</url>')[0];
      assert.truthy(entry && entry.match(/<xhtml:link /g).length === 10, `${lang}: 10 alternates`);
    }
  });

  test('robots.txt points the sitemap at the new domain', async () => {
    const txt = await fetchText('/robots.txt');
    assert.truthy(txt.includes(`Sitemap: ${DOMAIN}/sitemap.xml`), 'sitemap line');
    assertNoOldDomain(txt, 'robots');
  });

  test('llms.txt exists, leads with the reserved domain and the repository', async () => {
    const txt = await fetchText('/llms.txt');
    assert.truthy(txt.startsWith('# WaySlice Terra'), 'h1');
    assert.truthy(txt.includes(DOMAIN), 'domain present');
    assert.truthy(txt.includes('https://github.com/GSUI5051/WaySliceTerra'), 'repository link');
    assertNoOldDomain(txt, 'llms');
  });

  test('about pages carry new-domain canonical/og:url', async () => {
    for (const p of ['/about/story/story.html', '/about/privacy/privacy.html', '/about/changelog/changelog.html']) {
      const html = await fetchText(p);
      assert.truthy(html.includes(`<link rel="canonical" href="${DOMAIN}${p}">`), `${p}: canonical`);
      assert.truthy(html.includes(`<meta property="og:url" content="${DOMAIN}${p}">`), `${p}: og:url`);
      assertNoOldDomain(html, p);
    }
  });

  test('story dialog hosts about pages via site-absolute paths', async () => {
    const src = await fetchText('/js/ui/storyDialog.js');
    assert.truthy(src.includes("src: '/about/story/story.html'"), 'story src absolute');
    assert.truthy(!/src: 'about\//.test(src), 'no page-relative about src');
  });
});
