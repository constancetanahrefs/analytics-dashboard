# Analytics Dashboard — Detailed Architecture

This document is the primary technical reference for rebuilding this dashboard. It covers every backend API call, every calculation, every frontend rendering pattern, and all error handling. An AI building this application should read this alongside the Ahrefs MCP documentation — wherever this document says "confirm with MCP", use the `doc` tool to verify the exact field names and parameter shapes before writing code.

---

## Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 18+ | Native `fetch`, ES modules (`"type": "module"`) |
| Backend | Express.js | Simple HTTP server; no framework magic |
| Database | SQLite via `better-sqlite3` | Synchronous API; WAL mode for concurrency |
| Scheduler | `node-cron` | Global refresh schedule |
| Frontend | Vanilla JS | No framework; ES modules via `<script type="module">` |
| Charts | Chart.js | Line charts only; loaded from CDN |
| API client | Native `fetch` + `AbortController` | Timeout via `AbortController` |

---

## Project Structure

```
analytics-dashboard/
├── server.js                    # Entry point; must import 'dotenv/config' FIRST
├── config.js                    # Frozen in-memory config read from process.env
├── .env                         # All secrets and config (never committed)
├── .env.example                 # Template with all required/optional keys
├── package.json                 # "type": "module"; scripts: start, dev
├── ecosystem.config.cjs         # PM2 config (CJS extension required)
├── db/
│   ├── schema.sql               # Table definitions + seed widget rows
│   └── db.js                    # better-sqlite3 singleton + helpers
├── api/
│   ├── client.js                # All Ahrefs API calls go through here
│   ├── insights-registry.js     # Widget ID → fetcher mapping (18 widgets)
│   └── fetchers/
│       ├── brand-radar.js       # Brand Radar endpoint functions
│       ├── gsc.js               # Google Search Console endpoint functions
│       ├── rank-tracker.js      # Rank Tracker endpoint functions
│       ├── web-analytics.js     # Web Analytics endpoint functions
│       └── site-explorer.js     # Site Explorer (page title enrichment)
├── scheduler/
│   └── cron.js                  # Cron job, sync state, pause/resume
├── routes/
│   ├── insights-api.js          # /api/insights/* routes (main data routes)
│   └── settings.js              # /api/settings (global config + widget overrides)
└── public/
    └── insights/
        ├── index.html
        ├── css/styles.css
        └── js/
            ├── app.js           # Tab routing, widget initialization
            ├── widgets.js       # All widget renderers
            └── settings.js      # Settings panel UI
```

---

## Configuration System

### Environment Variables (`.env`)

```env
AHREFS_API_KEY=                          # Required — Ahrefs API v3 key
PORT=3000                                # Optional — HTTP server port
TIMEOUT_MS=30000                         # Optional — API call timeout in ms
DB_PATH=./analytics.db                   # Optional — SQLite file path

DEFAULT_PROJECT_ID=                      # Ahrefs project ID for GSC + Rank Tracker
DEFAULT_WEB_ANALYTICS_PROJECT_ID=        # Ahrefs project ID for Web Analytics (falls back to DEFAULT_PROJECT_ID)
DEFAULT_REPORT_ID=                       # Brand Radar report ID
DEFAULT_DOMAIN=                          # Your domain, e.g. example.com
DEFAULT_BRAND_NAME=                      # Brand name for filtering branded keywords
DEFAULT_COUNTRY=us                       # ISO 2-letter country code for SERP lookups
DEFAULT_COMPETITORS_DOMAINS=             # Comma-separated competitor domains to exclude
CRON_SCHEDULE=0 2 * * *                  # Cron expression for scheduled refresh
```

### In-Memory Config (`config.js`)

```js
export const config = Object.freeze({
  ahrefsApiKey:               process.env.AHREFS_API_KEY || '',
  timeoutMs:                  parseInt(process.env.TIMEOUT_MS || '30000', 10),
  defaultProjectId:           process.env.DEFAULT_PROJECT_ID || '',
  defaultWebAnalyticsProjectId: process.env.DEFAULT_WEB_ANALYTICS_PROJECT_ID || '',
  defaultReportId:            process.env.DEFAULT_REPORT_ID || '',
  defaultDomain:              process.env.DEFAULT_DOMAIN || '',
  defaultBrandName:           process.env.DEFAULT_BRAND_NAME || '',
  defaultCountry:             process.env.DEFAULT_COUNTRY || 'us',
  defaultCompetitorDomains:   (process.env.DEFAULT_COMPETITORS_DOMAINS || '')
                                .split(',').map(s => s.trim()).filter(Boolean),
  cronSchedule:               process.env.CRON_SCHEDULE || '0 2 * * *',
});
```

