/**
 * Insights Report — Widget renderers.
 * Each widget loads its data from the backend and renders into a card.
 */

import {
  multiLineChart, fmt, fmtPct, fmtDelta, tsToDate,
  PLATFORM_COLORS, PLATFORM_LABELS
} from './charts.js';

const PLATFORMS = ['chatgpt', 'gemini', 'perplexity', 'copilot'];
const PAGE_SIZE = 10;

// ── In-memory data cache ───────────────────────────────────────────────────────
// Persists across tab switches. Cleared on date or settings change.
const _cache = {}; // widgetId → { data, fetched_at }

export function clearWidgetCache() {
  for (const k in _cache) delete _cache[k];
}

// ── Widget presentation metadata ───────────────────────────────────────────────
const WIDGET_META = {
  'p1-sov-ai':          { chartType: 'multi-line',     category: 'ai'      },
  'p2-sov-organic':     { chartType: 'stat',           category: 'organic' },
  'p3-impressions-ai':  { chartType: 'multi-line',     category: 'ai'      },
  'p4-impressions-gsc': { chartType: 'single-line',    category: 'organic' },
  'p5-clicks-organic':  { chartType: 'line-and-table', category: 'organic' },
  'p6-clicks-ai':       { chartType: 'multi-line',     category: 'ai'      },
  'p8-aio-pages':       { chartType: 'table',          category: 'ai'      },
  'p9-organic-pages':   { chartType: 'table-tabbed',   category: 'organic' },
  'o1-third-domains':   { chartType: 'table',          category: 'ai'      },
  'o2-aio-gaps':        { chartType: 'table',          category: 'ai'      },
  'o3-question-kw':     { chartType: 'table',          category: 'organic' },
  'o4-longtail-kw':     { chartType: 'table',          category: 'organic' },
  'o5-paa':             { chartType: 'table',          category: 'organic' },
  'o6-discussions':     { chartType: 'table',          category: 'organic' },
  'o7-reddit-quora':    { chartType: 'table',          category: 'ai'      },
  'o8-videos':          { chartType: 'table',          category: 'organic' },
  'o9-video-ai':        { chartType: 'table',          category: 'ai'      }
};

const WIDGET_BACKEND = {
  'p1-sov-ai':    { endpoints: 'brand-radar/sov-history (×4 platforms)', params: 'report_id, brand, prompts=custom, data_source=<platform>', calculations: '4 parallel calls. Each returns { metrics: [{date, share_of_voice}] }. Platform filter selects series.' },
  'p2-sov-organic':{ endpoints: 'rank-tracker/competitors-stats (×2 dates)', params: 'project_id, device=desktop, volume_mode=monthly, date (current + compare)', calculations: '2 calls for delta. Rows shown as SoV% with +/- change per competitor.' },
  'p3-impressions-ai':{ endpoints: 'brand-radar/impressions-history (×4)', params: 'brand (required), report_id, prompts=custom, data_source=<platform>', calculations: '4 parallel calls. Each returns { metrics: [{date, impressions}] }.' },
  'p4-impressions-gsc':{ endpoints: 'gsc/performance-history', params: 'project_id, history_grouping=daily, date_from, date_to', calculations: 'Single call. Plots impressions field from metrics array.' },
  'p5-clicks-organic':{ endpoints: 'gsc/performance-history + gsc/pages', params: 'project_id, date_from, date_to; pages: order_by=clicks:desc, limit=200', calculations: 'Line chart = performance-history clicks. Subfolder table = pages grouped by first path segment.' },
  'p6-clicks-ai': { endpoints: 'web-analytics/sources-chart', params: 'project_id, granularity=daily, from, to, where={source_channel eq llm}', calculations: 'Single call filtered to LLM channel. Returns {points:[{timestamp,source,visitors}]}. Grouped by source field — one line per AI source.' },
  'p8-aio-pages': { endpoints: 'rank-tracker/overview', params: 'select=keyword,url,traffic,volume,serp_features,best_position_kind, order_by=traffic:desc, limit=50, where={serp_features includes ai_overview AND best_position_kind=ai_overview}', calculations: 'Single call. url field gives the page directly. Grouped by URL, sorted by keyword count. Titles enriched via site-explorer/top-pages.' },
  'p9-organic-pages':{ endpoints: 'gsc/pages', params: 'project_id, date_from, date_to, order_by=clicks:desc OR impressions:desc, limit=50', calculations: 'Two tabs switch sort order. Paginated 5/page.' },
  'o1-third-domains':{ endpoints: 'brand-radar/cited-domains', params: 'report_id, brand, prompts=custom, data_source=chatgpt,gemini,perplexity,copilot, select=volume,mentions,responses,domain,pages, limit=25, date=today', calculations: 'Single combined call across all platforms. Own domain (default_domain) and competitor domains (default_competitors_domains) filtered client-side. Paginated 10/page.' },
  'o2-aio-gaps':  { endpoints: 'rank-tracker/overview + rank-tracker/serp-overview (×N)', params: 'where={ai_overview AND NOT ai_overview_found}. Step 2: per keyword', calculations: 'Competitor URLs in AI Overviews where your URL is absent. Grouped by URL, sorted by keyword count.' },
  'o3-question-kw':{ endpoints: 'gsc/keywords', params: 'project_id, date_from, order_by=impressions:desc, limit=500', calculations: 'Client-side regex filter: /^(who|what|why|where|how|when|which|is|are|can|does|do|should)\\b/i. Paginated.' },
  'o4-longtail-kw':{ endpoints: 'gsc/keywords', params: 'project_id, date_from, order_by=impressions:desc, limit=200, where={keyword_words ≥ 5}', calculations: 'Server-side keyword_words filter. Paginated 5/page.' },
  'o5-paa':       { endpoints: 'rank-tracker/overview + rank-tracker/serp-overview (×N)', params: 'Step 1: where={serp_features includes question}. Step 2: per keyword', calculations: 'PAA question text (title) + keyword + your position.' },
  'o6-discussions':{ endpoints: 'rank-tracker/overview + rank-tracker/serp-overview (×N)', params: 'Step 1: where={serp_features includes discussion}. Step 2: per keyword', calculations: 'Discussion thread titles and URLs.' },
  'o7-reddit-quora':{ endpoints: 'brand-radar/cited-pages (×4)', params: 'prompts=custom, data_source=<platform>, where={cited_domain_subdomains in [reddit.com, quora.com]}', calculations: 'Server-side domain filter. Domain badge on each row. Platform filter selects source.' },
  'o8-videos':    { endpoints: 'rank-tracker/overview + rank-tracker/serp-overview (×N)', params: 'Step 1: where={serp_features includes video OR video_th}. Step 2: per keyword', calculations: 'Video and video thumbnail SERP results. Shows title and URL.' },
  'o9-video-ai':  { endpoints: 'brand-radar/cited-pages (×4)', params: 'prompts=custom, data_source=<platform>, where={cited_domain_subdomains in [youtube.com, tiktok.com]}', calculations: 'Server-side domain filter. Prominent YouTube/TikTok badge on each row.' }
};

