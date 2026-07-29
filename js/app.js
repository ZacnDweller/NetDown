const STORAGE_KEY = 'netdown-reports-v1';
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://127.0.0.1:3000' : '';
const SUPABASE_URL = window.NETDOWN_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.NETDOWN_SUPABASE_ANON_KEY || '';
const cityCoordinates = {
  Jakarta: [-6.2088, 106.8456],
  Surabaya: [-7.2575, 112.7521],
  Sidoarjo: [-7.4474, 112.7183],
  Medan: [3.5952, 98.6722],
  Bandung: [-6.9175, 107.6191],
  Makassar: [-5.1477, 119.4327]
};

let reports = [];
let providerOptions = [];
let map;
let trendChart;
let distributionChart;
let activePage = 'home';
let adminSearchTerm = '';
let statusFilter = 'all';
let supabaseClient = null;
let storageMode = 'local';
let isOperationalMode = true;
let isAdminLoggedIn = false;
const ADMIN_EMAIL = 'admin@zc.com';
const ADMIN_PASSWORD = '7acn';
const ADMIN_SESSION_KEY = 'netdown-admin-session';

async function init() {
  ensureSeedData();
  checkAdminSession();
  bindEvents();
  applyStoredTheme();
  await initializeStorage();
  await loadProviderOptions();
  await loadReportsFromApi();
  renderAll();
  activatePage('home');
}

function checkAdminSession() {
  const session = localStorage.getItem(ADMIN_SESSION_KEY);
  if (session === 'true') {
    isAdminLoggedIn = true;
  }
  document.getElementById('loginModal').classList.remove('show');
}

async function initializeStorage() {
  if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { error } = await supabaseClient.from('reports').select('id').limit(1);
      if (!error) {
        storageMode = 'supabase';
        return;
      }
      console.warn('Supabase unavailable, using local storage fallback:', error.message);
    } catch (error) {
      console.warn('Supabase unavailable, using local storage fallback:', error.message);
    }
  }

  storageMode = 'local';
}

function normalizeReport(value) {
  if (!value) return null;
  if (value.payload && typeof value.payload === 'object') {
    return { ...value.payload };
  }

  return {
    id: value.id || crypto.randomUUID(),
    provider: value.provider || '',
    category: value.category || '',
    type: value.type || '',
    city: value.city || '',
    description: value.description || '',
    createdAt: value.createdAt || value.created_at || new Date().toISOString(),
    lat: Number(value.lat ?? 0),
    lng: Number(value.lng ?? 0),
    validatedCount: Number(value.validatedCount ?? 0),
    status: value.status || 'Baru'
  };
}

async function syncReportsToSupabase(reportsToSave) {
  if (storageMode !== 'supabase' || !supabaseClient) return;

  try {
    const rows = reportsToSave.map((report) => ({
      id: report.id,
      provider: report.provider,
      category: report.category || getProviderCategory(report.provider),
      type: report.type,
      city: report.city,
      description: report.description,
      createdAt: report.createdAt,
      lat: report.lat,
      lng: report.lng,
      validatedCount: report.validatedCount,
      status: report.status
    }));

    await supabaseClient.from('reports').delete().neq('id', '');
    if (rows.length) {
      await supabaseClient.from('reports').insert(rows);
    }
  } catch (error) {
    console.warn('Gagal sinkronisasi ke Supabase:', error.message);
  }
}

