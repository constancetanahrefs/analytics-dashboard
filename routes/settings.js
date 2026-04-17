import { Router } from 'express';
import { getAllSettings, setSetting, getAllWidgets, updateWidgetParams, getWidget, safeParseJson } from '../db/db.js';
import { restartCron } from '../scheduler/cron.js';
import cron from 'node-cron';

const router = Router();

// ── Global settings ─────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const settings = getAllSettings();
  if (settings.ahrefs_api_key) settings.ahrefs_api_key = '[set]';
  const widgets = getAllWidgets();
  res.json({ settings, widgets });
});

router.post('/', (req, res) => {
  // Validate cron expression before persisting
  if ('cron_schedule' in req.body && !cron.validate(req.body.cron_schedule)) {
    return res.status(400).json({ error: `Invalid cron expression: "${req.body.cron_schedule}"` });
  }

  const allowed = [
    'default_project_id', 'default_report_id', 'default_domain',
    'default_brand_name', 'default_country', 'default_competitors_domains',
    'cron_schedule', 'timeout_ms'
  ];
  for (const key of allowed) {
    if (key in req.body) setSetting(key, req.body[key]);
  }
  // Also allow setting ahrefs_api_key if explicitly provided
  if ('ahrefs_api_key' in req.body) {
    setSetting('ahrefs_api_key', req.body.ahrefs_api_key);
  }
  if ('cron_schedule' in req.body) {
    restartCron(req.body.cron_schedule);
  }
  const saved = getAllSettings();
  if (saved.ahrefs_api_key) saved.ahrefs_api_key = '[set]';
  res.json({ ok: true, settings: saved });
});

// ── Per-widget param overrides ──────────────────────────────────────────────

router.put('/widgets/:id', (req, res) => {
  const widget = getWidget(req.params.id);
  if (!widget) return res.status(404).json({ error: 'Widget not found' });
  const existing = safeParseJson(widget.params);
  const merged = { ...existing, ...req.body };
  updateWidgetParams(req.params.id, merged);
  res.json({ ok: true, params: merged });
});

export default router;
