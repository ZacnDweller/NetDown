require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const { checkMikroTikMonitor } = require('./monitoring');

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');
const reportsFilePath = path.join(dataDir, 'reports.json');
const providersFilePath = path.join(dataDir, 'providers.json');
const monitorsFilePath = path.join(dataDir, 'monitors.json');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram not configured (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing)');
    return Promise.resolve(false);
  }

  const encoded = encodeURIComponent(text);
  const path = `/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&parse_mode=MarkdownV2&text=${encoded}`;

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path,
    method: 'GET',
    headers: {
      'User-Agent': 'netdown-notifier/1.0'
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          if (json && json.ok) return resolve(true);
        } catch (e) {
          // ignore
        }
        resolve(false);
      });
    });

    req.on('error', (err) => {
      console.warn('Telegram request failed:', err.message);
      resolve(false);
    });

    req.end();
  });
}

app.use(cors());
app.use(express.json());
app.use(express.static(rootDir));

const seedReports = [
  {
    id: 'seed-1',
    provider: 'Telkomsel',
    category: 'Seluler',
    type: 'Internet Mati Total',
    city: 'Jakarta',
    description: 'Layanan data mati sejak pagi di kawasan Sudirman.',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    lat: -6.2088,
    lng: 106.8456,
    validatedCount: 0,
    status: 'Baru'
  },
  {
    id: 'seed-2',
    provider: 'Indihome',
    category: 'ISP',
    type: 'Koneksi Lambat',
    city: 'Jakarta',
    description: 'Kecepatan turun drastis pada malam hari.',
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    lat: -6.2088,
    lng: 106.8456,
    validatedCount: 0,
    status: 'Baru'
  }
];

let dbClient = null;
let dbMode = 'file';

function ensureDataDirectory() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function ensureReportsFile() {
  ensureDataDirectory();
  if (!fs.existsSync(reportsFilePath)) {
    fs.writeFileSync(reportsFilePath, JSON.stringify(seedReports, null, 2));
  }
}

function ensureProvidersFile() {
  ensureDataDirectory();
  if (!fs.existsSync(providersFilePath)) {
    fs.writeFileSync(providersFilePath, JSON.stringify([
      { provider: 'Internet Rakyat', category: 'Community ISP' }
    ], null, 2));
  }
}

function ensureMonitorsFile() {
  ensureDataDirectory();
  if (!fs.existsSync(monitorsFilePath)) {
    // create an empty monitors file - user can populate with real endpoints
    fs.writeFileSync(monitorsFilePath, JSON.stringify([], null, 2));
  }
}

function getMonitors() {
  ensureMonitorsFile();
  try {
    return JSON.parse(fs.readFileSync(monitorsFilePath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveMonitors(monitors) {
  ensureMonitorsFile();
  fs.writeFileSync(monitorsFilePath, JSON.stringify(monitors, null, 2));
}

async function checkMonitor(monitor, timeout = 5000) {
  const isMikroTik = Boolean(
    monitor.type === 'mikrotik' ||
    monitor.api === 'mikrotik' ||
    monitor.mode === 'mikrotik' ||
    monitor.host ||
    monitor.port ||
    monitor.interface ||
    monitor.username ||
    monitor.password
  );

  if (isMikroTik && (monitor.host || monitor.router || monitor.ip || monitor.url)) {
    const data = await checkMikroTikMonitor(monitor, timeout);
    return {
      ok: data.ok,
      status: data.status,
      name: data.name,
      raw: data.raw,
      error: data.error
    };
  }

  const urlStr = monitor.url;
  try {
    const urlObj = new URL(urlStr);
    const lib = urlObj.protocol === 'https:' ? https : http;

    return await new Promise((resolve) => {
      const req = lib.get(urlStr, { timeout }, (res) => {
        const ok = res.statusCode && res.statusCode < 400;
        res.resume();
        resolve({ ok, statusCode: res.statusCode });
      });

      req.on('error', () => resolve({ ok: false }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false });
      });
    });
  } catch (e) {
    return { ok: false };
  }
}

async function runMonitorChecks() {
  const monitors = getMonitors();
  if (!monitors.length) return;

  const now = new Date().toISOString();
  let changed = false;
  for (const m of monitors) {
    const prev = m.lastStatus || 'unknown';
    const res = await checkMonitor(m).catch(() => ({ ok: false, status: 'down' }));
    const newStatus = (res && res.status) ? res.status : (res && res.ok ? 'up' : 'down');
    m.lastStatus = newStatus;
    m.lastChecked = now;
    m.lastError = res && res.error ? String(res.error) : null;

    if (prev !== newStatus) {
      changed = true;
      const target = m.interface ? `${m.name || 'MikroTik'} (${m.interface})` : `${m.name || 'Monitor'} (${m.url || m.host || m.router || 'target'})`;
      const msg = `📡 Monitor ${target} status berubah: *${prev}* → *${newStatus}*`;
      sendTelegramMessage(msg).catch(() => {});
    }
  }

  if (changed) saveMonitors(monitors);
}

// start periodic checks after server starts
let monitorInterval = null;

async function initializeDatabase() {
  if (process.env.DATABASE_URL) {
    dbClient = new Pool({ connectionString: process.env.DATABASE_URL });
    dbMode = 'postgres';
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(255) PRIMARY KEY,
        payload JSON NOT NULL
      )
    `);
    return true;
  }

  if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME) {
    dbClient = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    dbMode = 'mysql';
    await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(255) PRIMARY KEY,
        payload JSON NOT NULL
      )
    `);
    return true;
  }

  return false;
}

