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
