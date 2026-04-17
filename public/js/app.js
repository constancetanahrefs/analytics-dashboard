import { buildCard, loadWidgetData } from './widgets.js';
import { renderSettings } from './settings.js';
import { dateCtx } from './state.js';

// ── State ────────────────────────────────────────────────────────────────────
let allWidgets = [];
let syncPollInterval = null;

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  allWidgets = await fetch('/api/widgets').then(r => r.json());
  route();
  window.addEventListener('popstate', route);
  document.querySelectorAll('#sidebar nav a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const tab = a.dataset.tab;
      history.pushState({ tab }, '', '#' + tab);
      route();
    });
  });

  // Topbar buttons
  document.getElementById('btn-refresh-all').addEventListener('click', startSync);
  document.getElementById('btn-resume-sync').addEventListener('click', resumeSync);
  document.getElementById('btn-terminate').addEventListener('click', terminateApp);

  // Date picker — seed inputs with defaults then wire Apply
  initDatePicker();

  startSyncPoller();
}

// ── Date picker ───────────────────────────────────────────────────────────────
function initDatePicker() {
  document.getElementById('dp-primary').value = dateCtx.primary;
  document.getElementById('dp-compare').value = dateCtx.compare;

  document.getElementById('btn-apply-dates').addEventListener('click', () => {
    const primary = document.getElementById('dp-primary').value;
    const compare = document.getElementById('dp-compare').value;
    if (!primary || !compare) return;
    dateCtx.primary = primary;
    dateCtx.compare = compare;
    refreshCurrentTab();
  });
}

function refreshCurrentTab() {
  const tab = location.hash.replace('#', '') || 'home';
  // Re-render the tab — buildCard will call loadWidgetData which reads
  // the updated dateCtx automatically via getDateParams()
  renderTab(tab);
}

function route() {
  const hash = location.hash.replace('#', '') || 'home';
  document.querySelectorAll('#sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === hash);
  });
  document.getElementById('page-title').textContent = {
    home: 'Overview',
    seo: 'SEO',
    'ai-search': 'AI Search',
    competitor: 'Competitor Research',
    logs: 'Fetch Logs',
    settings: 'Settings'
  }[hash] || 'Dashboard';

  renderTab(hash);
}

// ── Tab rendering ─────────────────────────────────────────────────────────────
function renderTab(tab) {
  const content = document.getElementById('content');
  content.innerHTML = '';

  const isDataTab = !['settings', 'logs'].includes(tab);
  document.getElementById('date-bar').classList.toggle('hidden', !isDataTab);

  if (tab === 'settings') { renderSettings(content); return; }
  if (tab === 'logs') { renderLogs(content); return; }

  const grid = document.createElement('div');
  grid.className = 'widget-grid';

  if (tab === 'home') {
    // ── SoV section (side-by-side at top) ───────────────────────────────────
    const sovIds = ['sov-custom-prompts', 'sov-organic'];
    const sovWidgets = allWidgets.filter(w => sovIds.includes(w.id) && !w.hidden);
    if (sovWidgets.length) {
      const sovSection = document.createElement('div');
      sovSection.className = 'sov-section';
      const sovLabel = document.createElement('div');
      sovLabel.className = 'section-label';
      sovLabel.textContent = 'Share of Voice';
      sovSection.appendChild(sovLabel);
      const sovRow = document.createElement('div');
      sovRow.className = 'sov-row';
      for (const w of sovWidgets) sovRow.appendChild(buildCard(w, allWidgets));
      sovSection.appendChild(sovRow);
      content.appendChild(sovSection);
    }

    // Native home widgets (excluding SoV — already rendered above)
    const homeWidgets = allWidgets.filter(w => w.tab === 'home' && !sovIds.includes(w.id));
    for (const w of homeWidgets) {
      if (!w.hidden) grid.appendChild(buildCard(w, allWidgets));
    }
    // Pinned widgets from other tabs
    const pinned = allWidgets.filter(w => w.tab !== 'home' && w.pinned);
    for (const w of pinned) {
      const card = buildCard(w, allWidgets);
      // Visual indicator that it's pinned from another tab
      const badge = document.createElement('span');
      badge.style.cssText = 'font-size:10px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:1px 5px;color:var(--text-muted)';
      badge.textContent = w.tab;
      card.querySelector('.widget-header').appendChild(badge);
      grid.appendChild(card);
    }
  } else {
    const tabWidgets = allWidgets.filter(w => w.tab === tab);
    for (const w of tabWidgets) {
      if (!w.hidden) grid.appendChild(buildCard(w, allWidgets));
    }
  }

  // Hidden widgets toggle
  const hiddenWidgets = allWidgets.filter(w => w.tab === (tab === 'home' ? 'home' : tab) && w.hidden);
  if (hiddenWidgets.length) {
    const toggleWrap = document.createElement('div');
    toggleWrap.style.cssText = 'margin-top:16px;';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn sm';
    toggleBtn.textContent = `Show ${hiddenWidgets.length} hidden widget(s)`;
    let showing = false;
    const hiddenGrid = document.createElement('div');
    hiddenGrid.className = 'widget-grid';
    hiddenGrid.style.marginTop = '12px';
    hiddenGrid.style.display = 'none';
    for (const w of hiddenWidgets) hiddenGrid.appendChild(buildCard(w, allWidgets));
    toggleBtn.addEventListener('click', () => {
      showing = !showing;
      hiddenGrid.style.display = showing ? '' : 'none';
      toggleBtn.textContent = showing ? 'Hide hidden widgets' : `Show ${hiddenWidgets.length} hidden widget(s)`;
    });
    toggleWrap.appendChild(toggleBtn);
    toggleWrap.appendChild(hiddenGrid);
    content.appendChild(grid);
    content.appendChild(toggleWrap);
    return;
  }

  content.appendChild(grid);
}

