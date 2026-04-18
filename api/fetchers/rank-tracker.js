import { ahrefsGet } from '../client.js';
import { config } from '../../config.js';

function defaultProjectId(overrides) {
  return overrides.project_id || config.defaultProjectId;
}

function defaultCountry(overrides) {
  return overrides.country || config.defaultCountry;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Overview (tracked keyword rankings)
// ---------------------------------------------------------------------------
export const overviewConfig = {
  endpoint: 'rank-tracker/overview',
  params: { select: 'keyword,position,url,traffic,volume,serp_features', device: 'desktop', date: 'today' }
};

export async function fetchOverview(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const params = {
    select: 'keyword,position,url,traffic,volume,serp_features',
    device: 'desktop',
    date: today(),
    ...overrides,
    project_id: projectId
  };
  return ahrefsGet('rank-tracker/overview', params, widgetId);
}

// SoV — Organic: via competitors-stats (share_of_voice + share_of_traffic_value)
export const sovOrganicConfig = {
  endpoint: 'rank-tracker/competitors-stats',
  params: { select: 'competitor,share_of_voice,share_of_traffic_value', device: 'desktop', volume_mode: 'monthly', date: 'today' }
};

export async function fetchSovOrganic(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const params = {
    select: 'competitor,share_of_voice,share_of_traffic_value',
    device: 'desktop',
    volume_mode: 'monthly',
    date: today(),
    ...overrides,
    project_id: projectId
  };
  return ahrefsGet('rank-tracker/competitors-stats', params, widgetId);
}

// SoV — AIO: % of tracked keywords that have AI Overview SERP feature
export const sovAioConfig = {
  endpoint: 'rank-tracker/overview',
  params: { select: 'keyword,position,serp_features', device: 'desktop', date: 'today', note: 'SoV in AIO = % of tracked keywords with ai_overview SERP feature' }
};

export async function fetchSovAio(overrides = {}, widgetId) {
  const data = await fetchOverview({ ...overrides, select: 'keyword,position,serp_features,traffic,volume' }, widgetId);
  const keywords = data.overviews || [];
  const total = keywords.length;
  const withAio = keywords.filter(k => Array.isArray(k.serp_features) && k.serp_features.includes('ai_overview'));
  return {
    total,
    with_aio: withAio.length,
    sov_percent: total ? ((withAio.length / total) * 100).toFixed(1) : 0,
    top_keywords: withAio.sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 20),
    top_pages: groupByUrl(withAio).slice(0, 20)
  };
}

function groupByUrl(keywords) {
  const map = {};
  for (const k of keywords) {
    if (!k.url) continue;
    if (!map[k.url]) map[k.url] = { url: k.url, keyword_count: 0, total_traffic: 0 };
    map[k.url].keyword_count++;
    map[k.url].total_traffic += k.traffic || 0;
  }
  return Object.values(map).sort((a, b) => b.total_traffic - a.total_traffic);
}

// ---------------------------------------------------------------------------
// SERP Overview — for PAA, Discussion, Video SERP features
// ---------------------------------------------------------------------------
export const serpOverviewConfig = {
  endpoint: 'rank-tracker/serp-overview',
  params: { select: 'keyword,position,serp_features,serp_items', device: 'desktop', note: 'Filter serp_items by type: question | discussion | video | video_th' }
};

export async function fetchSerpOverview(keyword, overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  // Note: serp-overview has no `select` param; returns { positions: [...] }
  const params = {
    device: 'desktop',
    country: defaultCountry(overrides),
    keyword,
    ...overrides,
    project_id: projectId
  };
  return ahrefsGet('rank-tracker/serp-overview', params, widgetId);
}

// Fetch PAA questions across all tracked keywords
export const serpPaaConfig = {
  endpoint: 'rank-tracker/serp-overview',
  params: { select: 'keyword,serp_items', device: 'desktop', filter: 'type=question', note: 'Returns PAA questions from SERP for all tracked keywords' }
};

// serp_features values used as pre-filter in Step 1 (overview)
const SERP_FEATURE_FILTER = {
  question:   ['question'],
  discussion: ['discussion'],
  video:      ['video', 'video_th']
};