function ensureSeedData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  }
  reports = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.target === 'admin' && !isAdminLoggedIn) {
        document.getElementById('loginModal').classList.add('show');
        return;
      }
      activatePage(btn.dataset.target);
      if (window.innerWidth < 768) {
        document.getElementById('mobile-menu').classList.add('hidden');
      }
    });
  });

  document.querySelectorAll('.nav-btn-sidebar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target === 'admin' && !isAdminLoggedIn) {
        document.getElementById('loginModal').classList.add('show');
        document.getElementById('mobile-menu').classList.add('hidden');
        return;
      }
      document.querySelectorAll('.nav-btn-sidebar').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activatePage(target);
      document.getElementById('mobile-menu').classList.add('hidden');
    });
  });

  document.getElementById('loginForm').addEventListener('submit', handleAdminLogin);
  document.getElementById('logoutBtn').addEventListener('click', handleAdminLogout);
  document.getElementById('reportForm').addEventListener('submit', handleSubmit);
  document.getElementById('useLocationBtn').addEventListener('click', useCurrentLocation);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('detailsModal').addEventListener('click', (event) => {
    if (event.target.id === 'detailsModal') {
      closeModal();
    }
  });
  document.getElementById('menuToggle')?.addEventListener('click', toggleMobileNav);
  document.getElementById('closeMenuBtn')?.addEventListener('click', closeMobileMenu);
  document.getElementById('closeMobileMenuBtn')?.addEventListener('click', closeMobileMenu);
  document.getElementById('mobileNavBackdrop')?.addEventListener('click', closeMobileMenu);
  document.addEventListener('click', (event) => {
    const mobileNav = document.getElementById('mobile-menu');
    const menuToggle = document.getElementById('menuToggle');
    const backdrop = document.getElementById('mobileNavBackdrop');
    if (document.body.classList.contains('mobile-nav-open') && 
        !mobileNav.contains(event.target) && 
        event.target !== menuToggle &&
        event.target !== backdrop) {
      closeMobileMenu();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
      closeMobileMenu();
    }
  });
  document.getElementById('refreshDataBtn').addEventListener('click', refreshData);
  document.getElementById('exportCsvBtn').addEventListener('click', exportToCsv);
  document.getElementById('exportJsonBtn').addEventListener('click', exportToJson);
  document.getElementById('resetDemoBtn').addEventListener('click', resetDemoData);
  document.getElementById('clearAllBtn').addEventListener('click', clearAllData);
  document.getElementById('adminSearch').addEventListener('input', (event) => {
    adminSearchTerm = event.target.value.trim().toLowerCase();
    renderAdmin();
  });
  document.getElementById('statusFilter').addEventListener('change', (event) => {
    statusFilter = event.target.value;
    renderAdmin();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      closeMobileMenu();
    }
  });
}

function handleAdminLogin(event) {
  event.preventDefault();
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const errorDiv = document.getElementById('loginError');

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    isAdminLoggedIn = true;
    localStorage.setItem(ADMIN_SESSION_KEY, 'true');
    document.getElementById('loginModal').classList.remove('show');
    document.getElementById('loginForm').reset();
    errorDiv.classList.add('hidden');
    activatePage('admin');
    if (window.innerWidth < 768) {
      document.getElementById('mobileNav').classList.add('hidden');
    }
  } else {
    errorDiv.classList.remove('hidden');
    errorDiv.textContent = 'Email atau password salah. Coba lagi.';
  }
}

function handleAdminLogout() {
  if (confirm('Apakah Anda yakin ingin logout?')) {
    isAdminLoggedIn = false;
    localStorage.removeItem(ADMIN_SESSION_KEY);
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').classList.add('hidden');
    activatePage('home');
    alert('Anda telah logout dari dashboard admin.');
  }
}

function toggleMobileNav() {
  const mobileNav = document.getElementById('mobile-menu');
  const backdrop = document.getElementById('mobileNavBackdrop');
  const menuToggle = document.getElementById('menuToggle');

  const menuIsHidden = mobileNav.classList.contains('hidden');
  mobileNav.classList.toggle('hidden');
  backdrop?.classList.toggle('hidden');
  document.body.classList.toggle('mobile-nav-open', menuIsHidden);
  document.body.style.overflow = menuIsHidden ? 'hidden' : '';
  menuToggle?.setAttribute('aria-expanded', String(menuIsHidden));
}

function closeMobileMenu() {
  const mobileNav = document.getElementById('mobile-menu');
  const backdrop = document.getElementById('mobileNavBackdrop');
  const menuToggle = document.getElementById('menuToggle');

  mobileNav.classList.add('hidden');
  backdrop?.classList.add('hidden');
  document.body.classList.remove('mobile-nav-open');
  document.body.style.overflow = '';
  menuToggle?.setAttribute('aria-expanded', 'false');
}

function toggleTheme() {
  const body = document.body;
  const isDark = body.classList.toggle('dark');
  localStorage.setItem('netdown-theme', isDark ? 'dark' : 'light');
  document.getElementById('themeToggle').textContent = isDark ? '☀️' : '🌙';
}

function applyStoredTheme() {
  const stored = localStorage.getItem('netdown-theme');
  if (stored === 'dark') {
    document.body.classList.add('dark');
    document.getElementById('themeToggle').textContent = '☀️';
  } else {
    document.getElementById('themeToggle').textContent = '🌙';
  }
}