**Critical:** `import 'dotenv/config'` must be the **first line** of `server.js`. This guarantees `process.env` is populated before `config.js` evaluates.

---

## API Client (`api/client.js`)

All Ahrefs API requests flow through a single function:

```js
async function ahrefsGet(endpoint, params, widgetId) {
  // 1. Build URL: https://api.ahrefs.com/v3/<endpoint>?<params>
  // 2. Set Authorization: Bearer <config.ahrefsApiKey>
  // 3. Set AbortController timeout: config.timeoutMs
  // 4. On success: log to fetch_logs (status='success'), return parsed JSON
  // 5. On non-200: log (status='error', http_code=N), throw structured error
  // 6. On timeout: log (status='timeout'), throw TimeoutError
}
```

**Base URL:** `https://api.ahrefs.com/v3/`

**Authentication:** `Authorization: Bearer <AHREFS_API_KEY>` header on every request.

**Logging:** Every call writes a row to the `fetch_logs` table with: `widget_id`, `endpoint`, `params` (JSON), `status`, `http_code`, `duration_ms`, `error_message`, `created_at`.

---

## Database Schema

### `insights_widgets` — Widget registry and per-widget overrides

```sql
CREATE TABLE insights_widgets (
  id          TEXT PRIMARY KEY,   -- e.g. 'p1-sov-ai'
  page        TEXT,               -- 'performance' or 'opportunities'
  title       TEXT,
  pinned      INTEGER DEFAULT 0,  -- 1 = shown in starred/home view
  paused      INTEGER DEFAULT 0,  -- 1 = skipped during scheduled refresh
  params      TEXT DEFAULT '{}'   -- JSON: per-widget overrides (project_id, report_id, brand)
);
```

Seeded at DB creation time with all 18 widget rows. The `params` column is the only field that changes at runtime (via the settings UI).

### `insights_cache` — API response cache

```sql
CREATE TABLE insights_cache (
  widget_id  TEXT PRIMARY KEY,
  data       TEXT,               -- JSON blob of the full API response
  fetched_at TEXT                -- ISO timestamp
);
```

### `fetch_logs` — Full audit log of every API call

