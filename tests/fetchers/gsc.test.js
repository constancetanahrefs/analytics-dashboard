// tests/fetchers/gsc.test.js
import 'dotenv/config';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, assertNumber, assertDateInRange, assertDiffers, warnEmpty } from '../setup.js';
import {
  fetchPerformanceHistory,
  fetchPages,
  fetchQuestionKeywords,
  fetchLongTailKeywords
} from '../../api/fetchers/gsc.js';

const WIDGET = 'gsc-test';

// ── p4 / p5: Performance History (impressions and clicks over time) ───────────
describe('p4-impressions-gsc / p5-clicks-organic: fetchPerformanceHistory', () => {
  it('default scenario — metrics array with date, impressions, clicks', async () => {
    const s = SCENARIOS.default;
    const data = await fetchPerformanceHistory({ date_from: s.dateFrom, date_to: s.dateTo }, WIDGET);
    assert.ok(Array.isArray(data.metrics), `metrics should be array, got ${JSON.stringify(Object.keys(data))}`);
    if (data.metrics.length === 0) { warnEmpty('p4/p5', 'default', 'metrics is empty'); return; }
    const first = data.metrics[0];
    assert.ok(typeof first.date === 'string', `metrics[0].date should be string`);
    assertNumber(first.impressions, 'metrics[0].impressions');
    assertNumber(first.clicks,      'metrics[0].clicks');
    assertNumber(first.ctr,         'metrics[0].ctr');
    assertNumber(first.position,    'metrics[0].position');
  });

  it('historical scenario — all dates fall within requested range', async () => {
    const s = SCENARIOS.historical;
    const data = await fetchPerformanceHistory({ date_from: s.dateFrom, date_to: s.dateTo }, WIDGET);
    if (!data.metrics?.length) { warnEmpty('p4/p5', 'historical', 'metrics is empty'); return; }
    for (const m of data.metrics) {
      assertDateInRange(m.date, s.dateFrom, s.dateTo, 'p4/p5 historical date');
    }
  });

  it('short scenario — dates fall within 7-day window', async () => {
    const s = SCENARIOS.short;
    const data = await fetchPerformanceHistory({ date_from: s.dateFrom, date_to: s.dateTo }, WIDGET);
    if (!data.metrics?.length) { warnEmpty('p4/p5', 'short', 'metrics is empty'); return; }
    for (const m of data.metrics) {
      assertDateInRange(m.date, s.dateFrom, s.dateTo, 'p4/p5 short date');
    }
  });

  it('historical scenario — data differs from default (dates are forwarded)', async () => {
    const def = SCENARIOS.default;
    const hist = SCENARIOS.historical;
    const [dataDefault, dataHist] = await Promise.all([
      fetchPerformanceHistory({ date_from: def.dateFrom, date_to: def.dateTo }, WIDGET),
      fetchPerformanceHistory({ date_from: hist.dateFrom, date_to: hist.dateTo }, WIDGET)
    ]);
    if (!dataDefault.metrics?.length || !dataHist.metrics?.length) {
      warnEmpty('p4/p5', 'historical-vs-default', 'one or both empty — skipping diff check');
      return;
    }
    assertDiffers(
      dataDefault.metrics.map(m => m.date),
      dataHist.metrics.map(m => m.date),
      'p4/p5 performance history dates should differ between default and historical'
    );
  });
});

