import { ahrefsGet } from '../client.js';
import { config } from '../../config.js';

function defaultTarget(overrides) {
  return overrides.target || config.defaultDomain;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Domain Metrics
// ---------------------------------------------------------------------------
export const metricsConfig = {
  endpoint: 'site-explorer/metrics',
  params: { select: 'org_keywords,org_traffic,domain_rating,backlinks,referring_domains', mode: 'domain', date: 'today' }
};

// ---------------------------------------------------------------------------
// Page Titles — bulk fetch via top-pages (top_keyword_best_position_title)
// Returns a url→title map for all ranked pages on the given domain.
// Used by other fetchers to enrich table results that lack title fields.
// ---------------------------------------------------------------------------
export async function fetchPageTitles(domain, widgetId) {
  if (!domain) return {};
  const data = await ahrefsGet('site-explorer/top-pages', {
    target: domain,
    mode: 'subdomains',
    select: 'url,top_keyword_best_position_title',
    limit: 1000
  }, widgetId).catch(() => ({ pages: [] }));

  const map = {};
  for (const p of (data.pages || [])) {
    if (p.url) map[p.url] = p.top_keyword_best_position_title || null;
  }
  return map;
}

export async function fetchMetrics(overrides = {}, widgetId) {
  const target = defaultTarget(overrides);
  const params = {
    select: 'org_keywords,org_traffic,domain_rating,backlinks,referring_domains',
    mode: 'domain',
    date: today(),
    ...overrides,
    target
  };
  return ahrefsGet('site-explorer/metrics', params, widgetId);
}