```sql
CREATE TABLE fetch_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  widget_id     TEXT,
  endpoint      TEXT,
  params        TEXT,
  status        TEXT,            -- 'success' | 'error' | 'timeout'
  http_code     INTEGER,
  duration_ms   INTEGER,
  error_message TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### `insights_sync_state` — Cron sync progress tracking

```sql
CREATE TABLE insights_sync_state (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  in_progress        INTEGER DEFAULT 0,
  started_at         TEXT,
  last_widget_synced TEXT,
  total_widgets      INTEGER,
  synced_count       INTEGER DEFAULT 0
);
```

---

## Per-Widget Override System

Each widget can override `project_id`, `report_id`, or `brand` independently.

**Storage:** `insights_widgets.params` JSON column, e.g. `{"project_id": "99999", "brand": "MyBrand"}`.

**Reading (backend route):**
```js
const widget = db.getWidgetById(widgetId);
const overrides = JSON.parse(widget.params || '{}');
const fetcher = getInsightsFetcher(widgetId);
const data = await fetcher(overrides, widgetId);
```

**Merge in fetcher:**
```js
function defaultProjectId(overrides) {
  return overrides.project_id || config.defaultProjectId;
}
```

**Writing (settings UI):** `PUT /api/insights/settings/widgets/:id` with `{ project_id: '...', brand: '...' }` body. The route merges with existing params and saves to DB.

---

## Widgets: Performance Tab

### p1 — SoV Over Time — AI Answers

**Chart type:** Line chart
**Endpoint:** `brand-radar/sov-history`
**Params:**
```
prompts=custom
data_source=chatgpt,gemini,perplexity,copilot  (comma-separated — single call returns all)
select=share_of_voice,date
report_id=<report_id>
brand=<brand>
date_from=<90 days ago>
date_to=<today>
```
**Response shape:** `{ metrics: [{ date: 'YYYY-MM-DD', share_of_voice: [{ ... }] }] }`
**Calculation:** Single API call returns all platforms. Frontend filters which platform series to display via a platform toggle. Chart x-axis = date, y-axis = share_of_voice value.
**Confirm with MCP:** `brand-radar/sov-history` field names and data_source values.

---

### p2 — SoV — Organic Search

**Chart type:** Stat card with delta badge
**Endpoint:** `rank-tracker/competitors-stats` (two calls)
**Params:**
```
project_id=<project_id>
select=competitor,share_of_voice
device=desktop
volume_mode=monthly
date=<today>        (call 1: current)
date=<30 days ago>  (call 2: compare)
```
**Response shape:** `{ 'competitors-metrics': [{ competitor: '...', share_of_voice: N }] }`
**Calculation:** Call 1 and Call 2 run in parallel. Delta = `current.share_of_voice - previous.share_of_voice` per competitor. Note: response key is `competitors-metrics` (hyphenated).
**Confirm with MCP:** `rank-tracker/competitors-stats` select fields and response key name.

---

### p3 — Impressions Over Time — AI Answers

**Chart type:** Line chart
**Endpoint:** `brand-radar/impressions-history`
**Params:** 4 parallel calls, one per platform:
```
prompts=custom
data_source=<chatgpt|gemini|perplexity|copilot>
report_id=<report_id>
brand=<brand>      (required by API)
date_from=<90 days ago>   (required by API)
date_to=<today>
```
**Response shape:** `{ metrics: [{ date, impressions }] }`
**Calculation:** 4 calls via `Promise.allSettled`. Each becomes one line series. Platform filter in UI selects which lines to show.
**Confirm with MCP:** `brand-radar/impressions-history` — note that `brand` and `date_from` are required.

---

### p4 — Impressions Over Time — Organic

**Chart type:** Line chart
**Endpoint:** `gsc/performance-history`
**Params:**
```
project_id=<project_id>
date_from=<90 days ago>
history_grouping=daily
```
**Response shape:** `{ metrics: [{ date, impressions, clicks, ctr, position }] }`
**Calculation:** Single call. Only `impressions` field is plotted. Chart x-axis = date, y-axis = impressions.

---

### p5 — Clicks Over Time — Organic

**Chart type:** Line chart + subfolder breakdown table
**Endpoints:** `gsc/performance-history` (clicks over time) + `gsc/pages` (top pages)
**Params for performance-history:** same as p4
**Params for pages:**
```
project_id=<project_id>
order_by=clicks:desc
date_from=<90 days ago>
limit=200
```
**Response shape (pages):** `{ pages: [{ page, clicks, impressions, ctr, position }] }`
**Calculation:** Line chart uses `clicks` from performance-history. Table groups pages by the first path segment (e.g., `/blog/` from `/blog/article`) to show subfolder breakdown.

---

### p6 — Clicks Over Time — AI Traffic

**Chart type:** Line chart
**Endpoint:** `web-analytics/sources-chart`
**Params:**
```
project_id=<web_analytics_project_id>
granularity=daily
from=<ISO timestamp, 30 days ago>
to=<ISO timestamp, now>
where={"and":[{"field":"source_channel","is":["eq","llm"]}]}
```
**Response shape:** `{ points: [{ timestamp, source, visitors }] }`
**Calculation:** Single call with `source_channel = llm` filter. Points are tagged with `source` field (e.g., `chatgpt.com`, `perplexity.ai`). Frontend groups into one line per source. Platform filter toggles visibility.
**Important:** Web Analytics uses ISO timestamp format (`from`/`to`), not date strings (`date_from`/`date_to`).

---

### p8 — Top Pages in AI Overviews

**Chart type:** Table
**Endpoints:** `rank-tracker/overview` (Step 1) then `rank-tracker/serp-overview` per keyword (Step 2)
**Step 1 params:**
```
project_id=<project_id>
select=keyword,url,traffic,volume,serp_features
order_by=traffic:desc
limit=200
where={"or":[
  {"field":"best_position_kind","is":["eq","ai_overview"]},
  {"field":"best_position_kind","is":["eq","ai_overview_sitelink"]}
]}
```
**Response shape (overview):** `{ overviews: [{ keyword, url, traffic, volume, serp_features }] }`
**Calculation:** Groups returned rows by `url`. For each URL: `keyword_count` = number of keywords, `total_traffic` = sum of traffic. Sorted by `keyword_count` descending. No Step 2 needed — the URL is already in the overview row.
**Note:** This widget uses `best_position_kind` filter (not `serp_features`) to find keywords where *your* URL is cited.

---

### p9 — Top Organic Pages

**Chart type:** Table (two tabs: by clicks, by impressions)
**Endpoint:** `gsc/pages`
**Params:**
```
project_id=<project_id>
date_from=<90 days ago>
order_by=clicks:desc    (tab A) | impressions:desc  (tab B)
limit=50
```
**Response shape:** `{ pages: [{ page, clicks, impressions, ctr, position }] }`
**Calculation:** Single call. Page titles are enriched via `site-explorer/top-pages` (best-effort; failures are silently ignored). Paginated 5 rows per page in the UI.

---

## Widgets: Opportunities Tab

### o1 — 3rd-Party Domains — AI Search

**Chart type:** Table
**Endpoint:** `brand-radar/cited-domains`
**Params:**
```
report_id=<report_id>
brand=<brand>
prompts=custom
data_source=chatgpt,gemini,perplexity,copilot
select=volume,mentions,responses,domain,pages
limit=25
date=<today>
```
**Response shape:** `{ domains: [{ domain, responses, mentions, volume, pages }] }`
**Calculation:** Single call across all platforms. Client-side filter removes: your own domain (`config.defaultDomain`) and any competitor domains (`config.defaultCompetitorDomains`). Paginated 10 per page.
**Empty state distinction:** Show count of domains filtered out if all were removed by the filter.

---

### o2 — 3rd-Party URLs in AI Overviews

**Chart type:** Table
**Endpoints:** `rank-tracker/overview` (Step 1) then `rank-tracker/serp-overview` per keyword (Step 2)
**Step 1 params:**
```
project_id=<project_id>
select=keyword,position,serp_features
where={"and":[
  {"field":"serp_features","list_is":{"any":["eq","ai_overview"]}},
  {"not":{"field":"serp_features","list_is":{"any":["eq","ai_overview_found"]}}}
]}
```
**Step 2:** For each keyword (up to 50), call `rank-tracker/serp-overview` with `project_id`, `keyword`, `device=desktop`, `country=<country>`. Extract positions where `type` is `ai_overview` or `ai_overview_sitelink`.
**Calculation:** Filter out URLs containing `config.defaultDomain` or `config.defaultCompetitorDomains`. Group remaining URLs: `keyword_count` = how many keywords cite this URL. Sorted descending by `keyword_count`.
**Batching:** Step 2 calls run in batches of 5 via `Promise.allSettled`.

---

### o3 — Question Keywords — Organic

**Chart type:** Table
**Endpoint:** `gsc/keywords`
**Params:**
```
project_id=<project_id>
date_from=<90 days ago>
order_by=impressions:desc
limit=500
where={"and":[{"or":[
  {"field":"keyword","is":["iphrase_match","who"]},
  {"field":"keyword","is":["iphrase_match","what"]},
  {"field":"keyword","is":["iphrase_match","why"]},
  {"field":"keyword","is":["iphrase_match","where"]},
  {"field":"keyword","is":["iphrase_match","how"]},
  {"field":"keyword","is":["iphrase_match","when"]},
  {"field":"keyword","is":["iphrase_match","can"]},
  {"field":"keyword","is":["iphrase_match","does"]},
  {"field":"keyword","is":["iphrase_match","should"]}
]}]}
```
**Response shape:** `{ keywords: [{ keyword, clicks, impressions, ctr, position }] }`
**Calculation:** Server-side filter via `iphrase_match`. No post-processing needed.

---

### o4 — Long-tail Keywords (5+ words)

**Chart type:** Table
**Endpoint:** `gsc/keywords`
**Params:**
```
project_id=<project_id>
date_from=<90 days ago>
order_by=impressions:desc
limit=500
```
**Calculation:** Client-side filter: `keyword.trim().split(/\s+/).length >= 5`. The `keyword_words` field is not filterable via `where` in this API.

---

### o5 — People Also Ask — Top Questions

**Chart type:** Table
**Endpoints:** `rank-tracker/overview` (Step 1) + `rank-tracker/serp-overview` (Step 2)
**Step 1 `where` filter:**
```json
{ "field": "serp_features", "list_is": { "any": ["eq", "question"] } }
```
**Step 2:** Filter positions by `type === 'question'`. Each item has: `title` (PAA question text), `url`.
**Calculation:** Table shows: PAA question text, keyword that triggered it, your rank position.
**Batching:** Step 2 in batches of 5.

---

### o6 — Popular Discussions & Forums

Same two-step pattern as o5, but:
**Step 1 filter:** `serp_features includes discussion`
**Step 2 filter:** `type === 'discussion'`
Each item: `title` (thread title), `url` (forum post URL).

---

### o7 — Cited Reddit & Quora Pages

**Chart type:** Table
**Endpoint:** `brand-radar/cited-pages` (4 parallel calls, one per platform)
**Params per call:**
```
report_id=<report_id>
brand=<brand>
prompts=custom
data_source=<chatgpt|gemini|perplexity|copilot>
select=url,responses
limit=25
date=<today>
where={"field":"cited_url_exact","is":["substring",["reddit","quora"]]}
```
**Response shape:** `{ pages: [{ url, responses }] }`
**Calculation:** 4 parallel calls via `Promise.allSettled`. Platform filter in UI selects which platform's results to show. Domain badge (Reddit / Quora) shown per row.
**Confirm with MCP:** `where` filter for substring match on URL.

---

### o8 — Popular Video Topics

Same two-step pattern as o5, but:
**Step 1 filter:**
```json
{ "or": [
  { "field": "serp_features", "list_is": { "any": ["eq", "video"] } },
  { "field": "serp_features", "list_is": { "any": ["eq", "video_th"] } }
] }
```
**Step 2 filter:** `type === 'video' || type === 'video_th'`
Each item: `title` (video title), `url`.
**Deduplication:** Use a `Set` to deduplicate by URL before rendering (same video can appear for multiple keywords).

---

### o9 — Videos Cited in AI Answers

**Chart type:** Table
**Endpoint:** `brand-radar/cited-pages` (single combined call)
**Params:**
```
report_id=<report_id>
brand=<brand>
prompts=custom
data_source=chatgpt,gemini,perplexity,copilot
select=url,responses
limit=25
date=<today>
where={"field":"cited_url_exact","is":["substring",["youtube","tiktok"]]}
```
**Response shape:** `{ pages: [{ url, responses }] }`
**Calculation:** Single call. Domain badge (YouTube / TikTok) determined by checking if `url` contains `youtube` or `tiktok`.

---

## Frontend Rendering

### Widget Card Structure

```html
<div class="widget-card" data-id="p1-sov-ai" data-category="ai">
  <div class="widget-header">
    <span class="widget-title">SoV Over Time — AI Answers</span>
    <button class="pin-btn">★</button>
  </div>
  <div class="widget-body">
    <!-- chart canvas or table rendered here -->
  </div>
