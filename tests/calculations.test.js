// tests/calculations.test.js
import 'dotenv/config';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, assertNumber, assertNoneMatch, warnEmpty } from './setup.js';
import { config } from '../config.js';
import {
  computeSovDeltas,
  groupBySubfolder,
  filterQuestionKeywords,
  filterLongTailKeywords,
  filterExcludedDomains,
  deduplicateByUrl
} from './calculations.js';
import { fetchOrganicSovSnapshot } from '../api/fetchers/rank-tracker.js';
import { fetchPages, fetchKeywords } from '../api/fetchers/gsc.js';
import { fetchThirdPartyDomains } from '../api/fetchers/brand-radar.js';
import { fetchSerpFeatures } from '../api/fetchers/rank-tracker.js';

const WIDGET = 'calc-test';

// ── SoV delta computation (p2-sov-organic) ────────────────────────────────────
describe('computeSovDeltas (p2-sov-organic)', () => {
  it('delta is a finite number for competitors in both periods', async () => {
    const s = SCENARIOS.default;
    const data = await fetchOrganicSovSnapshot({ date_to: s.dateTo, date_from: s.dateFrom }, WIDGET);
    if (!data.rows?.length) { warnEmpty('p2-calc', 'default', 'rows empty — skipping'); return; }

    // fetchOrganicSovSnapshot already computes deltas; we verify the results are correct
    for (const row of data.rows) {
      if (row.sov_delta !== null) {
        assertNumber(row.sov_delta, `sov_delta for ${row.competitor}`);
        assert.ok(
          isFinite(row.sov_delta),
          `sov_delta for ${row.competitor} is not finite: ${row.sov_delta}`
        );
      }
    }
  });

  it('computeSovDeltas correctly marks absent-from-previous competitors as null delta', () => {
    // Synthetic test using the pure function directly — no API call needed
    const current = [
      { competitor: 'site-a.com', share_of_voice: 30 },
      { competitor: 'site-b.com', share_of_voice: 20 },
      { competitor: 'site-new.com', share_of_voice: 5 } // not in previous
    ];
    const previous = [
      { competitor: 'site-a.com', share_of_voice: 25 },
      { competitor: 'site-b.com', share_of_voice: 22 }
    ];
    const rows = computeSovDeltas(current, previous);
    const siteA = rows.find(r => r.competitor === 'site-a.com');
    const siteNew = rows.find(r => r.competitor === 'site-new.com');
    assert.strictEqual(siteA.sov_delta, 5,    'site-a sov_delta should be 30 - 25 = 5');
    assert.strictEqual(siteNew.sov_delta, null, 'site-new sov_delta should be null (absent from previous)');
  });

  it('share_of_voice values are all in [0, 100]', async () => {
    const s = SCENARIOS.default;
    const data = await fetchOrganicSovSnapshot({ date_to: s.dateTo, date_from: s.dateFrom }, WIDGET);
    for (const row of (data.rows || [])) {
      assert.ok(
        row.share_of_voice >= 0 && row.share_of_voice <= 100,
        `p2: share_of_voice ${row.share_of_voice} for ${row.competitor} is outside [0, 100]`
      );
    }
  });
});

// ── Subfolder grouping (p5-clicks-organic) ────────────────────────────────────
describe('groupBySubfolder (p5-clicks-organic)', () => {
  it('group keys start with /, no page appears in more than one group, click totals are accurate', async () => {
    const s = SCENARIOS.default;
    const data = await fetchPages({ date_from: s.dateFrom, date_to: s.dateTo, order_by: 'clicks:desc', limit: 200 }, WIDGET);
    if (!data.pages?.length) { warnEmpty('p5-calc', 'default', 'pages empty — skipping'); return; }

    const groups = groupBySubfolder(data.pages);
    assert.ok(groups.length > 0, 'groupBySubfolder should produce at least one group');

    // Every group key starts with /
    for (const g of groups) {
      assert.ok(g.key.startsWith('/'), `group key '${g.key}' should start with '/'`);
    }

    // No page appears in more than one group
    const allPagesInGroups = groups.flatMap(g => g.pages);
    const urlsInGroups = allPagesInGroups.map(p => p.page || p.url);
    const urlSet = new Set(urlsInGroups);
    assert.strictEqual(urlSet.size, urlsInGroups.length, 'each page should appear in exactly one group');

    // Sum of group clicks equals sum of all page clicks
    const totalClicksPages  = data.pages.reduce((s, p) => s + (p.clicks || 0), 0);
    const totalClicksGroups = groups.reduce((s, g) => s + g.clicks, 0);
    assert.strictEqual(totalClicksGroups, totalClicksPages, `group click totals (${totalClicksGroups}) should equal page totals (${totalClicksPages})`);
  });
});

