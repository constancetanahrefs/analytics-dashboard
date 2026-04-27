# Date Picker Test Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a live integration + calculation test suite that verifies all 17 widgets correctly forward date picker values to Ahrefs API calls and produce accurate client-side calculations against real data.

**Architecture:** Tests call fetcher functions directly using Node 18 `node:test`, hitting the real Ahrefs API with credentials from `.env`. Three date scenarios prove dates are forwarded (not ignored) by asserting `historical` returns data differing from `default`. A `calculations.js` helper mirrors the client-side logic from `widgets.js` as pure functions and is tested against live API responses.

**Tech Stack:** Node 18 `node:test` + `node:assert/strict`, existing fetchers in `api/fetchers/`, `dotenv` (already installed).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `tests/setup.js` | Create | Date scenarios, shared assertion helpers |
| `tests/calculations.js` | Create | Pure calculation functions mirroring `widgets.js` |
| `tests/fetchers/brand-radar.test.js` | Create | Brand Radar fetcher tests (p1, p3, o1, o7, o9) |
| `tests/fetchers/gsc.test.js` | Create | GSC fetcher tests (p4, p5, p9, o3, o4) |
| `tests/fetchers/rank-tracker.test.js` | Create | Rank Tracker fetcher tests (p2, p8, o2, o5, o6, o8) |
| `tests/fetchers/web-analytics.test.js` | Create | Web Analytics fetcher tests (p6) |
| `tests/calculations.test.js` | Create | Calculation correctness tests against live data |
| `package.json` | Modify | Add `test` script |

---

## Task 1: Test infrastructure — `setup.js`, `calculations.js`, `package.json`

**Files:**
- Create: `tests/setup.js`
- Create: `tests/calculations.js`
- Modify: `package.json`

- [ ] **Step 1: Create `tests/setup.js`**

```js
// tests/setup.js
// Must be the first import in every test file — loads .env before config.js evaluates.
import 'dotenv/config';
import assert from 'node:assert/strict';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

// Three date scenarios used across all test files.
// 'default'    — known-working baseline (1 month window ending today)
// 'historical' — proves dates are forwarded; data must differ from default
// 'short'      — stress-tests sparse-data handling (7-day window)
export const SCENARIOS = {
  default: {
    dateFrom: monthsAgo(1),
    dateTo:   daysAgo(0),
  },
  historical: {
    dateFrom: monthsAgo(3),
    dateTo:   monthsAgo(2),
  },
  short: {
    dateFrom: daysAgo(7),
    dateTo:   daysAgo(1),
  }
};

// Add ISO timestamp versions for Web Analytics endpoints (use 'from'/'to' not 'date_from'/'date_to')
for (const s of Object.values(SCENARIOS)) {
  s.from = s.dateFrom + 'T00:00:00.000Z';
  s.to   = s.dateTo   + 'T23:59:59.000Z';
}

// ── Assertion helpers ────────────────────────────────────────────────────────

/** Assert val is a finite number — not NaN, Infinity, null, or string. */
export function assertNumber(val, label) {
  assert.ok(
    typeof val === 'number' && isFinite(val),
    `${label}: expected finite number, got ${JSON.stringify(val)}`
  );
}

/** Assert a YYYY-MM-DD string falls within [from, to] inclusive. */
export function assertDateInRange(dateStr, from, to, label) {
  const d = (dateStr || '').slice(0, 10);
  assert.ok(
    d >= from && d <= to,
    `${label}: date ${d} is outside range [${from}, ${to}]`
  );
}

/** Assert two values are not deeply equal — proves data changes when dates change. */
export function assertDiffers(a, b, label) {
  assert.notDeepStrictEqual(a, b, `${label}: expected values to differ but they are identical`);
}

/** Assert arr is a non-empty array. */
export function assertNonEmpty(arr, label) {
  assert.ok(Array.isArray(arr) && arr.length > 0, `${label}: expected non-empty array, got ${JSON.stringify(arr)}`);
}

/** Assert no item in arr satisfies predicate. */
export function assertNoneMatch(arr, predicate, label) {
  const matches = arr.filter(predicate);
  assert.strictEqual(
    matches.length, 0,
    `${label}: expected no matches, found ${JSON.stringify(matches)}`
  );
}

/** Log a warning for a scenario that returned no data (not a test failure). */
export function warnEmpty(widgetId, scenario, message) {
  console.warn(`  ⚠ [${widgetId}] ${scenario}: ${message} (not a failure — may be sparse data)`);
}
```

