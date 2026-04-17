import { logFetch, getSetting } from '../db/db.js';

const BASE_URL = 'https://api.ahrefs.com/v3';

class TimeoutError extends Error {
  constructor(ms) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.isTimeout = true;
  }
}

class ApiError extends Error {
  constructor(httpCode, message) {
    super(message);
    this.name = 'ApiError';
    this.httpCode = httpCode;
  }
}

/**
 * Make a GET request to the Ahrefs API v3.
 * @param {string} endpoint  - e.g. "brand-radar/sov-overview"
 * @param {object} params    - query params
 * @param {string} widgetId  - used for logging
 * @returns {Promise<object>} parsed JSON response
 */
export async function ahrefsGet(endpoint, params = {}, widgetId = null) {
  // DB is the source of truth at runtime; env is the bootstrap fallback
  const apiKey = getSetting('ahrefs_api_key') || process.env.AHREFS_API_KEY;
  if (!apiKey) {
    throw new Error('AHREFS_API_KEY is not configured. Set it in .env or the Settings page.');
  }
  const timeoutMs = parseInt(getSetting('timeout_ms') || process.env.TIMEOUT_MS || '30000', 10);

  const url = new URL(`${BASE_URL}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    const duration = Date.now() - start;

    if (!res.ok) {
      let errorMessage;
      try {
        const body = await res.json();
        errorMessage = body.error || body.message || `HTTP ${res.status}`;
      } catch {
        errorMessage = `HTTP ${res.status}`;
      }
      logFetch({ widgetId, endpoint, params, status: 'error', httpCode: res.status, durationMs: duration, errorMessage });
      throw new ApiError(res.status, errorMessage);
    }

    const data = await res.json();
    logFetch({ widgetId, endpoint, params, status: 'success', httpCode: res.status, durationMs: duration });
    return data;

  } catch (err) {
    const duration = Date.now() - start;
    if (err.name === 'AbortError') {
      logFetch({ widgetId, endpoint, params, status: 'timeout', httpCode: null, durationMs: duration, errorMessage: `Timed out after ${timeoutMs}ms` });
      throw new TimeoutError(timeoutMs);
    }
    if (err instanceof ApiError) throw err;
    // Network or other errors
    logFetch({ widgetId, endpoint, params, status: 'error', httpCode: null, durationMs: duration, errorMessage: err.message });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export { TimeoutError, ApiError };
