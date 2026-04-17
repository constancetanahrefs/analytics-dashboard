/**
 * Insights Report — Settings panel.
 * Slide-in panel for global settings (project_id, report_id, country, brand, domain)
 * and per-widget param overrides.
 */

const GLOBAL_FIELDS = [
  {
    key: 'default_project_id',
    label: 'Project ID',
    placeholder: 'e.g. 12345',
    tip: 'Used by GSC, Rank Tracker, and Web Analytics widgets as the default project_id parameter.'
  },
  {
    key: 'default_report_id',
    label: 'Brand Radar Report ID',
    placeholder: 'e.g. 67890',
    tip: 'Used by all Brand Radar widgets (AI SoV, Impressions, Cited Pages). Find it in your Ahrefs Brand Radar report URL.'
  },
  {
    key: 'default_brand_name',
    label: 'Brand Name',
    placeholder: 'e.g. Acme Corp',
    tip: 'Required by brand-radar/impressions-history. Also used to filter branded keywords in GSC widgets.'
  },
  {
    key: 'default_domain',
    label: 'Domain',
    placeholder: 'e.g. acme.com',
    tip: 'Your own domain — used to exclude your URLs from 3rd-party competitor tables (o1, o2 widgets).'
  },
  {
    key: 'default_competitors_domains',
    label: 'Competitor Domains (comma-separated)',
    placeholder: 'e.g. semrush.com,moz.com,ahrefs.com',
    tip: 'Competitor domains to exclude from the 3rd-Party Domains — AI Search widget (o1). Comma-separated, e.g. semrush.com,moz.com'
  },
  {
    key: 'default_country',
    label: 'Country',
    placeholder: 'e.g. us',
    tip: 'Applied as the "country" parameter to rank-tracker/serp-overview calls (PAA, Discussions, Videos widgets). Use ISO 2-letter code.'
  },
  {
    key: 'ahrefs_api_key',
    label: 'Ahrefs API Key',
    placeholder: '••••••••',
    tip: 'Your Ahrefs API v3 key. Overrides the AHREFS_API_KEY environment variable set on the server.'
  },
  {
    key: 'timeout_ms',
    label: 'Request Timeout (ms)',
    placeholder: '30000',
    tip: 'Maximum milliseconds before an API request is cancelled and logged as a timeout. Default: 30000.'
  }
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

  // ── Global Settings ────────────────────────────────────────────────────────
  const globalSection = document.createElement('div');
  globalSection.className = 'settings-section';
  globalSection.innerHTML = '<h3>Global Settings</h3>';

  for (const field of GLOBAL_FIELDS) {
    const group = document.createElement('div');
    group.className = 'form-group';

    const isKey = field.key === 'ahrefs_api_key';
    const currentVal = _state.settings[field.key] || '';

    group.innerHTML = `
      <label>
        ${field.label}
        <span class="endpoint-tip" title="${escHtml(field.tip)}">ℹ</span>
      </label>
      <input type="${isKey ? 'password' : 'text'}"
             id="gs-${field.key}"
             placeholder="${field.placeholder}"
             value="${escHtml(isKey ? '' : currentVal)}"
             autocomplete="off">
    `;
    globalSection.appendChild(group);
  }

  const saveGlobalBtn = document.createElement('button');
  saveGlobalBtn.className = 'btn primary sm';
  saveGlobalBtn.style.marginTop = '8px';
  saveGlobalBtn.textContent = 'Save Global Settings';
  saveGlobalBtn.addEventListener('click', saveGlobalSettings);
  globalSection.appendChild(saveGlobalBtn);

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

async function saveGlobalSettings() {
  const updates = {};
  for (const field of GLOBAL_FIELDS) {
    const el = document.getElementById(`gs-${field.key}`);
    if (!el) continue;
    const val = el.value.trim();
    // Skip empty API key (never clear it via blank field — use a dedicated reset)
    if (field.key === 'ahrefs_api_key' && !val) continue;
    updates[field.key] = val;
  }

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Save failed');
    // Update in-memory state
    Object.assign(_state.settings, updates);
    showToast('✓ Settings saved');
    document.dispatchEvent(new CustomEvent('insights:settings-change'));
  } catch (err) {
    showToast('Failed to save: ' + err.message, '#f87171');
  }
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