export async function fetchSerpFeatures(type, overrides = {}, widgetId) {
  // Step 1: fetch only keywords whose serp_features include the relevant type,
  // using the server-side `where` filter so we don't waste API calls on irrelevant keywords.
  const featureValues = SERP_FEATURE_FILTER[type] || [type];
  const whereFilter = featureValues.length === 1
    ? { field: 'serp_features', list_is: { any: ['eq', featureValues[0]] } }
    : { or: featureValues.map(v => ({ field: 'serp_features', list_is: { any: ['eq', v] } })) };

  const overviewData = await fetchOverview({
    ...overrides,
    select: 'keyword,position,serp_features',
    where: JSON.stringify(whereFilter)
  }, widgetId);

  const keywords = (overviewData.overviews || []).slice(0, 50);

  // Step 2: fetch SERP positions in parallel batches of 5 to avoid long sequential waits
  const BATCH = 5;
  const results = [];
  for (let i = 0; i < keywords.length; i += BATCH) {
    const batch = keywords.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(kw => fetchSerpOverview(kw.keyword, overrides, widgetId))
    );
    for (let j = 0; j < batch.length; j++) {
      if (settled[j].status === 'rejected') continue;
      const kw = batch[j];
      const items = (settled[j].value.positions || []).filter(item => {
        const types = Array.isArray(item.type) ? item.type : [item.type];
        if (type === 'video') return types.includes('video') || types.includes('video_th');
        return types.includes(type);
      });
      if (items.length) results.push({ keyword: kw.keyword, position: kw.position, items });
    }
  }
  return { type, results };
}

// ---------------------------------------------------------------------------
// Competitors Overview
// ---------------------------------------------------------------------------
export const competitorsOverviewConfig = {
  endpoint: 'rank-tracker/competitors-overview',
  params: { select: 'keyword,position,url,competitor', device: 'desktop', date: 'today' }
};

export async function fetchCompetitorsOverview(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const params = {
    select: 'keyword,position,url,competitor,serp_features',
    device: 'desktop',
    date: today(),
    ...overrides,
    project_id: projectId
  };
  return ahrefsGet('rank-tracker/competitors-overview', params, widgetId);
}

// Keywords where competitor has AIO but you don't
export const competitorAioGapsConfig = {
  endpoint: 'rank-tracker/competitors-overview vs rank-tracker/overview',
  params: { select: 'keyword,serp_features', device: 'desktop', date: 'today', note: 'Cross-references competitor AIO presence vs yours' }
};

export async function fetchCompetitorAioGaps(overrides = {}, widgetId) {
  const [myData, compData] = await Promise.all([
    fetchOverview({ ...overrides, select: 'keyword,position,serp_features' }, widgetId),
    fetchCompetitorsOverview({ ...overrides }, widgetId)
  ]);
  const myAioKeywords = new Set(
    (myData.overviews || [])
      .filter(k => Array.isArray(k.serp_features) && k.serp_features.includes('ai_overview'))
      .map(k => k.keyword)
  );
  // competitors-overview: each entry has competitors_list array per keyword
  const gaps = [];
  for (const overview of (compData.overviews || [])) {
    for (const comp of (overview.competitors_list || [])) {
      const compTypes = Array.isArray(comp.serp_features) ? comp.serp_features : [];
      if (compTypes.includes('ai_overview') && !myAioKeywords.has(overview.keyword)) {
        gaps.push({ keyword: overview.keyword, competitor: comp.competitor, position: comp.position });
      }
    }
  }
  return { gaps };
}

// ---------------------------------------------------------------------------
// Competitors Stats (for SoV comparison)
// ---------------------------------------------------------------------------
export const competitorsStatsConfig = {
  endpoint: 'rank-tracker/competitors-stats',
  params: { select: 'competitor,sov,traffic,traffic_value', device: 'desktop', date: 'today' }
};

export async function fetchCompetitorsStats(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const params = {
    select: 'competitor,sov,traffic,traffic_value',
    device: 'desktop',
    date: today(),
    ...overrides,
    project_id: projectId
  };
  return ahrefsGet('rank-tracker/competitors-stats', params, widgetId);
}

// ---------------------------------------------------------------------------
// Pages cited in AI Overviews (our domain appears in AIO)
// Step 1: overview filtered for ai_overview_found
// Step 2: serp-overview filtered for ai_overview type — extract URLs
// ---------------------------------------------------------------------------
export const aioFoundPagesConfig = {
  endpoint: 'rank-tracker/overview',
  params: { filter: 'best_position_kind = ai_overview or ai_overview_sitelink', note: 'Keywords where your best position is an AI Overview citation. Grouped by URL, sorted by keyword count.' }
};