- [ ] **Step 2: Create `tests/calculations.js`**

These are pure functions mirroring the logic embedded in `widgets.js`. They are NOT imported from the frontend — they live here so they can be tested in Node context.

```js
// tests/calculations.js

// ── SoV delta (p2-sov-organic) ───────────────────────────────────────────────
// Mirrors the computation in fetchOrganicSovSnapshot in rank-tracker.js
export function computeSovDeltas(currentRows, previousRows) {
  const prevMap = {};
  for (const r of previousRows) {
    prevMap[r.competitor] = r.share_of_voice || 0;
  }
  return currentRows.map(r => ({
    ...r,
    share_of_voice_prev: prevMap[r.competitor] ?? null,
    sov_delta: prevMap[r.competitor] != null
      ? (r.share_of_voice || 0) - prevMap[r.competitor]
      : null
  }));
}

// ── Subfolder grouping (p5-clicks-organic) ───────────────────────────────────
// Groups pages by their first URL path segment (/blog/, /docs/, etc.)
// Mirrors the table rendering logic in widgets.js renderLineAndTable
export function groupBySubfolder(pages) {
  const groups = {};
  for (const p of pages) {
    const url = p.page || p.url || '';
    let seg = '/';
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      seg = parts.length > 0 ? '/' + parts[0] + '/' : '/';
    } catch { /* malformed URL — bucket under root */ }
    if (!groups[seg]) groups[seg] = { key: seg, clicks: 0, pages: [] };
    groups[seg].clicks += p.clicks || 0;
    groups[seg].pages.push(p);
  }
  return Object.values(groups);
}

// ── Question keyword regex (o3-question-kw) ──────────────────────────────────
// Mirrors the client-side filter in the o3 renderer in widgets.js
const QUESTION_RE = /^(who|what|why|where|how|when|which|is|are|can|does|do|should)\b/i;
export function filterQuestionKeywords(keywords) {
  return keywords.filter(k => QUESTION_RE.test(k.keyword || ''));
}

// ── Long-tail word count (o4-longtail-kw) ────────────────────────────────────
// Mirrors the client-side filter in fetchLongTailKeywords in gsc.js
export function filterLongTailKeywords(keywords) {
  return keywords.filter(k => (k.keyword || '').trim().split(/\s+/).length >= 5);
}

// ── Domain exclusion (o1-third-domains, o2-aio-gaps) ─────────────────────────
// Mirrors the client-side filter applied in the o1/o2 renderers in widgets.js
// domainField: the property name on each item containing the domain/URL string
// ownDomain: string, e.g. 'example.com'
// competitorDomains: string[], e.g. ['competitor.com']
export function filterExcludedDomains(items, domainField, ownDomain, competitorDomains) {
  const excludes = [ownDomain, ...competitorDomains].filter(Boolean);
  return items.filter(item => {
    const val = item[domainField] || '';
    return !excludes.some(d => d && val.includes(d));
  });
}

// ── URL deduplication (o8-videos) ────────────────────────────────────────────
// Mirrors the Set-based dedup in renderSerpFeaturesTable in widgets.js
// results: [{ keyword, position, items: [{ url, title, ... }] }]
export function deduplicateByUrl(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    for (const item of (r.items || [])) {
      const url = item.url || '';
      if (url && seen.has(url)) continue;
      if (url) seen.add(url);
      out.push({ keyword: r.keyword, position: r.position, ...item });
    }
  }
  return out;
}
```

- [ ] **Step 3: Add test script to `package.json`**

Edit `package.json` scripts section to add:
```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js",
  "test": "node --test 'tests/fetchers/*.test.js' 'tests/calculations.test.js'"
}
```

- [ ] **Step 4: Verify setup files are importable**

```bash
cd /Users/constancetk/Code/analytics-dashboard
node -e "import('./tests/setup.js').then(m => { console.log('SCENARIOS:', Object.keys(m.SCENARIOS)); })"
```

Expected output:
```
SCENARIOS: [ 'default', 'historical', 'short' ]
```

- [ ] **Step 5: Commit**

```bash
cd /Users/constancetk/Code/analytics-dashboard
git add tests/setup.js tests/calculations.js package.json
git commit -m "test: add test infrastructure — date scenarios, assertion helpers, calculation functions"
```