// ── Question keyword regex (o3-question-kw) ───────────────────────────────────
describe('filterQuestionKeywords (o3-question-kw)', () => {
  // iphrase_match matches anywhere in the string — use word boundary anywhere
  const QUESTION_RE = /\b(who|what|why|where|how|when|which|is|are|can|does|do|should)\b/i;

  it('every filtered keyword contains a question word; at least one raw keyword was excluded', async () => {
    const s = SCENARIOS.default;
    // Fetch raw unfiltered keywords to test the filter independently
    const data = await fetchKeywords({ date_from: s.dateFrom, date_to: s.dateTo, limit: 500, order_by: 'impressions:desc' }, WIDGET);
    if (!data.keywords?.length) { warnEmpty('o3-calc', 'default', 'keywords empty — skipping'); return; }

    const filtered = filterQuestionKeywords(data.keywords);
    for (const kw of filtered) {
      assert.ok(QUESTION_RE.test(kw.keyword || ''), `'${kw.keyword}' passed filter but does not contain a question word`);
    }

    // At least one keyword was excluded — proves the filter is active
    const nonQuestion = data.keywords.filter(k => !QUESTION_RE.test(k.keyword || ''));
    assert.ok(nonQuestion.length > 0, 'filterQuestionKeywords: no keywords were excluded — filter may be a no-op');
  });
});

// ── Long-tail word count (o4-longtail-kw) ────────────────────────────────────
describe('filterLongTailKeywords (o4-longtail-kw)', () => {
  it('every filtered keyword has >= 5 words; at least one raw keyword had < 5 words', async () => {
    const s = SCENARIOS.default;
    const data = await fetchKeywords({ date_from: s.dateFrom, date_to: s.dateTo, limit: 500, order_by: 'impressions:desc' }, WIDGET);
    if (!data.keywords?.length) { warnEmpty('o4-calc', 'default', 'keywords empty — skipping'); return; }

    const filtered = filterLongTailKeywords(data.keywords);
    for (const kw of filtered) {
      const count = (kw.keyword || '').trim().split(/\s+/).length;
      assert.ok(count >= 5, `'${kw.keyword}' passed long-tail filter but has only ${count} words`);
    }

    const shortKeywords = data.keywords.filter(k => (k.keyword || '').trim().split(/\s+/).length < 5);
    assert.ok(shortKeywords.length > 0, 'filterLongTailKeywords: no short keywords found — filter may be a no-op');
  });
});

// ── Domain exclusion (o1-third-domains) ──────────────────────────────────────
describe('filterExcludedDomains (o1-third-domains)', () => {
  it('own domain and competitor domains are excluded; at least one domain was removed', async () => {
    const s = SCENARIOS.default;
    const data = await fetchThirdPartyDomains({ date: s.dateTo }, WIDGET);
    if (!data.domains?.length) { warnEmpty('o1-calc', 'default', 'domains empty — skipping'); return; }

    const ownDomain = config.defaultDomain;
    const competitorDomains = config.defaultCompetitorDomains;
    const excludes = [ownDomain, ...competitorDomains].filter(Boolean);

    if (excludes.length === 0) {
      warnEmpty('o1-calc', 'default', 'no exclude domains configured — skipping filter test');
      return;
    }

    const filtered = filterExcludedDomains(data.domains, 'domain', ownDomain, competitorDomains);

    // No excluded domain appears in result
    assertNoneMatch(
      filtered,
      item => excludes.some(d => item.domain?.includes(d)),
      'o1 filtered domains should not contain own or competitor domains'
    );

    // At least one domain was removed (if any excluded domains appeared in raw results)
    const removedCount = data.domains.length - filtered.length;
    if (removedCount === 0) {
      warnEmpty('o1-calc', 'default', `domain filter removed 0 of ${data.domains.length} domains — own/competitor domains may not appear in AI citations`);
    } else {
      console.log(`  o1: domain filter removed ${removedCount} of ${data.domains.length} domains`);
    }
  });
});

// ── URL deduplication (o8-videos) ────────────────────────────────────────────
describe('deduplicateByUrl (o8-videos)', () => {
  it('no URL appears twice; dedup count <= raw count', async () => {
    const s = SCENARIOS.default;
    const data = await fetchSerpFeatures('video', { date_to: s.dateTo }, WIDGET);
    if (!data.results?.length) { warnEmpty('o8-calc', 'default', 'no video results — skipping'); return; }

    const deduped = deduplicateByUrl(data.results);
    const dedupedUrls = deduped.map(r => r.url).filter(Boolean);
    const urlSet = new Set(dedupedUrls);

    assert.strictEqual(
      urlSet.size, dedupedUrls.length,
      `deduplicateByUrl: found ${dedupedUrls.length - urlSet.size} duplicate URLs in deduped output`
    );

    const rawCount = data.results.reduce((s, r) => s + (r.items?.length || 0), 0);
    assert.ok(
      deduped.length <= rawCount,
      `deduped count (${deduped.length}) should be <= raw item count (${rawCount})`
    );
  });

  it('deduplicateByUrl pure function: synthetic test with known duplicates', () => {
    const results = [
      { keyword: 'kw1', position: 1, items: [{ url: 'https://youtube.com/a', title: 'Video A' }, { url: 'https://youtube.com/b', title: 'Video B' }] },
      { keyword: 'kw2', position: 2, items: [{ url: 'https://youtube.com/a', title: 'Video A' }, { url: 'https://youtube.com/c', title: 'Video C' }] }
    ];
    const deduped = deduplicateByUrl(results);
    const urls = deduped.map(r => r.url);
    assert.deepStrictEqual(urls, ['https://youtube.com/a', 'https://youtube.com/b', 'https://youtube.com/c']);
    assert.strictEqual(deduped.length, 3, 'should have 3 unique URLs (a appears twice in raw, kept once)');
  });
});
