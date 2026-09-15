function renderTrendChart() {
  const labels = Array.from({ length: 24 }, (_, index) => {
    const date = new Date();
    date.setHours(date.getHours() - (23 - index));
    return `${date.getHours().toString().padStart(2, '0')}:00`;
  });

  const data = labels.map((label, index) => {
    const hour = Number(label.split(':')[0]);
    return reports.filter((report) => new Date(report.createdAt).getHours() === hour).length + (index % 3 === 0 ? 1 : 0);
  });

  const ctx = document.getElementById('trendChart');
  if (trendChart) {
    trendChart.destroy();
  }
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Laporan gangguan',
        data,
        borderColor: '#1d4ed8',
        backgroundColor: 'rgba(29, 78, 216, 0.18)',
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: '#ef4444'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });
}

function renderDistributionChart() {
  const ctx = document.getElementById('distributionChart');
  if (distributionChart) {
    distributionChart.destroy();
  }

  const cityCounts = reports.reduce((acc, report) => {
    acc[report.city] = (acc[report.city] || 0) + 1;
    return acc;
  }, {});

  const providerCounts = reports.reduce((acc, report) => {
    acc[report.provider] = (acc[report.provider] || 0) + 1;
    return acc;
  }, {});

  const labels = [...Object.keys(cityCounts), ...Object.keys(providerCounts)];
  const data = [...Object.values(cityCounts), ...Object.values(providerCounts)];

  distributionChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ['#1d4ed8', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#14b8a6', '#6366f1', '#f97316'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

function renderMonitorSparkline(canvasId, history) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const entries = Array.isArray(history) ? history.slice(-24) : [];
  const labels = entries.map((e) => {
    try { return new Date(e.ts).toLocaleTimeString(); } catch (e) { return ''; }
  });
  const data = entries.map((e) => (String(e.status).toLowerCase() === 'up' ? 1 : 0));

  // small sparkline
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: data.some(d => d === 0) ? '#ef4444' : '#10b981',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.2,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false, suggestedMin: 0, suggestedMax: 1 }
      },
      elements: { line: { borderWidth: 2 } },
      interaction: { intersect: false }
    }
  });
}

function renderLargeMonitorChart(canvasId, history) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const entries = Array.isArray(history) ? history.slice(-96) : [];
  const labels = entries.map((e) => {
    try { return new Date(e.ts).toLocaleString(); } catch (e) { return ''; }
  });
  const data = entries.map((e) => (String(e.status).toLowerCase() === 'up' ? 1 : 0));

  // compute uptime percentage
  const upCount = data.filter((v) => v === 1).length;
  const uptimePct = entries.length ? Math.round((upCount / entries.length) * 100) : 0;

  if (window._modalTrendChart) {
    window._modalTrendChart.destroy();
    window._modalTrendChart = null;
  }

  window._modalTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Status (1=up, 0=down)',
        data,
        borderColor: '#1d4ed8',
        backgroundColor: 'rgba(29,78,216,0.12)',
        fill: true,
        tension: 0.2,
        pointRadius: 3,
        pointBackgroundColor: '#1d4ed8'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, title: { display: true, text: `Uptime ${uptimePct}%` } },
      scales: {
        y: { beginAtZero: true, suggestedMin: 0, suggestedMax: 1, ticks: { stepSize: 1 } }
      }
    }
  });
}