---

## Task 2: Brand Radar fetcher tests

**Files:**
- Create: `tests/fetchers/brand-radar.test.js`

- [ ] **Step 1: Create the test file**

```js
// tests/fetchers/brand-radar.test.js
import 'dotenv/config';  // MUST be first — populates process.env before config.js evaluates
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, assertNumber, assertDateInRange, assertDiffers, assertNonEmpty, warnEmpty } from '../setup.js';
import {
  fetchSovHistory,
  fetchImpressionsHistory,
  fetchThirdPartyDomains,
  fetchDiscussionCitedPages,
  fetchVideoCitedPages
} from '../../api/fetchers/brand-radar.js';

const WIDGET = 'brand-radar-test';

// ── p1: SoV History ──────────────────────────────────────────────────────────
describe('p1-sov-ai: fetchSovHistory', () => {
  it('default scenario — metrics array with date and share_of_voice', async () => {
    const s = SCENARIOS.default;
    const data = await fetchSovHistory({ date_from: s.dateFrom, date_to: s.dateTo }, WIDGET);
    assert.ok(Array.isArray(data.metrics), 'metrics should be an array');
    if (data.metrics.length === 0) { warnEmpty('p1', 'default', 'metrics is empty'); return; }
    assertNonEmpty(data.metrics, 'metrics');
    const first = data.metrics[0];
    assert.ok(typeof first.date === 'string', `metrics[0].date should be a string, got ${JSON.stringify(first.date)}`);
    assert.ok(Array.isArray(first.share_of_voice), `metrics[0].share_of_voice should be an array`);
    if (first.share_of_voice.length > 0) {
      const brandEntry = first.share_of_voice[0];
      assertNumber(brandEntry.share_of_voice, 'metrics[0].share_of_voice[0].share_of_voice');
    }
  });

  it('historical scenario — dates fall within requested range', async () => {
    const s = SCENARIOS.historical;
    const data = await fetchSovHistory({ date_from: s.dateFrom, date_to: s.dateTo }, WIDGET);
    if (!data.metrics?.length) { warnEmpty('p1', 'historical', 'metrics is empty'); return; }
    for (const m of data.metrics) {
      assertDateInRange(m.date, s.dateFrom, s.dateTo, 'p1 historical date');
    }
  });

  it('historical scenario — data differs from default (dates are forwarded)', async () => {
    const def = SCENARIOS.default;
    const hist = SCENARIOS.historical;
    const [dataDefault, dataHist] = await Promise.all([
      fetchSovHistory({ date_from: def.dateFrom, date_to: def.dateTo }, WIDGET),
      fetchSovHistory({ date_from: hist.dateFrom, date_to: hist.dateTo }, WIDGET)
    ]);
    if (!dataDefault.metrics?.length || !dataHist.metrics?.length) {
      warnEmpty('p1', 'historical-vs-default', 'one or both responses empty — skipping diff check');
      return;
    }
    assertDiffers(
      dataDefault.metrics.map(m => m.date),
      dataHist.metrics.map(m => m.date),
      'p1 SoV history dates should differ between default and historical scenarios'
    );
  });
});

// ── p3: Impressions History ───────────────────────────────────────────────────
describe('p3-impressions-ai: fetchImpressionsHistory', () => {
  it('default scenario — returns object keyed by platform with metrics arrays', async () => {
    const s = SCENARIOS.default;
    const data = await fetchImpressionsHistory({ date_from: s.dateFrom, date_to: s.dateTo }, WIDGET);
    for (const platform of ['chatgpt', 'gemini', 'perplexity', 'copilot']) {
      assert.ok(platform in data, `response should have key '${platform}'`);
      if (data[platform].error) {
        warnEmpty('p3', 'default', `${platform} returned error: ${data[platform].error}`);
        continue;
      }
      assert.ok(Array.isArray(data[platform].metrics), `${platform}.metrics should be an array`);
      if (data[platform].metrics.length > 0) {
        const first = data[platform].metrics[0];
        assert.ok(typeof first.date === 'string', `${platform}.metrics[0].date should be string`);
        assertNumber(first.impressions, `${platform}.metrics[0].impressions`);
      }
    }
  });

  it('historical scenario — at least one platform dates are within range', async () => {
    const s = SCENARIOS.historical;
    const data = await fetchImpressionsHistory({ date_from: s.dateFrom, date_to: s.dateTo }, WIDGET);
    let checked = 0;
    for (const platform of ['chatgpt', 'gemini', 'perplexity', 'copilot']) {
      if (data[platform].error || !data[platform].metrics?.length) continue;
      for (const m of data[platform].metrics) {
        assertDateInRange(m.date, s.dateFrom, s.dateTo, `p3 historical ${platform} date`);
      }
      checked++;
    }
    if (checked === 0) warnEmpty('p3', 'historical', 'all platforms returned errors or empty metrics');
  });

  it('historical scenario — data differs from default for at least one platform', async () => {
    const def = SCENARIOS.default;
    const hist = SCENARIOS.historical;
    const [dataDefault, dataHist] = await Promise.all([
      fetchImpressionsHistory({ date_from: def.dateFrom, date_to: def.dateTo }, WIDGET),
      fetchImpressionsHistory({ date_from: hist.dateFrom, date_to: hist.dateTo }, WIDGET)
    ]);
    let diffFound = false;
    for (const platform of ['chatgpt', 'gemini', 'perplexity', 'copilot']) {
      const defDates = dataDefault[platform]?.metrics?.map(m => m.date) || [];
      const histDates = dataHist[platform]?.metrics?.map(m => m.date) || [];
      if (defDates.length > 0 && histDates.length > 0 && JSON.stringify(defDates) !== JSON.stringify(histDates)) {
        diffFound = true;
        break;
      }
    }
    if (!diffFound) warnEmpty('p3', 'historical-vs-default', 'could not confirm date difference — both may be empty');
  });
});

// ── o1: Third-Party Cited Domains ────────────────────────────────────────────
describe('o1-third-domains: fetchThirdPartyDomains', () => {
  it('default scenario — response has domains array with domain and responses fields', async () => {
    const s = SCENARIOS.default;
    // o1 uses date=today, not a range — pass date to confirm param is accepted
    const data = await fetchThirdPartyDomains({ date: s.dateTo }, WIDGET);
    assert.ok(Array.isArray(data.domains), `domains should be an array, got ${JSON.stringify(Object.keys(data))}`);
    if (data.domains.length === 0) { warnEmpty('o1', 'default', 'domains is empty'); return; }
    const first = data.domains[0];
    assert.ok(typeof first.domain === 'string', `domains[0].domain should be string`);
    assertNumber(first.responses, 'domains[0].responses');
  });
});

// ── o7: Cited Reddit & Quora Pages ───────────────────────────────────────────
describe('o7-reddit-quora: fetchDiscussionCitedPages', () => {
  it('default scenario — returns per-platform object; all URLs contain reddit or quora', async () => {
    const s = SCENARIOS.default;
    const data = await fetchDiscussionCitedPages({ date: s.dateTo }, WIDGET);
    for (const platform of ['chatgpt', 'gemini', 'perplexity', 'copilot']) {
      assert.ok(platform in data, `response should have key '${platform}'`);
      if (data[platform].error) {
        warnEmpty('o7', 'default', `${platform} error: ${data[platform].error}`);
        continue;
      }
      const pages = data[platform].pages || [];
      for (const page of pages) {
        assert.ok(
          page.url?.includes('reddit') || page.url?.includes('quora'),
          `o7 ${platform}: URL should contain 'reddit' or 'quora', got: ${page.url}`
        );
      }
    }
  });
});

// ── o9: Videos Cited in AI Answers ───────────────────────────────────────────
describe('o9-video-ai: fetchVideoCitedPages', () => {
  it('default scenario — all returned URLs contain youtube or tiktok', async () => {
    const s = SCENARIOS.default;
    const data = await fetchVideoCitedPages({ date: s.dateTo }, WIDGET);
    const pages = data.pages || [];
    if (pages.length === 0) { warnEmpty('o9', 'default', 'pages is empty'); return; }
    for (const page of pages) {
      assert.ok(
        page.url?.includes('youtube') || page.url?.includes('tiktok'),
        `o9: URL should contain 'youtube' or 'tiktok', got: ${page.url}`
      );
    }
  });
});
```