async function getAllReports() {
  if (dbMode !== 'file') {
    try {
      if (dbMode === 'postgres') {
        const result = await dbClient.query('SELECT payload FROM reports ORDER BY id DESC');
        return result.rows.map((row) => row.payload);
      }

      const [rows] = await dbClient.execute('SELECT payload FROM reports ORDER BY id DESC');
      return rows.map((row) => JSON.parse(row.payload));
    } catch (error) {
      console.warn('Database read failed, falling back to file storage:', error.message);
      dbMode = 'file';
    }
  }

  ensureReportsFile();
  return JSON.parse(fs.readFileSync(reportsFilePath, 'utf8'));
}

async function saveAllReports(reports) {
  if (dbMode !== 'file') {
    try {
      if (dbMode === 'postgres') {
        await dbClient.query('DELETE FROM reports');
        for (const report of reports) {
          await dbClient.query('INSERT INTO reports (id, payload) VALUES ($1, $2)', [report.id, JSON.stringify(report)]);
        }
      } else {
        await dbClient.execute('DELETE FROM reports');
        for (const report of reports) {
          await dbClient.execute('INSERT INTO reports (id, payload) VALUES (?, ?)', [report.id, JSON.stringify(report)]);
        }
      }
      return;
    } catch (error) {
      console.warn('Database write failed, falling back to file storage:', error.message);
      dbMode = 'file';
    }
  }

  ensureReportsFile();
  fs.writeFileSync(reportsFilePath, JSON.stringify(reports, null, 2));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: dbMode });
});

app.get('/api/reports', async (req, res) => {
  try {
    const reports = await getAllReports();
    res.json(reports);
  } catch (error) {
    const msg = `Gagal mengambil laporan: ${error.message}`;
    sendTelegramMessage(msg).catch(() => {});
    res.status(500).json({ message: 'Gagal mengambil laporan', error: error.message });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const reports = await getAllReports();
    const newReport = {
      id: req.body.id || `report-${Date.now()}`,
      ...req.body,
      createdAt: req.body.createdAt || new Date().toISOString(),
      validatedCount: req.body.validatedCount || 0,
      status: req.body.status || 'Baru'
    };

    reports.unshift(newReport);
    await saveAllReports(reports);
    // Kirim notifikasi Telegram untuk laporan baru yang relevan
    try {
      const summary = `${newReport.provider} - ${newReport.type} di ${newReport.city}\nStatus: ${newReport.status}\n${newReport.description || ''}`;
      sendTelegramMessage(`📣 *NetDown Report*\n${summary}`).catch(() => {});
    } catch (e) {
      // ignore
    }
    res.status(201).json(newReport);
  } catch (error) {
    const msg = `Gagal menyimpan laporan: ${error.message}`;
    sendTelegramMessage(msg).catch(() => {});
    res.status(500).json({ message: 'Gagal menyimpan laporan', error: error.message });
  }
});

app.put('/api/reports', async (req, res) => {
  try {
    const reports = Array.isArray(req.body) ? req.body : [];
    await saveAllReports(reports);
    res.json({ ok: true, count: reports.length });
  } catch (error) {
    const msg = `Gagal memperbarui laporan: ${error.message}`;
    sendTelegramMessage(msg).catch(() => {});
    res.status(500).json({ message: 'Gagal memperbarui laporan', error: error.message });
  }
});

app.get('/api/providers', (req, res) => {
  ensureProvidersFile();
  res.json(JSON.parse(fs.readFileSync(providersFilePath, 'utf8')));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.post('/api/notify-test', async (req, res) => {
  const text = req.body && req.body.text ? String(req.body.text) : 'Test message from NetDown';
  try {
    const ok = await sendTelegramMessage(`🧪 Test: ${text}`);
    res.json({ ok });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/monitors', (req, res) => {
  try {
    const monitors = getMonitors().filter(m => m.provider === 'Internet Rakyat');
    res.json(monitors);
  } catch (e) {
    res.status(500).json({ message: 'Gagal membaca monitors', error: e.message });
  }
});

app.post('/api/monitors', (req, res) => {
  try {
    const all = getMonitors();
    const item = req.body;
    if (!item || !item.id) return res.status(400).json({ message: 'Monitor harus memiliki id' });
    all.push(item);
    saveMonitors(all);
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ message: 'Gagal menyimpan monitor', error: e.message });
  }
});

app.put('/api/monitors', (req, res) => {
  try {
    const monitors = Array.isArray(req.body) ? req.body : [];
    saveMonitors(monitors);
    res.json({ ok: true, count: monitors.length });
  } catch (e) {
    res.status(500).json({ message: 'Gagal memperbarui monitors', error: e.message });
  }
});

async function startServer() {
  ensureDataDirectory();
  ensureProvidersFile();
  ensureMonitorsFile();
  await initializeDatabase();
  ensureReportsFile();

  app.listen(PORT, () => {
    console.log(`NetDown backend running on http://localhost:${PORT}`);
    console.log(`Storage mode: ${dbMode}`);
    // start periodic monitor checks every 60 seconds
    if (!monitorInterval) {
      monitorInterval = setInterval(() => {
        runMonitorChecks().catch(() => {});
      }, Number(process.env.MONITOR_INTERVAL_MS || 60000));
      // run once immediately
      runMonitorChecks().catch(() => {});
    }
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  try {
    sendTelegramMessage(`❌ NetDown failed to start: ${error.message}`).catch(() => {});
  } catch (e) {
    // ignore
  }
  process.exit(1);
});