export async function fetchAioFoundPages(overrides = {}, widgetId) {
  const overviewData = await fetchOverview({
    ...overrides,
    select: 'keyword,url,traffic,volume,serp_features',
    order_by: 'traffic:desc',
    limit: 200,
    where: JSON.stringify({
      or: [
        { field: 'best_position_kind', is: ['eq', 'ai_overview'] },
        { field: 'best_position_kind', is: ['eq', 'ai_overview_sitelink'] }
      ]
    })
  }, widgetId);

  const rows = overviewData.overviews || [];
  const urlMap = {};
  for (const row of rows) {
    if (!row.url) continue;
    if (!urlMap[row.url]) urlMap[row.url] = { url: row.url, keywords: [], keyword_count: 0, total_traffic: 0 };
    urlMap[row.url].keywords.push(row.keyword);
    urlMap[row.url].keyword_count++;
    urlMap[row.url].total_traffic += row.traffic || 0;
  }

  return { pages: Object.values(urlMap).sort((a, b) => b.keyword_count - a.keyword_count) };
}

// ---------------------------------------------------------------------------
// 3rd-party URLs in AI Overviews (AIO exists but OUR URL is NOT in it)
// ---------------------------------------------------------------------------
export const aioGapUrlsConfig = {
  endpoint: 'rank-tracker/overview + rank-tracker/serp-overview',
  params: { filter: 'serp_features includes ai_overview AND NOT ai_overview_found', note: 'Keywords where AI Overview exists but your URL is absent; extracts competitor URLs' }
};

export async function fetchAioGapUrls(overrides = {}, widgetId) {
  const ownDomain = overrides.domain || config.defaultDomain;
  const competitorDomains = config.defaultCompetitorDomains;
  const excludeDomains = [ownDomain, ...competitorDomains].filter(Boolean);

  const overviewData = await fetchOverview({
    ...overrides,
    select: 'keyword,position,serp_features',
    where: JSON.stringify({
      and: [
        { field: 'serp_features', list_is: { any: ['eq', 'ai_overview'] } },
        { not: { field: 'serp_features', list_is: { any: ['eq', 'ai_overview_found'] } } }
      ]
    })
  }, widgetId);

  const keywords = (overviewData.overviews || []).slice(0, 50);
  const urlMap = {};

  // Fetch SERP data in parallel batches of 5
  const BATCH = 5;
  for (let i = 0; i < keywords.length; i += BATCH) {
    const batch = keywords.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(kw => fetchSerpOverview(kw.keyword, overrides, widgetId))
    );
    for (let j = 0; j < batch.length; j++) {
      if (settled[j].status === 'rejected') continue;
      const kw = batch[j];
      const aioPositions = (settled[j].value.positions || []).filter(item => {
        const types = Array.isArray(item.type) ? item.type : [item.type];
        return types.includes('ai_overview') || types.includes('ai_overview_sitelink');
      });
      for (const pos of aioPositions) {
        if (!pos.url) continue;
        if (excludeDomains.some(d => pos.url.includes(d))) continue;
        if (!urlMap[pos.url]) urlMap[pos.url] = { url: pos.url, title: pos.title || null, keywords: [], keyword_count: 0 };
        urlMap[pos.url].keywords.push(kw.keyword);
        urlMap[pos.url].keyword_count++;
      }
    }
  }

  return {
    urls: Object.values(urlMap).sort((a, b) => b.keyword_count - a.keyword_count)
  };
}

// ---------------------------------------------------------------------------
// Organic SoV snapshot — current vs previous (no history endpoint available)
// ---------------------------------------------------------------------------
export const organicSovSnapshotConfig = {
  endpoint: 'rank-tracker/competitors-stats',
  params: { select: 'competitor,share_of_voice,share_of_traffic_value', device: 'desktop', volume_mode: 'monthly', note: 'Two calls: current date and compare date; shows delta' }
};

export async function fetchOrganicSovSnapshot(overrides = {}, widgetId) {
  const projectId = defaultProjectId(overrides);
  const baseP = {
    select: 'competitor,share_of_voice',
    device: 'desktop',
    volume_mode: 'monthly',
    project_id: projectId
  };
  const [current, previous] = await Promise.all([
    ahrefsGet('rank-tracker/competitors-stats', { ...baseP, date: overrides.date_to || overrides.date || today() }, widgetId),
    ahrefsGet('rank-tracker/competitors-stats', { ...baseP, date: overrides.date_from || overrides.date_compared || today() }, widgetId)
  ]);

  // API returns key "competitors-metrics" (hyphenated)
  const currentRows  = current['competitors-metrics']  || [];
  const previousRows = previous['competitors-metrics'] || [];

  const prevMap = {};
  for (const r of previousRows) {
    prevMap[r.competitor] = r.share_of_voice || 0;
  }
  const rows = currentRows.map(r => ({
    ...r,
    share_of_voice_prev: prevMap[r.competitor] ?? null,
    sov_delta: prevMap[r.competitor] != null
      ? ((r.share_of_voice || 0) - prevMap[r.competitor])
      : null
  }));
  return { rows };
}
