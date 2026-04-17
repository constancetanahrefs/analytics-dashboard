/**
 * Widget registry — single source of truth for all dashboard widgets.
 * Each entry maps to a fetcher function and a config object that drives
 * the auto-generated description shown beneath each widget card.
 *
 * When endpoint or params change here, the description updates automatically
 * on the next server start (written to the widgets table in SQLite).
 */

import * as brandRadar from './fetchers/brand-radar.js';
import * as gsc from './fetchers/gsc.js';
import * as rankTracker from './fetchers/rank-tracker.js';
import * as webAnalytics from './fetchers/web-analytics.js';
import { upsertWidget, getWidget } from '../db/db.js';

/**
 * Build a human-readable description from a config object.
 * Called on every server start; result is written to the widgets table.
 */
function generateDescription(config) {
  const parts = [`Endpoint: ${config.endpoint}`];
  const skip = new Set(['note']);
  const paramParts = Object.entries(config.params || {})
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${k}=${v}`);
  if (paramParts.length) parts.push(`Params: ${paramParts.join(', ')}`);
  if (config.params?.note) parts.push(`Note: ${config.params.note}`);
  return parts.join(' | ');
}

// ---------------------------------------------------------------------------
// Widget definitions
// ---------------------------------------------------------------------------
export const WIDGETS = [
  // ── HOMEPAGE ──────────────────────────────────────────────────────────────
  { id: 'sov-custom-prompts',      tab: 'home', order_index: 0,  title: 'SoV — Custom Prompts',                fetcher: brandRadar.fetchSovCustomPrompts,    config: brandRadar.sovCustomPromptsConfig },
  { id: 'sov-aio',                 tab: 'home', order_index: 1,  title: 'SoV — AI Overviews',                  fetcher: rankTracker.fetchSovAio,             config: rankTracker.sovAioConfig },
  { id: 'sov-organic',             tab: 'home', order_index: 2,  title: 'SoV — Organic',                       fetcher: rankTracker.fetchSovOrganic,         config: rankTracker.sovOrganicConfig },
  { id: 'clicks-organic',          tab: 'home', order_index: 3,  title: 'Clicks — Organic',                    fetcher: gsc.fetchPerformanceHistory,         config: gsc.performanceHistoryConfig },
  { id: 'clicks-ai-search',        tab: 'home', order_index: 4,  title: 'Clicks — AI Search',                  fetcher: webAnalytics.fetchAiSearchClicks,    config: webAnalytics.aiSearchClicksConfig },
  { id: 'gsc-impressions-split',   tab: 'home', order_index: 5,  title: 'GSC Impressions — Branded/Unbranded', fetcher: gsc.fetchImpressionsSplit,           config: gsc.impressionsSplitConfig },
  { id: 'top-pages-impressions',   tab: 'home', order_index: 6,  title: 'Top Pages by Impressions',            fetcher: gsc.fetchPages,                      config: gsc.pagesConfig },
  { id: 'rt-paa',                  tab: 'home', order_index: 7,  title: 'Questions — RT People Also Ask',      fetcher: (o, id) => rankTracker.fetchSerpFeatures('question', o, id),   config: rankTracker.serpPaaConfig },
  { id: 'gsc-question-keywords',   tab: 'home', order_index: 8,  title: 'Questions — GSC Keywords',            fetcher: gsc.fetchQuestionKeywords,           config: gsc.questionKeywordsConfig },
  { id: 'rt-discussions',          tab: 'home', order_index: 9,  title: 'Questions — RT Discussions',          fetcher: (o, id) => rankTracker.fetchSerpFeatures('discussion', o, id), config: rankTracker.serpOverviewConfig },
  { id: 'cited-pages-prompts',     tab: 'home', order_index: 10, title: 'Top Cited Pages (Custom Prompts)',    fetcher: brandRadar.fetchCitedPages,          config: brandRadar.citedPagesConfig },
  { id: 'rt-videos',               tab: 'home', order_index: 11, title: 'PR — RT Videos',                      fetcher: (o, id) => rankTracker.fetchSerpFeatures('video', o, id),      config: rankTracker.serpOverviewConfig },
  { id: 'traffic-overview',        tab: 'home', order_index: 12, title: 'Total Traffic by Channel',            fetcher: webAnalytics.fetchSourceChannels,    config: webAnalytics.sourceChannelsConfig },
  { id: 'traffic-chart',           tab: 'home', order_index: 13, title: 'Traffic Over Time',                   fetcher: webAnalytics.fetchTrafficChart,      config: webAnalytics.trafficChartConfig },
  { id: 'ai-platform-pages',       tab: 'home', order_index: 14, title: 'Top Pages from AI Platforms',         fetcher: webAnalytics.fetchAiSearchClicks,    config: webAnalytics.aiSearchClicksConfig },
  { id: 'traffic-increases',       tab: 'home', order_index: 15, title: 'Pages — Biggest Traffic Increases',   fetcher: webAnalytics.fetchTrafficChanges,    config: webAnalytics.trafficChangesConfig },
  { id: 'traffic-decreases',       tab: 'home', order_index: 16, title: 'Pages — Biggest Traffic Decreases',   fetcher: webAnalytics.fetchTrafficChanges,    config: webAnalytics.trafficChangesConfig },
  { id: 'traffic-no-traffic',      tab: 'home', order_index: 17, title: 'Pages — No Traffic',                  fetcher: webAnalytics.fetchTrafficChanges,    config: webAnalytics.trafficChangesConfig },

  // ── SEO ───────────────────────────────────────────────────────────────────
  { id: 'seo-performance',         tab: 'seo',  order_index: 0,  title: 'Organic Clicks / Impressions / Position', fetcher: gsc.fetchPerformanceHistory,    config: gsc.performanceHistoryConfig },
  { id: 'seo-positions-history',   tab: 'seo',  order_index: 1,  title: 'Average Position Over Time',          fetcher: gsc.fetchPositionsHistory,          config: gsc.positionsHistoryConfig },
  { id: 'seo-position-buckets',    tab: 'seo',  order_index: 2,  title: 'Performance by Position Bucket',      fetcher: gsc.fetchPerformanceByPosition,     config: gsc.performanceByPositionConfig },
  { id: 'seo-branded-keywords',    tab: 'seo',  order_index: 3,  title: 'Branded Keywords Monitor',            fetcher: gsc.fetchBrandedKeywords,           config: gsc.brandedKeywordsConfig },
  { id: 'seo-question-keywords',   tab: 'seo',  order_index: 4,  title: 'Question Keywords Monitor',           fetcher: gsc.fetchQuestionKeywords,          config: gsc.questionKeywordsConfig },

  // ── AI SEARCH ─────────────────────────────────────────────────────────────
  { id: 'ai-comention-sentiment',  tab: 'ai-search', order_index: 0,  title: 'Co-mention Sentiment by Platform', fetcher: brandRadar.fetchAiResponses,      config: brandRadar.aiResponsesConfig },
  { id: 'ai-cited-pages-prompts',  tab: 'ai-search', order_index: 1,  title: 'Top Cited Pages (Custom Prompts)',  fetcher: brandRadar.fetchCitedPages,      config: brandRadar.citedPagesConfig },
  { id: 'ai-cited-domains-prompts',tab: 'ai-search', order_index: 2,  title: 'Top Cited Domains (Custom Prompts)',fetcher: brandRadar.fetchCitedDomains,    config: brandRadar.citedDomainsConfig },
  { id: 'ai-cited-pages-aio',      tab: 'ai-search', order_index: 3,  title: 'Top Cited Pages (AIO)',            fetcher: brandRadar.fetchCitedPagesAio,    config: brandRadar.citedPagesAioConfig },
  { id: 'ai-cited-domains-aio',    tab: 'ai-search', order_index: 4,  title: 'Top Cited Domains (AIO)',          fetcher: brandRadar.fetchCitedDomainsAio,  config: brandRadar.citedDomainsAioConfig },
  { id: 'ai-rt-paa',               tab: 'ai-search', order_index: 5,  title: 'RT — People Also Ask',             fetcher: (o, id) => rankTracker.fetchSerpFeatures('question', o, id),   config: rankTracker.serpPaaConfig },
  { id: 'ai-rt-discussions',       tab: 'ai-search', order_index: 6,  title: 'RT — Discussions & Forums',        fetcher: (o, id) => rankTracker.fetchSerpFeatures('discussion', o, id), config: rankTracker.serpOverviewConfig },
  { id: 'ai-rt-videos',            tab: 'ai-search', order_index: 7,  title: 'RT — Videos & Video Previews',     fetcher: (o, id) => rankTracker.fetchSerpFeatures('video', o, id),      config: rankTracker.serpOverviewConfig },
  { id: 'ai-aio-sov',              tab: 'ai-search', order_index: 8,  title: 'AIO Visibility — Overall SoV',     fetcher: rankTracker.fetchSovAio,          config: rankTracker.sovAioConfig },

  // ── COMPETITOR RESEARCH ────────────────────────────────────────────────────
  { id: 'comp-aio-sov',            tab: 'competitor', order_index: 0, title: 'Competitor AIO — Overall SoV',    fetcher: rankTracker.fetchCompetitorsStats,  config: rankTracker.competitorsStatsConfig },
  { id: 'comp-aio-gaps',           tab: 'competitor', order_index: 1, title: 'AIO Gaps — Competitor In, You Not', fetcher: rankTracker.fetchCompetitorAioGaps, config: rankTracker.competitorAioGapsConfig }
];

/**
 * Seed all widgets into the database on startup.
 * Preserves user settings (pinned, paused, hidden, params overrides).
 */
export function seedWidgets() {
  for (const w of WIDGETS) {
    const existing = getWidget(w.id);
    upsertWidget({
      id: w.id,
      tab: w.tab,
      title: w.title,
      endpoint: w.config.endpoint,
      params: JSON.stringify(w.config.params || {}),
      description: generateDescription(w.config),
      // preserve user flags if widget already exists
      pinned: existing?.pinned ?? 0,
      paused: existing?.paused ?? 0,
      hidden: existing?.hidden ?? 0,
      order_index: w.order_index
    });
  }
}

/**
 * Get a fetcher function by widget ID.
 */
export function getFetcher(widgetId) {
  const w = WIDGETS.find(x => x.id === widgetId);
  return w ? w.fetcher : null;
}