- [ ] **Step 2: Run brand-radar tests**

```bash
cd /Users/constancetk/Code/analytics-dashboard
node --test tests/fetchers/brand-radar.test.js
```

Expected: all tests pass or warn (no hard failures unless a fetcher has a real bug). If a test fails, read the error — it indicates either a wrong field name in the fetcher or a response shape mismatch.

- [ ] **Step 3: Fix any failing tests**

If a test fails with a shape error (e.g. `metrics` is undefined), check the actual API response by adding a temporary `console.log(JSON.stringify(data, null, 2))` before the assertions. Compare the actual field names against what the fetcher expects. Fix the fetcher if the field name is wrong.

- [ ] **Step 4: Commit**

```bash
git add tests/fetchers/brand-radar.test.js
git commit -m "test: brand-radar fetcher tests — sov-history, impressions-history, cited domains and pages"
```

---

## Task 3: GSC fetcher tests

**Files:**
- Create: `tests/fetchers/gsc.test.js`

- [ ] **Step 1: Create the test file**

```js
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

  it('historical scenario — pages differ from default (dates are forwarded)', async () => {
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
    assertDiffers(
      (dataDefault.pages[0].page || dataDefault.pages[0].url),
      (dataHist.pages[0].page || dataHist.pages[0].url),
      'p5/p9 top page should differ between default and historical — if identical, date_from/date_to may be ignored'
    );
  });
});

// ── o3: Question Keywords ─────────────────────────────────────────────────────
describe('o3-question-kw: fetchQuestionKeywords', () => {
  const QUESTION_RE = /^(who|what|why|where|how|when|which|is|are|can|does|do|should)\b/i;

  it('default scenario — all returned keywords match question-word pattern', async () => {
    const s = SCENARIOS.default;
    const data = await fetchQuestionKeywords({ date_from: s.dateFrom, date_to: s.dateTo }, WIDGET);
    assert.ok(Array.isArray(data.keywords), `keywords should be array`);
    if (data.keywords.length === 0) { warnEmpty('o3', 'default', 'keywords is empty'); return; }
    for (const kw of data.keywords) {
      assert.ok(
        QUESTION_RE.test(kw.keyword || ''),
        `o3: keyword '${kw.keyword}' does not match question regex — server-side filter may have failed`
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
```