// ── Logs page ────────────────────────────────────────────────────────────────
async function renderLogs(container) {
  container.innerHTML = `
    <div class="page-section">
      <h2>Fetch Logs</h2>
      <div class="log-filters">
        <select id="log-filter-status">
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="timeout">Timeout</option>
        </select>
        <select id="log-filter-widget">
          <option value="">All widgets</option>
          ${allWidgets.map(w => `<option value="${w.id}">${w.title}</option>`).join('')}
        </select>
        <button class="btn sm" id="log-filter-apply">Filter</button>
        <button class="btn sm danger" id="log-clear">Clear Logs</button>
      </div>
      <div class="log-table-wrap" id="log-table-wrap"><div class="widget-loading"><span class="spinner"></span>&nbsp;Loading…</div></div>
    </div>
  `;

  const loadLogs = async () => {
    const status = document.getElementById('log-filter-status').value;
    const widgetId = document.getElementById('log-filter-widget').value;
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (widgetId) params.set('widget_id', widgetId);
    const logs = await fetch('/api/logs?' + params).then(r => r.json());
    const wrap = document.getElementById('log-table-wrap');
    if (!logs.length) { wrap.innerHTML = '<div class="widget-empty">No logs</div>'; return; }

    const t = document.createElement('table');
    t.className = 'data-table';
    t.innerHTML = `<thead><tr>
      <th>Time</th><th>Widget</th><th>Endpoint</th>
      <th>Status</th><th>HTTP</th><th>Duration</th><th>Error</th>
    </tr></thead>`;
    const tbody = t.createTBody();
    for (const log of logs) {
      const tr = tbody.insertRow();
      const statusCls = log.status === 'success' ? 'success' : log.status === 'timeout' ? 'timeout' : 'error';
      tr.innerHTML = `
        <td style="white-space:nowrap;font-size:11px">${log.created_at || '—'}</td>
        <td>${log.widget_id || '—'}</td>
        <td style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis">${log.endpoint || '—'}</td>
        <td><span class="badge ${statusCls}">${log.status}</span></td>
        <td class="num">${log.http_code || '—'}</td>
        <td class="num">${log.duration_ms != null ? log.duration_ms + 'ms' : '—'}</td>
        <td style="font-size:11px;color:var(--danger);max-width:200px;overflow:hidden;text-overflow:ellipsis">${log.error_message || ''}</td>
      `;
    }
    wrap.innerHTML = '';
    wrap.appendChild(t);
  };

  container.querySelector('#log-filter-apply').addEventListener('click', loadLogs);
  container.querySelector('#log-clear').addEventListener('click', async () => {
    await fetch('/api/logs', { method: 'DELETE' });
    loadLogs();
  });

  loadLogs();
}

// ── Sync controls ─────────────────────────────────────────────────────────────
async function startSync() {
  const res = await fetch('/api/sync/run', { method: 'POST' });
  if (!res.ok) { const j = await res.json(); alert(j.error); return; }
  showSyncBar();
}

async function resumeSync() {
  await fetch('/api/sync/resume', { method: 'POST' });
  showSyncBar();
}

function showSyncBar() {
  document.getElementById('sync-bar').classList.add('visible');
}

async function terminateApp() {
  if (!confirm('Terminate the application?')) return;
  document.open();
  document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Terminated</title>
  <style>
    body { margin: 0; background: #0f1117; color: #e2e4f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .msg { text-align: center; }
    .msg h1 { font-size: 28px; font-weight: 700; margin-bottom: 10px; }
    .msg p { color: #7c80a0; font-size: 15px; }
  </style>
</head>
<body>
  <div class="msg">
    <h1>Application terminated.</h1>
    <p>See you again!</p>
  </div>
</body>
</html>`);
  document.close();
  await fetch('/api/shutdown', { method: 'POST' }).catch(() => {});
}

function startSyncPoller() {
  syncPollInterval = setInterval(async () => {
    const state = await fetch('/api/sync/status').then(r => r.json());
    const bar = document.getElementById('sync-bar');
    if (state.in_progress) {
      bar.classList.add('visible');
      const pct = state.total_widgets ? Math.round((state.synced_count / state.total_widgets) * 100) : 0;
      bar.querySelector('progress').value = pct;
      bar.querySelector('.sync-label').textContent = `${state.synced_count} / ${state.total_widgets} widgets · Last: ${state.last_widget_synced || '—'}`;
    } else {
      bar.classList.remove('visible');
    }
  }, 3000);
}

init();