// ── Public: render a page of widgets ──────────────────────────────────────────
export function renderPage(widgetIds, container, appState) {
  container.innerHTML = '';

  if (widgetIds.length === 0) {
    container.innerHTML = '<div class="widget-empty" style="margin-top:60px;justify-content:center">No widgets on this page.</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'widget-grid';
  container.appendChild(grid);

  const widgetMeta = Object.fromEntries(appState.widgets.map(w => [w.id, w]));

  for (const id of widgetIds) {
    const dbMeta  = widgetMeta[id] || { id, title: id, starred: 0 };
    const uiMeta  = WIDGET_META[id] || { chartType: 'table' };
    const backend = WIDGET_BACKEND[id] || {};
    const card    = createCard(id, dbMeta, uiMeta, backend, appState);
    card.classList.add('full-width');
    grid.appendChild(card);
    loadWidgetData(id, card, uiMeta, appState, buildDateOverrides(appState));
  }
}

// ── Card DOM construction ──────────────────────────────────────────────────────
function createCard(id, dbMeta, uiMeta, backend, appState) {
  const card = document.createElement('div');
  card.className = 'widget-card' + (dbMeta.starred ? ' starred' : '');
  card.dataset.widgetId = id;
  if (uiMeta?.category) card.dataset.category = uiMeta.category;

  // Header
  const header = document.createElement('div');
  header.className = 'widget-header';
  header.innerHTML = `
    <span class="widget-title">${dbMeta.title || id}</span>
    <div class="widget-actions">
      <button class="btn-backend" title="View API details">{ }</button>
      <button class="btn-refresh" title="Refresh data">↺</button>
      <button class="btn-star ${dbMeta.starred ? 'active' : ''}" title="${dbMeta.starred ? 'Unstar' : 'Star'} widget">★</button>
    </div>
  `;

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'widget-meta';
  meta.innerHTML = '<span class="badge cached">Loading…</span>';

  // Body
  const body = document.createElement('div');
  body.className = 'widget-body';
  body.innerHTML = '<div class="widget-loading"><span class="spinner"></span> Loading…</div>';

  // Backend panel
  const backendPanel = document.createElement('div');
  backendPanel.className = 'backend-panel';
  if (backend.endpoints) {
    backendPanel.innerHTML = `
      <strong>Endpoints</strong><code>${backend.endpoints}</code>
      <strong>Params</strong><code>${backend.params || '—'}</code>
      <strong>Calculations</strong><code>${backend.calculations || '—'}</code>
    `;
  }

  card.appendChild(header);
  card.appendChild(meta);
  card.appendChild(body);
  card.appendChild(backendPanel);

  // ── Button bindings ────────────────────────────────────────────────────────
  header.querySelector('.btn-backend').addEventListener('click', () => {
    const visible = backendPanel.classList.toggle('visible');
    header.querySelector('.btn-backend').classList.toggle('backend-active', visible);
  });

  header.querySelector('.btn-star').addEventListener('click', async () => {
    const btn = header.querySelector('.btn-star');
    const wasStarred = card.classList.contains('starred');
    try {
      const res = await fetch(`/api/insights/widgets/${id}/star`, { method: 'POST' });
      const json = await res.json();
      card.classList.toggle('starred', json.starred);
      btn.classList.toggle('active', json.starred);
      btn.title = json.starred ? 'Unstar widget' : 'Star widget';
      // Update in appState
      const w = appState.widgets.find(x => x.id === id);
      if (w) w.starred = json.starred ? 1 : 0;
      showToast(json.starred ? '⭐ Starred' : 'Unstarred', json.starred ? '#fbbf24' : '#7c80a0');
    } catch {
      showToast('Failed to update star', '#f87171');
    }
  });

  header.querySelector('.btn-refresh').addEventListener('click', () => {
    const dateOverrides = buildDateOverrides(appState);
    loadWidgetData(id, card, uiMeta, appState, dateOverrides, true);
  });

  // ── Date / settings change listeners ──────────────────────────────────────
  const onRefreshNeeded = () => {
    const dateOverrides = buildDateOverrides(appState);
    loadWidgetData(id, card, uiMeta, appState, dateOverrides, true);
  };
  document.addEventListener('insights:date-change', onRefreshNeeded);
  document.addEventListener('insights:settings-change', onRefreshNeeded);

  return card;
}

// ── Data loading ───────────────────────────────────────────────────────────────
async function loadWidgetData(id, card, uiMeta, appState, dateOverrides, forceRefresh = false) {
  const body = card.querySelector('.widget-body');
  const meta = card.querySelector('.widget-meta');

  // Serve from in-memory cache on tab re-visits (skip if forced refresh)
  if (!forceRefresh && _cache[id]) {
    const hit = _cache[id];
    card._data = hit.data;
    const ts = new Date(hit.fetched_at).toLocaleString();
    meta.innerHTML = `<span class="badge ok">OK</span><span>${ts}</span><span class="badge cached">cached</span>`;
    renderBody(id, card, uiMeta, hit.data, appState);
    return;
  }

  body.innerHTML = '<div class="widget-loading"><span class="spinner"></span> Loading…</div>';
  meta.innerHTML = '<span class="badge cached">Loading…</span>';

  try {
    const refreshRes = await fetch(`/api/insights/data/${id}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_overrides: dateOverrides })
    });
    if (!refreshRes.ok) {
      const err = await refreshRes.json();
      throw Object.assign(new Error(err.error || 'Fetch failed'), err);
    }
    const result = await refreshRes.json();

    // Store in in-memory cache
    const fetched_at = result.fetched_at || new Date().toISOString();
    _cache[id] = { data: result.data, fetched_at };

    card._data = result.data;
    const ts = new Date(fetched_at).toLocaleString();
    meta.innerHTML = `<span class="badge ok">OK</span><span>${ts}</span>`;
    renderBody(id, card, uiMeta, result.data, appState);

  } catch (err) {
    card._data = null;
    const isTimeout = err.isTimeout;
    const isNetworkErr = !err.httpCode && !isTimeout;
    meta.innerHTML = `<span class="badge ${isTimeout ? 'timeout' : 'error'}">${isTimeout ? 'Timeout' : 'Error'}</span>`;

    let errMsg, errSub;
    if (isTimeout) {
      errMsg = 'No response from Ahrefs API';
      errSub = 'The request timed out. Try increasing TIMEOUT_MS in your .env file, or click Retry.';
    } else if (isNetworkErr) {
      errMsg = 'Could not reach Ahrefs API';
      errSub = 'Check your server\'s internet connection and API key, then retry.';
    } else {
      errMsg = err.message || 'Ahrefs API error';
      errSub = err.httpCode ? `HTTP ${err.httpCode} — verify your API key and configured IDs in .env.` : '';
    }

    body.innerHTML = '';
    const errEl = document.createElement('div');
    errEl.className = 'widget-error';
    const m = document.createElement('span');
    m.className = 'error-msg';
    m.textContent = `⚠ ${errMsg}`;
    errEl.appendChild(m);
    if (errSub) {
      const s = document.createElement('span');
      s.className = 'error-sub';
      s.textContent = errSub;
      errEl.appendChild(s);
    }
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn sm';
    retryBtn.style.marginTop = '8px';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => card.querySelector('.btn-refresh').click());
    errEl.appendChild(retryBtn);
    body.appendChild(errEl);
  }
}

// ── Body renderer dispatcher ───────────────────────────────────────────────────
function renderBody(id, card, uiMeta, data, appState) {
  const body = card.querySelector('.widget-body');
  if (!data) {
    body.appendChild(noDataEl('No data received', 'The server returned an empty response. Try refreshing.'));
    return;
  }

  // Apply body class for padding rules
  body.classList.remove('has-table', 'has-chart', 'has-stat');
  const isTable = ['table', 'table-tabbed'].includes(uiMeta.chartType);
  const isChart = ['multi-line', 'single-line', 'line-and-table'].includes(uiMeta.chartType);
  if (isTable) body.classList.add('has-table');
  else if (uiMeta.chartType === 'stat') body.classList.add('has-stat');
  else if (isChart) body.classList.add('has-chart');

  switch (uiMeta.chartType) {
    case 'multi-line':      renderMultiLine(id, body, data); break;
    case 'single-line':     renderSingleLine(id, body, data); break;
    case 'stat':            renderStat(id, body, data); break;
    case 'line-and-table':  renderLineAndTable(id, body, data, appState); break;
    case 'table-tabbed':    renderTabbedTable(id, body, data); break;
    case 'table':           renderTable(id, body, data, appState); break;
    default:                body.innerHTML = '<div class="widget-empty">Unknown chart type</div>';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildDateOverrides(appState) {
  if (!appState.dateFrom && !appState.dateTo) return {};
  return {
    date_from: appState.dateFrom,
    date_to:   appState.dateTo,
    from:      appState.dateFrom ? appState.dateFrom + 'T00:00:00.000Z' : undefined,
    to:        appState.dateTo   ? appState.dateTo   + 'T23:59:59.000Z' : undefined
  };
}

function pagination(rows, container, renderRows) {
  let page = 0;
  const totalPages = () => Math.ceil(rows.length / PAGE_SIZE);

  function draw() {
    const start = page * PAGE_SIZE;
    const slice = rows.slice(start, start + PAGE_SIZE);
    renderRows(slice);
    const pag = container.querySelector('.pagination');
    if (pag) {
      pag.querySelector('.pag-info').textContent = `${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length}`;
      pag.querySelector('.pag-prev').disabled = page === 0;
      pag.querySelector('.pag-next').disabled = page >= totalPages() - 1;
    }
  }

  const pagDiv = document.createElement('div');
  pagDiv.className = 'pagination';
  pagDiv.innerHTML = `
    <span class="pag-info"></span>
    <div class="pagination-controls">
      <button class="pag-prev">← Prev</button>
      <button class="pag-next">Next →</button>
    </div>
  `;
  pagDiv.querySelector('.pag-prev').addEventListener('click', () => { if (page > 0) { page--; draw(); } });
  pagDiv.querySelector('.pag-next').addEventListener('click', () => { if (page < totalPages() - 1) { page++; draw(); } });

  if (rows.length === 0) {
    container.appendChild(emptyEl());
    return;
  }
  container.appendChild(pagDiv);
  draw();
}

/**
 * Empty-state element with a required short message and an optional explanation.
 * Use the right message for each scenario:
 *   api_empty   → API responded but returned no records
 *   filter_empty → Records existed but filtering removed them all
 *   calc_empty  → Calculation / derivation produced no results
 */
function noDataEl(msg, sub = '') {
  const d = document.createElement('div');
  d.className = 'widget-empty';
  const msgEl = document.createElement('span');
  msgEl.className = 'empty-msg';
  msgEl.textContent = msg;
  d.appendChild(msgEl);
  if (sub) {
    const subEl = document.createElement('span');
    subEl.className = 'empty-sub';
    subEl.textContent = sub;
    d.appendChild(subEl);
  }
  return d;
}

/** @deprecated Use noDataEl() with a specific message instead. */
function emptyEl() {
  return noDataEl('No data available');
}

/**
 * Error-state element. Covers three scenarios:
 *   - timeout: isTimeout=true
 *   - API/HTTP error: httpCode present
 *   - Network failure: no httpCode, not timeout
 */
function errorEl(message, httpCode) {
  const d = document.createElement('div');
  d.className = 'widget-error';
  const msgEl = document.createElement('span');
  msgEl.className = 'error-msg';
  msgEl.textContent = `⚠ ${message}`;
  d.appendChild(msgEl);
  if (httpCode) {
    const subEl = document.createElement('span');
    subEl.className = 'error-sub';
    subEl.textContent = `HTTP ${httpCode}`;
    d.appendChild(subEl);
  }
  return d;
}

/**
 * Collect errors from a per-platform response map.
 * Returns [{ platform, error, httpCode? }] for any platform that errored.
 */
function collectPlatformErrors(data, platforms) {
  return platforms
    .filter(p => data[p]?.error)
    .map(p => ({ platform: PLATFORM_LABELS[p] || p, error: data[p].error }));
}

/**
 * Build a small inline error notice listing which platforms failed.
 * Shown below chart/table when some — but not all — platforms errored.
 */
function platformErrorNotice(errors) {
  if (!errors.length) return null;
  const d = document.createElement('div');
  d.style.cssText = 'padding:6px 14px;font-size:var(--fs-sm);color:var(--danger);border-top:1px solid var(--border)';
  d.textContent = '⚠ Failed: ' + errors.map(e => `${e.platform} — ${e.error}`).join(' · ');
  return d;
}

function tableContainer(body) {
  const wrap = document.createElement('div');
  body.innerHTML = '';
  body.appendChild(wrap);
  return wrap;
}

function domainBadge(url) {
  if (!url) return '';
  if (url.includes('youtube.com')) return '<span class="domain-badge youtube">YouTube</span>';
  if (url.includes('tiktok.com'))  return '<span class="domain-badge tiktok">TikTok</span>';
  if (url.includes('reddit.com'))  return '<span class="domain-badge reddit">Reddit</span>';
  if (url.includes('quora.com'))   return '<span class="domain-badge quora">Quora</span>';
  return '';
}

/**
 * Two-line URL cell: domain on top (muted), path below (accent).
 * Full URL is always visible — nothing truncated.
 */
function urlCell(url) {
  if (!url) return null;
  let domain = url, path = '';
  try {
    const u = new URL(url);
    domain = u.hostname.replace(/^www\./, '');
    path   = u.pathname + (u.search || '');
  } catch { /* malformed — show raw */ }
  const a = document.createElement('a');
  a.className = 'url-cell-link';
  a.target = '_blank';
  a.rel = 'noopener';
  // Only allow safe protocols — prevent javascript: and data: URIs
  if (/^https?:\/\//i.test(url)) a.href = url;
  const domainSpan = document.createElement('span');
  domainSpan.className = 'url-domain';
  domainSpan.textContent = domain;
  const pathSpan = document.createElement('span');
  pathSpan.className = 'url-path';
  pathSpan.textContent = path || url;
  a.appendChild(domainSpan);
  a.appendChild(pathSpan);
  return a;
}

function showToast(msg, color = '#34d399') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  t.style.background = color;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ── Renderers ──────────────────────────────────────────────────────────────────

/** Multi-line chart. Handles two data shapes:
 *  1. Flat (p1-sov-ai): { metrics: [{date, share_of_voice: [{brand, share_of_voice},...]}] }
 *     — single combined call, renders one line per brand found in share_of_voice array
 *  2. Per-platform (p3-impressions-ai): { chatgpt: {metrics/points}, ... }
 *  3. Flat points by source (p6-clicks-ai): { points: [{timestamp, source, visitors}] }
 */
function renderMultiLine(id, body, data) {
  body.innerHTML = '<div class="chart-wrap" style="height:220px"></div>';
  const canvas = document.createElement('canvas');
  body.querySelector('.chart-wrap').appendChild(canvas);

  let labels = null;
  const datasets = [];

  // ── Shape 3: flat points grouped by source (sources-chart, p6-clicks-ai) ──
  if (id === 'p6-clicks-ai' && data.points && Array.isArray(data.points)) {
    if (data.points.length === 0) {
      body.innerHTML = '';
      body.appendChild(noDataEl(
        'No AI traffic data returned',
        'Ahrefs returned no web analytics data for the LLM channel in the selected period. Check your DEFAULT_WEB_ANALYTICS_PROJECT_ID in .env.'
      ));
      return;
    }
    const palette = ['#009DFF', '#FF8800', '#00cfff', '#ff4d00', '#00c87a', '#FFD000', '#a78bfa', '#f87171'];
    const sourceMap = {}; // source → { date → visitors }
    const dateSet = new Set();

    for (const pt of data.points) {
      const date = tsToDate(pt.timestamp);
      const src  = pt.source || '(direct)';
      dateSet.add(date);
      if (!sourceMap[src]) sourceMap[src] = {};
      sourceMap[src][date] = (sourceMap[src][date] || 0) + (pt.visitors || 0);
    }

    labels = [...dateSet].sort();
    const sources = Object.keys(sourceMap).sort((a, b) => {
      const totA = Object.values(sourceMap[a]).reduce((s, v) => s + v, 0);
      const totB = Object.values(sourceMap[b]).reduce((s, v) => s + v, 0);
      return totB - totA;
    });
    sources.forEach((src, i) => {
      datasets.push({
        label: src,
        data: labels.map(d => sourceMap[src][d] || 0),
        color: palette[i % palette.length]
      });
    });

  // ── Shape 1: flat metrics (sov-history single combined call) ──────────────
  } else if (id === 'p1-sov-ai' && data.metrics && Array.isArray(data.metrics)) {
    const metrics = data.metrics;
    labels = metrics.map(m => m.date?.slice(0, 10) || '');

    // Build one dataset per brand found in the first non-empty metric entry
    const brandMap = {}; // brand name → [values]
    for (const m of metrics) {
      const sovArr = Array.isArray(m.share_of_voice) ? m.share_of_voice : [];
      for (const brandObj of sovArr) {
        const name = brandObj.brand || brandObj.name || String(Object.values(brandObj).find(v => typeof v === 'string') || '?');
        // Extract the numeric SoV value — the field is named 'share_of_voice'
        const val = typeof brandObj.share_of_voice === 'number'
          ? brandObj.share_of_voice
          : Object.values(brandObj).find(v => typeof v === 'number') ?? 0;
        if (!brandMap[name]) brandMap[name] = new Array(metrics.length).fill(0);
        brandMap[name][metrics.indexOf(m)] = val;
      }
    }

    const brandNames = Object.keys(brandMap);
    const palette = ['#009DFF', '#FF8800', '#00cfff', '#ff4d00', '#00c87a', '#FFD000', '#a78bfa', '#f87171'];
    brandNames.forEach((name, i) => {
      datasets.push({ label: name, data: brandMap[name], color: palette[i % palette.length] });
    });

  } else {
    // ── Shape 2: per-platform { chatgpt: {metrics}, gemini: {...}, ... } ────
    for (const p of PLATFORMS) {
      const pData = data[p];
      if (!pData || pData.error) continue;

      if (pData.metrics && Array.isArray(pData.metrics)) {
        const metrics = pData.metrics;
        if (!labels) labels = metrics.map(m => m.date?.slice(0, 10) || '');

        const field = id === 'p3-impressions-ai' ? 'impressions' : null;
        const values = metrics.map(m => {
          const v = field ? m[field] : null;
          if (typeof v === 'number') return v;
          return 0;
        });
        datasets.push({ label: PLATFORM_LABELS[p], data: values, color: PLATFORM_COLORS[p] });

      } else if (pData.points && Array.isArray(pData.points)) {
        const points = pData.points;
        if (!labels) labels = points.map(pt => tsToDate(pt.timestamp));
        const values = points.map(pt => pt.visitors || 0);
        datasets.push({ label: PLATFORM_LABELS[p], data: values, color: PLATFORM_COLORS[p] });
      }
    }

    // Collect errors from all platforms
    const errs = collectPlatformErrors(data, PLATFORMS);

    if (datasets.length === 0) {
      body.innerHTML = '';
      if (errs.length) {
        body.appendChild(errorEl(
          'Ahrefs API errors across all platforms',
          null
        ));
        const subEl = document.createElement('span');
        subEl.className = 'error-sub';
        subEl.textContent = errs.map(e => `${e.platform}: ${e.error}`).join(' · ');
        body.querySelector('.widget-error').appendChild(subEl);
      } else {
        body.appendChild(noDataEl(
          'No data from Ahrefs for any platform',
          'All AI platforms returned empty results. Check your Brand Radar report ID and brand name in .env.'
        ));
      }
      return;
    }

    // Some platforms succeeded, some failed — render chart then append notice
    const valueFormat = id === 'p1-sov-ai' ? 'percent' : 'number';
    multiLineChart(canvas, labels, datasets, { valueFormat });
    const notice = platformErrorNotice(errs);
    if (notice) body.closest('.widget-card').querySelector('.widget-body').appendChild(notice);
    return;
  }

  if (!labels || labels.length === 0 || datasets.length === 0) {
    body.innerHTML = '';
    body.appendChild(noDataEl(
      'No data returned from Ahrefs',
      'The API responded but returned no time-series data for the selected date range.'
    ));
    return;
  }

  const valueFormat = id === 'p1-sov-ai' ? 'percent' : 'number';
  multiLineChart(canvas, labels, datasets, { valueFormat });
}

/** Single-line chart for GSC performance history metrics */
function renderSingleLine(id, body, data) {
  if (data.error) { body.appendChild(errorEl(data.error, data.httpCode)); return; }
  const metrics = data.metrics || [];
  if (metrics.length === 0) {
    body.innerHTML = '';
    body.appendChild(noDataEl(
      'No impressions data returned',
      'Ahrefs returned no GSC performance history for this project and date range. Check your DEFAULT_PROJECT_ID in .env.'
    ));
    return;
  }

  body.innerHTML = '<div class="chart-wrap" style="height:220px"></div>';
  const canvas = document.createElement('canvas');
  body.querySelector('.chart-wrap').appendChild(canvas);

  const labels = metrics.map(m => m.date?.slice(0, 10) || '');
  const values = metrics.map(m => m.impressions || 0);
  multiLineChart(canvas, labels, [{ label: 'Impressions', data: values, color: '#6c8eff' }]);
}

/** Stat display for organic SoV snapshot */
function renderStat(id, body, data) {
  if (data.error) { body.appendChild(errorEl(data.error, data.httpCode)); return; }
  const rows = data.rows || [];
  if (rows.length === 0) {
    body.innerHTML = '';
    body.appendChild(noDataEl(
      'No Share of Voice data returned',
      'Ahrefs returned no competitor stats for this project. Verify your DEFAULT_PROJECT_ID in .env.'
    ));
    return;
  }

  const sorted = [...rows].sort((a, b) => (b.share_of_voice || 0) - (a.share_of_voice || 0));

  body.innerHTML = '<div class="stat-grid"></div>';
  const grid = body.querySelector('.stat-grid');

  for (const row of sorted) {
    const sov = row.share_of_voice || 0;
    const delta = row.sov_delta;
    const { text: deltaText, cls: deltaCls } = fmtDelta(delta);
    const box = document.createElement('div');
    box.className = 'stat-box';
    const label = document.createElement('div');
    label.className = 'stat-label';
    label.textContent = row.competitor || '—';
    const valDiv = document.createElement('div');
    valDiv.className = 'stat-value';
    valDiv.innerHTML = `${fmtPct(sov)}<span class="stat-delta ${deltaCls}">${deltaText}</span>`;
    const sub = document.createElement('div');
    sub.className = 'stat-sub';
    sub.textContent = 'Share of Voice';
    box.appendChild(label);
    box.appendChild(valDiv);
    box.appendChild(sub);
    grid.appendChild(box);
  }
}

/** Line chart + subfolder table (p5-clicks-organic) */
async function renderLineAndTable(id, body, data, appState) {
  body.innerHTML = '';
  if (data.error) { body.appendChild(errorEl(data.error, data.httpCode)); return; }
  const metrics = data.metrics || [];

  if (metrics.length === 0) {
    body.innerHTML = '';
    body.appendChild(noDataEl(
      'No clicks data returned',
      'Ahrefs returned no GSC performance history for this project and date range. Check your DEFAULT_PROJECT_ID in .env.'
    ));
    return;
  }

  // Clicks line chart
  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-wrap';
  chartWrap.style.height = '180px';
  const canvas = document.createElement('canvas');
  chartWrap.appendChild(canvas);
  body.appendChild(chartWrap);

  const labels = metrics.map(m => m.date?.slice(0, 10) || '');
  const values = metrics.map(m => m.clicks || 0);
  multiLineChart(canvas, labels, [{ label: 'Clicks', data: values, color: '#00c87a' }]);

  // Subfolder breakdown — try to load pages data
  const subfolderSection = document.createElement('div');
  subfolderSection.className = 'subfolder-section';
  subfolderSection.innerHTML = '<div class="subfolder-label">Clicks by Subfolder</div><div class="subfolder-table-wrap"><div class="widget-loading"><span class="spinner"></span> Loading pages…</div></div>';
  body.appendChild(subfolderSection);

  try {
    let pagesData;
    // Use in-memory cache if p9 is already loaded; otherwise fetch it
    if (_cache['p9-organic-pages']) {
      pagesData = _cache['p9-organic-pages'].data;
    } else {
      const cacheRes = await fetch('/api/insights/data/p9-organic-pages');
      if (cacheRes.ok) {
        const r = await cacheRes.json();
        pagesData = r.data;
      } else {
        const refreshRes = await fetch('/api/insights/data/p9-organic-pages/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date_overrides: buildDateOverrides(appState) })
        });
        if (refreshRes.ok) {
          const r = await refreshRes.json();
          pagesData = r.data;
        }
      }
    }

    if (pagesData) {
      const pages = pagesData.pages || [];
      const subfolderMap = {};
      for (const p of pages) {
        const url = p.page || p.url || '';
        let seg = '/';
        try {
          const path = new URL(url).pathname;
          const parts = path.split('/').filter(Boolean);
          seg = parts.length ? '/' + parts[0] + '/' : '/';
        } catch {}
        if (!subfolderMap[seg]) subfolderMap[seg] = { subfolder: seg, clicks: 0, impressions: 0, pages: 0 };
        subfolderMap[seg].clicks      += p.clicks      || 0;
        subfolderMap[seg].impressions += p.impressions || 0;
        subfolderMap[seg].pages++;
      }
      const subfolders = Object.values(subfolderMap).sort((a, b) => b.clicks - a.clicks);

      const wrap = subfolderSection.querySelector('.subfolder-table-wrap');
      wrap.innerHTML = '';
      if (subfolders.length === 0) {
        wrap.appendChild(noDataEl(
          'No pages data returned',
          'Ahrefs returned no GSC pages to build the subfolder breakdown.'
        ));
      } else {
        const table = document.createElement('table');
        table.className = 'data-table';
        table.innerHTML = `<thead><tr><th>Subfolder</th><th class="num">Clicks</th><th class="num">Impressions</th><th class="num">Pages</th></tr></thead>`;
        const tbody = document.createElement('tbody');
        for (const sf of subfolders.slice(0, 15)) {
          const tr = document.createElement('tr');
          const sfTd = document.createElement('td');
          sfTd.title = sf.subfolder;
          sfTd.textContent = sf.subfolder;
          tr.appendChild(sfTd);
          [
            { cls: 'num', val: fmt(sf.clicks) },
            { cls: 'num', val: fmt(sf.impressions) },
            { cls: 'num', val: String(sf.pages) }
          ].forEach(({ cls, val }) => {
            const td = document.createElement('td');
            td.className = cls;
            td.textContent = val;
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        wrap.appendChild(table);
      }
    }
  } catch (err) {
    subfolderSection.querySelector('.subfolder-table-wrap').innerHTML = '';
    subfolderSection.querySelector('.subfolder-table-wrap').appendChild(errorEl(err.message || 'Could not load pages'));
  }
}

/** Two-tab table for p9-organic-pages (Clicks / Impressions sort) */
function renderTabbedTable(id, body, data) {
  body.innerHTML = '';
  if (data.error) { body.appendChild(errorEl(data.error, data.httpCode)); return; }
  const pages = data.pages || [];
  if (pages.length === 0) {
    body.appendChild(noDataEl(
      'No pages returned from Ahrefs',
      'Ahrefs returned no GSC page data for this project and date range. Check your DEFAULT_PROJECT_ID in .env.'
    ));
    return;
  }

  const tabs = document.createElement('div');
  tabs.className = 'inner-tabs';
  tabs.innerHTML = '<button class="active" data-sort="clicks">By Clicks</button><button data-sort="impressions">By Impressions</button>';
  body.appendChild(tabs);

  const tableWrap = document.createElement('div');
  body.appendChild(tableWrap);

  let currentSort = 'clicks';
  function drawTable() {
    const sorted = [...pages].sort((a, b) => (b[currentSort] || 0) - (a[currentSort] || 0));
    tableWrap.innerHTML = '';
    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = `<thead><tr><th>Title</th><th>URL</th><th class="num">Clicks</th><th class="num">Impressions</th><th class="num">CTR</th><th class="num">Pos</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    scroll.appendChild(table);
    table.appendChild(tbody);
    tableWrap.appendChild(scroll);
    pagination(sorted, tableWrap, slice => {
      tbody.innerHTML = '';
      for (const p of slice) {
        const url = p.page || p.url || '';
        const tr = document.createElement('tr');
        tr.appendChild(titleTd(p.title));
        tr.appendChild(urlTd(url));
        tr.appendChild(numTd(fmt(p.clicks)));
        tr.appendChild(numTd(fmt(p.impressions)));
        tr.appendChild(numTd(fmtPct(p.ctr)));
        tr.appendChild(numTd(p.position ? parseFloat(p.position).toFixed(1) : '—', 'pos'));
        tbody.appendChild(tr);
      }
    });
  }

  tabs.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      drawTable();
    });
  });

  drawTable();
}

