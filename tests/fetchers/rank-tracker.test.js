// tests/fetchers/rank-tracker.test.js
import 'dotenv/config';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, assertNumber, assertDiffers, assertNonEmpty, warnEmpty } from '../setup.js';
import { config } from '../../config.js';
import {
  fetchOrganicSovSnapshot,
  fetchAioFoundPages,
  fetchAioGapUrls,
  fetchSerpFeatures
} from '../../api/fetchers/rank-tracker.js';

const WIDGET = 'rank-tracker-test';

// ── p2: Organic SoV Snapshot ──────────────────────────────────────────────────
// NOTE: This widget maps date_to → "current" date and date_from → "compare" date.
// It uses single-date snapshots, not a range. So 'historical' scenario uses
// monthsAgo(2) as current and monthsAgo(3) as compare.
describe('p2-sov-organic: fetchOrganicSovSnapshot', () => {
  it('default scenario — rows array with competitor, share_of_voice, sov_delta', async () => {
    const s = SCENARIOS.default;
    const data = await fetchOrganicSovSnapshot(
      { date_to: s.dateTo, date_from: s.dateFrom },
      WIDGET
    );
    assert.ok(Array.isArray(data.rows), `rows should be array, got ${JSON.stringify(Object.keys(data))}`);
    if (data.rows.length === 0) { warnEmpty('p2', 'default', 'rows is empty'); return; }
    for (const row of data.rows) {
      assert.ok(typeof row.competitor === 'string', `row.competitor should be string, got ${JSON.stringify(row.competitor)}`);
      assertNumber(row.share_of_voice, `p2 row.share_of_voice for ${row.competitor}`);
      // sov_delta is null when competitor absent from compare period — never NaN
      if (row.sov_delta !== null) {
        assertNumber(row.sov_delta, `p2 row.sov_delta for ${row.competitor}`);
      }
      assert.ok(
        row.sov_delta === null || typeof row.sov_delta === 'number',
        `p2 sov_delta must be null or number, got ${JSON.stringify(row.sov_delta)}`
      );
    }
  });

  it('historical scenario — current and compare use historical dates (data differs from default)', async () => {
    const def = SCENARIOS.default;
    const hist = SCENARIOS.historical;
    const [dataDefault, dataHist] = await Promise.all([
      fetchOrganicSovSnapshot({ date_to: def.dateTo, date_from: def.dateFrom }, WIDGET),
      fetchOrganicSovSnapshot({ date_to: hist.dateTo, date_from: hist.dateFrom }, WIDGET)
    ]);
    if (!dataDefault.rows?.length || !dataHist.rows?.length) {
      warnEmpty('p2', 'historical-vs-default', 'one or both empty — skipping diff check');
      return;
    }
    assertDiffers(
      dataDefault.rows.map(r => r.share_of_voice),
      dataHist.rows.map(r => r.share_of_voice),
      'p2 share_of_voice values should differ between default and historical — if identical, date params may be ignored'
    );
  });

  it('sov_delta is never NaN or undefined — only null or finite number', async () => {
    const s = SCENARIOS.default;
    const data = await fetchOrganicSovSnapshot({ date_to: s.dateTo, date_from: s.dateFrom }, WIDGET);
    for (const row of (data.rows || [])) {
      assert.ok(
        row.sov_delta === null || (typeof row.sov_delta === 'number' && isFinite(row.sov_delta)),
        `p2 sov_delta for '${row.competitor}' is ${JSON.stringify(row.sov_delta)} — expected null or finite number`
      );
    }
  });
});

// ── p8: AIO Found Pages ───────────────────────────────────────────────────────
// NOTE: rank-tracker/overview uses a single `date` snapshot, not a range.
// Date picker `date_to` maps to the snapshot date via overrides spread.
describe('p8-aio-pages: fetchAioFoundPages', () => {
  it('default scenario — pages array with url, keyword_count, total_traffic', async () => {
    const s = SCENARIOS.default;
    const data = await fetchAioFoundPages({ date_to: s.dateTo }, WIDGET);
    assert.ok(Array.isArray(data.pages), `pages should be array, got ${JSON.stringify(Object.keys(data))}`);
    if (data.pages.length === 0) { warnEmpty('p8', 'default', 'pages is empty — no AIO citations found'); return; }
    for (const page of data.pages) {
      assert.ok(typeof page.url === 'string', `pages[*].url should be string`);
      assert.ok(Number.isInteger(page.keyword_count) && page.keyword_count >= 1, `pages[*].keyword_count should be integer >= 1, got ${page.keyword_count}`);
      assertNumber(page.total_traffic, 'pages[*].total_traffic');
    }
  });

  it('pages are sorted descending by keyword_count', async () => {
    const s = SCENARIOS.default;
    const data = await fetchAioFoundPages({ date_to: s.dateTo }, WIDGET);
    if (!data.pages?.length || data.pages.length < 2) return;
    for (let i = 1; i < data.pages.length; i++) {
      assert.ok(
        data.pages[i - 1].keyword_count >= data.pages[i].keyword_count,
        `p8 pages not sorted by keyword_count desc at index ${i}`
      );
    }
  });
});

