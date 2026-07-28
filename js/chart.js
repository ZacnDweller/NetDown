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
