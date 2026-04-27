# Lessons Learned — Frequently Made Errors & How to Avoid Them

This document records mistakes made when building this dashboard and how to avoid repeating them. It is intended for an AI platform attempting to build this application from scratch.

---

## 1. Wrong Field Names in Ahrefs API Calls

### The Mistake
Using field names that seem logical but are not what the API actually returns or accepts. Examples encountered:

- `sov` instead of `share_of_voice` in `brand-radar/sov-overview`
- `brand_sov` / `competitor_sov` — these fields do not exist; the correct field is `share_of_voice`
- `response_count` instead of `responses` in `brand-radar/cited-pages` and `cited-domains`
- `query` instead of `question` in `brand-radar/ai-responses`
- `order_by` on `brand-radar/cited-pages` — this parameter is not valid for that endpoint
- `keyword_words` used as a `where` filter in `gsc/keywords` — the field is not filterable server-side; you must fetch and filter client-side

### How to Avoid
- **Always use the Ahrefs MCP tool** (`mcp__claude_ai_Ahrefs__doc`) to verify exact field names before building a fetcher. Never guess field names.
- For Brand Radar endpoints specifically: `select` fields are `share_of_voice`, `brand`, `responses`, `url`, `title`, `domain`, `question`, `response`, `data_source`.
- Run `doc` tool queries like: "What fields can I select from brand-radar/cited-pages?"

---

## 2. Wrong `select` Parameter Behavior

### The Mistake
Assuming `select` works as a server-side column filter for all endpoints. Some endpoints ignore `select` entirely (e.g., `rank-tracker/serp-overview` does not accept a `select` param — it always returns its full response shape).

### How to Avoid
- Check the MCP `doc` tool for each endpoint to confirm whether it accepts `select`.
- For `rank-tracker/serp-overview`: do not pass `select`. It returns `{ positions: [...] }` unconditionally.

---

## 3. Storing Secrets in the Database

### The Mistake
Early versions seeded the Ahrefs API key, project IDs, and other config values into the SQLite `settings` table and read them back at runtime. This meant:
- Secrets were persisted to disk beyond the `.env` file
- The DB could get out of sync with `.env`
- The settings UI mistakenly exposed editable fields for these values

### How to Avoid
- All global config must be read from `process.env` at startup into a frozen, in-memory config object. Nothing is written to the DB.
- The `settings` table in SQLite should be used only for per-widget overrides (e.g., `params` JSON column on the `insights_widgets` table).
- The settings UI shows global config as **read-only** with a note that changes require editing `.env` and restarting.
- **Never return the API key to the browser.** Return `[set]` or empty string.

---

## 4. Module Import Order with `dotenv`

### The Mistake
Importing application modules (which read `process.env` at module evaluation time) before `import 'dotenv/config'` has been evaluated. In Node.js ESM, module side-effects run at evaluation time, so if `config.js` is evaluated before `dotenv/config`, all env vars will be empty strings.

### How to Avoid
- In `server.js` (the entry point), `import 'dotenv/config'` **must be the first import**, before any application-level imports.
- Never rely on `require('dotenv').config()` in ESM — use `import 'dotenv/config'` instead.
- The config module (`config.js`) should only read `process.env` at module level; it relies on the entry point guaranteeing that dotenv has already run.

---

## 5. Brand Radar `prompts` Parameter

### The Mistake
Omitting the `prompts: 'custom'` parameter from Brand Radar calls. This causes the API to return no data or an error, because Brand Radar requires you to specify which prompt type to use.

### How to Avoid
- Every Brand Radar API call **must include `prompts: 'custom'`** when querying custom prompts.
- This applies to: `brand-radar/sov-overview`, `brand-radar/sov-history`, `brand-radar/impressions-history`, `brand-radar/cited-pages`, `brand-radar/cited-domains`, `brand-radar/ai-responses`.
- The `brand` parameter is also required by Brand Radar (at least one of `brand`, `competitors`, `market`, or `where` must be set).

