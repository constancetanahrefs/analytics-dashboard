export async function renderSettings(container) {
  container.innerHTML = '<div class="widget-loading"><span class="spinner"></span>&nbsp;Loading…</div>';

  const res = await fetch('/api/settings');
  const { settings, widgets } = await res.json();

  container.innerHTML = '';

  // ── Global Settings ──────────────────────────────────────────────────────
  const section = document.createElement('div');
  section.className = 'page-section';
  section.innerHTML = `
    <h2>Global Settings</h2>
    <div class="form-grid">
      <div class="form-group">
        <label>Ahrefs API Key</label>
        <input type="password" id="s-api-key" placeholder="From .env or override here" value="${settings.ahrefs_api_key || ''}">
      </div>
      <div class="form-group">
        <label>Default Project ID (GSC / RT / Web Analytics)</label>
        <input type="text" id="s-project-id" value="${settings.default_project_id || ''}">
      </div>
      <div class="form-group">
        <label>Default Brand Radar Report ID</label>
        <input type="text" id="s-report-id" value="${settings.default_report_id || ''}">
      </div>
      <div class="form-group">
        <label>Default Domain (Site Explorer target)</label>
        <input type="text" id="s-domain" placeholder="example.com" value="${settings.default_domain || ''}">
      </div>
      <div class="form-group">
        <label>Brand Name (for branded keyword filtering)</label>
        <input type="text" id="s-brand-name" placeholder="YourBrand" value="${settings.default_brand_name || ''}">
      </div>
      <div class="form-group">
        <label>
          Default Country (ISO 2-letter code)
          <span class="endpoint-tip" title="Used by rank-tracker/serp-overview — required for PAA, Discussions, and Videos widgets on the Home and AI Search tabs. Examples: us, gb, au, ca">ℹ</span>
        </label>
        <input type="text" id="s-country" placeholder="us" maxlength="2" value="${settings.default_country || 'us'}">
      </div>
      <div class="form-group">
        <label>Refresh Schedule (cron expression)</label>
        <input type="text" id="s-cron" placeholder="0 2 * * *" value="${settings.cron_schedule || '0 2 * * *'}">
      </div>
      <div class="form-group">
        <label>API Timeout (ms)</label>
        <input type="number" id="s-timeout" value="${settings.timeout_ms || 30000}">
      </div>
    </div>
    <button class="btn primary" id="save-global">Save Global Settings</button>
  `;
  container.appendChild(section);

  section.querySelector('#save-global').addEventListener('click', async () => {
    const body = {
      ahrefs_api_key: section.querySelector('#s-api-key').value,
      default_project_id: section.querySelector('#s-project-id').value,
      default_report_id: section.querySelector('#s-report-id').value,
      default_domain: section.querySelector('#s-domain').value,
      default_brand_name: section.querySelector('#s-brand-name').value,
      default_country: section.querySelector('#s-country').value.toLowerCase(),
      cron_schedule: section.querySelector('#s-cron').value,
      timeout_ms: section.querySelector('#s-timeout').value
    };
    const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) showToast('Settings saved');
    else showToast('Error saving settings', true);
  });

  // ── Per-widget Settings ──────────────────────────────────────────────────
  const wsSection = document.createElement('div');
  wsSection.className = 'page-section';
  wsSection.style.marginTop = '32px';
  wsSection.innerHTML = '<h2>Widget Overrides</h2><p style="color:var(--text-muted);font-size:12px;margin-bottom:12px">Override project_id, report_id, or domain per widget. Leave blank to use global defaults.</p>';

  const list = document.createElement('div');
  list.className = 'widget-settings-list';

  for (const w of widgets) {
    const params = JSON.parse(w.params || '{}');
    const row = document.createElement('div');
    row.className = 'widget-settings-row';
    row.innerHTML = `
      <div>
        <div class="wname">
          ${w.title}
          <span class="endpoint-tip" title="${w.description}">ℹ</span>
        </div>
        <div class="wtab">${w.tab}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <input type="text" placeholder="project_id" data-key="project_id" value="${params.project_id || ''}" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:4px 8px;font-size:12px">
        <input type="text" placeholder="report_id" data-key="report_id" value="${params.report_id || ''}" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:4px 8px;font-size:12px">
        <input type="text" placeholder="domain" data-key="domain" value="${params.target || ''}" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:4px 8px;font-size:12px">
      </div>
      <button class="btn sm" data-widget-id="${w.id}">Save</button>
    `;
    row.querySelector('button').addEventListener('click', async () => {
      const overrides = {};
      row.querySelectorAll('input').forEach(inp => { if (inp.value) overrides[inp.dataset.key] = inp.value; });
      const r = await fetch(`/api/settings/widgets/${w.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(overrides) });
      if (r.ok) showToast(`Saved overrides for "${w.title}"`);
    });
    list.appendChild(row);
  }
  wsSection.appendChild(list);
  container.appendChild(wsSection);
}

function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:${isError ? 'var(--danger)' : 'var(--success)'};color:#fff;padding:8px 18px;border-radius:8px;font-size:13px;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,0.4)`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