/** Generic table renderer, dispatches to specific table by widget ID */
function renderTable(id, body, data, appState) {
  switch (id) {
    case 'p8-aio-pages':      renderAioPagesTable(body, data); break;
    case 'o1-third-domains':  renderThirdDomainsTable(body, data, appState.settings); break;
    case 'o2-aio-gaps':       renderAioGapsTable(body, data); break;
    case 'o3-question-kw':
    case 'o4-longtail-kw':    renderKeywordsTable(body, data, id); break;
    case 'o5-paa':            renderSerpFeaturesTable(body, data, 'question'); break;
    case 'o6-discussions':    renderSerpFeaturesTable(body, data, 'discussion'); break;
    case 'o7-reddit-quora':   renderCitedPagesTable(body, data, true, ['reddit.com', 'quora.com']); break;
    case 'o8-videos':         renderSerpFeaturesTable(body, data, 'video'); break;
    case 'o9-video-ai':       renderVideoPagesTable(body, data); break;
    default:                  body.innerHTML = '<div class="widget-empty">No renderer</div>';
  }
}

// ── Table cell helpers ────────────────────────────────────────────────────────

/** Title column: plain text, .title-cell */
function titleTd(text) {
  const td = document.createElement('td');
  td.className = 'title-cell';
  td.textContent = text || '—';
  return td;
}

