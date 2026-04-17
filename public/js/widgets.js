import { lineChart, barChart, donutChart, fmt, fmtPct } from './charts.js';
import { getDateParams } from './state.js';

// ── Utility ─────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const res = await fetch('/api' + path, opts);
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error || 'API error'), { httpCode: res.status, isTimeout: json.isTimeout });
  return json;
}

function el(tag, cls, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function table(headers, rows) {
  const t = el('table', 'data-table');
  const thead = t.createTHead();
  const hr = thead.insertRow();
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });
  const tbody = t.createTBody();
  for (const row of rows) {
    const tr = tbody.insertRow();
    row.forEach(cell => {
      const td = tr.insertCell();
      if (typeof cell === 'object' && cell !== null) {
        td.className = cell.cls || '';
        td.textContent = cell.v ?? '—';
      } else {
        td.textContent = cell ?? '—';
      }
    });
  }
  return t;
}

// ── Widget card builder ──────────────────────────────────────────────────────

export function buildCard(widget, allWidgets) {
  const card = el('div', `widget-card${widget.pinned ? ' pinned' : ''}${widget.hidden ? ' hidden-widget' : ''}`);
  card.dataset.widgetId = widget.id;

  // Header
  const header = el('div', 'widget-header');
  const titleEl = el('span', 'widget-title', widget.title);
  const actions = el('div', 'widget-actions');

  // Pin button
  const pinBtn = el('button', widget.pinned ? 'active' : '', '📌');
  pinBtn.title = widget.pinned ? 'Unpin from Home' : 'Pin to Home';
  pinBtn.addEventListener('click', async () => {
    const res = await apiFetch(`/widgets/${widget.id}/pin`, { method: 'POST' });
    widget.pinned = res.pinned ? 1 : 0;
    pinBtn.className = widget.pinned ? 'active' : '';
    card.classList.toggle('pinned', !!widget.pinned);
    pinBtn.title = widget.pinned ? 'Unpin from Home' : 'Pin to Home';
  });

  // Show/hide button
  const hideBtn = el('button', widget.hidden ? 'active' : '', '👁');
  hideBtn.title = widget.hidden ? 'Show widget' : 'Hide widget';
  hideBtn.addEventListener('click', async () => {
    const res = await apiFetch(`/widgets/${widget.id}/hide`, { method: 'POST' });
    widget.hidden = res.hidden ? 1 : 0;
    card.classList.toggle('hidden-widget', !!widget.hidden);
    hideBtn.className = widget.hidden ? 'active' : '';
    hideBtn.title = widget.hidden ? 'Show widget' : 'Hide widget';
  });

  // Pause button (pauses scheduled refresh)
  const pauseBtn = el('button', widget.paused ? 'paused' : '', '⏸');
  pauseBtn.title = widget.paused ? 'Resume auto-refresh' : 'Pause auto-refresh';
  pauseBtn.addEventListener('click', async () => {
    const res = await apiFetch(`/widgets/${widget.id}/pause`, { method: 'POST' });
    widget.paused = res.paused ? 1 : 0;
    pauseBtn.className = widget.paused ? 'paused' : '';
    pauseBtn.title = widget.paused ? 'Resume auto-refresh' : 'Pause auto-refresh';
  });

  // Refresh button — always uses current date picker values
  const refreshBtn = el('button', '', '🔄');
  refreshBtn.title = 'Refresh now';
  refreshBtn.addEventListener('click', () => loadWidgetData(card, widget, true));

  actions.append(pinBtn, hideBtn, pauseBtn, refreshBtn);
  header.append(titleEl, actions);
  card.appendChild(header);

  // Description
  const desc = el('div', 'widget-description', widget.description);
  card.appendChild(desc);

  // Meta (last fetched, status badge)
  const meta = el('div', 'widget-meta');
  meta.innerHTML = '<span class="last-fetched">Not loaded</span>';
  card.appendChild(meta);

  // Body
  const body = el('div', 'widget-body');
  body.innerHTML = '<div class="widget-loading"><span class="spinner"></span>&nbsp;Loading…</div>';
  card.appendChild(body);

  // Load data
  loadWidgetData(card, widget, false);

  return card;
}

