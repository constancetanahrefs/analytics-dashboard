# Analytics Dashboard — High-Level Overview

This document is intended for an AI platform helping a user rebuild this dashboard from scratch. Read this first before any other document. It describes the purpose, scope, and design philosophy of the application — independent of technology choices.

---

## What This Application Does

This is a **self-hosted analytics dashboard** that pulls data from the [Ahrefs API v3](https://ahrefs.com/api) and presents it across two views:

- **Performance** — tracks brand visibility over time in AI-generated answers and organic search (Share of Voice, impressions, clicks, top pages)
- **Opportunities** — surfaces content gaps and SERP features (AI Overviews, PAA questions, discussion threads, video topics, Reddit/Quora citations, third-party domains in AI answers)

All data is fetched on demand (or on a scheduled cron), cached locally, and rendered client-side. No data is sent to any third party other than the Ahrefs API itself.

---

## What Must Be Built

- A backend server that:
  - Reads configuration from a local `.env` file at startup and holds it in memory
  - Fetches data from the Ahrefs API v3 on demand and on a configurable schedule
  - Caches API responses locally (SQLite)
  - Exposes REST endpoints the frontend calls
  - Logs every API call with status, duration, and errors
- A frontend that:
  - Renders two tabs: Performance and Opportunities
  - Each tab contains widgets (cards), each displaying a chart or table
  - Widgets show three distinct empty states: API returned no data, data was filtered out, API call failed
  - A Settings panel that shows global config (read-only) and allows per-widget param overrides
  - A widget pin feature (pin any widget for quick access from a starred/home view)
- A scheduler that:
  - Runs on a configurable cron schedule
  - Refreshes all widget data and updates the local cache
  - Can be paused, resumed, and triggered manually

---

## What Must NOT Be Built

- **No user authentication system** — the dashboard is designed for localhost or behind a reverse proxy with HTTP basic auth. Do not add login/session logic unless explicitly requested.
- **No in-app editing of global config** — all global settings (API key, project IDs, domain, brand name) live in `.env`. The app reads them at startup. The UI shows them read-only. Do not build a form to save global settings.
- **No multi-tenancy** — this is a single-user, single-brand tool. One set of Ahrefs credentials, one domain.
- **No public API** — all routes are internal. No API keys are returned to the browser.
- **No over-engineering** — avoid caching layers beyond SQLite, avoid message queues, avoid microservices. This runs on a single Node.js process.

---

## Ahrefs API Concepts to Understand First

Before building, the AI must understand the following Ahrefs API distinctions:

### Project ID vs Report ID
- **Project ID** (`project_id`) — used by Rank Tracker, GSC, and Web Analytics endpoints. Identifies a tracked website project in Ahrefs.
- **Web Analytics Project ID** — a *separate* project ID specifically for Web Analytics endpoints. It may differ from the general Project ID. The app exposes a dedicated env var for it (`DEFAULT_WEB_ANALYTICS_PROJECT_ID`) and falls back to `DEFAULT_PROJECT_ID` if unset.
- **Report ID** (`report_id`) — used only by Brand Radar endpoints. Identifies a Brand Radar report (a collection of custom prompts used to probe AI answer engines).

### Brand Radar
- Brand Radar tracks how often your brand appears in AI-generated answers (ChatGPT, Gemini, Perplexity, Copilot, Google AI Overviews).
- Requires a `report_id` (a Brand Radar report ID) and a `brand` name.
- The `prompts` parameter must be set to `'custom'` to use custom prompts from the report.
- `data_source` selects the AI platform: `chatgpt`, `gemini`, `perplexity`, `copilot`, `google_ai_overviews`.

### Rank Tracker
- Tracks keyword rankings across SERP features for a tracked project.
- The `where` filter uses a specific JSON structure (not SQL-style strings).
- SERP feature values include: `ai_overview`, `ai_overview_found`, `ai_overview_sitelink`, `question`, `discussion`, `video`, `video_th`.
- Many widgets use a two-step pattern: (1) fetch the Rank Tracker overview to find relevant keywords, then (2) fetch `serp-overview` per keyword to extract detailed SERP feature items.

### GSC (Google Search Console)
- Provides impressions, clicks, CTR, position data for organic search.
- Requires `project_id`. Date ranges use `date_from` / `date_to`.

---

## Questions to Ask the User Before Building

The AI building this dashboard should prompt the user with these questions before starting implementation:

### Configuration
1. **Do you have an Ahrefs API v3 key?** (Required — without it, no data can be fetched.)
2. **What is your Ahrefs Rank Tracker / GSC Project ID?** (Used by most widgets.)
3. **Do you have a separate Ahrefs Web Analytics project?** If yes, what is its Project ID? (Falls back to the main project ID if not provided.)
4. **Do you have a Brand Radar report set up in Ahrefs?** If yes, what is the Report ID? (Required for all AI visibility widgets.)
5. **What is your brand name exactly as it appears in Ahrefs?** (Used to filter branded keywords and as the `brand` param in Brand Radar calls.)
6. **What is your primary domain?** (e.g., `example.com` — used to exclude your own URLs from competitor tables.)
7. **Do you want to exclude competitor domains from third-party domain tables?** If yes, provide a comma-separated list.
8. **What country code should be used for SERP lookups?** (ISO 2-letter, e.g., `us`, `gb`. Defaults to `us`.)

### Deployment
9. **Where will the dashboard run?** (Locally on your machine, or on a remote server?)
10. **Do you want it to auto-refresh data on a schedule?** If yes, how often? (Default: daily at 2am — cron expression `0 2 * * *`.)

### Scope
11. **Which widgets do you need?** (All 9 Performance widgets and all 9 Opportunities widgets are included by default. Some require Brand Radar access; some require Rank Tracker access.)

---

## Design Principles

- **Config lives in `.env`, not the database.** All global settings are environment variables read once at startup. The SQLite database stores only widget overrides, cache, and logs.
- **Per-widget overrides are allowed.** Any widget can override `project_id`, `report_id`, or `brand` independently of the global defaults. These are stored in the widget's database row as a JSON object.
- **Cache-first, fetch-on-demand.** The frontend always fetches fresh data when a widget loads (calling backend routes), but the backend caches responses in SQLite. The cron scheduler pre-warms the cache on a schedule.
- **Errors are visible.** Every API call failure is logged. Widget error states show the reason (timeout, HTTP error code, no data, filtered-out data). A Logs page shows the full fetch history.
- **No secrets in the browser.** The Ahrefs API key is never returned to the frontend. The settings panel shows `[set]` if the key is configured.

---

## Application Flow Summary

```
User opens dashboard
  → Frontend loads tab (Performance or Opportunities)
  → For each widget in the tab, calls GET /api/insights/data/<widget-id>
  → Backend reads widget config (global config + per-widget overrides from DB)
  → Backend calls Ahrefs API with merged params
  → Backend caches response in SQLite, logs the call
  → Backend returns data to frontend
  → Frontend renders chart or table
  → If error: frontend shows error state with reason
```

---

## Widget ID Naming Convention

Widgets follow a consistent ID naming scheme:
- `p1` through `p9` — Performance tab widgets
- `o1` through `o9` — Opportunities tab widgets

Each widget ID maps to a specific fetcher function, endpoint, and renderer.
