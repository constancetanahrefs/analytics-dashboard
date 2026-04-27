import { ahrefsGet } from '../client.js';
import { fetchPageTitles } from './site-explorer.js';
import { config } from '../../config.js';

function defaultProjectId(overrides) {
  return overrides.project_id || config.defaultProjectId;
}

function dateFrom(daysBack = 90) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/**
 * Strip non-GSC date params from overrides.
 * buildDateOverrides() in the insights frontend sends { date, date_from, date_to, from, to }
 * to every widget. GSC endpoints only accept date_from / date_to (YYYY-MM-DD strings).
 * Sending `from`, `to` (ISO timestamps) or `date` (single snapshot date) causes HTTP 500.
 */
function gscOverrides(overrides) {
  // eslint-disable-next-line no-unused-vars
  const { date, from, to, ...rest } = overrides;
  return rest;
}

// ---------------------------------------------------------------------------
// Performance History (clicks, impressions, position over time)
// ---------------------------------------------------------------------------
export const performanceHistoryConfig = {
  endpoint: 'gsc/performance-history',
  params: { select: 'date,clicks,impressions,ctr,position', granularity: 'daily' }
};

export async function fetchPerformanceHistory(overrides = {}, widgetId) {
  const clean = gscOverrides(overrides);
  const projectId = defaultProjectId(clean);
  const params = {
    date_from: dateFrom(90),
    history_grouping: 'daily',
    ...clean,
    project_id: projectId
  };
  return ahrefsGet('gsc/performance-history', params, widgetId);
}

// ---------------------------------------------------------------------------
// Positions History (keywords by position bucket over time)
// ---------------------------------------------------------------------------
export const positionsHistoryConfig = {
  endpoint: 'gsc/positions-history',
  params: { select: 'date,top3,top10,top20,top50,top100' }
};

export async function fetchPositionsHistory(overrides = {}, widgetId) {
  const clean = gscOverrides(overrides);
  const projectId = defaultProjectId(clean);
  const params = {
    date_from: dateFrom(365),
    ...clean,
    project_id: projectId
  };
  return ahrefsGet('gsc/positions-history', params, widgetId);
}

// ---------------------------------------------------------------------------
// Performance by Position (CTR, clicks grouped by position range)
// ---------------------------------------------------------------------------
export const performanceByPositionConfig = {
  endpoint: 'gsc/performance-by-position',
  params: { select: 'position_group,clicks,impressions,ctr' }
};

export async function fetchPerformanceByPosition(overrides = {}, widgetId) {
  const clean = gscOverrides(overrides);
  const projectId = defaultProjectId(clean);
  const params = {
    date_from: dateFrom(90),
    ...clean,
    project_id: projectId
  };
  return ahrefsGet('gsc/performance-by-position', params, widgetId);
}

// ---------------------------------------------------------------------------
// Keywords (with optional filter for branded or question keywords)
// ---------------------------------------------------------------------------
export const keywordsConfig = {
  endpoint: 'gsc/keywords',
  params: { select: 'keyword,clicks,impressions,ctr,position', order_by: 'impressions:desc', limit: 100 }
};

export async function fetchKeywords(overrides = {}, widgetId) {
  const clean = gscOverrides(overrides);
  const projectId = defaultProjectId(clean);
  const params = {
    order_by: 'impressions:desc',
    date_from: dateFrom(90),
    limit: 100,
    ...clean,
    project_id: projectId
  };
  return ahrefsGet('gsc/keywords', params, widgetId);
}

// Branded keywords: filter server-side by brand name after fetching
export const brandedKeywordsConfig = {
  endpoint: 'gsc/keywords',
  params: { select: 'keyword,clicks,impressions,ctr,position', filter: 'keyword contains {brand_name}', order_by: 'impressions:desc', limit: 100 }
};

export async function fetchBrandedKeywords(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const brandName = overrides.brand_name || config.defaultBrandName || '';
  const data = await fetchKeywords({ ...overrides, project_id: projectId }, widgetId);
  if (!brandName) return data;
  const lower = brandName.toLowerCase();
  const filtered = (data.keywords || []).filter(k => k.keyword?.toLowerCase().includes(lower));
  return { ...data, keywords: filtered };
}

