import { ahrefsGet } from '../client.js';
import { config } from '../../config.js';

function defaultProjectId(overrides) {
  return overrides.project_id || config.defaultWebAnalyticsProjectId || config.defaultProjectId;
}

function isoTimestamp(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Traffic Chart (total, with source breakdown)
// ---------------------------------------------------------------------------
export const trafficChartConfig = {
  endpoint: 'web-analytics/chart',
  params: { granularity: 'daily', note: 'Returns pageviews/visitors/sessions over time; channel dropdown available in UI' }
};

export async function fetchTrafficChart(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const params = {
    granularity: 'daily',
    from: isoTimestamp(90),
    to: new Date().toISOString(),
    ...overrides,
    project_id: projectId
  };
  return ahrefsGet('web-analytics/chart', params, widgetId);
}

// ---------------------------------------------------------------------------
// Source Channels (Organic, Direct, Referral, AI Search, Paid, etc.)
// ---------------------------------------------------------------------------
export const sourceChannelsConfig = {
  endpoint: 'web-analytics/source-channels',
  params: { select: 'channel,visitors,pageviews,sessions,bounce_rate' }
};

export async function fetchSourceChannels(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const params = {
    from: isoTimestamp(90),
    to: new Date().toISOString(),
    ...overrides,
    project_id: projectId
  };
  return ahrefsGet('web-analytics/source-channels', params, widgetId);
}

// ---------------------------------------------------------------------------
// AI Search Clicks — uses "llm" channel filter
// Falls back to referrers filtered by AI domains if channel returns no data
// ---------------------------------------------------------------------------
export const aiSearchClicksConfig = {
  endpoint: 'web-analytics/source-channels',
  params: { channel: 'llm', note: 'Filters for llm channel; falls back to web-analytics/referrers with known AI domains if unavailable' }
};

const AI_REFERRER_DOMAINS = [
  'perplexity.ai', 'chat.openai.com', 'gemini.google.com',
  'copilot.microsoft.com', 'claude.ai', 'you.com', 'phind.com', 'bing.com'
];

export async function fetchAiSearchClicks(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  try {
    const data = await fetchSourceChannels({ ...overrides, project_id: projectId }, widgetId);
    const channels = data.stats || [];
    const aiChannel = channels.find(c => c.source_channel?.toLowerCase() === 'llm');
    if (aiChannel) return { source: 'channel', data: aiChannel, all_channels: channels };
    // channel exists but no AI row — fall through to referrer fallback
  } catch (err) {
    // log already written in client.js — fall through to fallback
  }
  // Fallback: sum up referrers matching known AI domains
  try {
    const refData = await ahrefsGet('web-analytics/referrers', {
      from: isoTimestamp(90),
      to: new Date().toISOString(),
      project_id: projectId,
      ...overrides
    }, widgetId);
    const aiRefs = (refData.stats || []).filter(r =>
      AI_REFERRER_DOMAINS.some(d => r.source_referer?.includes(d))
    );
    return { source: 'referrer_fallback', data: aiRefs, fallback_reason: 'AI Search channel not found in web-analytics/source-channels' };
  } catch (fallbackErr) {
    throw fallbackErr;
  }
}

// ---------------------------------------------------------------------------
// Top Pages
// ---------------------------------------------------------------------------
export const topPagesConfig = {
  endpoint: 'web-analytics/top-pages',
  params: { select: 'url,visitors,pageviews,sessions', order_by: 'visitors:desc', limit: 50 }
};

export async function fetchTopPages(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const params = {
    order_by: 'visitors:desc',
    from: isoTimestamp(90),
    to: new Date().toISOString(),
    limit: 50,
    ...overrides,
    project_id: projectId
  };
  return ahrefsGet('web-analytics/top-pages', params, widgetId);
}

// Pages with biggest traffic changes between two periods
export const trafficChangesConfig = {
  endpoint: 'web-analytics/top-pages',
  params: { note: 'Fetches two date ranges and compares visitor counts to find increases/decreases' }
};

export async function fetchTrafficChanges(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const periodDays = overrides.period_days || 30;

  const [current, previous] = await Promise.all([
    fetchTopPages({ ...overrides, project_id: projectId, from: isoTimestamp(periodDays), to: new Date().toISOString(), limit: 200 }, widgetId),
    fetchTopPages({ ...overrides, project_id: projectId, from: isoTimestamp(periodDays * 2), to: isoTimestamp(periodDays), limit: 200 }, widgetId)
  ]);

  const prevMap = {};
  for (const p of (previous.stats || [])) prevMap[p.url] = p.visitors || 0;

  const changes = (current.stats || []).map(p => ({
    url: p.url,
    visitors_current: p.visitors || 0,
    visitors_previous: prevMap[p.url] || 0,
    change: (p.visitors || 0) - (prevMap[p.url] || 0),
    change_pct: prevMap[p.url] ? (((p.visitors || 0) - prevMap[p.url]) / prevMap[p.url] * 100).toFixed(1) : null
  }));

  return {
    increases: changes.filter(c => c.change > 0).sort((a, b) => b.change - a.change).slice(0, 20),
    decreases: changes.filter(c => c.change < 0).sort((a, b) => a.change - b.change).slice(0, 20),
    no_traffic: changes.filter(c => c.visitors_current === 0).sort((a, b) => a.url.localeCompare(b.url))
  };
}

// ---------------------------------------------------------------------------
// Referrers (for AI platform breakdown)
// ---------------------------------------------------------------------------
export const referrersConfig = {
  endpoint: 'web-analytics/referrers',
  params: { select: 'referrer,visitors,sessions', order_by: 'visitors:desc', limit: 100 }
};

export async function fetchReferrers(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const params = {
    order_by: 'visitors:desc',
    from: isoTimestamp(90),
    to: new Date().toISOString(),
    limit: 100,
    ...overrides,
    project_id: projectId
  };
  return ahrefsGet('web-analytics/referrers', params, widgetId);
}

// ---------------------------------------------------------------------------
// AI Clicks Over Time — sources-chart filtered by source_channel=llm
// Returns: { points: [{ timestamp, source, visitors }] } — one flat array,
// each point tagged with `source`; renderer groups into one line per source.
// ---------------------------------------------------------------------------
export const aiReferrersChartConfig = {
  endpoint: 'web-analytics/sources-chart',
  params: { granularity: 'daily', where: 'source_channel eq llm', note: 'Single call; all AI sources returned with source field per point' }
};

export async function fetchAiReferrersChart(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const params = {
    granularity: 'daily',
    ...overrides,
    project_id: projectId,
    from: overrides.from || isoTimestamp(30),
    to: overrides.to || new Date().toISOString(),
    where: JSON.stringify({ and: [{ field: 'source_channel', is: ['eq', 'llm'] }] })
  };
  return ahrefsGet('web-analytics/sources-chart', params, widgetId);
}