/** URL column: two-line domain + path via urlCell() */
function urlTd(url) {
  const td = document.createElement('td');
  td.className = 'url-col';
  const el = urlCell(url);
  if (el) td.appendChild(el); else td.textContent = '—';
  return td;
}

/** Numeric column */
function numTd(text, extraClass = '') {
  const td = document.createElement('td');
  td.className = 'num' + (extraClass ? ' ' + extraClass : '');
  td.textContent = text;
  return td;
}

// ── Specific table renderers ───────────────────────────────────────────────────

/**
 * Merge pages across all platforms. Returns { rows, errors }.
 */
function mergePlatformPages(data) {
  const merged = {};
  const errors = [];
  for (const p of PLATFORMS) {
    const pData = data[p];
    if (!pData || pData.error) { if (pData?.error) errors.push({ platform: PLATFORM_LABELS[p] || p, error: pData.error }); continue; }
    for (const item of (pData.pages || pData.data || [])) {
      const key = item.url || item.page || '';
      if (!merged[key]) merged[key] = { ...item, responses: 0 };
      merged[key].responses += item.responses || 0;
    }
  }
  return { rows: Object.values(merged).sort((a, b) => (b.responses || 0) - (a.responses || 0)), errors };
}

/**
 * Merge domains across all platforms. Returns { rows, errors }.
 */