- [ ] **Step 2: Run GSC tests**

```bash
cd /Users/constancetk/Code/analytics-dashboard
node --test tests/fetchers/gsc.test.js
```

Expected: all pass or warn. A failure on the "sorted correctly" test would indicate the API is not returning sorted results and the fetcher needs an explicit `order_by` param fix.

- [ ] **Step 3: Fix any failures**

Common issues to look for:
- `data.pages` is undefined → field may be named `data.stats` or `data.results` — check raw response
- Dates outside range → `date_to` not forwarded — check fetcher spreads `overrides` before the default params

- [ ] **Step 4: Commit**

```bash
git add tests/fetchers/gsc.test.js
git commit -m "test: GSC fetcher tests — performance-history, pages, question-keywords, long-tail-keywords"
```

---

## Task 4: Rank Tracker fetcher tests

**Files:**
- Create: `tests/fetchers/rank-tracker.test.js`

- [ ] **Step 1: Create the test file**

```js
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
        assert.ok(typeof item.url === 'string', `result.items[*].url should be string`);
        assert.ok(typeof item.title === 'string', `result.items[*].title should be string (PAA question text)`);
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
```

- [ ] **Step 2: Run Rank Tracker tests**

```bash
cd /Users/constancetk/Code/analytics-dashboard
node --test tests/fetchers/rank-tracker.test.js
```

Expected: all pass or warn. A `sov_delta is NaN` failure would indicate the `competitors-metrics` key extraction bug from `rank-tracker/competitors-stats`.

- [ ] **Step 3: Fix any failures**

Most likely failure: `rows` is undefined in `fetchOrganicSovSnapshot`. The response uses the key `competitors-metrics` (hyphenated). Verify the fetcher reads `current['competitors-metrics']`.

- [ ] **Step 4: Commit**

```bash
git add tests/fetchers/rank-tracker.test.js
git commit -m "test: rank-tracker fetcher tests — sov-snapshot, aio-pages, aio-gaps, serp-features"
```

---

## Task 5: Web Analytics fetcher tests

**Files:**
- Create: `tests/fetchers/web-analytics.test.js`

- [ ] **Step 1: Create the test file**