</div>
```

**Header color via CSS attribute selector:**
```css
.widget-card[data-category="ai"] .widget-header      { background: #0D1B6B; }
.widget-card[data-category="organic"] .widget-header { background: #6B3800; }
```

### Line Charts (Chart.js)

All line charts use `Chart.js`. Pattern:
```js
new Chart(canvas, {
  type: 'line',
  data: {
    labels: dates,                    // x-axis: date strings
    datasets: [{ label, data, borderColor, tension: 0.3 }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: true } },
    scales: { x: { ... }, y: { ... } }
  }
});
```

### Tables

Tables are built with DOM methods (not `innerHTML` with API data) to prevent XSS:
```js
const tr = document.createElement('tr');
const td = document.createElement('td');
td.textContent = row.keyword;   // safe — textContent escapes HTML
tr.appendChild(td);
```

### Three-State Empty Handling

Every widget renderer must handle three distinct empty conditions:

```js
// 1. API failure (network error, timeout, HTTP error)
if (error) {
  body.innerHTML = '';
  const msg = document.createElement('div');
  msg.className = 'error-state';
  // show: error type + code
  body.appendChild(msg);
  return;
}

// 2. API returned empty (no records from Ahrefs)
if (rawData.length === 0) {
  showEmpty(body, 'No data returned from Ahrefs', 'Check your project_id and date range in Settings.');
  return;
}

// 3. Filtered to zero (data existed but was removed)
const filtered = rawData.filter(...);
if (filtered.length === 0) {
  showEmpty(body, 'No results after filtering', `${rawData.length} record(s) were filtered out. Check your domain or brand settings.`);
  return;
}

// 4. Render normally
renderTable(body, filtered);
```

### Platform Filter UI

Brand Radar and Web Analytics AI widgets include a platform selector:
```html
<div class="platform-filter">
  <button data-platform="chatgpt" class="active">ChatGPT</button>
  <button data-platform="gemini">Gemini</button>
  <button data-platform="perplexity">Perplexity</button>
  <button data-platform="copilot">Copilot</button>
</div>
```
Clicking a button re-renders the chart with that platform's data series. The full multi-platform response object is kept in memory; only the display changes.

---

## Backend Routes

### `GET /api/insights/data/:widgetId`

1. Load widget row from `insights_widgets` table
2. Parse `params` JSON (per-widget overrides)
3. Look up fetcher from `INSIGHTS_WIDGETS` registry
4. Call `fetcher(overrides, widgetId)`
5. Write result to `insights_cache` table
6. Return JSON response

### `GET /api/insights/settings`

Returns: `{ settings: { ...config values... }, widgets: [...all widget rows...] }`
The `ahrefs_api_key` field returns `'[set]'` if configured, or `''`.

### `PUT /api/insights/settings/widgets/:id`

Body: `{ project_id: '...', report_id: '...', brand: '...' }`
Merges with existing `params` JSON, saves to DB, returns `{ params: { merged object } }`.

### `POST /api/insights/sync/run`

Triggers manual refresh of all non-paused widgets. Returns `409` if sync already running.

### `GET /api/insights/logs`

Returns recent rows from `fetch_logs` table, newest first.

---

## Scheduler (`scheduler/cron.js`)

```js
import cron from 'node-cron';
import { config } from '../config.js';

let _syncRunning = false;

export function startCron() {
  cron.schedule(config.cronSchedule, async () => {
    if (_syncRunning) return;
    _syncRunning = true;
    try {
      await runAllWidgets();
    } finally {
      _syncRunning = false;
    }
  });
}
```

`runAllWidgets()` iterates all non-paused widgets from the DB, calls each fetcher, updates `insights_cache` and `fetch_logs`, and updates `insights_sync_state`.

---

## Error Handling

### Backend

| Scenario | Behavior |
|---|---|
| Ahrefs returns non-200 | Log to `fetch_logs` with `status='error'`, `http_code=N`; throw `{ httpCode, message }` |
| Request times out | Log `status='timeout'`; throw `TimeoutError` |
| Missing config (no API key) | Return 500 with message before even calling API |
| Widget not found | Return 404 |
| Sync already running | Return 409 |

### Frontend

| Scenario | Widget State |
|---|---|
| HTTP error from backend | Show "API error — HTTP {code}" with error message |
| Timeout | Show "Request timed out after {N}s" |
| Network failure | Show "Could not connect to server" |
| API returned empty dataset | Show "No data returned from Ahrefs" with config hint |
| All records filtered out | Show count of filtered records + what was filtered |
| Data successfully loaded | Render chart or table |

### Logs Page

All API calls are visible in the `/logs` view. Columns: timestamp, widget, endpoint, status (success/error/timeout), HTTP code, duration, error message. This allows diagnosing configuration issues without touching the server.

---

## Using the Ahrefs MCP Tool

Wherever this document references a field name, parameter, or filter — verify it with the Ahrefs MCP `doc` tool before writing code. The MCP server provides the authoritative API reference.

Example queries to run:
- "What fields can I select from brand-radar/sov-history?"
- "What is the exact response shape of rank-tracker/serp-overview?"
- "What filter operators are supported in gsc/keywords where clause?"
- "Does brand-radar/cited-pages support an order_by parameter?"
- "What does the competitors-metrics response key look like in rank-tracker/competitors-stats?"

**Never assume** field names match what seems logical. Always verify.