function mergePlatformDomains(data, excludeDomains = []) {
  const merged = {};
  const errors = [];
  for (const p of PLATFORMS) {
    const pData = data[p];
    if (!pData || pData.error) { if (pData?.error) errors.push({ platform: PLATFORM_LABELS[p] || p, error: pData.error }); continue; }
    for (const item of (pData.domains || pData.data || [])) {
      const key = item.domain || '';
      if (!merged[key]) merged[key] = { ...item, responses: 0 };
      merged[key].responses += item.responses || 0;
    }
  }
  let rows = Object.values(merged).sort((a, b) => (b.responses || 0) - (a.responses || 0));
  if (excludeDomains.length) {
    rows = rows.filter(r => !excludeDomains.some(d => d && r.domain?.includes(d)));
  }
  return { rows, errors };
}

function renderCitedPagesTable(body, data, showDomainBadge, domainFilter = []) {
  const { rows: rawRows, errors } = mergePlatformPages(data);
  const rows = domainFilter.length
    ? rawRows.filter(r => domainFilter.some(d => (r.url || '').includes(d)))
    : rawRows;
  body.innerHTML = '';
  if (rows.length === 0) {
    if (errors.length && rawRows.length === 0) {
      // All platforms errored — no response
      body.appendChild(errorEl(
        'Ahrefs API errors across all platforms',
        null
      ));
      const subEl = document.createElement('span');
      subEl.className = 'error-sub';
      subEl.textContent = errors.map(e => `${e.platform}: ${e.error}`).join(' · ');
      body.querySelector('.widget-error').appendChild(subEl);
    } else if (rawRows.length === 0) {
      // API responded but no records at all
      body.appendChild(noDataEl(
        'No cited pages returned from Ahrefs',
        'Ahrefs returned no cited pages for any AI platform. Check your Brand Radar report ID and brand name in .env.'
      ));
    } else {
      // Had rows but domain filter removed them all
      body.appendChild(noDataEl(
        'No matching pages after domain filter',
        `None of the ${rawRows.length} returned pages matched the required domains (${domainFilter.join(', ')}).`
      ));
    }
    return;
  }

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `<thead><tr>${showDomainBadge ? '<th>Source</th>' : ''}<th>Title</th><th>URL</th><th class="num">Responses</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  body.appendChild(scroll);

  pagination(rows, body, slice => {
    tbody.innerHTML = '';
    for (const row of slice) {
      const url = row.url || '';
      const tr = document.createElement('tr');
      if (showDomainBadge) {
        const badgeTd = document.createElement('td');
        badgeTd.style.cssText = 'white-space:nowrap;vertical-align:top;padding-top:8px';
        badgeTd.innerHTML = domainBadge(url);
        tr.appendChild(badgeTd);
      }
      tr.appendChild(titleTd(row.title));
      tr.appendChild(urlTd(url));
      tr.appendChild(numTd(fmt(row.responses)));
      tbody.appendChild(tr);
    }
  });
  const notice = platformErrorNotice(errors);
  if (notice) body.appendChild(notice);
}

function renderVideoPagesTable(body, data) {
  // Flat combined response: { pages: [...] }
  body.innerHTML = '';
  if (data.error) { body.appendChild(errorEl(data.error, data.httpCode)); return; }
  const VIDEO_DOMAINS = ['youtube.com', 'tiktok.com'];
  const allPages = data.pages || [];
  const rows = allPages
    .filter(r => VIDEO_DOMAINS.some(d => (r.url || '').includes(d)))
    .sort((a, b) => (b.responses || 0) - (a.responses || 0));
  if (rows.length === 0) {
    if (allPages.length === 0) {
      body.appendChild(noDataEl(
        'No cited pages returned from Ahrefs',
        'Ahrefs returned no cited pages for any AI platform. Check your Brand Radar report ID and brand name in .env.'
      ));
    } else {
      body.appendChild(noDataEl(
        'No YouTube or TikTok citations found',
        `None of the ${allPages.length} returned cited pages were from YouTube or TikTok.`
      ));
    }
    return;
  }

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `<thead><tr><th>Source</th><th>URL</th><th class="num">Responses</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  body.appendChild(scroll);

  pagination(rows, body, slice => {
    tbody.innerHTML = '';
    for (const row of slice) {
      const url = row.url || '';
      const tr = document.createElement('tr');
      const badgeTd = document.createElement('td');
      badgeTd.style.cssText = 'white-space:nowrap;vertical-align:top;padding-top:8px';
      badgeTd.innerHTML = domainBadge(url);
      tr.appendChild(badgeTd);
      tr.appendChild(urlTd(url));
      tr.appendChild(numTd(fmt(row.responses)));
      tbody.appendChild(tr);
    }
  });
}