---

## 6. Two-Step SERP Feature Pattern (Rank Tracker)

### The Mistake
Trying to fetch PAA questions, discussion threads, or video topics in a single Rank Tracker API call. The API does not return SERP feature item details (question text, thread titles, video URLs) from `rank-tracker/overview` — only a list of feature names per keyword.

### How to Avoid
- Always use the **two-step pattern**:
  1. Call `rank-tracker/overview` with a `where` filter for the desired SERP feature (e.g., `serp_features includes question`) to get a filtered list of keywords.
  2. For each keyword (up to 50), call `rank-tracker/serp-overview` to get detailed SERP items, then filter by `type = question | discussion | video | video_th`.
- Batch the Step 2 calls in groups of 5 using `Promise.allSettled` to avoid rate limits and long sequential waits.
- The `where` filter for SERP features uses this JSON structure:
  ```json
  { "field": "serp_features", "list_is": { "any": ["eq", "question"] } }
  ```
  For multiple values (e.g., video + video_th):
  ```json
  { "or": [
    { "field": "serp_features", "list_is": { "any": ["eq", "video"] } },
    { "field": "serp_features", "list_is": { "any": ["eq", "video_th"] } }
  ] }
  ```

---

## 7. `where` Filter JSON Structure

### The Mistake
Using SQL-style strings or incorrect JSON shapes for the Ahrefs `where` parameter. The API rejects malformed filter objects silently or returns all records (ignoring the filter).

### How to Avoid
- The `where` parameter must be a **JSON-stringified object** (pass as `JSON.stringify({...})`, not as a raw string).
- Use the Ahrefs MCP `doc` tool to confirm filter field names and operators for each endpoint.
- Basic pattern: `{ field: 'field_name', is: ['eq', 'value'] }`
- List membership: `{ field: 'serp_features', list_is: { any: ['eq', 'ai_overview'] } }`
- Negation: `{ not: { field: 'serp_features', list_is: { any: ['eq', 'ai_overview_found'] } } }`
- Combination: `{ and: [...] }` or `{ or: [...] }`

---

## 8. `rank-tracker/competitors-stats` Response Key

### The Mistake
Accessing `data.competitors` or `data.stats` from the `rank-tracker/competitors-stats` response. The actual key returned by the API is `competitors-metrics` (hyphenated, not camelCase).

### How to Avoid
- Always destructure as `data['competitors-metrics'] || []`.
- Verify response shapes with the MCP `doc` tool before writing destructuring logic.

---

## 9. Duplicate Results in SERP Feature Widgets

### The Mistake
Multiple keywords can trigger the same URL to appear in SERP features (e.g., the same YouTube video appearing in 10 different video SERP results). Without deduplication, the table shows the same URL many times.

### How to Avoid
- Use a `Set` to track seen URLs before pushing to the results array:
  ```js
  const seenUrls = new Set();
  for (const result of results) {
    for (const item of result.items) {
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      rows.push({ keyword: result.keyword, ...item });
    }
  }
  ```

---

## 10. Web Analytics Uses Different Date Format

### The Mistake
Passing `date_from` / `date_to` (ISO date strings like `2024-01-01`) to Web Analytics endpoints. Web Analytics uses full ISO timestamp format (`from` / `to` with datetime strings like `2024-01-01T00:00:00.000Z`).

### How to Avoid
- GSC endpoints use: `date_from` and `date_to` with `YYYY-MM-DD` format.
- Web Analytics endpoints use: `from` and `to` with full ISO timestamps (e.g., `new Date().toISOString()`).
- Never mix these parameter names across endpoint families.

---

## 11. Branded Keyword Filter Must Be Client-Side

### The Mistake
Trying to filter branded keywords server-side using a `where` clause on `gsc/keywords` with the brand name. The GSC keywords endpoint does not support a `contains` filter on the `keyword` field via the `where` param.

