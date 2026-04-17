import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || './analytics.db';

let _db;

export function getDb() {
  if (!_db) {
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    const schema = readFileSync(join(__dir, 'schema.sql'), 'utf8');
    _db.exec(schema);
  }
  return _db;
}

// Settings helpers
export function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

/** Parse JSON safely, returning fallback (default {}) on any error. */
export function safeParseJson(str, fallback = {}) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// Widget helpers
export function getAllWidgets() {
  return getDb().prepare('SELECT * FROM widgets ORDER BY tab, order_index').all();
}

export function getWidget(id) {
  return getDb().prepare('SELECT * FROM widgets WHERE id = ?').get(id);
}

export function upsertWidget(widget) {
  getDb().prepare(`
    INSERT INTO widgets (id, tab, title, endpoint, params, description, pinned, paused, hidden, order_index)
    VALUES (@id, @tab, @title, @endpoint, @params, @description, @pinned, @paused, @hidden, @order_index)
    ON CONFLICT(id) DO UPDATE SET
      tab = excluded.tab,
      title = excluded.title,
      endpoint = excluded.endpoint,
      -- params intentionally excluded: user overrides survive restarts
      description = excluded.description,
      order_index = excluded.order_index
  `).run(widget);
}

export function updateWidgetPin(id, pinned) {
  getDb().prepare('UPDATE widgets SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
}

export function updateWidgetPause(id, paused) {
  getDb().prepare('UPDATE widgets SET paused = ? WHERE id = ?').run(paused ? 1 : 0, id);
}

export function updateWidgetHidden(id, hidden) {
  getDb().prepare('UPDATE widgets SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, id);
}

export function updateWidgetParams(id, params) {
  getDb().prepare('UPDATE widgets SET params = ? WHERE id = ?').run(JSON.stringify(params), id);
}

// Cache helpers
export function getCached(widgetId) {
  return getDb().prepare('SELECT * FROM cache WHERE widget_id = ?').get(widgetId);
}

export function setCache(widgetId, data) {
  getDb().prepare(`
    INSERT OR REPLACE INTO cache (widget_id, data, fetched_at)
    VALUES (?, ?, datetime('now'))
  `).run(widgetId, JSON.stringify(data));
}

// Log helpers
export function logFetch({ widgetId, endpoint, params, status, httpCode, durationMs, errorMessage }) {
  getDb().prepare(`
    INSERT INTO fetch_logs (widget_id, endpoint, params, status, http_code, duration_ms, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(widgetId, endpoint, JSON.stringify(params), status, httpCode ?? null, durationMs, errorMessage ?? null);
}

export function getLogs({ limit = 200, widgetId, status } = {}) {
  let sql = 'SELECT * FROM fetch_logs';
  const conditions = [];
  const args = [];
  if (widgetId) { conditions.push('widget_id = ?'); args.push(widgetId); }
  if (status) { conditions.push('status = ?'); args.push(status); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ?';
  args.push(limit);
  return getDb().prepare(sql).all(...args);
}

export function clearLogs() {
  getDb().prepare('DELETE FROM fetch_logs').run();
}

// Sync state helpers
export function getSyncState() {
  return getDb().prepare('SELECT * FROM sync_state WHERE id = 1').get();
}

export function updateSyncState(fields) {
  const allowed = ['in_progress', 'started_at', 'last_widget_synced', 'total_widgets', 'synced_count'];
  const sets = allowed.filter(k => k in fields).map(k => `${k} = @${k}`).join(', ');
  if (!sets) return;
  getDb().prepare(`UPDATE sync_state SET ${sets} WHERE id = 1`).run(fields);
}

// ── Insights widget helpers ──────────────────────────────────────────────────

export function getAllInsightsWidgets() {
  return getDb().prepare('SELECT * FROM insights_widgets ORDER BY page, order_index').all();
}

export function getInsightsWidget(id) {
  return getDb().prepare('SELECT * FROM insights_widgets WHERE id = ?').get(id);
}

export function setInsightsWidgetStar(id, starred) {
  getDb().prepare('UPDATE insights_widgets SET starred = ? WHERE id = ?').run(starred ? 1 : 0, id);
}

export function setInsightsWidgetParams(id, params) {
  getDb().prepare('UPDATE insights_widgets SET params = ? WHERE id = ?').run(JSON.stringify(params), id);
}

// ── Insights cache helpers ───────────────────────────────────────────────────

export function getInsightsCached(widgetId) {
  return getDb().prepare('SELECT * FROM insights_cache WHERE widget_id = ?').get(widgetId);
}

export function setInsightsCache(widgetId, data) {
  getDb().prepare(`
    INSERT OR REPLACE INTO insights_cache (widget_id, data, fetched_at)
    VALUES (?, ?, datetime('now'))
  `).run(widgetId, JSON.stringify(data));
}