// ── p5 / p9: Pages ───────────────────────────────────────────────────────────
describe('p5-clicks-organic / p9-organic-pages: fetchPages', () => {
  it('default scenario with order_by=clicks:desc — pages array with correct fields', async () => {
    const s = SCENARIOS.default;
    const data = await fetchPages({ date_from: s.dateFrom, date_to: s.dateTo, order_by: 'clicks:desc' }, WIDGET);
    assert.ok(Array.isArray(data.pages), `pages should be array, got ${JSON.stringify(Object.keys(data))}`);
    if (data.pages.length === 0) { warnEmpty('p5/p9', 'default clicks', 'pages is empty'); return; }
    const first = data.pages[0];
    const pageUrl = first.page || first.url;
    assert.ok(typeof pageUrl === 'string', `pages[0] should have page or url string field`);
    assertNumber(first.clicks,      'pages[0].clicks');
    assertNumber(first.impressions, 'pages[0].impressions');
  });

  it('default scenario — clicks are non-increasing (sorted correctly)', async () => {
    const s = SCENARIOS.default;
    const data = await fetchPages({ date_from: s.dateFrom, date_to: s.dateTo, order_by: 'clicks:desc' }, WIDGET);
    if (!data.pages?.length || data.pages.length < 2) return;
    for (let i = 1; i < data.pages.length; i++) {
      assert.ok(
        (data.pages[i - 1].clicks || 0) >= (data.pages[i].clicks || 0),
        `pages not sorted by clicks desc: pages[${i-1}].clicks=${data.pages[i-1].clicks} < pages[${i}].clicks=${data.pages[i].clicks}`
      );
    }
  });

  it('historical scenario — click totals differ from default (dates are forwarded)', async () => {
    const def = SCENARIOS.default;
    const hist = SCENARIOS.historical;
    const [dataDefault, dataHist] = await Promise.all([
      fetchPages({ date_from: def.dateFrom, date_to: def.dateTo, order_by: 'clicks:desc' }, WIDGET),
      fetchPages({ date_from: hist.dateFrom, date_to: hist.dateTo, order_by: 'clicks:desc' }, WIDGET)
    ]);
    if (!dataDefault.pages?.length || !dataHist.pages?.length) {
      warnEmpty('p5/p9', 'historical-vs-default', 'one or both pages arrays empty — skipping diff check');
      return;
    }
    // Compare total clicks across all pages — evergreen top pages may stay the same URL
    // but click volumes should differ across different date ranges
    const totalDefault = dataDefault.pages.reduce((s, p) => s + (p.clicks || 0), 0);
    const totalHist    = dataHist.pages.reduce((s, p) => s + (p.clicks || 0), 0);
    assertDiffers(
      totalDefault,
      totalHist,
      'p5/p9 total clicks should differ between default and historical — if identical, date_from/date_to may be ignored'
    );
  });
});

// ── o3: Question Keywords ─────────────────────────────────────────────────────
describe('o3-question-kw: fetchQuestionKeywords', () => {
  // iphrase_match matches the word anywhere in the keyword (not just at start),
  // so we test for word-boundary match anywhere in the string.
  const QUESTION_RE = /\b(who|what|why|where|how|when|which|is|are|can|does|do|should)\b/i;

  it('default scenario — all returned keywords contain a question word', async () => {
    const s = SCENARIOS.default;
    const data = await fetchQuestionKeywords({ date_from: s.dateFrom, date_to: s.dateTo }, WIDGET);
    assert.ok(Array.isArray(data.keywords), `keywords should be array`);
    if (data.keywords.length === 0) { warnEmpty('o3', 'default', 'keywords is empty'); return; }
    for (const kw of data.keywords) {
      assert.ok(
        QUESTION_RE.test(kw.keyword || ''),
        `o3: keyword '${kw.keyword}' does not contain a question word — server-side iphrase_match filter may have failed`
      );
    }
  });
});

// ── o4: Long-tail Keywords ────────────────────────────────────────────────────
describe('o4-longtail-kw: fetchLongTailKeywords', () => {
  it('default scenario — all returned keywords have 5 or more words', async () => {
    const s = SCENARIOS.default;
    const data = await fetchLongTailKeywords({ date_from: s.dateFrom, date_to: s.dateTo }, WIDGET);
    assert.ok(Array.isArray(data.keywords), `keywords should be array`);
    if (data.keywords.length === 0) { warnEmpty('o4', 'default', 'keywords is empty'); return; }
    for (const kw of data.keywords) {
      const wordCount = (kw.keyword || '').trim().split(/\s+/).length;
      assert.ok(
        wordCount >= 5,
        `o4: keyword '${kw.keyword}' has ${wordCount} words — client-side filter should have excluded it`
      );
    }
  });

  it('historical scenario — data differs from default (dates are forwarded)', async () => {
    const def = SCENARIOS.default;
    const hist = SCENARIOS.historical;
    const [dataDefault, dataHist] = await Promise.all([
      fetchLongTailKeywords({ date_from: def.dateFrom, date_to: def.dateTo }, WIDGET),
      fetchLongTailKeywords({ date_from: hist.dateFrom, date_to: hist.dateTo }, WIDGET)
    ]);
    if (!dataDefault.keywords?.length || !dataHist.keywords?.length) {
      warnEmpty('o4', 'historical-vs-default', 'one or both empty — skipping diff check');
      return;
    }
    assertDiffers(
      dataDefault.keywords.slice(0, 5).map(k => k.keyword),
      dataHist.keywords.slice(0, 5).map(k => k.keyword),
      'o4 top keywords should differ between default and historical — if identical, date_from may be ignored'
    );
  });
});
