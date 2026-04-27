// tests/calculations.js
// Pure calculation functions mirroring the logic embedded in widgets.js.
// These are NOT imported from the frontend — they live here so they can be
// tested in Node context against live API responses.

// ── SoV delta (p2-sov-organic) ───────────────────────────────────────────────
// Mirrors the computation in fetchOrganicSovSnapshot in rank-tracker.js
export function computeSovDeltas(currentRows, previousRows) {
  const prevMap = {};
  for (const r of previousRows) {
    prevMap[r.competitor] = r.share_of_voice || 0;
  }
  return currentRows.map(r => ({
    ...r,
    share_of_voice_prev: prevMap[r.competitor] ?? null,
    sov_delta: prevMap[r.competitor] != null
      ? (r.share_of_voice || 0) - prevMap[r.competitor]
      : null
  }));
}

// ── Subfolder grouping (p5-clicks-organic) ───────────────────────────────────
// Groups pages by their first URL path segment (/blog/, /docs/, etc.)
// Mirrors the table rendering logic in widgets.js renderLineAndTable
export function groupBySubfolder(pages) {
  const groups = {};
  for (const p of pages) {
    const url = p.page || p.url || '';
    let seg = '/';
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      seg = parts.length > 0 ? '/' + parts[0] + '/' : '/';
    } catch { /* malformed URL — bucket under root */ }
    if (!groups[seg]) groups[seg] = { key: seg, clicks: 0, pages: [] };
    groups[seg].clicks += p.clicks || 0;
    groups[seg].pages.push(p);
  }
  return Object.values(groups);
}

// ── Question keyword regex (o3-question-kw) ──────────────────────────────────
// Mirrors the client-side filter in the o3 renderer in widgets.js
const QUESTION_RE = /^(who|what|why|where|how|when|which|is|are|can|does|do|should)\b/i;
export function filterQuestionKeywords(keywords) {
  return keywords.filter(k => QUESTION_RE.test(k.keyword || ''));
}

// ── Long-tail word count (o4-longtail-kw) ────────────────────────────────────
// Mirrors the client-side filter in fetchLongTailKeywords in gsc.js
export function filterLongTailKeywords(keywords) {
  return keywords.filter(k => (k.keyword || '').trim().split(/\s+/).length >= 5);
}

// ── Domain exclusion (o1-third-domains, o2-aio-gaps) ─────────────────────────
// Mirrors the client-side filter applied in the o1/o2 renderers in widgets.js
// domainField: the property name on each item containing the domain/URL string
// ownDomain: string, e.g. 'example.com'
// competitorDomains: string[], e.g. ['competitor.com']
export function filterExcludedDomains(items, domainField, ownDomain, competitorDomains) {
  const excludes = [ownDomain, ...competitorDomains].filter(Boolean);
  return items.filter(item => {
    const val = item[domainField] || '';
    return !excludes.some(d => d && val.includes(d));
  });
}

// ── URL deduplication (o8-videos) ────────────────────────────────────────────
// Mirrors the Set-based dedup in renderSerpFeaturesTable in widgets.js
// results: [{ keyword, position, items: [{ url, title, ... }] }]
export function deduplicateByUrl(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    for (const item of (r.items || [])) {
      const url = item.url || '';
      if (url && seen.has(url)) continue;
      if (url) seen.add(url);
      out.push({ keyword: r.keyword, position: r.position, ...item });
    }
  }
  return out;
}
