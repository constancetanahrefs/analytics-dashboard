/**
 * Chart.js helpers.
 * Chart.js is loaded via CDN in index.html.
 */

const PALETTE = ['#6c8eff', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#22d3ee', '#fb923c'];

export function lineChart(canvas, labels, datasets) {
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        borderColor: PALETTE[i % PALETTE.length],
        backgroundColor: PALETTE[i % PALETTE.length] + '22',
        fill: datasets.length === 1,
        tension: 0.3,
        pointRadius: labels.length > 60 ? 0 : 3,
        borderWidth: 2
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#7c80a0', boxWidth: 12, font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#7c80a0', maxTicksLimit: 8, font: { size: 11 } }, grid: { color: '#2e3147' } },
        y: { ticks: { color: '#7c80a0', font: { size: 11 } }, grid: { color: '#2e3147' } }
      }
    }
  });
}

export function barChart(canvas, labels, datasets) {
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: PALETTE[i % PALETTE.length] + 'cc'
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: datasets.length > 1, labels: { color: '#7c80a0', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#7c80a0', font: { size: 11 } }, grid: { color: '#2e3147' } },
        y: { ticks: { color: '#7c80a0', font: { size: 11 } }, grid: { color: '#2e3147' } }
      }
    }
  });
}

export function donutChart(canvas, labels, data) {
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: PALETTE.slice(0, labels.length) }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#7c80a0', font: { size: 11 } } } },
      cutout: '65%'
    }
  });
}

export function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return parseFloat(n).toFixed(1) + '%';
}