### How to Avoid
- Fetch all keywords, then filter client-side (in the backend fetcher) using `keyword.toLowerCase().includes(brandName.toLowerCase())`.
- Similarly, long-tail keyword filtering (5+ words) must be done client-side — `keyword_words` is not a filterable field in `gsc/keywords`.

---

## 12. Question Keywords Filter Uses `iphrase_match`

### The Mistake
Using `eq` or `contains` operators to match question-word keywords in GSC. This returns wrong or no results.

### How to Avoid
- Use the `iphrase_match` operator (case-insensitive phrase match) with an `or` condition across question words:
  ```json
  { "and": [{ "or": [
    { "field": "keyword", "is": ["iphrase_match", "who"] },
    { "field": "keyword", "is": ["iphrase_match", "what"] },
    ...
  ] }] }
  ```

---

## 13. Missing Three-State Empty Handling

### The Mistake
Showing a generic "No data" message for all empty widget states. This made it impossible to diagnose whether:
- The API returned nothing (empty dataset — the configuration might be wrong)
- Data was returned but filtered out (filtering is too aggressive, or the brand name/domain setting is wrong)
- The API call failed entirely (network error, timeout, auth error)

### How to Avoid
Always implement three distinct empty states per widget:
1. **API failure** — show the error type (timeout vs. HTTP error) and code
2. **API returned empty** — "No data returned from Ahrefs" with a hint about checking config
3. **Filter removed all data** — "Data was returned but filtered out" with the count of pre-filter records and what was filtered

---

## 14. `innerHTML` with API Data is an XSS Risk

### The Mistake
Building table rows or content by concatenating API response values into `innerHTML` strings. API responses can contain characters like `<`, `>`, `"` that break HTML or enable XSS.

### How to Avoid
- Use DOM methods: `textContent`, `createElement`, `appendChild`.
- Only use `innerHTML` for static, developer-controlled HTML templates (e.g., empty skeleton markup).
- If you must use `innerHTML` with dynamic data, run it through an HTML escaper first:
  ```js
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  ```

---

## 15. ESM vs CJS Mixing

### The Mistake
Mixing `require()` and `import` in the same project, or using `.js` extension in ESM imports without understanding that Node.js ESM requires explicit extensions.

### How to Avoid
- Set `"type": "module"` in `package.json` to use ESM throughout.
- All imports must include the `.js` extension: `import { foo } from './foo.js'` (not `./foo`).
- For CommonJS-only packages (e.g., `better-sqlite3`), this works fine — Node.js allows importing CJS from ESM.
- Config files that must be CJS (e.g., PM2 `ecosystem.config.cjs`) use the `.cjs` extension.

---

## 16. Per-Widget Override Merge Order

### The Mistake
Fetchers not correctly merging per-widget overrides with global defaults, causing per-widget settings to be ignored or global defaults to silently override them.

### How to Avoid
- The correct merge order is: **per-widget override wins over global default**:
  ```js
  const projectId = overrides.project_id || config.defaultProjectId;
  ```
- The `overrides` object comes from the `insights_widgets.params` JSON column in the database.
- The backend route reads the widget row from the DB, parses `params`, and passes it as `overrides` to the fetcher.
- Web Analytics has a three-tier fallback:
  ```js
  overrides.project_id || config.defaultWebAnalyticsProjectId || config.defaultProjectId
  ```

---

## 17. Concurrent Sync Guard

### The Mistake
Triggering multiple scheduled or manual sync runs simultaneously, causing duplicate API calls and log entries.

### How to Avoid
- Use a module-level boolean flag (`_syncRunning`) to guard the sync entry point:
  ```js
  if (_syncRunning) return;
  _syncRunning = true;
  try { await runSync(); } finally { _syncRunning = false; }
  ```
- The `POST /api/insights/sync/run` route should return a `409` if a sync is already in progress.
