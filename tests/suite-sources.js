/** Basemap catalog tests: source shape, i18n labels, default source,
 * the outdoor group's generated-contour exemption, the natural-overlay
 * opt-out. */
import { suite, test, assert } from './runner.js';
import {
  MAP_SOURCES, groupedSources, DEFAULT_SOURCE_ID,
  getSavedSource, getSavedSourceId, isOutdoorBasemap, naturalOverlayEnabled,
} from '../js/map/sources.js';
import * as language from '../js/language/language.js';
import '../js/language/langs.js';

suite('basemap / catalog integrity', () => {
  test('every source has the required fields and a unique id', () => {
    const ids = MAP_SOURCES.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate source ids');
    for (const s of MAP_SOURCES) {
      assert.truthy(s.id && s.labelKey && s.group && (s.url || s.styleUrl) && s.maxZoom && s.attribution, `incomplete source: ${s.id}`);
    }
  });

  test('grouped sources cover every source exactly once', () => {
    const grouped = groupedSources().flatMap((g) => g.sources.map((s) => s.id)).sort();
    assert.deepEqual(grouped, MAP_SOURCES.map((s) => s.id).sort());
  });

  test('street and minimal groups follow the documented selector order', () => {
    const idsFor = (group) => MAP_SOURCES.filter((s) => s.group === group).map((s) => s.id);
    assert.deepEqual(idsFor('street'), ['osm', 'OpenFreeMapBright']);
    assert.deepEqual(idsFor('outdoor'), ['opentopomap', 'cyclosm']);
    assert.deepEqual(idsFor('satellite'), ['EOXSentinel2', 'esri-imagery']);
    assert.deepEqual(idsFor('minimal'), ['OpenFreeMapPositron', 'OpenFreeMapDark']);
  });

  test('vector style sources point at their provider style endpoints', () => {
    const vector = MAP_SOURCES.filter((s) => s.styleUrl);
    assert.deepEqual(vector.map((s) => s.id).sort(), ['OpenFreeMapBright', 'OpenFreeMapDark', 'OpenFreeMapPositron']);
    for (const s of vector.filter((s) => s.id.startsWith('OpenFreeMap'))) {
      assert.truthy(s.styleUrl.startsWith('https://tiles.openfreemap.org/styles/'), `style host for ${s.id}`);
      assert.truthy(!s.url, `vector-only provider serves no raster url: ${s.id}`);
    }
  });

  test('no catalog entry carries an api key or registration-gated endpoint', () => {
    // Every shipped source must work without a token, API key or account
    // (user rule after removing Thunderforest/Mapy/Stadia).
    for (const s of MAP_SOURCES) {
      const urls = [s.url, s.styleUrl].filter(Boolean);
      for (const u of urls) {
        assert.truthy(!/api[-_]?key|token/i.test(u), `keyless url for ${s.id}: ${u}`);
        assert.truthy(!/stadiamaps\.com|thunderforest\.com|api\.mapy\.com/.test(u), `provider not requiring registration for ${s.id}: ${u}`);
      }
    }
  });

  test('default source id resolves to a registered source', () => {
    assert.truthy(MAP_SOURCES.some((s) => s.id === DEFAULT_SOURCE_ID));
  });
});

suite('basemap / outdoor group carries its own contours', () => {
  test('isOutdoorBasemap flags exactly the outdoor group, null-safe', () => {
    for (const s of MAP_SOURCES) {
      assert.equal(isOutdoorBasemap(s), s.group === 'outdoor', `${s.id}`);
    }
    assert.equal(isOutdoorBasemap(null), false, 'null (no basemap yet) is not outdoor');
    assert.equal(isOutdoorBasemap(undefined), false);
  });

  test('every outdoor source is a raster basemap (paints its own contours)', () => {
    // The exemption exists because these tiles already draw contour lines;
    // a future vector outdoor style must re-justify the flag.
    const outdoor = MAP_SOURCES.filter((s) => isOutdoorBasemap(s));
    assert.deepEqual(outdoor.map((s) => s.id), ['opentopomap', 'cyclosm']);
    for (const s of outdoor) {
      assert.truthy(s.url && !s.styleUrl, `${s.id} serves raster tiles`);
    }
  });
});

suite('basemap / natural overlay gating', () => {
  test('satellite and vector-style sources ride both view modes; null-safe', () => {
    for (const s of MAP_SOURCES.filter((x) => x.group === 'satellite' || x.styleUrl)) {
      assert.equal(naturalOverlayEnabled(s, false), true, `${s.id} in 2D`);
      assert.equal(naturalOverlayEnabled(s, true), true, `${s.id} in 3D`);
    }
    assert.equal(naturalOverlayEnabled(null, true), false, 'no basemap yet = no overlay');
    assert.equal(naturalOverlayEnabled(undefined, false), false);
  });

  test("the standard raster maps ride the 3D view only — their tiles carry natural markers", () => {
    const byId = Object.fromEntries(MAP_SOURCES.map((s) => [s.id, s]));
    for (const id of ['osm', 'opentopomap', 'cyclosm']) {
      assert.equal(naturalOverlayEnabled(byId[id], false), false, `${id}: 2D excludes (the tiles draw their own markers)`);
      assert.equal(naturalOverlayEnabled(byId[id], true), true, `${id}: 3D rides (tile markers melt into the draped raster)`);
    }
  });

  test('explicit gating values', () => {
    assert.equal(naturalOverlayEnabled({ id: 'x', naturalOverlay: false }, true), false, 'false never rides');
    assert.equal(naturalOverlayEnabled({ id: 'x', naturalOverlay: '3d' }, true), true, "'3d' rides 3D");
    assert.equal(naturalOverlayEnabled({ id: 'x', naturalOverlay: '3d' }, false), false, "'3d' skips 2D");
    assert.equal(naturalOverlayEnabled({ id: 'x' }, false), true, 'unset rides everywhere');
  });
});

suite('basemap / i18n labels', () => {
  test('every source label resolves in every registered language', async () => {
    const codes = language.getLanguages().map((l) => l.code);
    for (const source of MAP_SOURCES) {
      for (const code of codes) {
        await language.setLanguage(code);
        const label = language.t(source.labelKey);
        assert.truthy(label && label !== source.labelKey, `${source.labelKey} unresolved in ${code}`);
      }
    }
    await language.setLanguage('en');
  });
});

suite('basemap / default source', () => {
  test('with no saved choice the catalog default applies, whatever the UI language', async () => {
    localStorage.removeItem('wayslice-basemap');
    for (const { code } of language.getLanguages()) {
      await language.setLanguage(code);
      assert.equal(getSavedSourceId(), DEFAULT_SOURCE_ID, `default for ${code}`);
      assert.equal(getSavedSource().id, DEFAULT_SOURCE_ID, `default source for ${code}`);
    }
    await language.setLanguage('en');
  });

  test('an explicit choice beats the default', () => {
    localStorage.setItem('wayslice-basemap', 'opentopomap');
    assert.equal(getSavedSourceId(), 'opentopomap');
    assert.equal(getSavedSource().id, 'opentopomap');
    localStorage.removeItem('wayslice-basemap');
    assert.equal(getSavedSourceId(), DEFAULT_SOURCE_ID);
  });

  test('a stale saved id falls back to the default', () => {
    localStorage.setItem('wayslice-basemap', 'not-a-source');
    assert.equal(getSavedSourceId(), DEFAULT_SOURCE_ID);
    localStorage.removeItem('wayslice-basemap');
  });
});
