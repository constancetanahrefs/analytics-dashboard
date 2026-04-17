/**
 * Shared application state — imported by both app.js and widgets.js.
 * Avoids prop-drilling date context through every function call.
 */

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

const today = new Date();
const monthAgo = new Date(today);
monthAgo.setDate(monthAgo.getDate() - 30);

export const dateCtx = {
  primary: toDateStr(today),   // "current" date
  compare: toDateStr(monthAgo) // comparison baseline (1 month ago)
};

/**
 * Map the shared date context to the correct param names for each endpoint family.
 * Called just before a fetch so widgets always use the latest picker values.
 *
 * @param {string} endpoint  - e.g. "rank-tracker/overview"
 * @returns {object}         - params to merge into the fetcher overrides
 */
export function getDateParams(endpoint) {
  if (endpoint.startsWith('rank-tracker/')) {
    return {
      date: dateCtx.primary,
      date_compared: dateCtx.compare
    };
  }
  if (endpoint.startsWith('gsc/')) {
    return {
      date_from: dateCtx.compare,
      date_to: dateCtx.primary
    };
  }
  if (endpoint.startsWith('web-analytics/')) {
    return {
      from: dateCtx.compare + 'T00:00:00.000Z',
      to: dateCtx.primary + 'T23:59:59.000Z'
    };
  }
  if (endpoint.startsWith('brand-radar/')) {
    return { date: dateCtx.primary };
  }
  return {};
}
