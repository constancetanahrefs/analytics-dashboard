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