export async function loadWidgetData(card, widget, forceRefresh) {
  const body = card.querySelector('.widget-body');
  const meta = card.querySelector('.widget-meta');
  body.innerHTML = '<div class="widget-loading"><span class="spinner"></span>&nbsp;Loading…</div>';

  try {
    // Always go through the refresh endpoint so date_overrides can be passed.
    // For the initial load (not forceRefresh), the server still returns cached
    // data if available — date_overrides bypass the cache regardless.
    const dateOverrides = getDateParams(widget.endpoint);
    const hasDateOverrides = Object.keys(dateOverrides).length > 0;

    let res;
    if (!forceRefresh && !hasDateOverrides) {
      // No date overrides — use cached GET path
      res = await apiFetch(`/data/${widget.id}`, { method: 'GET' });
    } else {
      // Date overrides or forced refresh — POST with date_overrides body
      res = await apiFetch(`/data/${widget.id}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_overrides: hasDateOverrides ? dateOverrides : undefined })
      });
    }

    const cached = res.cached ? 'Cached' : 'Live';
    meta.innerHTML = `
      <span class="last-fetched">${cached} · ${new Date(res.fetched_at).toLocaleString()}</span>
      <span class="badge success">OK</span>
    `;

    renderWidget(body, widget.id, res.data);
  } catch (err) {
    const badgeClass = err.isTimeout ? 'timeout' : 'error';
    const badgeText = err.isTimeout ? `Timeout` : `Error ${err.httpCode || ''}`;
    meta.innerHTML = `<span class="badge ${badgeClass}">${badgeText}</span>`;
    body.innerHTML = `<div class="widget-error">
      <span>${err.isTimeout ? '⏱ Request timed out' : '⚠ ' + (err.message || 'Failed to load')}</span>
      <button class="btn sm" onclick="this.closest('.widget-card').querySelector('.widget-actions button:last-child').click()">Retry</button>
    </div>`;
  }
}

// ── Per-widget renderers ─────────────────────────────────────────────────────

function renderWidget(container, widgetId, data) {
  if (!data) { container.innerHTML = '<div class="widget-empty">No data</div>'; return; }

  const r = RENDERERS[widgetId];
  if (r) {
    r(container, data);
  } else {
    // Generic JSON fallback
    container.innerHTML = `<pre style="font-size:11px;overflow:auto;max-height:200px;color:var(--text-muted)">${JSON.stringify(data, null, 2).slice(0, 2000)}</pre>`;
  }
}

// ── Shared Brand Radar platform tab helper ────────────────────────────────────
// data shape: { chatgpt: {...}, gemini: {...}, perplexity: {...}, copilot: {...} }
// renderFn(container, platformData) — called when a tab is selected

const PLATFORM_LABELS = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  copilot: 'Copilot',
  google_ai_overviews: 'AIO'
};

function renderBrandRadarTabs(el, data, renderFn, defaultPlatform = 'chatgpt') {
  el.innerHTML = '';
  const platforms = ['chatgpt', 'gemini', 'perplexity', 'copilot'].filter(p => p in data);
  if (!platforms.length) { el.innerHTML = '<div class="widget-empty">No data</div>'; return; }

  const tabs = document.createElement('div');
  tabs.className = 'inner-tabs';
  const content = document.createElement('div');

  const activate = (platform) => {
    tabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    tabs.querySelector(`[data-platform="${platform}"]`)?.classList.add('active');
    content.innerHTML = '';
    const platformData = data[platform];
    if (platformData?.error) {
      content.innerHTML = `<div class="widget-error">⚠ ${platformData.error}</div>`;
    } else {
      renderFn(content, platformData);
    }
  };

  for (const p of platforms) {
    const btn = document.createElement('button');
    btn.textContent = PLATFORM_LABELS[p] || p;
    btn.dataset.platform = p;
    btn.addEventListener('click', () => activate(p));
    tabs.appendChild(btn);
  }

  el.appendChild(tabs);
  el.appendChild(content);
  activate(platforms.includes(defaultPlatform) ? defaultPlatform : platforms[0]);
}

// ── Renderer map ─────────────────────────────────────────────────────────────

const RENDERERS = {
  // --- SoV Custom Prompts ---
  'sov-custom-prompts': (el, data) => {
    renderBrandRadarTabs(el, data, renderSovStats);
  },

  // --- SoV AIO ---
  'sov-aio': (el, data) => {
    el.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'stats-row';
    row.innerHTML = `
      <div class="stat-box"><div class="stat-label">SoV in AIO</div><div class="stat-value">${data.sov_percent || 0}%</div></div>
      <div class="stat-box"><div class="stat-label">Keywords w/ AIO</div><div class="stat-value">${fmt(data.with_aio)}</div></div>
      <div class="stat-box"><div class="stat-label">Total Tracked</div><div class="stat-value">${fmt(data.total)}</div></div>
    `;
    el.appendChild(row);
    if (data.top_keywords?.length) {
      el.appendChild(document.createElement('br'));
      el.appendChild(table(['Keyword', 'Position', 'Volume'],
        data.top_keywords.slice(0, 10).map(k => [k.keyword, { v: k.position, cls: 'num pos' }, { v: fmt(k.volume), cls: 'num' }])
      ));
    }
  },

  // --- SoV Organic (competitors-stats: share_of_voice + share_of_traffic_value) ---
  'sov-organic': (el, data) => {
    el.innerHTML = '';
    const rows = data['competitors-metrics'] || [];
    if (!rows.length) { el.innerHTML = '<div class="widget-empty">No data</div>'; return; }
    el.appendChild(table(['Competitor', 'SoV', 'Traffic Value SoV'],
      rows.map(r => [
        r.competitor,
        { v: fmtPct((r.share_of_voice || 0) * 100), cls: 'num' },
        { v: fmtPct((r.share_of_traffic_value || 0) * 100), cls: 'num' }
      ])
    ));
  },

  // --- Clicks Organic / SEO Performance ---
  'clicks-organic': renderGscPerformanceHistory,
  'seo-performance': renderGscPerformanceHistory,

  // --- Clicks AI Search ---
  'clicks-ai-search': (el, data) => {
    el.innerHTML = '';
    if (data.source === 'channel' && data.data) {
      const d = data.data;
      el.innerHTML = `<div class="stats-row">
        <div class="stat-box"><div class="stat-label">AI Search Visitors</div><div class="stat-value">${fmt(d.visitors)}</div></div>
        <div class="stat-box"><div class="stat-label">Sessions</div><div class="stat-value">${fmt(d.sessions)}</div></div>
      </div>`;
    } else if (data.source === 'referrer_fallback' && data.data) {
      el.innerHTML = `<div style="font-size:11px;color:var(--warning);margin-bottom:8px">⚠ Fallback: "llm" channel not found. Showing referrer data.</div>`;
      el.appendChild(table(['Referrer', 'Visitors', 'Sessions'],
        data.data.slice(0, 10).map(r => [r.source_referer, { v: fmt(r.visitors), cls: 'num' }, { v: fmt(r.sessions), cls: 'num' }])
      ));
    }
  },

  // --- GSC Impressions Split ---
  'gsc-impressions-split': (el, data) => {
    el.innerHTML = '';
    const canvas = document.createElement('canvas');
    el.innerHTML = '<div class="chart-wrap"></div>';
    el.querySelector('.chart-wrap').appendChild(canvas);
    donutChart(canvas, ['Branded', 'Unbranded'], [data.branded || 0, data.unbranded || 0]);
    const row = document.createElement('div');
    row.className = 'stats-row';
    row.style.marginTop = '12px';
    row.innerHTML = `
      <div class="stat-box"><div class="stat-label">Branded</div><div class="stat-value">${fmt(data.branded)}</div></div>
      <div class="stat-box"><div class="stat-label">Unbranded</div><div class="stat-value">${fmt(data.unbranded)}</div></div>
      <div class="stat-box"><div class="stat-label">Total</div><div class="stat-value">${fmt(data.total)}</div></div>
    `;
    el.appendChild(row);
  },

  // --- Top Pages by Impressions ---
  'top-pages-impressions': (el, data) => {
    el.innerHTML = '';
    const pages = data.pages || [];
    if (!pages.length) { el.innerHTML = '<div class="widget-empty">No data</div>'; return; }
    el.appendChild(table(['URL', 'Impressions', 'Clicks', 'Position'],
      pages.slice(0, 15).map(p => [
        { v: decodeURIComponent(p.page || '').replace(/^https?:\/\/[^/]+/, ''), cls: '' },
        { v: fmt(p.impressions), cls: 'num' },
        { v: fmt(p.clicks), cls: 'num' },
        { v: p.position ? parseFloat(p.position).toFixed(1) : '—', cls: 'num pos' }
      ])
    ));
  },

  // --- RT PAA / Discussions / Videos ---
  'rt-paa': renderSerpFeature,
  'rt-discussions': renderSerpFeature,
  'rt-videos': renderSerpFeature,
  'ai-rt-paa': renderSerpFeature,
  'ai-rt-discussions': renderSerpFeature,
  'ai-rt-videos': renderSerpFeature,

  // --- GSC Question Keywords ---
  'gsc-question-keywords': renderKeywordsTable,
  'seo-question-keywords': renderKeywordsTable,
  'seo-branded-keywords': renderKeywordsTable,

  // --- Cited Pages (per-platform tabs for custom prompts; single view for AIO) ---
  'cited-pages-prompts':    (el, data) => renderBrandRadarTabs(el, data, renderCitedPages),
  'ai-cited-pages-prompts': (el, data) => renderBrandRadarTabs(el, data, renderCitedPages),
  'ai-cited-pages-aio':     (el, data) => renderCitedPages(el, data),

  // --- Cited Domains (per-platform tabs for custom prompts; single view for AIO) ---
  'ai-cited-domains-prompts': (el, data) => renderBrandRadarTabs(el, data, renderCitedDomains),
  'ai-cited-domains-aio':     (el, data) => renderCitedDomains(el, data),

  // --- Traffic Overview ---
  'traffic-overview': (el, data) => {
    el.innerHTML = '';
    const channels = data.stats || [];
    if (!channels.length) { el.innerHTML = '<div class="widget-empty">No data</div>'; return; }
    el.appendChild(table(['Channel', 'Visitors', 'Sessions', 'Bounce %'],
      channels.map(c => [
        c.source_channel,
        { v: fmt(c.visitors), cls: 'num' },
        { v: fmt(c.sessions), cls: 'num' },
        { v: c.bounce_rate ? fmtPct(c.bounce_rate) : '—', cls: 'num' }
      ])
    ));
  },

  // --- Traffic Chart ---
  'traffic-chart': (el, data) => {
    el.innerHTML = '<div class="chart-wrap"></div>';
    const canvas = document.createElement('canvas');
    el.querySelector('.chart-wrap').appendChild(canvas);
    const points = data.points || [];
    if (!points.length) { el.innerHTML = '<div class="widget-empty">No chart data</div>'; return; }
    const labels = points.map(p => {
      if (!p.timestamp) return '';
      return typeof p.timestamp === 'number'
        ? new Date(p.timestamp * 1000).toISOString().slice(0, 10)
        : String(p.timestamp).slice(0, 10);
    });
    lineChart(canvas, labels, [
      { label: 'Visitors', data: points.map(p => p.visitors || 0) },
      { label: 'Pageviews', data: points.map(p => p.pageviews || 0) }
    ]);
  },

  // --- AI Platform Pages (same renderer as clicks-ai-search) ---
  'ai-platform-pages': (el, data) => RENDERERS['clicks-ai-search'](el, data),

  // --- Traffic Increases ---
  'traffic-increases': (el, data) => {
    el.innerHTML = '';
    const rows = data.increases || [];
    if (!rows.length) { el.innerHTML = '<div class="widget-empty">No increases found</div>'; return; }
    el.appendChild(table(['URL', 'Current', 'Previous', 'Change'],
      rows.slice(0, 15).map(r => [
        r.url?.replace(/^https?:\/\/[^/]+/, '') || r.url,
        { v: fmt(r.visitors_current), cls: 'num' },
        { v: fmt(r.visitors_previous), cls: 'num' },
        { v: (r.change_pct !== null ? '+' + r.change_pct + '%' : '+' + fmt(r.change)), cls: 'num up' }
      ])
    ));
  },

  // --- Traffic Decreases ---
  'traffic-decreases': (el, data) => {
    el.innerHTML = '';
    const rows = data.decreases || [];
    if (!rows.length) { el.innerHTML = '<div class="widget-empty">No decreases found</div>'; return; }
    el.appendChild(table(['URL', 'Current', 'Previous', 'Change'],
      rows.slice(0, 15).map(r => [
        r.url?.replace(/^https?:\/\/[^/]+/, '') || r.url,
        { v: fmt(r.visitors_current), cls: 'num' },
        { v: fmt(r.visitors_previous), cls: 'num' },
        { v: (r.change_pct !== null ? r.change_pct + '%' : fmt(r.change)), cls: 'num down' }
      ])
    ));
  },

  // --- No Traffic ---
  'traffic-no-traffic': (el, data) => {
    el.innerHTML = '';
    const rows = data.no_traffic || [];
    if (!rows.length) { el.innerHTML = '<div class="widget-empty">All pages have traffic</div>'; return; }
    el.appendChild(table(['URL', 'Prev Visitors'],
      rows.slice(0, 20).map(r => [
        r.url?.replace(/^https?:\/\/[^/]+/, '') || r.url,
        { v: fmt(r.visitors_previous), cls: 'num' }
      ])
    ));
  },

  // --- SEO Positions History ---
  'seo-positions-history': (el, data) => {
    el.innerHTML = '<div class="chart-wrap"></div>';
    const canvas = document.createElement('canvas');
    el.querySelector('.chart-wrap').appendChild(canvas);
    const points = data.metrics || [];
    if (!points.length) { el.innerHTML = '<div class="widget-empty">No data</div>'; return; }
    const labels = points.map(p => p.date || '');
    lineChart(canvas, labels, [
      { label: 'Top 3', data: points.map(p => p.position_1_to_3 || 0) },
      { label: 'Top 10', data: points.map(p => p.position_4_to_10 || 0) },
      { label: 'Top 20', data: points.map(p => p.position_11_to_20 || 0) },
      { label: 'Top 50', data: points.map(p => p.position_21_to_50 || 0) }
    ]);
  },

  // --- SEO Position Buckets ---
  'seo-position-buckets': (el, data) => {
    el.innerHTML = '';
    const groups = data.metrics || [];
    if (!groups.length) { el.innerHTML = '<div class="widget-empty">No data</div>'; return; }
    el.appendChild(table(['Position Range', 'Clicks', 'Impressions', 'CTR'],
      groups.map(g => [
        g.position_range,
        { v: fmt(g.clicks), cls: 'num' },
        { v: fmt(g.impressions), cls: 'num' },
        { v: g.ctr ? fmtPct(g.ctr * 100) : '—', cls: 'num' }
      ])
    ));
  },

  // --- AI Co-mention Sentiment (per-platform tabs) ---
  'ai-comention-sentiment': (el, data) => {
    renderBrandRadarTabs(el, data, (container, platformData) => {
      if (platformData?.error) { container.innerHTML = `<div class="widget-error">⚠ ${platformData.error}</div>`; return; }
      // API returns { ai_responses: [{ question, response, data_source, volume, ... }] }
      const responses = platformData?.ai_responses || [];
      if (!responses.length) { container.innerHTML = '<div class="widget-empty">No responses</div>'; return; }
      container.appendChild(table(['Question', 'Response Excerpt'],
        responses.slice(0, 10).map(r => [
          r.question || '—',
          (r.response || '').slice(0, 120) + ((r.response || '').length > 120 ? '…' : '')
        ])
      ));
    });
  },

  // --- AIO SoV (AI Search tab) ---
  'ai-aio-sov': (el, data) => RENDERERS['sov-aio'](el, data),

  // --- Competitor AIO SoV ---
  'comp-aio-sov': (el, data) => {
    el.innerHTML = '';
    const competitors = data.competitors || data.data || [];
    if (!competitors.length) { el.innerHTML = '<div class="widget-empty">No data</div>'; return; }
    el.appendChild(table(['Competitor', 'SoV', 'Traffic', 'Traffic Value'],
      competitors.slice(0, 15).map(c => [
        c.competitor,
        { v: c.sov ? fmtPct(c.sov) : '—', cls: 'num' },
        { v: fmt(c.traffic), cls: 'num' },
        { v: c.traffic_value ? '$' + fmt(Math.round(c.traffic_value / 100)) : '—', cls: 'num' }
      ])
    ));
  },

  // --- Competitor AIO Gaps ---
  'comp-aio-gaps': (el, data) => {
    el.innerHTML = '';
    const gaps = data.gaps || [];
    if (!gaps.length) { el.innerHTML = '<div class="widget-empty">No gaps found</div>'; return; }
    el.appendChild(table(['Keyword', 'Competitor', 'Position'],
      gaps.slice(0, 20).map(g => [g.keyword, g.competitor || '—', { v: g.position || '—', cls: 'num pos' }])
    ));
  }
};

// ── Shared sub-renderers ─────────────────────────────────────────────────────

function renderSovStats(container, data) {
  if (!data || data.error) {
    container.innerHTML = `<div class="widget-error">⚠ ${data?.error || 'No data'}</div>`;
    return;
  }
  // API returns { metrics: [{ brand, share_of_voice }, ...] }
  const metrics = data.metrics || [];
  if (!metrics.length) { container.innerHTML = '<div class="widget-empty">No data</div>'; return; }
  container.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'stats-row';
  for (const m of metrics) {
    const box = document.createElement('div');
    box.className = 'stat-box';
    box.innerHTML = `<div class="stat-label">${m.brand || 'Brand'}</div><div class="stat-value">${fmtPct((m.share_of_voice || 0) * 100)}</div>`;
    row.appendChild(box);
  }
  container.appendChild(row);
}

function renderGscPerformanceHistory(container, data) {
  const points = data.metrics || [];
  if (!points.length) { container.innerHTML = '<div class="widget-empty">No data</div>'; return; }
  const labels = points.map(p => p.date || '');

  container.innerHTML = `
    <div style="margin-bottom:4px;font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Clicks</div>
    <div class="chart-wrap" style="height:140px"></div>
    <div style="margin:12px 0 4px;font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Impressions</div>
    <div class="chart-wrap" style="height:140px"></div>
  `;
  const [clicksWrap, impressionsWrap] = container.querySelectorAll('.chart-wrap');

  const clicksCanvas = document.createElement('canvas');
  clicksWrap.appendChild(clicksCanvas);
  lineChart(clicksCanvas, labels, [{ label: 'Clicks', data: points.map(p => p.clicks || 0) }]);

  const impressionsCanvas = document.createElement('canvas');
  impressionsWrap.appendChild(impressionsCanvas);
  lineChart(impressionsCanvas, labels, [{ label: 'Impressions', data: points.map(p => p.impressions || 0) }]);
}

function renderSerpFeature(container, data) {
  container.innerHTML = '';
  const results = data.results || [];
  if (!results.length) { container.innerHTML = '<div class="widget-empty">No data</div>'; return; }
  for (const kw of results.slice(0, 8)) {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)';
    section.innerHTML = `<div style="font-weight:600;font-size:12.5px;margin-bottom:4px">🔍 ${kw.keyword} <span style="color:var(--text-muted);font-weight:normal">pos ${kw.position || '—'}</span></div>`;
    for (const item of (kw.items || []).slice(0, 3)) {
      const p = document.createElement('div');
      p.style.cssText = 'font-size:12px;color:var(--text-muted);padding-left:12px;margin-bottom:2px';
      // positions have `title` and `url`; type array indicates what kind of SERP feature it is
      p.textContent = item.title || item.url || '';
      section.appendChild(p);
    }
    container.appendChild(section);
  }
}

function renderKeywordsTable(container, data) {
  container.innerHTML = '';
  const keywords = data.keywords || [];
  if (!keywords.length) { container.innerHTML = '<div class="widget-empty">No keywords found</div>'; return; }
  container.appendChild(table(['Keyword', 'Clicks', 'Impressions', 'Position'],
    keywords.slice(0, 20).map(k => [
      k.keyword,
      { v: fmt(k.clicks), cls: 'num' },
      { v: fmt(k.impressions), cls: 'num' },
      { v: k.position ? parseFloat(k.position).toFixed(1) : '—', cls: 'num pos' }
    ])
  ));
}

function renderCitedPages(container, data) {
  container.innerHTML = '';
  if (data?.error) { container.innerHTML = `<div class="widget-error">⚠ ${data.error}</div>`; return; }
  const pages = data?.pages || [];
  if (!pages.length) { container.innerHTML = '<div class="widget-empty">No data</div>'; return; }
  container.appendChild(table(['URL', 'Responses'],
    pages.slice(0, 15).map(p => [
      decodeURIComponent(p.url || '').replace(/^https?:\/\/[^/]+/, '') || p.url,
      { v: fmt(p.responses), cls: 'num' }
    ])
  ));
}

function renderCitedDomains(container, data) {
  container.innerHTML = '';
  if (data?.error) { container.innerHTML = `<div class="widget-error">⚠ ${data.error}</div>`; return; }
  const domains = data?.domains || [];
  if (!domains.length) { container.innerHTML = '<div class="widget-empty">No data</div>'; return; }
  container.appendChild(table(['Domain', 'Responses', 'Pages'],
    domains.slice(0, 15).map(d => [
      d.domain,
      { v: fmt(d.responses), cls: 'num' },
      { v: fmt(d.pages), cls: 'num' }
    ])
  ));
}