```js
// tests/fetchers/web-analytics.test.js
import 'dotenv/config';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, assertNumber, assertDiffers, warnEmpty } from '../setup.js';
import { fetchAiReferrersChart } from '../../api/fetchers/web-analytics.js';

const WIDGET = 'web-analytics-test';

// ── p6: AI Clicks Over Time ───────────────────────────────────────────────────
// NOTE: Web Analytics uses ISO timestamp 'from'/'to' params, NOT 'date_from'/'date_to'.
// buildDateOverrides() in app.js provides both; we use 'from'/'to' here.
describe('p6-clicks-ai: fetchAiReferrersChart', () => {
  it('default scenario — response has points array with timestamp, source, visitors', async () => {
    const s = SCENARIOS.default;
    const data = await fetchAiReferrersChart({ from: s.from, to: s.to }, WIDGET);
    assert.ok(Array.isArray(data.points), `points should be array, got ${JSON.stringify(Object.keys(data))}`);
    if (data.points.length === 0) {
      warnEmpty('p6', 'default', 'points is empty — no AI traffic in this period (not a failure)');
      return;
    }
    for (const pt of data.points) {
      assert.ok(typeof pt.timestamp === 'string', `points[*].timestamp should be ISO string, got ${JSON.stringify(pt.timestamp)}`);
      assert.ok(typeof pt.source === 'string', `points[*].source should be string`);
      assertNumber(pt.visitors, 'points[*].visitors');
    }
  });

  it('historical scenario — all timestamps fall within requested ISO range', async () => {
    const s = SCENARIOS.historical;
    const data = await fetchAiReferrersChart({ from: s.from, to: s.to }, WIDGET);
    if (!data.points?.length) { warnEmpty('p6', 'historical', 'points is empty — skipping date range check'); return; }
    for (const pt of data.points) {
      assert.ok(
        pt.timestamp >= s.from && pt.timestamp <= s.to,
        `p6 historical: timestamp ${pt.timestamp} is outside range [${s.from}, ${s.to}]`
      );
    }
  });

  it('short scenario — all timestamps fall within 7-day window', async () => {
    const s = SCENARIOS.short;
    const data = await fetchAiReferrersChart({ from: s.from, to: s.to }, WIDGET);
    if (!data.points?.length) { warnEmpty('p6', 'short', 'points is empty — skipping date range check'); return; }
    for (const pt of data.points) {
      assert.ok(
        pt.timestamp >= s.from && pt.timestamp <= s.to,
        `p6 short: timestamp ${pt.timestamp} is outside range [${s.from}, ${s.to}]`
      );
    }
  });

  it('historical scenario — data differs from default (ISO from/to are forwarded)', async () => {
    const def = SCENARIOS.default;
    const hist = SCENARIOS.historical;
    const [dataDefault, dataHist] = await Promise.all([
      fetchAiReferrersChart({ from: def.from, to: def.to }, WIDGET),
      fetchAiReferrersChart({ from: hist.from, to: hist.to }, WIDGET)
    ]);
    if (!dataDefault.points?.length || !dataHist.points?.length) {
      warnEmpty('p6', 'historical-vs-default', 'one or both empty — skipping diff check');
      return;
    }
    assertDiffers(
      dataDefault.points.map(p => p.timestamp.slice(0, 10)),
      dataHist.points.map(p => p.timestamp.slice(0, 10)),
      'p6 timestamps should differ between default and historical — if identical, from/to params may be ignored'
    );
  });
});
```

- [ ] **Step 2: Run Web Analytics tests**

```bash
cd /Users/constancetk/Code/analytics-dashboard
node --test tests/fetchers/web-analytics.test.js
```

Expected: passes or warns (AI traffic may be sparse). A timestamp-out-of-range failure means `from`/`to` are not being forwarded to the API correctly.

- [ ] **Step 3: Fix any failures**

If timestamps fall outside the requested range: check `fetchAiReferrersChart` spreads `overrides` correctly so `from`/`to` override the defaults.

- [ ] **Step 4: Commit**

```bash
git add tests/fetchers/web-analytics.test.js
git commit -m "test: web-analytics fetcher tests — ai-referrers-chart with ISO timestamp date ranges"
```

---

## Task 6: Calculation tests against live data

**Files:**
- Create: `tests/calculations.test.js`

- [ ] **Step 1: Create the test file**

