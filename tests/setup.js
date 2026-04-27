// tests/setup.js
// Must be the first import in every test file — loads .env before config.js evaluates.
import 'dotenv/config';
import assert from 'node:assert/strict';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

// Three date scenarios used across all test files.
// 'default'    — known-working baseline (1 month window ending today)
// 'historical' — proves dates are forwarded; data must differ from default
// 'short'      — stress-tests sparse-data handling (7-day window)
export const SCENARIOS = {
  default: {
    dateFrom: monthsAgo(1),
    dateTo:   daysAgo(0),
  },
  historical: {
    dateFrom: monthsAgo(3),
    dateTo:   monthsAgo(2),
  },
  short: {
    dateFrom: daysAgo(7),
    dateTo:   daysAgo(1),
  }
};

// Add ISO timestamp versions for Web Analytics endpoints (use 'from'/'to' not 'date_from'/'date_to')
for (const s of Object.values(SCENARIOS)) {
  s.from = s.dateFrom + 'T00:00:00.000Z';
  s.to   = s.dateTo   + 'T23:59:59.000Z';
}

// ── Assertion helpers ────────────────────────────────────────────────────────

/** Assert val is a finite number — not NaN, Infinity, null, or string. */
export function assertNumber(val, label) {
  assert.ok(
    typeof val === 'number' && isFinite(val),
    `${label}: expected finite number, got ${JSON.stringify(val)}`
  );
}

/** Assert a YYYY-MM-DD string falls within [from, to] inclusive. */
export function assertDateInRange(dateStr, from, to, label) {
  const d = (dateStr || '').slice(0, 10);
  assert.ok(
    d >= from && d <= to,
    `${label}: date ${d} is outside range [${from}, ${to}]`
  );
}

/** Assert two values are not deeply equal — proves data changes when dates change. */
export function assertDiffers(a, b, label) {
  assert.notDeepStrictEqual(a, b, `${label}: expected values to differ but they are identical`);
}

/** Assert arr is a non-empty array. */
export function assertNonEmpty(arr, label) {
  assert.ok(Array.isArray(arr) && arr.length > 0, `${label}: expected non-empty array, got ${JSON.stringify(arr)}`);
}

/** Assert no item in arr satisfies predicate. */
export function assertNoneMatch(arr, predicate, label) {
  const matches = arr.filter(predicate);
  assert.strictEqual(
    matches.length, 0,
    `${label}: expected no matches, found ${JSON.stringify(matches)}`
  );
}

/** Log a warning for a scenario that returned no data (not a test failure). */
export function warnEmpty(widgetId, scenario, message) {
  console.warn(`  ⚠ [${widgetId}] ${scenario}: ${message} (not a failure — may be sparse data)`);
}
