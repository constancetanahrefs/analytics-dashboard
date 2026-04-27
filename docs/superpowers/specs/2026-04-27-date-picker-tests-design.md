# Date Picker Test Suite — Design Spec

**Date:** 2026-04-27
**Scope:** Integration + calculation tests for all 17 widgets, verifying that date overrides set via the date picker are correctly forwarded to Ahrefs API calls and that all client-side calculations produce accurate results against live data.

---

## Goal

When a user changes the date picker, every widget must:
1. Send the correct date params to the Ahrefs API (not silently ignore them)
2. Return data that falls within the requested date range
3. Produce accurate results from client-side calculations applied to that live data

The benchmark is the default date range (today vs. 1 month ago), which is known to return data correctly.

---

## Approach

**Option C — Fetcher-level integration tests + calculation unit tests against live data.**

Tests call fetcher functions directly (bypassing Express routing), hit the real Ahrefs API using credentials from `.env`, and run the same client-side calculations used in `widgets.js` against the returned data.

- No mocking
- No new dependencies — uses Node 18 built-in `node:test`
- Calculations are mirrored in a `tests/calculations.js` helper (not imported from frontend, which runs in a browser context)

---

## Project Structure

```
tests/
├── setup.js                  # dotenv, date scenarios, shared assertion helpers
├── calculations.js           # Pure calculation functions mirroring widgets.js logic
├── fetchers/
│   ├── brand-radar.test.js
│   ├── gsc.test.js
│   ├── rank-tracker.test.js
│   └── web-analytics.test.js
└── calculations.test.js      # Calculation correctness tests against live API data
```

`package.json` addition:
```json
"test": "node --test tests/**/*.test.js"
```

---

## Date Scenarios

Three scenarios are defined in `tests/setup.js` and used across all test files:

| Name | `dateFrom` | `dateTo` | `from` (ISO) | `to` (ISO) | Purpose |
|---|---|---|---|---|---|
| `default` | 1 month ago | today | `dateFrom + T00:00:00.000Z` | `dateTo + T23:59:59.000Z` | Known-working baseline |
| `historical` | 3 months ago | 2 months ago | same pattern | same pattern | Proves dates are forwarded — data differs from default |
| `short` | 7 days ago | yesterday | same pattern | same pattern | Stress-tests sparse data handling |

Date arithmetic uses `Date` objects with `.setMonth()` / `.setDate()`. All dates formatted as `YYYY-MM-DD` for GSC/Brand Radar/Rank Tracker params, and as full ISO timestamps for Web Analytics `from`/`to` params.

---

## Shared Assertion Helpers (`tests/setup.js`)

```js
// Assert a value is a finite number (not NaN, Infinity, null, string)
assertNumber(val, label)

// Assert a date string falls within [from, to] inclusive
assertDateInRange(dateStr, from, to, label)

// Assert two values are not deeply equal (proves data changes with dates)
assertDiffers(a, b, label)

// Assert an array is non-empty
assertNonEmpty(arr, label)

// Assert no item in arr satisfies predicate
assertNoneMatch(arr, predicate, label)
```

---

## Fetcher Tests

### `tests/fetchers/brand-radar.test.js`

**`fetchSovHistory` (p1-sov-ai)**
- All 3 scenarios: response has `metrics` array
- Each metric entry has `date` (string) and `share_of_voice` (array of objects)
- Each `share_of_voice` entry has a numeric `share_of_voice` value
- `historical` dates in `metrics[*].date` are within `historical.dateFrom` – `historical.dateTo`
- `historical` metrics array differs from `default` metrics array

**`fetchImpressionsHistory` (p3-impressions-ai)**
- All 3 scenarios: response is an object with keys `chatgpt`, `gemini`, `perplexity`, `copilot`
- Each successful platform key has a `metrics` array with `date` and `impressions` (number)
- `historical` dates in `metrics[*].date` fall within the historical range
- `historical` metrics differ from `default` metrics for at least one platform

**`fetchThirdPartyDomains` (o1-third-domains)**
- `default` scenario: response has `domains` array
- Each domain entry has `domain` (string) and `responses` (number ≥ 0)
- No assertion on date range (Brand Radar cited-domains uses a single `date=today` param, not a range)

**`fetchDiscussionCitedPages` (o7-reddit-quora)**
- `default` scenario: response is object keyed by platform
- Each platform that did not error has `pages` array
- Every `url` in `pages` contains either `reddit` or `quora` (server-side filter verification)

**`fetchVideoCitedPages` (o9-video-ai)**
- `default` scenario: response has `pages` array (or per-platform object; assert on actual shape returned)
- Every `url` in result contains either `youtube` or `tiktok`

---

### `tests/fetchers/gsc.test.js`

**`fetchPerformanceHistory` (p4-impressions-gsc, p5-clicks-organic)**
- All 3 scenarios: response has `metrics` array
- Each entry has `date` (string), `impressions` (number), `clicks` (number), `ctr` (number), `position` (number)
- `historical` dates within historical range
- `historical` metrics array differs from `default`

**`fetchPages` (p5-clicks-organic, p9-organic-pages)**
- All 3 scenarios with `order_by=clicks:desc`: response has `pages` array
- Each entry has `page` or `url` (string), `clicks` (number), `impressions` (number)
- Clicks are non-increasing across rows (sorted correctly)
- `historical` first-page URL or clicks value differs from `default` (proves date forwarded)

