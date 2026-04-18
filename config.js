/**
 * config.js — loaded once at server startup via dotenv.
 * Values are read from process.env (populated by .env) and frozen in memory.
 * Nothing is written to disk. Values are cleared when the process exits.
 *
 * Import order guarantee: server.js imports 'dotenv/config' before any
 * application module, so process.env is fully populated by the time this
 * module evaluates.
 */

export const config = Object.freeze({
  // Core
  ahrefsApiKey:             process.env.AHREFS_API_KEY             || '',
  timeoutMs:                parseInt(process.env.TIMEOUT_MS         || '30000', 10),

  // Project defaults — used as fallbacks when no per-widget override is set
  defaultProjectId:           process.env.DEFAULT_PROJECT_ID            || '',
  defaultWebAnalyticsProjectId: process.env.DEFAULT_WEB_ANALYTICS_PROJECT_ID || '',
  defaultReportId:            process.env.DEFAULT_REPORT_ID            || '',
  defaultDomain:            process.env.DEFAULT_DOMAIN             || '',
  defaultBrandName:         process.env.DEFAULT_BRAND_NAME         || '',
  defaultCountry:           process.env.DEFAULT_COUNTRY            || 'us',
  defaultCompetitorDomains: (process.env.DEFAULT_COMPETITORS_DOMAINS || '')
    .split(',').map(s => s.trim()).filter(Boolean),

  // Scheduler
  cronSchedule:             process.env.CRON_SCHEDULE              || '0 2 * * *',
});
