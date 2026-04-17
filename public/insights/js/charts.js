/**
 * Chart helpers for the Insights report.
 * Chart.js loaded via CDN in index.html.
 */

const PALETTE = ['#009DFF', '#FF8800', '#00cfff', '#ff4d00', '#00c87a', '#FFD000'];

const CHART_FONT = { family: "'Inter', sans-serif", size: 10.5 };
const TICK_COLOR = '#5e5e5e';
const GRID_COLOR = '#1e1e1e';

const AXIS_DEFAULTS = {
  ticks: { color: TICK_COLOR, font: CHART_FONT, maxTicksLimit: 8 },
  grid:  { color: GRID_COLOR }
};

// Shared hover behaviour: snap to nearest x, show all datasets at that index
const HOVER_INTERACTION = { mode: 'index', intersect: false };

// Tooltip styled to match the dark theme
const TOOLTIP_STYLE = {
  backgroundColor: '#1a1a1a',
  borderColor: '#333',
  borderWidth: 1,
  titleColor: '#f2f2f2',
  bodyColor: '#a0a0a0',
  titleFont: { ...CHART_FONT, weight: '600' },
  bodyFont: CHART_FONT,
  padding: 10,
  boxWidth: 8,
  boxHeight: 8,
  usePointStyle: true,
  callbacks: {
    title(items) {
      const raw = items[0]?.label;
      if (!raw) return '';
      const d = new Date(raw + 'T00:00:00');
      if (isNaN(d.getTime())) return raw;
      return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
    },
    label(item) {
      const v = item.parsed.y;
      if (v === null || v === undefined) return null;
      const formatted = v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M'
                      : v >= 1_000     ? (v / 1_000).toFixed(1) + 'K'
                      : String(v);
      return ' ' + item.dataset.label + ': ' + formatted;
    }
  }
};

// X-axis with "24-Feb" date label formatting
const DATE_X_AXIS = {
  ticks: {
    color: TICK_COLOR,
    font: CHART_FONT,
    maxTicksLimit: 8,
    callback(val) {
      const raw = this.getLabelForValue(val);
      if (!raw) return '';
      const d = new Date(raw + 'T00:00:00');
      if (isNaN(d.getTime())) return raw;
      return d.getDate() + '-' + d.toLocaleString('en', { month: 'short' });
    }
  },
  grid: { color: GRID_COLOR }
};

function destroyExisting(canvas) {
  if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }
}

/**
 * Single-series line chart (filled area).
 */
export function lineChart(canvas, labels, dataset) {
  destroyExisting(canvas);
  canvas._chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: dataset.label,
        data: dataset.data,
        borderColor: dataset.color || PALETTE[0],
        backgroundColor: (dataset.color || PALETTE[0]) + '22',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: HOVER_INTERACTION,
      plugins: {
        legend: { display: false },
        tooltip: TOOLTIP_STYLE
      },
      scales: {
        x: DATE_X_AXIS,
        y: AXIS_DEFAULTS
      }
    }
  });
}

/**
 * Multi-series line chart — all datasets share the same Y axis.
 * datasets: [{ label, data, color? }]
 */
export function multiLineChart(canvas, labels, datasets, { valueFormat = 'number' } = {}) {
  destroyExisting(canvas);
  const tooltipStyle = valueFormat === 'percent'
    ? {
        ...TOOLTIP_STYLE,
        callbacks: {
          ...TOOLTIP_STYLE.callbacks,
          label(item) {
            const v = item.parsed.y;
            if (v === null || v === undefined) return null;
            return ' ' + item.dataset.label + ': ' + parseFloat(v).toFixed(1) + '%';
          }
        }
      }
    : TOOLTIP_STYLE;

  canvas._chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color || PALETTE[i % PALETTE.length],
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: HOVER_INTERACTION,
      plugins: {
        legend: { labels: { color: TICK_COLOR, boxWidth: 10, font: CHART_FONT } },
        tooltip: tooltipStyle
      },
      scales: {
        x: DATE_X_AXIS,
        y: AXIS_DEFAULTS
      }
    }
  });
}

/**
 * Dual-Y-axis line chart.
 * Left axis for datasets[0], right axis for datasets[1].
 * datasets: [{ label, data, color? }, { label, data, color? }]
 * Matches Ahrefs-style: separate Y scales, no shared grid on right axis.
 */
export function dualYLineChart(canvas, labels, datasets) {
  destroyExisting(canvas);
  const colors = datasets.map((ds, i) => ds.color || PALETTE[i % PALETTE.length]);
  canvas._chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        yAxisID: i === 0 ? 'y' : 'y1',
        borderColor: colors[i],
        backgroundColor: i === 0 ? colors[i] + '18' : 'transparent',
        fill: i === 0,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: HOVER_INTERACTION,
      plugins: {
        legend: { labels: { color: TICK_COLOR, boxWidth: 10, font: CHART_FONT } },
        tooltip: TOOLTIP_STYLE
      },
      scales: {
        x: DATE_X_AXIS,
        y: {
          position: 'left',
          ticks: { color: colors[0], font: CHART_FONT },
          grid: { color: GRID_COLOR }
        },
        y1: {
          position: 'right',
          ticks: { color: colors[1] || PALETTE[1], font: CHART_FONT },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

/**
 * Donut chart for percentage data.
 */
export function donutChart(canvas, labels, data) {
  destroyExisting(canvas);
  canvas._chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: PALETTE.slice(0, labels.length) }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: TICK_COLOR, font: CHART_FONT } }
      },
      cutout: '65%'
    }
  });
}

/* ── Formatters ──────────────────────────────────────────────────────────── */

export function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return parseFloat(n).toFixed(1) + '%';
}

export function fmtDelta(n) {
  if (n === null || n === undefined) return { text: '—', cls: 'flat' };
  const sign = n > 0 ? '+' : '';
  const cls  = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  return { text: sign + parseFloat(n).toFixed(2) + '%', cls };
}

export function tsToDate(ts) {
  if (!ts) return '';
  return typeof ts === 'number'
    ? new Date(ts * 1000).toISOString().slice(0, 10)
    : String(ts).slice(0, 10);
}

export const PLATFORM_COLORS = {
  chatgpt:    '#009DFF',
  gemini:     '#FF8800',
  perplexity: '#00cfff',
  copilot:    '#ff4d00'
};

export const PLATFORM_LABELS = {
  chatgpt:    'ChatGPT',
  gemini:     'Gemini',
  perplexity: 'Perplexity',
  copilot:    'Copilot'
};
