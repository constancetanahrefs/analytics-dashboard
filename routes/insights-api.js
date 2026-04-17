import { Router } from 'express';
import {
  getAllInsightsWidgets, getInsightsWidget,
  setInsightsWidgetStar, setInsightsWidgetParams,
  getInsightsCached, setInsightsCache,
  getAllSettings, safeParseJson
} from '../db/db.js';
import { getInsightsFetcher, getInsightsWidgetMeta } from '../api/insights-registry.js';

const router = Router();

// ── Widget list ──────────────────────────────────────────────────────────────
router.get('/widgets', (req, res) => {
  res.json(getAllInsightsWidgets());
});

// ── Global settings ───────────────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  const settings = getAllSettings();
  if (settings.ahrefs_api_key) settings.ahrefs_api_key = '[set]';
  res.json(settings);
});

// ── Data fetch (cached) ───────────────────────────────────────────────────────
router.get('/data/:widgetId', (req, res) => {
  const cached = getInsightsCached(req.params.widgetId);
  if (cached) {
    return res.json({ data: safeParseJson(cached.data), fetched_at: cached.fetched_at, cached: true });
  }
  res.status(404).json({ error: 'No cached data — use POST /refresh to load.' });
});

// ── Data refresh (force fetch) ────────────────────────────────────────────────
router.post('/data/:widgetId/refresh', async (req, res) => {
  const { widgetId } = req.params;
  const fetcher = getInsightsFetcher(widgetId);
  if (!fetcher) return res.status(404).json({ error: `Unknown widget: ${widgetId}` });

  const dbWidget = getInsightsWidget(widgetId);
  const storedParams = safeParseJson(dbWidget?.params);
  const dateOverrides = req.body?.date_overrides || {};
  const merged = { ...storedParams, ...dateOverrides };

  try {
    const data = await fetcher(merged, widgetId);
    const hasDateOverrides = Object.keys(dateOverrides).length > 0;
    if (!hasDateOverrides) {
      setInsightsCache(widgetId, data);
    }
    const cachedRow = getInsightsCached(widgetId);
    res.json({
      data,
      fetched_at: cachedRow?.fetched_at || new Date().toISOString(),
      cached: false
    });
  } catch (err) {
    res.status(502).json({
      error: err.message || 'Fetch failed',
      httpCode: err.httpCode || null,
      isTimeout: err.isTimeout || false
    });
  }
});

// ── Star toggle ───────────────────────────────────────────────────────────────
router.post('/widgets/:id/star', (req, res) => {
  const w = getInsightsWidget(req.params.id);
  if (!w) return res.status(404).json({ error: 'Widget not found' });
  const newVal = w.starred ? 0 : 1;
  setInsightsWidgetStar(req.params.id, newVal);
  res.json({ starred: !!newVal });
});

// ── Per-widget param overrides ────────────────────────────────────────────────
router.put('/settings/widgets/:id', (req, res) => {
  const w = getInsightsWidget(req.params.id);
  if (!w) return res.status(404).json({ error: 'Widget not found' });
  const existing = safeParseJson(w.params);
  const merged = { ...existing, ...req.body };
  setInsightsWidgetParams(req.params.id, merged);
  res.json({ ok: true, params: merged });
});

export default router;
