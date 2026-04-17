import * as brandRadar  from './fetchers/brand-radar.js';
import * as gsc         from './fetchers/gsc.js';
import * as rankTracker from './fetchers/rank-tracker.js';
import * as webAnalytics from './fetchers/web-analytics.js';

/**
 * Insights widget registry.
 * Each entry wires a widget ID to its fetcher and metadata used for
 * the backend-view panel (endpoint, params, calculations description).
 */
export const INSIGHTS_WIDGETS = [
  // ── PERFORMANCE ─────────────────────────────────────────────────────────────
  {
    id: 'p1-sov-ai',
    page: 'performance',
    title: 'SoV Over Time — AI Answers',
    fetcher: brandRadar.fetchSovHistory,
    chartType: 'line',
    backend: {
      endpoints: ['brand-radar/sov-history'],
      params: 'report_id, brand, prompts=custom, data_source=<platform>, date_from, date_to',
      calculations: '4 parallel calls (chatgpt, gemini, perplexity, copilot). Each returns { metrics: [{ date, share_of_voice }] }. Platform filter selects which series to display.'
    }
  },
  {
    id: 'p2-sov-organic',
    page: 'performance',
    title: 'SoV — Organic Search',
    fetcher: rankTracker.fetchOrganicSovSnapshot,
    chartType: 'stat',
    backend: {
      endpoints: ['rank-tracker/competitors-stats'],
      params: 'project_id, select=competitor,share_of_voice,share_of_traffic_value, device=desktop, volume_mode=monthly, date (current) + date (compare)',
      calculations: '2 calls: current date and compare date. Delta = current.share_of_voice - previous.share_of_voice per competitor. Displayed as single stat with +/- change badge.'
    }
  },
  {
    id: 'p3-impressions-ai',
    page: 'performance',
    title: 'Impressions Over Time — AI Answers',
    fetcher: brandRadar.fetchImpressionsHistory,
    chartType: 'line',
    backend: {
      endpoints: ['brand-radar/impressions-history'],
      params: 'brand (required), report_id, prompts=custom, data_source=<platform>, date_from, date_to',
      calculations: '4 parallel calls (one per platform). Each returns { metrics: [{ date, impressions }] }. Platform filter selects series.'
    }
  },
  {
    id: 'p4-impressions-gsc',
    page: 'performance',
    title: 'Impressions Over Time — Organic',
    fetcher: gsc.fetchPerformanceHistory,
    chartType: 'line',
    backend: {
      endpoints: ['gsc/performance-history'],
      params: 'project_id, date_from, date_to, history_grouping=daily',
      calculations: 'Single call. Returns { metrics: [{ date, impressions, clicks, ctr, position }] }. Only impressions field plotted.'
    }
  },
  {
    id: 'p5-clicks-organic',
    page: 'performance',
    title: 'Clicks Over Time — Organic',
    fetcher: gsc.fetchPerformanceHistory,
    chartType: 'line-and-table',
    backend: {
      endpoints: ['gsc/performance-history', 'gsc/pages'],
      params: 'project_id, date_from, date_to, history_grouping=daily; gsc/pages: order_by=clicks:desc, limit=200',
      calculations: 'Two calls: (1) performance-history for clicks over time line chart; (2) pages sorted by clicks, grouped by first URL path segment for subfolder breakdown table.'
    }
  },
  {
    id: 'p6-clicks-ai',
    page: 'performance',
    title: 'Clicks Over Time — AI Traffic',
    fetcher: webAnalytics.fetchAiReferrersChart,
    chartType: 'line',
    backend: {
      endpoints: ['web-analytics/referrers-chart'],
      params: 'project_id, granularity=daily, from, to, source_referers_to_chart=<domain>, where={source_referer_domain eq <domain>}',
      calculations: '4 parallel calls, one per AI platform domain (chat.openai.com, gemini.google.com, perplexity.ai, copilot.microsoft.com). Each returns { points: [{ timestamp, source_referer, visitors }] }. Platform filter selects which lines are shown.'
    }
  },
  {
    id: 'p8-aio-pages',
    page: 'performance',
    title: 'Top Pages in AI Overviews',
    fetcher: rankTracker.fetchAioFoundPages,
    chartType: 'table',
    backend: {
      endpoints: ['rank-tracker/overview', 'rank-tracker/serp-overview'],
      params: 'Step 1: project_id, select=keyword,position,serp_features, where={serp_features includes ai_overview_found}. Step 2: project_id, keyword, device=desktop, country=<country> per keyword (up to 50)',
      calculations: 'Step 1 pre-filters to keywords where your URL is cited in an AI Overview (ai_overview_found in serp_features). Step 2 extracts positions of type ai_overview/ai_overview_sitelink. URLs are grouped and counted by number of keywords they appear for.'
    }
  },
  {
    id: 'p9-organic-pages',
    page: 'performance',
    title: 'Top Organic Pages',
    fetcher: gsc.fetchPages,
    chartType: 'table',
    backend: {
      endpoints: ['gsc/pages'],
      params: 'project_id, date_from, date_to, order_by=clicks:desc (tab A) or impressions:desc (tab B), limit=50',
      calculations: 'Single call. Returns { pages: [{ page, clicks, impressions, ctr, position }] }. Two tabs toggle the sort order. Paginated 5 per page.'
    }
  },

  // ── OPPORTUNITIES ────────────────────────────────────────────────────────────
  {
    id: 'o1-third-domains',
    page: 'opportunities',
    title: '3rd-Party Domains — AI Search',
    fetcher: brandRadar.fetchThirdPartyDomains,
    chartType: 'table',
    backend: {
      endpoints: ['brand-radar/cited-domains'],
      params: 'report_id, brand, prompts=custom, data_source=chatgpt,gemini,perplexity,copilot, select=volume,mentions,responses,domain,pages, limit=25, date=today',
      calculations: 'Single combined call across all platforms. Own domain (default_domain setting) and competitor domains (default_competitors_domains setting) filtered out client-side. Paginated 10 per page.'
    }
  },
  {
    id: 'o2-aio-gaps',
    page: 'opportunities',
    title: '3rd-Party URLs in AI Overviews',
    fetcher: rankTracker.fetchAioGapUrls,
    chartType: 'table',
    backend: {
      endpoints: ['rank-tracker/overview', 'rank-tracker/serp-overview'],
      params: 'Step 1: project_id, where={serp_features includes ai_overview AND NOT ai_overview_found}. Step 2: project_id, keyword, device, country per keyword (up to 50)',
      calculations: 'Step 1 finds keywords where AI Overview exists but your URL is absent. Step 2 extracts competitor URLs from ai_overview positions, excluding own domain (default_domain setting). Grouped by URL, sorted by keyword count.'
    }
  },
  {
    id: 'o3-question-kw',
    page: 'opportunities',
    title: 'Question Keywords — Organic',
    fetcher: gsc.fetchQuestionKeywords,
    chartType: 'table',
    backend: {
      endpoints: ['gsc/keywords'],
      params: 'project_id, date_from, date_to, order_by=impressions:desc, limit=500',
      calculations: 'Fetches top 500 keywords. Client-side regex filter: /^(who|what|why|where|how|when|which|is|are|can|does|do|should)\\b/i. Paginated 5 per page.'
    }
  },
  {
    id: 'o4-longtail-kw',
    page: 'opportunities',
    title: 'Long-tail Keywords (5+ words)',
    fetcher: gsc.fetchLongTailKeywords,
    chartType: 'table',
    backend: {
      endpoints: ['gsc/keywords'],
      params: 'project_id, date_from, date_to, order_by=impressions:desc, limit=200, where={keyword_words gte 5}',
      calculations: 'Single call with server-side keyword_words filter. Returns keywords with 5 or more words. Paginated 5 per page.'
    }
  },
  {
    id: 'o5-paa',
    page: 'opportunities',
    title: 'People Also Ask — Top Questions',
    fetcher: (o, id) => rankTracker.fetchSerpFeatures('question', o, id),
    chartType: 'table',
    backend: {
      endpoints: ['rank-tracker/overview', 'rank-tracker/serp-overview'],
      params: 'Step 1: project_id, select=keyword,position,serp_features, where={serp_features includes question}. Step 2: per keyword, device=desktop, country=<country>',
      calculations: 'Step 1 pre-filters to keywords that have a PAA (question) SERP feature. Step 2 extracts positions of type question. Each row shows PAA question text (title), keyword, and your position.'
    }
  },
  {
    id: 'o6-discussions',
    page: 'opportunities',
    title: 'Popular Discussions & Forums',
    fetcher: (o, id) => rankTracker.fetchSerpFeatures('discussion', o, id),
    chartType: 'table',
    backend: {
      endpoints: ['rank-tracker/overview', 'rank-tracker/serp-overview'],
      params: 'Step 1: project_id, where={serp_features includes discussion}. Step 2: per keyword, device=desktop, country=<country>',
      calculations: 'Step 1 pre-filters to keywords with a discussion SERP feature. Step 2 extracts positions of type discussion. Shows thread title and URL.'
    }
  },
  {
    id: 'o7-reddit-quora',
    page: 'opportunities',
    title: 'Cited Reddit & Quora Pages',
    fetcher: brandRadar.fetchDiscussionCitedPages,
    chartType: 'table',
    backend: {
      endpoints: ['brand-radar/cited-pages'],
      params: 'report_id, brand, prompts=custom, data_source=<platform>, where={cited_domain_subdomains in [reddit.com, quora.com]}, limit=100',
      calculations: '4 parallel calls with server-side domain filter for reddit.com and quora.com. Domain badge shown on each row. Platform filter selects source.'
    }
  },
  {
    id: 'o8-videos',
    page: 'opportunities',
    title: 'Popular Video Topics',
    fetcher: (o, id) => rankTracker.fetchSerpFeatures('video', o, id),
    chartType: 'table',
    backend: {
      endpoints: ['rank-tracker/overview', 'rank-tracker/serp-overview'],
      params: 'Step 1: project_id, where={serp_features includes video OR video_th}. Step 2: per keyword, device=desktop, country=<country>',
      calculations: 'Step 1 pre-filters to keywords with a video or video thumbnail SERP feature. Step 2 extracts positions of type video/video_th. Shows video title and URL.'
    }
  },
  {
    id: 'o9-video-ai',
    page: 'opportunities',
    title: 'Videos Cited in AI Answers',
    fetcher: brandRadar.fetchVideoCitedPages,
    chartType: 'table',
    backend: {
      endpoints: ['brand-radar/cited-pages'],
      params: 'report_id, brand, prompts=custom, data_source=<platform>, where={cited_domain_subdomains in [youtube.com, tiktok.com]}, limit=100',
      calculations: '4 parallel calls with server-side domain filter for youtube.com and tiktok.com. Domain badge (YouTube / TikTok) prominently shown on each row.'
    }
  }
];

export function getInsightsFetcher(widgetId) {
  const w = INSIGHTS_WIDGETS.find(x => x.id === widgetId);
  return w ? w.fetcher : null;
}

export function getInsightsWidgetMeta(widgetId) {
  return INSIGHTS_WIDGETS.find(x => x.id === widgetId) || null;
}
