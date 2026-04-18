import { Router } from 'express';
import { getAllWidgets, updateWidgetParams, getWidget, safeParseJson } from '../db/db.js';
import { config } from '../config.js';

const router = Router();

// ── Global settings (read-only — sourced from .env) ─────────────────────────

router.get('/', (req, res) => {
  const settings = {
    default_project_id:                config.defaultProjectId,
    default_web_analytics_project_id:  config.defaultWebAnalyticsProjectId,
    default_report_id:                 config.defaultReportId,
    default_domain:              config.defaultDomain,
    default_brand_name:          config.defaultBrandName,
    default_country:             config.defaultCountry,
    default_competitors_domains: config.defaultCompetitorDomains.join(','),
    cron_schedule:               config.cronSchedule,
    timeout_ms:                  String(config.timeoutMs),
    ahrefs_api_key:              config.ahrefsApiKey ? '[set]' : ''
  };
  const widgets = getAllWidgets();
  res.json({ settings, widgets });
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