// Question keywords: server-side iphrase_match filter for question words
const QUESTION_WORDS = ['who', 'what', 'where', 'how', 'why', 'when', 'can', 'does', 'should'];

export const questionKeywordsConfig = {
  endpoint: 'gsc/keywords',
  params: { select: 'keyword,clicks,impressions,ctr,position', order_by: 'impressions:desc', limit: 500, where: 'iphrase_match on question words' }
};

export async function fetchQuestionKeywords(overrides = {}, widgetId) {
  const clean = gscOverrides(overrides);
  const projectId = defaultProjectId(clean);
  const where = JSON.stringify({
    and: [
      {
        or: QUESTION_WORDS.map(w => ({
          field: 'keyword',
          is: ['iphrase_match', w]
        }))
      }
    ]
  });
  const params = {
    order_by: 'impressions:desc',
    date_from: dateFrom(90),
    limit: 500,
    ...clean,
    project_id: projectId,
    where
  };
  return ahrefsGet('gsc/keywords', params, widgetId);
}

// ---------------------------------------------------------------------------
// Pages (by impressions)
// ---------------------------------------------------------------------------
export const pagesConfig = {
  endpoint: 'gsc/pages',
  params: { select: 'url,clicks,impressions,ctr,position', order_by: 'impressions:desc', limit: 50 }
};

export async function fetchPages(overrides = {}, widgetId) {
  const clean = gscOverrides(overrides);
  const projectId = defaultProjectId(clean);
  const params = {
    order_by: 'impressions:desc',
    date_from: dateFrom(90),
    limit: 50,
    ...clean,
    project_id: projectId
  };
  const data = await ahrefsGet('gsc/pages', params, widgetId);

  // Enrich with page titles from site-explorer/top-pages
  const domain = overrides.domain || config.defaultDomain;
  const pages = data.pages || [];
  if (domain && pages.length) {
    try {
      const titleMap = await fetchPageTitles(domain, widgetId);
      for (const p of pages) p.title = titleMap[p.url] || titleMap[p.page] || null;
    } catch { /* titles are best-effort */ }
  }

  return { ...data, pages };
}

// GSC impressions split — branded vs unbranded (derived from keywords)
export const impressionsSplitConfig = {
  endpoint: 'gsc/keywords',
  params: { select: 'keyword,impressions', filter: 'branded vs unbranded split derived from brand_name setting', limit: 1000 }
};

export async function fetchImpressionsSplit(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const brandName = overrides.brand_name || config.defaultBrandName || '';
  const data = await fetchKeywords({ ...overrides, project_id: projectId, limit: 1000 }, widgetId);
  const lower = brandName.toLowerCase();
  let branded = 0, unbranded = 0;
  for (const k of (data.keywords || [])) {
    if (brandName && k.keyword?.toLowerCase().includes(lower)) {
      branded += k.impressions || 0;
    } else {
      unbranded += k.impressions || 0;
    }
  }
  return { branded, unbranded, total: branded + unbranded };
}

// Long-tail keywords: 5+ words, filtered client-side
// (gsc/keywords does not expose keyword_words as a filterable where field)
export const longTailKeywordsConfig = {
  endpoint: 'gsc/keywords',
  params: { order_by: 'impressions:desc', limit: 500, note: 'keyword_words filter applied client-side' }
};

export async function fetchLongTailKeywords(overrides = {}, widgetId) {
  const clean = gscOverrides(overrides);
  const projectId = defaultProjectId(clean);
  const params = {
    order_by: 'impressions:desc',
    date_from: dateFrom(90),
    limit: 500,
    ...clean,
    project_id: projectId
  };
  const data = await ahrefsGet('gsc/keywords', params, widgetId);
  const filtered = (data.keywords || []).filter(
    k => k.keyword && k.keyword.trim().split(/\s+/).length >= 5
  );
  return { ...data, keywords: filtered };
}