async function loadProviderOptions() {
  if (storageMode === 'supabase' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('providers').select('*').order('provider');
      if (!error && Array.isArray(data)) {
        providerOptions = data;
        populateProviderOptions();
        return;
      }
      console.warn('Gagal memuat provider dari Supabase:', error?.message || 'unknown');
    } catch (error) {
      console.warn('Gagal memuat data provider dari Supabase:', error.message);
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/providers`);
    providerOptions = await response.json();
    populateProviderOptions();
  } catch (error) {
    console.warn('Gagal memuat data provider dari API:', error);
    try {
      const response = await fetch('./data/providers.json');
      providerOptions = await response.json();
      populateProviderOptions();
    } catch (fallbackError) {
      console.warn('Gagal memuat data provider JSON fallback:', fallbackError);
    }
  }
}

async function loadReportsFromApi() {
  if (storageMode === 'supabase' && supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('reports').select('*').order('createdAt', { ascending: false });
      if (!error && Array.isArray(data)) {
        const normalizedReports = data.map(normalizeReport).filter(Boolean);
        if (normalizedReports.length) {
          reports = normalizedReports;
          saveReports();
        }
        return;
      }
      console.warn('Gagal memuat laporan dari Supabase:', error?.message || 'unknown');
    } catch (error) {
      console.warn('Gagal memuat laporan dari Supabase:', error.message);
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/reports`);
    if (!response.ok) throw new Error('API reports failed');
    const serverReports = await response.json();
    if (Array.isArray(serverReports) && serverReports.length) {
      reports = serverReports.map(normalizeReport).filter(Boolean);
      saveReports();
    }
  } catch (error) {
    console.warn('Gagal memuat laporan dari API:', error);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getProviderCategory(provider) {
  const match = providerOptions.find((item) => item.provider === provider);
  return match?.category || inferCategory(provider);
}

function populateProviderOptions() {
  const select = document.getElementById('providerSelect');
  if (!select) return;
  const current = select.value;
  const optionsMarkup = providerOptions.length
    ? providerOptions.map((item) => `<option value="${escapeHtml(item.provider)}" title="${escapeHtml(item.category)}">${escapeHtml(item.provider)} • ${escapeHtml(item.category)}</option>`).join('')
    : '<option value="">Belum ada data provider</option>';
  select.innerHTML = `<option value="">Pilih provider</option>${optionsMarkup}`;
  if (current) {
    select.value = current;
  }
}

async function refreshData() {
  try {
    await loadReportsFromApi();
    renderAll();
    alert('Data berhasil disegarkan dari backend.');
  } catch (error) {
    reports = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    renderAll();
    alert('Gagal mengambil data dari backend, memakai data lokal.');
  }
}

function exportToCsv() {
  if (!reports.length) {
    alert('Belum ada data untuk diekspor.');
    return;
  }

  const headers = ['provider', 'city', 'type', 'status', 'createdAt', 'description'];
  const rows = reports.map((report) => {
    const values = [
      report.provider,
      report.city,
      report.type,
      report.validatedCount > 0 ? 'Terverifikasi' : 'Baru',
      report.createdAt,
      report.description.replace(/\n/g, ' ')
    ];
    return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'netdown-reports.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  alert('Data laporan berhasil diekspor ke file CSV.');
}

function exportToJson() {
  const blob = new Blob([JSON.stringify(reports, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'netdown-reports.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  alert('Data laporan berhasil diekspor ke file JSON.');
}

function clearAllData() {
  if (!confirm('Apakah Anda yakin ingin menghapus semua data laporan?')) return;
  reports = [];
  saveReports();
  renderAll();
  alert('Semua data laporan berhasil dihapus.');
}

function resetDemoData() {
  reports = [];
  saveReports();
  renderAll();
  alert('Data laporan berhasil dibersihkan dan sistem siap menerima entri baru.');
}

function activatePage(target) {
  activePage = target;
  document.querySelectorAll('.page').forEach((section) => section.classList.remove('active'));
  document.getElementById(target).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const isActive = btn.dataset.target === target;
    btn.classList.toggle('bg-navy-900', isActive);
    btn.classList.toggle('text-white', isActive);
    btn.classList.toggle('text-slate-600', !isActive);
  });
  document.querySelectorAll('.nav-btn-sidebar').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.target === target);
  });
  if (map) {
    setTimeout(() => map.invalidateSize(), 100);
  }
}

function renderAll() {
  reports = reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  saveReports();
  renderHome();
  renderProviderStatuses();
  renderAdmin();
}

function renderHome() {
  const today = new Date();
  const todayCount = reports.filter((report) => new Date(report.createdAt).toDateString() === today.toDateString()).length;
  const uniqueProviders = new Set(reports.filter((report) => new Date(report.createdAt).toDateString() === today.toDateString()).map((report) => report.provider)).size;
  const nationalStatusText = todayCount >= 8 ? 'Waspada' : todayCount >= 4 ? 'Pantauan Ketat' : 'Sistem Aktif';
  const nationalStatusColor = todayCount >= 8 ? 'text-red-400' : todayCount >= 4 ? 'text-yellow-400' : 'text-green-400';
  const systemStatusText = storageMode === 'supabase' ? 'Sinkronisasi Supabase aktif' : 'Mode lokal aktif';

  document.getElementById('todayReports').textContent = todayCount;
  document.getElementById('affectedProviders').textContent = uniqueProviders;
  document.getElementById('nationalCondition').textContent = todayCount >= 8 ? 'Peningkatan gangguan terdeteksi' : todayCount >= 4 ? 'Monitoring intensif' : 'Monitor operasional';
  document.getElementById('nationalStatus').textContent = nationalStatusText;
  document.getElementById('nationalStatus').className = `mt-1 text-xl font-semibold ${nationalStatusColor}`;
  const systemStatusEl = document.getElementById('systemStatus');
  if (systemStatusEl) {
    systemStatusEl.textContent = systemStatusText;
  }

  renderRecentReports();
  initMap();
  renderMapMarkers();
  renderTrendChart();
}

function renderRecentReports() {
  const container = document.getElementById('recentReportsList');
  const recent = [...reports].slice(0, 4);

  if (!recent.length) {
    container.innerHTML = '<p class="text-sm text-slate-500">Belum ada laporan terbaru.</p>';
    return;
  }

  container.innerHTML = recent.map((report) => {
    const statusMeta = getDetailedStatusMeta(report);
    return `
      <button type="button" data-id="${report.id}" class="report-card w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-900">${report.provider}</p>
            <p class="text-xs text-slate-500">${report.city} • ${report.type}</p>
            <p class="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">${getProviderCategory(report.provider)}</p>
          </div>
          <span class="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.className}">
            <span class="h-2 w-2 rounded-full ${statusMeta.dot}"></span>
            ${statusMeta.label}
          </span>
        </div>
        <p class="mt-3 text-sm text-slate-600">${report.description}</p>
        <p class="mt-2 text-xs text-slate-400">${formatTime(report.createdAt)}</p>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.report-card').forEach((button) => {
    button.addEventListener('click', () => openModal(button.dataset.id));
  });
}

function renderProviderStatuses() {
  const grid = document.getElementById('providerStatusGrid');
  const providerMap = new Map();
  const now = Date.now();
  reports.forEach((report) => {
    const key = report.provider;
    if (!providerMap.has(key)) {
      providerMap.set(key, { provider: report.provider, category: inferCategory(report.provider), count: 0, latest: [] });
    }
    const entry = providerMap.get(key);
    const age = now - new Date(report.createdAt).getTime();
    if (age <= 24 * 60 * 60 * 1000) {
      entry.count += 1;
      entry.latest.push(report);
    }
  });

  const cards = Array.from(providerMap.values()).sort((a, b) => b.count - a.count).map((item) => {
    const statusMeta = getProviderStatusMeta(item.count);
    return `
      <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-slate-900">${item.provider}</h3>
            <p class="mt-1 text-sm text-slate-500">${item.category}</p>
          </div>
          <span class="rounded-full border px-3 py-1 text-xs font-semibold ${statusMeta.className}">${statusMeta.label}</span>
        </div>
        <div class="mt-4 rounded-2xl bg-slate-50 p-4">
          <p class="text-sm text-slate-500">Jumlah Laporan Terbaru</p>
          <p class="mt-1 text-3xl font-bold text-slate-900">${item.count}</p>
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = cards || '<p class="text-sm text-slate-500">Belum ada data provider.</p>';
}

function renderAdmin() {
  const body = document.getElementById('adminTableBody');
  const filteredReports = reports.filter((report) => {
    const matchesSearch = !adminSearchTerm || [report.provider, report.city, report.type, report.description].some((value) => value.toLowerCase().includes(adminSearchTerm));
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'verified' && report.validatedCount > 0) || (statusFilter === 'pending' && report.validatedCount === 0);
    return matchesSearch && matchesStatus;
  });

  document.getElementById('adminCount').textContent = filteredReports.length;
  body.innerHTML = filteredReports.map((report) => {
    const statusMeta = getDetailedStatusMeta(report);
    return `
      <tr>
        <td class="px-4 py-3 text-sm font-medium text-slate-900">${report.provider}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${report.city}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${report.type}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${formatTime(report.createdAt)}</td>
        <td class="px-4 py-3 text-sm"><span class="inline-flex items-center gap-2 rounded-full border px-3 py-1 ${statusMeta.className}"><span class="h-2 w-2 rounded-full ${statusMeta.dot}"></span>${statusMeta.label}</span></td>
        <td class="px-4 py-3 text-sm">
          <div class="flex gap-2">
            <button data-action="validate" data-id="${report.id}" class="rounded-full bg-navy-900 px-3 py-1.5 font-medium text-white hover:bg-navy-800">Validasi</button>
            <button data-action="delete" data-id="${report.id}" class="rounded-full bg-red-100 px-3 py-1.5 font-medium text-red-700 hover:bg-red-200">Hapus</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  body.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => handleAdminAction(button.dataset.action, button.dataset.id));
  });

  renderCityStats();
  renderDistributionChart();
}

function renderCityStats() {
  const container = document.getElementById('cityStats');
  const cityCounts = reports.reduce((acc, report) => {
    acc[report.city] = (acc[report.city] || 0) + 1;
    return acc;
  }, {});

  const cards = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).map(([city, count]) => `
    <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p class="text-sm text-slate-500">${city}</p>
      <p class="mt-2 text-2xl font-semibold text-slate-900">${count}</p>
      <p class="text-xs text-slate-400">laporan masuk</p>
    </div>
  `).join('');

  container.innerHTML = cards || '<p class="text-sm text-slate-500">Belum ada data kota.</p>';
}

function handleAdminAction(action, id) {
  if (action === 'validate') {
    reports = reports.map((report) => report.id === id ? { ...report, validatedCount: report.validatedCount + 1, status: 'Terverifikasi' } : report);
    saveReports();
    renderAll();
    alert('Laporan berhasil divalidasi dan statistik gangguan diperbarui.');
  }

  if (action === 'delete') {
    reports = reports.filter((report) => report.id !== id);
    saveReports();
    renderAll();
    alert('Laporan dihapus dari daftar admin.');
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const provider = document.getElementById('providerSelect').value;
  const type = document.getElementById('type').value;
  const city = document.getElementById('city').value;
  const description = document.getElementById('description').value.trim();
  const latitude = document.getElementById('latitude').value.trim();
  const longitude = document.getElementById('longitude').value.trim();

  if (!provider || !type || !city || !description) {
    alert('Semua bidang wajib diisi untuk melanjutkan.');
    return;
  }

  const recentSameProvider = reports.find((report) => report.provider === provider && Date.now() - new Date(report.createdAt).getTime() < 2 * 60 * 1000);
  if (recentSameProvider) {
    alert('Terdeteksi laporan serupa dari provider yang sama dalam waktu singkat. Silakan tunggu sebelum mengirim ulang.');
    return;
  }

  const newReport = {
    id: crypto.randomUUID(),
    provider,
    category: getProviderCategory(provider),
    type,
    city,
    description,
    createdAt: new Date().toISOString(),
    lat: latitude ? Number(latitude) : cityCoordinates[city]?.[0] || 0,
    lng: longitude ? Number(longitude) : cityCoordinates[city]?.[1] || 0,
    validatedCount: 0,
    status: 'Baru'
  };

  try {
    let savedReport = newReport;

    if (storageMode === 'supabase' && supabaseClient) {
      const { data, error } = await supabaseClient.from('reports').insert([newReport]).select().single();
      if (!error) {
        savedReport = normalizeReport(data) || newReport;
      } else {
        throw error;
      }
    } else {
      const response = await fetch(`${API_BASE_URL}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReport)
      });

      if (!response.ok) throw new Error('Gagal mengirim ke backend');
      savedReport = normalizeReport(await response.json()) || newReport;
    }

    reports.unshift(savedReport);
    saveReports();
    renderAll();
    event.target.reset();
    activatePage('home');
    alert('Laporan berhasil dikirim ke sistem NetDown dan tersimpan untuk pemantauan lebih lanjut.');
  } catch (error) {
    reports.unshift(newReport);
    saveReports();
    renderAll();
    event.target.reset();
    activatePage('home');
    alert('Laporan disimpan secara lokal karena sinkronisasi sedang tidak tersedia.');
  }
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    alert('Browser Anda tidak mendukung Geolocation.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      document.getElementById('latitude').value = position.coords.latitude.toFixed(6);
      document.getElementById('longitude').value = position.coords.longitude.toFixed(6);
    },
    () => {
      alert('Akses lokasi ditolak. Silakan isi koordinat secara manual.');
    }
  );
}

