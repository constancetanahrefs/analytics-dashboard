/**
 * Insights Report — App entry point.
 * Manages routing, date state, and widget orchestration.
 */

import { initSettings, openSettings, closeSettings } from './settings.js';
import { renderPage, clearWidgetCache } from './widgets.js';

const PAGES = {
  performance: {
    title: 'Performance',
    widgetIds: ['p1-sov-ai','p2-sov-organic','p3-impressions-ai','p4-impressions-gsc',
                'p5-clicks-organic','p6-clicks-ai','p8-aio-pages','p9-organic-pages']
  },
  opportunities: {
    title: 'Opportunities',
    widgetIds: ['o1-third-domains','o2-aio-gaps','o3-question-kw','o4-longtail-kw',
                'o5-paa','o6-discussions','o7-reddit-quora','o8-videos','o9-video-ai']
  },
  starred: {
    title: 'Starred',
    widgetIds: null  // filled dynamically from state.widgets
  }
};

/** Shared application state — read by widgets.js and settings.js. */
export const state = {
  page:     'performance',
  dateFrom: null,   // ISO date (the compare/earlier date)
  dateTo:   null,   // ISO date (the primary/later date)
  widgets:  [],     // rows from GET /api/insights/widgets
  settings: {}      // key-value map from GET /api/insights/settings
};

async function init() {
  // Default: primary = today, compare = 1 month ago
  const today    = new Date();
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  state.dateTo   = toIso(today);
  state.dateFrom = toIso(monthAgo);

  document.getElementById('dp-primary').value = state.dateTo;
  document.getElementById('dp-compare').value = state.dateFrom;

  // Fetch widget list and global settings from backend
  const [widgetsRes, settingsRes] = await Promise.all([
    fetch('/api/insights/widgets').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('/api/insights/settings').then(r => r.ok ? r.json() : {}).catch(() => ({}))
  ]);
  state.widgets  = Array.isArray(widgetsRes) ? widgetsRes : [];
  state.settings = settingsRes || {};

  // Init settings panel (must happen after state is populated)
  initSettings(state);

  // ── Sidebar navigation ────────────────────────────────────────────────────
  document.querySelectorAll('#sidebar nav a[data-page]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(a.dataset.page);
    });
  });

  // ── Date apply ────────────────────────────────────────────────────────────
  document.getElementById('btn-apply-dates').addEventListener('click', () => {
    state.dateTo   = document.getElementById('dp-primary').value;
    state.dateFrom = document.getElementById('dp-compare').value;
    if (!state.dateTo || !state.dateFrom) return;
    clearWidgetCache();
    document.dispatchEvent(new CustomEvent('insights:date-change'));
  });

  // ── Settings panel ────────────────────────────────────────────────────────
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', closeSettings);

  // ── Initial route ─────────────────────────────────────────────────────────
  const hash = window.location.hash.slice(1);
  navigateTo(PAGES[hash] ? hash : 'performance');
}

function navigateTo(page) {
  state.page = page;
  window.location.hash = page;

  // Update nav active state
  document.querySelectorAll('#sidebar nav a[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
  document.getElementById('page-title').textContent = PAGES[page]?.title || page;

  let widgetIds = PAGES[page]?.widgetIds;
  if (page === 'starred') {
    widgetIds = state.widgets.filter(w => w.starred).map(w => w.id);
  }

  renderPage(widgetIds || [], document.getElementById('content'), state);
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

init();
