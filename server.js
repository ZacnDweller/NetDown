const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');
const reportsFilePath = path.join(dataDir, 'reports.json');
const providersFilePath = path.join(dataDir, 'providers.json');

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
      { provider: 'Telkomsel', category: 'Seluler' },
      { provider: 'Indihome', category: 'ISP' },
      { provider: 'Biznet', category: 'ISP' },
      { provider: 'XL Axiata', category: 'Seluler' },
      { provider: 'Indosat Ooredoo', category: 'Seluler' },
      { provider: 'Situs Web Kominfo', category: 'Layanan Publik' }
    ], null, 2));
  }
}

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
    res.status(201).json(newReport);
  } catch (error) {
    res.status(500).json({ message: 'Gagal menyimpan laporan', error: error.message });
  }
});

app.put('/api/reports', async (req, res) => {
  try {
    const reports = Array.isArray(req.body) ? req.body : [];
    await saveAllReports(reports);
    res.json({ ok: true, count: reports.length });
  } catch (error) {
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

async function startServer() {
  ensureDataDirectory();
  ensureProvidersFile();
  await initializeDatabase();
  ensureReportsFile();

  app.listen(PORT, () => {
    console.log(`NetDown backend running on http://localhost:${PORT}`);
    console.log(`Storage mode: ${dbMode}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