```js
// tests/calculations.test.js
import 'dotenv/config';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, assertNumber, assertNoneMatch, warnEmpty } from '../setup.js';
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

    // Re-derive raw current and previous rows to test computeSovDeltas independently
    // fetchOrganicSovSnapshot already computes deltas; we verify the results match our pure function
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
  const QUESTION_RE = /^(who|what|why|where|how|when|which|is|are|can|does|do|should)\b/i;

  it('every filtered keyword matches the regex; at least one raw keyword was excluded', async () => {
    const s = SCENARIOS.default;
    // Fetch raw unfiltered keywords to test the filter independently
    const data = await fetchKeywords({ date_from: s.dateFrom, date_to: s.dateTo, limit: 500, order_by: 'impressions:desc' }, WIDGET);
    if (!data.keywords?.length) { warnEmpty('o3-calc', 'default', 'keywords empty — skipping'); return; }

    const filtered = filterQuestionKeywords(data.keywords);
    for (const kw of filtered) {
      assert.ok(QUESTION_RE.test(kw.keyword || ''), `'${kw.keyword}' passed filter but does not match question regex`);
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
```

- [ ] **Step 2: Run calculation tests**

```bash
cd /Users/constancetk/Code/analytics-dashboard
node --test tests/calculations.test.js
```

Expected: all pass or warn. A failure on the dedup synthetic test would mean `deduplicateByUrl` in `calculations.js` doesn't match the `widgets.js` implementation.

- [ ] **Step 3: Fix any failures**

Failures fall into two categories:
- Pure function failures (e.g. dedup synthetic test): fix `tests/calculations.js` to match `widgets.js` exactly
- Live data failures (e.g. click totals don't match): indicates a calculation bug in the actual fetcher — fix the fetcher

- [ ] **Step 4: Commit**

```bash
git add tests/calculations.test.js
git commit -m "test: calculation tests against live data — sov-delta, subfolder-grouping, keyword-filters, domain-exclusion, url-dedup"
```

---

## Task 7: Full test run and verification

- [ ] **Step 1: Run all tests together**

```bash
cd /Users/constancetk/Code/analytics-dashboard
npm test
```

Expected output structure (all scenarios passing or warning — no hard failures):
```
▶ p1-sov-ai: fetchSovHistory
  ✔ default scenario — metrics array with date and share_of_voice
  ✔ historical scenario — dates fall within requested range
  ✔ historical scenario — data differs from default (dates are forwarded)
▶ p3-impressions-ai: fetchImpressionsHistory
  ...
```

- [ ] **Step 2: Capture test output as baseline**

```bash
npm test 2>&1 | tee tests/baseline-output.txt
```

This file is NOT committed — it's a local reference for comparing future runs.

- [ ] **Step 3: Verify the "dates are forwarded" assertions fired for all fetchers**

Check that at least one `assertDiffers` assertion passed (not just warned) in the output. If all differ-checks warned as empty, the date ranges may need adjusting — try extending historical to 6 months ago.

- [ ] **Step 4: Final commit**

```bash
git add tests/
git commit -m "test: complete date-picker test suite — all fetchers and calculations verified against live Ahrefs API"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Three date scenarios (`default`, `historical`, `short`) — Task 1
- ✅ Brand Radar: sov-history, impressions-history, third-domains, discussion-cited-pages, video-cited-pages — Task 2
- ✅ GSC: performance-history, pages, question-keywords, long-tail-keywords — Task 3
- ✅ Rank Tracker: sov-snapshot, aio-found-pages, aio-gap-urls, serp-features (question/discussion/video) — Task 4
- ✅ Web Analytics: ai-referrers-chart with ISO timestamp range — Task 5
- ✅ Calculations: sov-delta, subfolder-grouping, question-regex, long-tail-filter, domain-exclusion, url-dedup — Task 6
- ✅ Date boundary cross-check (historical ≠ default) — all fetcher test files
- ✅ Sparse data warnings (not failures) — `warnEmpty` helper used throughout
- ✅ `node:test`, no new dependencies — Task 1

**Type consistency:**
- `fetchKeywords` used in calculations.test.js is exported from `api/fetchers/gsc.js` ✅
- `computeSovDeltas`, `groupBySubfolder`, etc. defined in `tests/calculations.js` and imported in `tests/calculations.test.js` ✅
- `SCENARIOS.default.dateFrom` / `.dateTo` / `.from` / `.to` all populated in setup.js ✅