function initMap() {
  if (map) return;
  map = L.map('map').setView([-2.5, 118.0], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

function renderMapMarkers() {
  if (!map) return;
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer);
    }
  });

  reports.forEach((report) => {
    const lat = typeof report.lat === 'number' ? report.lat : cityCoordinates[report.city]?.[0];
    const lng = typeof report.lng === 'number' ? report.lng : cityCoordinates[report.city]?.[1];
    if (lat && lng) {
      const marker = L.marker([lat, lng], { icon: redIcon() }).addTo(map);
      marker.bindPopup(`<b>${report.provider}</b><br>${report.city}<br>${report.type}`);
    }
  });
}

function redIcon() {
  return L.divIcon({
    html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:9999px;border:2px solid white"></div>',
    className: 'bg-transparent border-none',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

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

function openModal(reportId) {
  const report = reports.find((item) => item.id === reportId);
  if (!report) return;

  document.getElementById('modalTitle').textContent = `${report.provider} • ${report.city}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p><strong>Jenis gangguan:</strong> ${report.type}</p>
      <p class="mt-2"><strong>Deskripsi:</strong> ${report.description}</p>
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs uppercase tracking-[0.2em] text-slate-400">Kategori provider</p>
        <p class="mt-1 font-semibold text-slate-900">${getProviderCategory(report.provider)}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs uppercase tracking-[0.2em] text-slate-400">Status</p>
        <p class="mt-1 font-semibold text-slate-900">${report.validatedCount > 0 ? 'Terverifikasi' : 'Menunggu verifikasi'}</p>
      </div>
    </div>
    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p><strong>Waktu pelaporan:</strong> ${formatTime(report.createdAt)}</p>
      <p class="mt-2"><strong>Koordinat:</strong> ${report.lat}, ${report.lng}</p>
      <p class="mt-2"><strong>Kota:</strong> ${report.city}</p>
    </div>
  `;
  document.getElementById('detailsModal').classList.remove('hidden');
  document.getElementById('detailsModal').classList.add('active');
}

function closeModal() {
  const modal = document.getElementById('detailsModal');
  modal.classList.add('hidden');
  modal.classList.remove('active');
}

function getDetailedStatusMeta(report) {
  const ageHours = (Date.now() - new Date(report.createdAt).getTime()) / (1000 * 60 * 60);

  if (report.validatedCount > 0) {
    return { label: 'Terverifikasi', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' };
  }

  if (ageHours < 2) {
    return { label: 'Baru', className: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' };
  }

  if (ageHours < 8) {
    return { label: 'Menunggu', className: 'border-sky-200 bg-sky-50 text-sky-700', dot: 'bg-sky-500' };
  }

  return { label: 'Perlu Tindak Lanjut', className: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500' };
}

function getProviderStatusMeta(count) {
  if (count >= 10) {
    return { label: 'Gangguan Massal', className: 'border-rose-200 bg-rose-50 text-rose-700' };
  }
  if (count >= 6) {
    return { label: 'Siaga Tinggi', className: 'border-orange-200 bg-orange-50 text-orange-700' };
  }
  if (count >= 3) {
    return { label: 'Waspada', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  }
  return { label: 'Normal', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
}

function inferCategory(provider) {
  if (provider === 'Situs Web Kominfo') return 'Layanan Publik';
  if (provider === 'Indihome' || provider === 'Biznet') return 'ISP';
  return 'Seluler';
}

function saveReports() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  if (storageMode === 'supabase' && supabaseClient) {
    syncReportsToSupabase(reports);
  }
}

function formatTime(value) {
  return new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

document.addEventListener('DOMContentLoaded', init);
