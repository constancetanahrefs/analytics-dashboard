import { ahrefsGet } from '../client.js';
import { config } from '../../config.js';

const PLATFORMS = ['chatgpt', 'gemini', 'perplexity', 'copilot'];

function daysAgoDate(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Build base params shared by all Brand Radar SNAPSHOT calls.
 * - `prompts: 'custom'` (plural — API requirement)
 * - `brand` read from settings (required by API; at least one of brand/competitors/market/where must be set)
 *
 * Strips date_from / date_to / from / to — those are GSC/web-analytics-style range params.
 * Brand Radar snapshot endpoints only accept a single `date` param. Passing range params
 * causes Ahrefs API validation errors when date_to < date_from (e.g. user enters dates
 * in wrong order in the date picker).
 * History fetchers (fetchSovHistory, fetchImpressionsHistory) do NOT use baseParams;
 * they handle date_from/date_to directly so they are unaffected by this strip.
 */
function baseParams(overrides) {
  // eslint-disable-next-line no-unused-vars
  const { date_from, date_to, from, to, ...rest } = overrides;
  const reportId = rest.report_id || config.defaultReportId;
  const brand    = rest.brand      || config.defaultBrandName;
  const p = { prompts: 'custom', ...rest };
  if (reportId) p.report_id = reportId;
  if (brand)    p.brand = brand;
  return p;
}

/** Fetch one endpoint for all 4 platforms in parallel. */
async function fetchAllPlatforms(endpoint, extraParams, overrides, widgetId) {
  const results = await Promise.allSettled(
    PLATFORMS.map(ds =>
      ahrefsGet(endpoint, { ...baseParams(overrides), ...extraParams, data_source: ds }, widgetId)
    )
  );
  return Object.fromEntries(
    PLATFORMS.map((ds, i) => [
      ds,
      results[i].status === 'fulfilled' ? results[i].value : { error: results[i].reason?.message }
    ])
  );
}

// ---------------------------------------------------------------------------
// SoV — Custom Prompts
// select: share_of_voice, brand  (NOT sov/brand_sov/competitor_sov)
// ---------------------------------------------------------------------------
export const sovCustomPromptsConfig = {
  endpoint: 'brand-radar/sov-overview',
  params: { select: 'share_of_voice,brand', prompts: 'custom', data_source: 'chatgpt|gemini|perplexity|copilot' }
};

export async function fetchSovCustomPrompts(overrides = {}, widgetId) {
  const aioResult = await ahrefsGet(
    'brand-radar/sov-overview',
    { ...baseParams(overrides), select: 'share_of_voice,brand', data_source: 'google_ai_overviews' },
    widgetId
  ).catch(e => ({ error: e.message }));

  const platformResults = await fetchAllPlatforms(
    'brand-radar/sov-overview',
    { select: 'share_of_voice,brand' },
    overrides,
    widgetId
  );

  return { ...platformResults, google_ai_overviews: aioResult };
}

// ---------------------------------------------------------------------------
// Cited Pages — all 4 platforms in parallel
// select: url, responses  (NOT response_count; order_by not valid here)
// ---------------------------------------------------------------------------
export const citedPagesConfig = {
  endpoint: 'brand-radar/cited-pages',
  params: { select: 'url,title,responses', prompts: 'custom', data_source: 'chatgpt|gemini|perplexity|copilot' }
};

export async function fetchCitedPages(overrides = {}, widgetId) {
  return fetchAllPlatforms(
    'brand-radar/cited-pages',
    { select: 'url,title,responses', limit: 50 },
    overrides,
    widgetId
  );
}

// ---------------------------------------------------------------------------
// Cited Domains — all 4 platforms in parallel
// select: domain, responses  (NOT response_count; order_by not valid here)
// ---------------------------------------------------------------------------
export const citedDomainsConfig = {
  endpoint: 'brand-radar/cited-domains',
  params: { select: 'domain,responses', prompts: 'custom', data_source: 'chatgpt|gemini|perplexity|copilot' }
};

export async function fetchCitedDomains(overrides = {}, widgetId) {
  return fetchAllPlatforms(
    'brand-radar/cited-domains',
    { select: 'domain,responses', limit: 50 },
    overrides,
    widgetId
  );
}

// ---------------------------------------------------------------------------
// Cited Pages (AIO) — fixed data_source: google_ai_overviews
// ---------------------------------------------------------------------------
export const citedPagesAioConfig = {
  endpoint: 'brand-radar/cited-pages',
  params: { select: 'url,title,responses', prompts: 'custom', data_source: 'google_ai_overviews', limit: 50 }
};

export async function fetchCitedPagesAio(overrides = {}, widgetId) {
  return ahrefsGet(
    'brand-radar/cited-pages',
    { ...baseParams(overrides), select: 'url,title,responses', data_source: 'google_ai_overviews', limit: 50 },
    widgetId
  );
}

// ---------------------------------------------------------------------------
// Cited Domains (AIO) — fixed data_source: google_ai_overviews
// ---------------------------------------------------------------------------
export const citedDomainsAioConfig = {
  endpoint: 'brand-radar/cited-domains',
  params: { select: 'domain,responses', prompts: 'custom', data_source: 'google_ai_overviews', limit: 50 }
};

export async function fetchCitedDomainsAio(overrides = {}, widgetId) {
  return ahrefsGet(
    'brand-radar/cited-domains',
    { ...baseParams(overrides), select: 'domain,responses', data_source: 'google_ai_overviews', limit: 50 },
    widgetId
  );
}

// ---------------------------------------------------------------------------
// AI Responses (co-mention / sentiment) — all 4 platforms in parallel
// select: question, response, data_source  (NOT query — field is 'question')
// order_by: 'relevance' | 'volume' only
// ---------------------------------------------------------------------------
export const aiResponsesConfig = {
  endpoint: 'brand-radar/ai-responses',
  params: { select: 'question,response,data_source', prompts: 'custom', data_source: 'chatgpt|gemini|perplexity|copilot' }
};

export async function fetchAiResponses(overrides = {}, widgetId) {
  return fetchAllPlatforms(
    'brand-radar/ai-responses',
    { select: 'question,response,data_source', limit: 100, order_by: 'relevance' },
    overrides,
    widgetId
  );
}

// ---------------------------------------------------------------------------
// SoV History (over time, per platform)
// Returns: { metrics: [{ date, share_of_voice: [{...}] }] }
// ---------------------------------------------------------------------------
export const sovHistoryConfig = {
  endpoint: 'brand-radar/sov-history',
  params: { prompts: 'custom', data_source: 'chatgpt,gemini,perplexity,copilot', select: 'share_of_voice,date', note: 'Single call all platforms; returns flat { metrics: [{date, share_of_voice}] }' }
};

export async function fetchSovHistory(overrides = {}, widgetId) {
  const reportId = overrides.report_id || config.defaultReportId;
  const brand    = overrides.brand      || config.defaultBrandName;
  const p = { prompts: 'custom', data_source: 'chatgpt,gemini,perplexity,copilot', select: 'share_of_voice,date', ...overrides };
  if (reportId) p.report_id = reportId;
  if (brand)    p.brand = brand;
  if (!p.date_from) p.date_from = daysAgoDate(365);
  if (!p.date_to)   p.date_to   = daysAgoDate(0);
  return ahrefsGet('brand-radar/sov-history', p, widgetId);
}

// ---------------------------------------------------------------------------
// Impressions History (over time, per platform)
// Returns: { metrics: [{ date, impressions }] }
// ---------------------------------------------------------------------------
export const impressionsHistoryConfig = {
  endpoint: 'brand-radar/impressions-history',
  params: { prompts: 'custom', data_source: 'chatgpt|gemini|perplexity|copilot', note: 'One call per platform; brand is required' }
};

export async function fetchImpressionsHistory(overrides = {}, widgetId) {
  const reportId = overrides.report_id || config.defaultReportId;
  const brand    = overrides.brand      || config.defaultBrandName;
  const results  = await Promise.allSettled(
    PLATFORMS.map(ds => {
      const p = { prompts: 'custom', data_source: ds, ...overrides };
      if (reportId) p.report_id = reportId;
      if (brand)    p.brand = brand;
      if (!p.date_from) p.date_from = daysAgoDate(90);  // required by API
      if (!p.date_to)   p.date_to   = daysAgoDate(0);
      return ahrefsGet('brand-radar/impressions-history', p, widgetId);
    })
  );
  return Object.fromEntries(
    PLATFORMS.map((ds, i) => [
      ds,
      results[i].status === 'fulfilled' ? results[i].value : { error: results[i].reason?.message }
    ])
  );
}

// ---------------------------------------------------------------------------
// Cited pages filtered by video domains (youtube, tiktok)
// ---------------------------------------------------------------------------
export const videoCitedPagesConfig = {
  endpoint: 'brand-radar/cited-pages',
  params: { prompts: 'custom', data_source: 'chatgpt,gemini,perplexity,copilot', note: 'Fetches all cited pages; youtube.com and tiktok.com filtered client-side.' }
};

const VIDEO_DOMAINS = ['youtube', 'tiktok'];

export async function fetchVideoCitedPages(overrides = {}, widgetId) {
  const p = {
    ...baseParams(overrides),
    data_source: 'chatgpt,gemini,perplexity,copilot',
    select: 'url,responses',
    limit: 100,
    date: overrides.date || new Date().toISOString().slice(0, 10)
  };
  const data = await ahrefsGet('brand-radar/cited-pages', p, widgetId);
  const pages = (data.pages || []).filter(page =>
    VIDEO_DOMAINS.some(d => page.url?.includes(d))
  );
  return { ...data, pages };
}

// ---------------------------------------------------------------------------
// Cited pages filtered by reddit.com, quora.com
// ---------------------------------------------------------------------------
export const discussionCitedPagesConfig = {
  endpoint: 'brand-radar/cited-pages',
  params: { prompts: 'custom', data_source: 'chatgpt|gemini|perplexity|copilot', note: 'Fetches all cited pages per platform; reddit.com and quora.com filtered client-side.' }
};

const DISCUSSION_DOMAINS = ['reddit', 'quora'];

export async function fetchDiscussionCitedPages(overrides = {}, widgetId) {
  const results = await Promise.allSettled(
    PLATFORMS.map(ds => {
      const p = {
        ...baseParams(overrides),
        data_source: ds,
        select: 'url,responses',
        limit: 100,
        date: overrides.date || new Date().toISOString().slice(0, 10)
      };
      return ahrefsGet('brand-radar/cited-pages', p, widgetId);
    })
  );
  return Object.fromEntries(
    PLATFORMS.map((ds, i) => {
      if (results[i].status === 'rejected') return [ds, { error: results[i].reason?.message }];
      const data = results[i].value;
      const pages = (data.pages || []).filter(page =>
        DISCUSSION_DOMAINS.some(d => page.url?.includes(d))
      );
      return [ds, { ...data, pages }];
    })
  );
}

// ---------------------------------------------------------------------------
// Third-party cited domains excluding own domain (client-side filtered)
// ---------------------------------------------------------------------------
export const thirdPartyDomainsConfig = {
  endpoint: 'brand-radar/cited-domains',
  params: { prompts: 'custom', data_source: 'chatgpt,gemini,perplexity,copilot', select: 'volume,mentions,responses,domain,pages', limit: 25, note: 'Single combined call. Own domain + competitor domains filtered client-side.' }
};

export async function fetchThirdPartyDomains(overrides = {}, widgetId) {
  const p = {
    ...baseParams(overrides),
    data_source: 'chatgpt,gemini,perplexity,copilot',
    select: 'volume,mentions,responses,domain,pages',
    limit: 25,
    date: overrides.date || new Date().toISOString().slice(0, 10)
  };
  return ahrefsGet('brand-radar/cited-domains', p, widgetId);
}