function renderThirdDomainsTable(body, data, settings) {
  const ownDomain = settings?.default_domain || '';
  const competitorDomains = (settings?.default_competitors_domains || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const excludeDomains = [ownDomain, ...competitorDomains].filter(Boolean);

  // Flat combined response: { domains: [...] }
  body.innerHTML = '';
  if (data.error) { body.appendChild(errorEl(data.error, data.httpCode)); return; }
  const allDomains = data.domains || [];
  let rows = excludeDomains.length
    ? allDomains.filter(r => !excludeDomains.some(d => d && r.domain?.includes(d)))
    : allDomains;
  rows = rows.sort((a, b) => (b.responses || 0) - (a.responses || 0));

  if (rows.length === 0) {
    if (allDomains.length === 0) {
      body.appendChild(noDataEl(
        'No cited domains returned from Ahrefs',
        'Ahrefs returned no cited domain data. Check your Brand Radar report ID and brand name in .env.'
      ));
    } else {
      body.appendChild(noDataEl(
        'No third-party domains after filtering',
        `All ${allDomains.length} returned domains matched your own domain or competitor exclusion list (DEFAULT_DOMAIN / DEFAULT_COMPETITORS_DOMAINS).`
      ));
    }
    return;
  }

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `<thead><tr><th>Domain</th><th class="num">Responses</th><th class="num">Mentions</th><th class="num">Volume</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  body.appendChild(scroll);

  pagination(rows, body, slice => {
    tbody.innerHTML = '';
    for (const row of slice) {
      const tr = document.createElement('tr');
      const domainTd = document.createElement('td');
      domainTd.textContent = row.domain || '—';
      tr.appendChild(domainTd);
      [fmt(row.responses), fmt(row.mentions), fmt(row.volume)].forEach(val => {
        const td = document.createElement('td');
        td.className = 'num';
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  });
}

function renderAioPagesTable(body, data) {
  body.innerHTML = '';
  if (data.error) { body.appendChild(errorEl(data.error, data.httpCode)); return; }
  const pages = data.pages || [];
  if (pages.length === 0) {
    body.appendChild(noDataEl(
      'No AI Overview pages found',
      'None of your tracked keywords appear as citations in Google AI Overviews. This may be a plan limitation or no AIO features exist for tracked keywords.'
    ));
    return;
  }

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `<thead><tr><th>Page</th><th class="num">Keywords in AIO</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  body.appendChild(scroll);

  pagination(pages, body, slice => {
    tbody.innerHTML = '';
    for (const row of slice) {
      const tr = document.createElement('tr');
      tr.appendChild(urlTd(row.url || ''));
      tr.appendChild(numTd(String(row.keyword_count || 0)));
      tbody.appendChild(tr);
    }
  });
}

function renderAioGapsTable(body, data) {
  body.innerHTML = '';
  if (data.error) { body.appendChild(errorEl(data.error, data.httpCode)); return; }
  const urls = data.urls || [];
  if (urls.length === 0) {
    body.appendChild(noDataEl(
      'No AIO URLs found',
      'No URLs were found in AI Overviews where your site is absent. Your site may already be cited, or no tracked keywords trigger AI Overviews.'
    ));
    return;
  }

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `<thead><tr><th>Title</th><th>URL</th><th class="num">Keywords</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  body.appendChild(scroll);

  pagination(urls, body, slice => {
    tbody.innerHTML = '';
    for (const row of slice) {
      const tr = document.createElement('tr');
      tr.appendChild(titleTd(row.title));
      tr.appendChild(urlTd(row.url || ''));
      tr.appendChild(numTd(String(row.keyword_count || 0)));
      tbody.appendChild(tr);
    }
  });
}

function renderKeywordsTable(body, data, id) {
  body.innerHTML = '';
  if (data.error) { body.appendChild(errorEl(data.error, data.httpCode)); return; }
  const keywords = data.keywords || [];
  if (keywords.length === 0) {
    if (id === 'o3-question-kw') {
      body.appendChild(noDataEl(
        'No question keywords found',
        'Ahrefs returned no GSC keywords matching question patterns (who, what, why, where, how…) for this project and date range.'
      ));
    } else {
      body.appendChild(noDataEl(
        'No long-tail keywords found',
        'No keywords with 5 or more words were found in the returned GSC data for this project and date range.'
      ));
    }
    return;
  }

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `<thead><tr><th>Keyword</th><th class="num">Clicks</th><th class="num">Impressions</th><th class="num">CTR</th><th class="num">Pos</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  body.appendChild(scroll);

  pagination(keywords, body, slice => {
    tbody.innerHTML = '';
    for (const kw of slice) {
      const tr = document.createElement('tr');
      // Set keyword via textContent to prevent any HTML/link injection
      const kwTd = document.createElement('td');
      kwTd.className = 'kw-cell';
      kwTd.textContent = kw.keyword || '—';
      tr.appendChild(kwTd);
      const rest = document.createElement('td'); rest.className = 'num'; rest.textContent = fmt(kw.clicks); tr.appendChild(rest);
      const imp  = document.createElement('td'); imp.className  = 'num'; imp.textContent  = fmt(kw.impressions); tr.appendChild(imp);
      const ctr  = document.createElement('td'); ctr.className  = 'num'; ctr.textContent  = fmtPct(kw.ctr); tr.appendChild(ctr);
      const pos  = document.createElement('td'); pos.className  = 'num pos'; pos.textContent = kw.position ? parseFloat(kw.position).toFixed(1) : '—'; tr.appendChild(pos);
      tbody.appendChild(tr);
    }
  });
}

function renderSerpFeaturesTable(body, data, type) {
  body.innerHTML = '';
  if (data.error) { body.appendChild(errorEl(data.error, data.httpCode)); return; }
  const results = data.results || [];
  const rows = [];
  const seenUrls = new Set();
  for (const r of results) {
    for (const item of (r.items || [])) {
      const url = item.url || '';
      if (url && seenUrls.has(url)) continue;
      if (url) seenUrls.add(url);
      rows.push({ keyword: r.keyword, position: r.position, title: item.title || '', url });
    }
  }

  if (rows.length === 0) {
    const typeLabels = {
      question:   ['No People Also Ask questions found',  'None of your tracked keywords triggered PAA boxes in the SERP.'],
      discussion: ['No discussion results found',          'None of your tracked keywords triggered Discussion carousel results.'],
      video:      ['No video results found',               'None of your tracked keywords triggered Video or Video Preview SERP features.']
    };
    const [msg, sub] = typeLabels[type] || ['No results found', 'No matching SERP features were found for tracked keywords.'];
    body.appendChild(noDataEl(msg, sub));
    return;
  }

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';

  // Questions have no URLs — one column; discussions/videos split into Title + URL
  if (type === 'question') {
    table.innerHTML = `<thead><tr><th>Question</th><th>Keyword</th><th class="num">Pos</th></tr></thead>`;
  } else {
    table.innerHTML = `<thead><tr><th>Title</th><th>URL</th><th>Keyword</th><th class="num">Pos</th></tr></thead>`;
  }

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  body.appendChild(scroll);

  pagination(rows, body, slice => {
    tbody.innerHTML = '';
    for (const row of slice) {
      const tr = document.createElement('tr');
      if (type === 'question') {
        const qTd = document.createElement('td');
        qTd.className = 'kw-cell';
        qTd.textContent = row.title || row.url || '—';
        tr.appendChild(qTd);
      } else {
        tr.appendChild(titleTd(row.title));
        tr.appendChild(urlTd(row.url));
      }
      const kwTd = document.createElement('td');
      kwTd.className = 'kw-cell';
      kwTd.style.minWidth = '120px';
      kwTd.textContent = row.keyword || '—';
      tr.appendChild(kwTd);
      tr.appendChild(numTd(row.position != null ? String(row.position) : '—', 'pos'));
      tbody.appendChild(tr);
    }
  });
}
