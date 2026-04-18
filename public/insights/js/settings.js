/**
 * Insights Report — Settings panel.
 * Slide-in panel for global settings (project_id, report_id, country, brand, domain)
 * and per-widget param overrides.
 */

// Global fields are read-only — sourced from server .env file
const GLOBAL_FIELDS = [
  { key: 'ahrefs_api_key',             label: 'Ahrefs API Key',                    envVar: 'AHREFS_API_KEY' },
  { key: 'default_project_id',              label: 'Project ID (GSC & Rank Tracker)',   envVar: 'DEFAULT_PROJECT_ID' },
  { key: 'default_web_analytics_project_id', label: 'Project ID (Web Analytics)',        envVar: 'DEFAULT_WEB_ANALYTICS_PROJECT_ID' },
  { key: 'default_report_id',               label: 'Brand Radar Report ID',             envVar: 'DEFAULT_REPORT_ID' },
  { key: 'default_brand_name',         label: 'Brand Name',                        envVar: 'DEFAULT_BRAND_NAME' },
  { key: 'default_domain',             label: 'Domain',                            envVar: 'DEFAULT_DOMAIN' },
  { key: 'default_competitors_domains',label: 'Competitor Domains',                envVar: 'DEFAULT_COMPETITORS_DOMAINS' },
  { key: 'default_country',            label: 'Country',                           envVar: 'DEFAULT_COUNTRY' },
  { key: 'cron_schedule',              label: 'Cron Schedule',                     envVar: 'CRON_SCHEDULE' },
  { key: 'timeout_ms',                 label: 'Request Timeout (ms)',              envVar: 'TIMEOUT_MS' }
];

// Per-widget overrideable params
const WIDGET_OVERRIDE_FIELDS = {
  'p1-sov-ai':          ['report_id', 'brand'],
  'p2-sov-organic':     ['project_id'],
  'p3-impressions-ai':  ['report_id', 'brand'],
  'p4-impressions-gsc': ['project_id'],
  'p5-clicks-organic':  ['project_id'],
  'p6-clicks-ai':       ['project_id'],
  'p8-aio-pages':       ['project_id'],
  'p9-organic-pages':   ['project_id'],
  'o1-third-domains':   ['report_id', 'brand'],
  'o2-aio-gaps':        ['project_id'],
  'o3-question-kw':     ['project_id'],
  'o4-longtail-kw':     ['project_id'],
  'o5-paa':             ['project_id'],
  'o6-discussions':     ['project_id'],
  'o7-reddit-quora':    ['report_id', 'brand'],
  'o8-videos':          ['project_id'],
  'o9-video-ai':        ['report_id', 'brand']
};

let _state = null;

export function initSettings(appState) {
  _state = appState;
  renderSettingsPanel();
}

export function openSettings() {
  document.getElementById('settings-overlay').classList.remove('hidden');
  document.getElementById('settings-panel').classList.remove('hidden');
}

export function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
  document.getElementById('settings-panel').classList.add('hidden');
}

function renderSettingsPanel() {
  const body = document.getElementById('settings-body');
  body.innerHTML = '';

  // ── Global Settings (read-only — configured in .env) ──────────────────────
  const globalSection = document.createElement('div');
  globalSection.className = 'settings-section';

  const globalHeader = document.createElement('h3');
  globalHeader.textContent = 'Global Settings';
  globalSection.appendChild(globalHeader);

  const globalNote = document.createElement('p');
  globalNote.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:12px';
  globalNote.textContent = 'These values are set in your server\'s .env file. Edit .env and restart the server to change them.';
  globalSection.appendChild(globalNote);

  for (const field of GLOBAL_FIELDS) {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = field.label;

    const envBadge = document.createElement('code');
    envBadge.style.cssText = 'font-size:10px;margin-left:6px;color:var(--text-muted)';
    envBadge.textContent = field.envVar;
    label.appendChild(envBadge);

    const val = _state.settings[field.key] || '';
    const display = document.createElement('div');
    display.style.cssText = 'font-size:13px;padding:6px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:' + (val ? 'var(--text)' : 'var(--text-muted)');
    display.textContent = val || '(not set)';

    group.appendChild(label);
    group.appendChild(display);
    globalSection.appendChild(group);
  }

  body.appendChild(globalSection);

  // ── Per-widget overrides ───────────────────────────────────────────────────
  const overrideSection = document.createElement('div');
  overrideSection.className = 'settings-section';
  overrideSection.innerHTML = '<h3>Per-Widget Overrides</h3>';

  for (const widget of _state.widgets) {
    const fields = WIDGET_OVERRIDE_FIELDS[widget.id];
    if (!fields || fields.length === 0) continue;

    const currentParams = JSON.parse(widget.params || '{}');
    const row = document.createElement('div');
    row.className = 'widget-override-row';

    const pageLabel = widget.page === 'performance' ? 'P' : 'O';
    row.innerHTML = `
      <div class="widget-override-title">
        ${widget.title || widget.id}
        <span class="widget-override-page">${widget.page}</span>
      </div>
      <div class="override-fields" id="override-fields-${widget.id}"></div>
      <button class="btn sm" data-widget-id="${widget.id}" style="margin-top:4px">Save</button>
    `;

    const fieldsDiv = row.querySelector(`#override-fields-${widget.id}`);
    for (const f of fields) {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = f;
      inp.title = `Override ${f} for this widget`;
      inp.dataset.field = f;
      inp.value = currentParams[f] || '';
      fieldsDiv.appendChild(inp);
    }

    row.querySelector('button').addEventListener('click', () => saveWidgetOverride(widget.id, row));
    overrideSection.appendChild(row);
  }

  if (_state.widgets.length === 0) {
    overrideSection.innerHTML += '<p style="font-size:12px;color:var(--text-muted)">No widgets loaded.</p>';
  }

  body.appendChild(overrideSection);
}

async function saveWidgetOverride(widgetId, row) {
  const inputs = row.querySelectorAll('[data-field]');
  const params = {};
  inputs.forEach(inp => {
    params[inp.dataset.field] = inp.value.trim();
  });

  try {
    const res = await fetch(`/api/insights/settings/widgets/${widgetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error('Save failed');
    // Sync params from the server response (server merges with existing DB params)
    const result = await res.json();
    const w = _state.widgets.find(x => x.id === widgetId);
    if (w && result.params) w.params = JSON.stringify(result.params);
    showToast('✓ Widget override saved');
    document.dispatchEvent(new CustomEvent('insights:settings-change'));
  } catch (err) {
    showToast('Failed: ' + err.message, '#f87171');
  }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(msg, color = '#34d399') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  t.style.background = color;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