**`fetchQuestionKeywords` (o3-question-kw)**
- `default` scenario: response has `keywords` array
- Every `keyword` in result matches `/^(who|what|why|where|how|when|which|is|are|can|does|do|should)\b/i`
- (Filter is server-side via `iphrase_match`; this verifies the API respected the filter)

**`fetchLongTailKeywords` (o4-longtail-kw)**
- `default` scenario: response has `keywords` array
- Every `keyword` has ≥ 5 whitespace-separated tokens (client-side filter applied in fetcher)
- `historical` results differ from `default`

---

### `tests/fetchers/rank-tracker.test.js`

**`fetchOrganicSovSnapshot` (p2-sov-organic)**
- All 3 scenarios: response has `rows` array
- Each row has `competitor` (string), `share_of_voice` (number), `sov_delta` (number or null)
- `sov_delta` is null only when competitor absent from the compare period (not NaN or undefined)
- `historical` rows differ from `default` rows

**`fetchAioFoundPages` (p8-aio-pages)**
- `default` scenario: response has `pages` array
- Each entry has `url` (string), `keyword_count` (integer ≥ 1), `total_traffic` (number ≥ 0)
- Pages are sorted descending by `keyword_count` (first ≥ second ≥ …)

**`fetchAioGapUrls` (o2-aio-gaps)**
- `default` scenario: response has `urls` array
- No `url` contains `config.defaultDomain`
- No `url` contains any domain from `config.defaultCompetitorDomains`
- Each entry has `keyword_count` ≥ 1

**`fetchSerpFeatures('question')` (o5-paa)**
- `default` scenario: response has `type === 'question'` and `results` array
- Each result has `keyword` (string), `position` (number), `items` (array)
- Each item has `url` (string) and `title` (string — the PAA question text)

**`fetchSerpFeatures('discussion')` (o6-discussions)**
- Same structure as above with `type === 'discussion'`
- Each item has `url` and `title` (thread title)

**`fetchSerpFeatures('video')` (o8-videos)**
- Same structure with `type === 'video'`
- Each item has `url`; `title` present when available

---

### `tests/fetchers/web-analytics.test.js`

**`fetchAiReferrersChart` (p6-clicks-ai)**
- All 3 scenarios: response has `points` array
- Each point has `timestamp` (ISO string), `source` (string), `visitors` (number ≥ 0)
- `historical`: all timestamps ≥ `historical.from` and ≤ `historical.to`
- `historical` points differ from `default` points (or both are empty — logged, not failed, since AI traffic may be sparse)

---

## Calculation Tests (`tests/calculations.test.js`)

All calculations mirror the logic in `widgets.js` exactly. They are defined in `tests/calculations.js` as pure functions and tested against live API data fetched once per test file (using the `default` scenario).

### SoV delta (p2-sov-organic)
```
sov_delta = current.share_of_voice - previous.share_of_voice
```
- Given two real `competitors-metrics` arrays, compute deltas
- Assert delta is a finite number for all competitors in both periods
- Assert competitors absent from previous period have `sov_delta = null` (not NaN or 0)
- Assert all `share_of_voice` values are in [0, 100]

### Subfolder grouping (p5-clicks-organic)
```
group key = first path segment of URL, e.g. '/blog/' from '/blog/article-name'
group clicks = sum of member pages' clicks
```
- Assert every group key starts with `/`
- Assert sum of all group clicks equals sum of all page clicks (no data lost)
- Assert no page URL appears in more than one group

### Question keyword regex (o3-question-kw)
```
/^(who|what|why|where|how|when|which|is|are|can|does|do|should)\b/i
```
- Fetch raw `gsc/keywords` unfiltered (limit 500)
- Apply regex client-side
- Assert every keyword in filtered set passes the regex
- Assert at least one raw keyword was excluded (filter is active, not a no-op)

### Long-tail word count (o4-longtail-kw)
```
keyword.trim().split(/\s+/).length >= 5
```
- Fetch raw `gsc/keywords` (limit 500)
- Apply filter client-side
- Assert every result keyword has ≥ 5 tokens
- Assert at least one raw keyword had < 5 tokens (filter did work)

### Domain exclusion (o1-third-domains, o2-aio-gaps)
```
exclude urls/domains containing defaultDomain or any competitorDomain
```
- Assert own domain does not appear in filtered output
- Assert no competitor domain appears in filtered output
- Assert at least one domain was removed (filter fired)

### URL deduplication (o8-videos)
```
Set-based dedup: first occurrence of a URL wins
```
- Collect all raw `items[*].url` across all `results`
- Apply Set dedup
- Assert no URL appears twice in deduplicated output
- Assert deduplicated count ≤ raw item count (dedup only removes, never adds)

### Date boundary cross-check (all date-range fetchers)
For every fetcher that returns records with a `date` field:
- `historical` scenario: assert `min(dates) >= historical.dateFrom`
- `historical` scenario: assert `max(dates) <= historical.dateTo`
- This is the primary regression guard — if a fetcher ignores date overrides, this fails

---

## Failure Reporting

Each failing assertion prints:
- Widget ID and scenario name
- The assertion that failed
- Expected vs actual values

Tests that hit the Ahrefs API and return empty arrays for a specific date range log a warning but do not fail — empty results are valid for sparse date ranges (especially `short` and `historical`). Only shape and calculation assertions are hard failures.

---

## What This Does NOT Cover

- The date picker UI wiring in `app.js` (`buildDateOverrides`, `insights:date-change` event) — this is trivial wiring, low risk
- The Express route layer (`routes/insights-api.js`) — tested implicitly by fetcher tests
- Browser rendering of charts and tables — out of scope for this test suite