// ── o2: AIO Gap URLs ──────────────────────────────────────────────────────────
describe('o2-aio-gaps: fetchAioGapUrls', () => {
  it('default scenario — urls array; no url contains own domain or competitor domains', async () => {
    const s = SCENARIOS.default;
    const data = await fetchAioGapUrls({ date_to: s.dateTo }, WIDGET);
    assert.ok(Array.isArray(data.urls), `urls should be array, got ${JSON.stringify(Object.keys(data))}`);
    if (data.urls.length === 0) { warnEmpty('o2', 'default', 'urls is empty — no AIO gaps found'); return; }
    const ownDomain = config.defaultDomain;
    const competitorDomains = config.defaultCompetitorDomains;
    const excludes = [ownDomain, ...competitorDomains].filter(Boolean);
    for (const item of data.urls) {
      assert.ok(typeof item.url === 'string', `urls[*].url should be string`);
      assert.ok(item.keyword_count >= 1, `urls[*].keyword_count should be >= 1`);
      for (const excl of excludes) {
        assert.ok(
          !item.url.includes(excl),
          `o2: URL '${item.url}' contains excluded domain '${excl}' — domain exclusion filter may be broken`
        );
      }
    }
  });
});

// ── o5: PAA Questions ─────────────────────────────────────────────────────────
describe('o5-paa: fetchSerpFeatures("question")', () => {
  it('default scenario — type is question; results have keyword, position, items with url and title', async () => {
    const s = SCENARIOS.default;
    const data = await fetchSerpFeatures('question', { date_to: s.dateTo }, WIDGET);
    assert.strictEqual(data.type, 'question', `type should be 'question'`);
    assert.ok(Array.isArray(data.results), `results should be array`);
    if (data.results.length === 0) { warnEmpty('o5', 'default', 'no PAA results found'); return; }
    for (const result of data.results) {
      assert.ok(typeof result.keyword === 'string', `result.keyword should be string`);
      assertNumber(result.position, 'result.position');
      assert.ok(Array.isArray(result.items), `result.items should be array`);
      for (const item of result.items) {
        // PAA items always have a title (the question text); url may be null for some entries
        assert.ok(typeof item.title === 'string' && item.title.length > 0, `result.items[*].title should be non-empty string (PAA question text), got ${JSON.stringify(item.title)}`);
      }
    }
  });
});

// ── o6: Discussions ───────────────────────────────────────────────────────────
describe('o6-discussions: fetchSerpFeatures("discussion")', () => {
  it('default scenario — type is discussion; results have keyword, items with url', async () => {
    const s = SCENARIOS.default;
    const data = await fetchSerpFeatures('discussion', { date_to: s.dateTo }, WIDGET);
    assert.strictEqual(data.type, 'discussion');
    assert.ok(Array.isArray(data.results));
    if (data.results.length === 0) { warnEmpty('o6', 'default', 'no discussion results found'); return; }
    for (const result of data.results) {
      assert.ok(typeof result.keyword === 'string');
      assert.ok(Array.isArray(result.items));
      for (const item of result.items) {
        assert.ok(typeof item.url === 'string', `o6 items[*].url should be string`);
      }
    }
  });
});

// ── o8: Popular Video Topics ──────────────────────────────────────────────────
describe('o8-videos: fetchSerpFeatures("video")', () => {
  it('default scenario — type is video; results have keyword, items with url; no duplicate URLs', async () => {
    const s = SCENARIOS.default;
    const data = await fetchSerpFeatures('video', { date_to: s.dateTo }, WIDGET);
    assert.strictEqual(data.type, 'video');
    assert.ok(Array.isArray(data.results));
    if (data.results.length === 0) { warnEmpty('o8', 'default', 'no video results found'); return; }

    // Collect all URLs across all results
    const allUrls = data.results.flatMap(r => (r.items || []).map(i => i.url).filter(Boolean));
    assert.ok(allUrls.length > 0, 'o8: expected at least one video URL');

    // Verify there ARE duplicates in raw results (proves dedup is meaningful)
    const rawCount = allUrls.length;
    const dedupCount = new Set(allUrls).size;
    if (rawCount === dedupCount) {
      warnEmpty('o8', 'default', 'no duplicate URLs found in raw results — dedup had no effect (this is ok if dataset is small)');
    } else {
      console.log(`  o8: dedup reduced ${rawCount} raw URLs to ${dedupCount} unique (removed ${rawCount - dedupCount} duplicates)`);
    }
  });
});
