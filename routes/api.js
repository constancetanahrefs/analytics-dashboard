import { Router } from 'express';
import {
  getAllWidgets, getWidget, getCached, setCache,
  updateWidgetPin, updateWidgetPause, updateWidgetHidden, updateWidgetParams, getSyncState,
  safeParseJson
} from '../db/db.js';
import { getFetcher } from '../api/widgets-registry.js';
import { runSync, resumeSync } from '../scheduler/cron.js';

const router = Router();

// ── Widget list ─────────────────────────────────────────────────────────────

router.get('/widgets', (req, res) => {
  res.json(getAllWidgets());
});

// ── Widget data (cached) ────────────────────────────────────────────────────

router.get('/data/:widgetId', async (req, res) => {
  const { widgetId } = req.params;
  const widget = getWidget(widgetId);
  if (!widget) return res.status(404).json({ error: 'Widget not found' });

  const cached = getCached(widgetId);
  if (cached) {
    return res.json({ cached: true, fetched_at: cached.fetched_at, data: safeParseJson(cached.data) });
  }

  const fetcher = getFetcher(widgetId);
  if (!fetcher) return res.status(404).json({ error: 'No fetcher for this widget' });

  try {
    const overrides = safeParseJson(widget.params);
    const data = await fetcher(overrides, widgetId);
    setCache(widgetId, data);
    res.json({ cached: false, fetched_at: new Date().toISOString(), data });
  } catch (err) {
    res.status(err.httpCode || 500).json({
      error: err.message,
      isTimeout: err.isTimeout || false,
      httpCode: err.httpCode || null
    });
  }
});

// ── Widget refresh (force fresh fetch) ─────────────────────────────────────
// Accepts optional { date_overrides } in request body.
// When date_overrides are present the result is NOT written to cache
// (it's a temporary date-filtered view, not the canonical snapshot).

router.post('/data/:widgetId/refresh', async (req, res) => {
  const { widgetId } = req.params;
  const widget = getWidget(widgetId);
  if (!widget) return res.status(404).json({ error: 'Widget not found' });

  const fetcher = getFetcher(widgetId);
  if (!fetcher) return res.status(404).json({ error: 'No fetcher for this widget' });

  const dateOverrides = req.body?.date_overrides || null;

  try {
    const storedParams = safeParseJson(widget.params);
    const overrides = dateOverrides
      ? { ...storedParams, ...dateOverrides }
      : storedParams;

    const data = await fetcher(overrides, widgetId);

    // Only persist to cache when not using a custom date range
    if (!dateOverrides) setCache(widgetId, data);

    res.json({ fetched_at: new Date().toISOString(), data });
  } catch (err) {
    res.status(err.httpCode || 500).json({
      error: err.message,
      isTimeout: err.isTimeout || false,
      httpCode: err.httpCode || null
    });
  }
});

// ── Widget controls ─────────────────────────────────────────────────────────

router.post('/widgets/:id/pin', (req, res) => {
  const widget = getWidget(req.params.id);
  if (!widget) return res.status(404).json({ error: 'Widget not found' });
  updateWidgetPin(req.params.id, !widget.pinned);
  res.json({ pinned: !widget.pinned });
});

router.post('/widgets/:id/pause', (req, res) => {
  const widget = getWidget(req.params.id);
  if (!widget) return res.status(404).json({ error: 'Widget not found' });
  updateWidgetPause(req.params.id, !widget.paused);
  res.json({ paused: !widget.paused });
});

router.post('/widgets/:id/hide', (req, res) => {
  const widget = getWidget(req.params.id);
  if (!widget) return res.status(404).json({ error: 'Widget not found' });
  updateWidgetHidden(req.params.id, !widget.hidden);
  res.json({ hidden: !widget.hidden });
});

router.put('/widgets/:id/params', (req, res) => {
  const widget = getWidget(req.params.id);
  if (!widget) return res.status(404).json({ error: 'Widget not found' });
  const existing = safeParseJson(widget.params);
  const merged = { ...existing, ...req.body };
  updateWidgetParams(req.params.id, merged);
  res.json({ params: merged });
});

// ── Sync controls ───────────────────────────────────────────────────────────

router.post('/sync/run', async (req, res) => {
  const state = getSyncState();
  if (state.in_progress) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }
  res.json({ started: true });
  // Run in background; client polls /api/sync/status
  runSync().catch(() => {});
});

router.post('/sync/resume', async (req, res) => {
  const state = getSyncState();
  if (state.in_progress) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }
  res.json({ resumed: true });
  resumeSync().catch(() => {});
});

router.get('/sync/status', (req, res) => {
  res.json(getSyncState());
});

export default router;
