# NetDown App

A simple responsive web app for crowdsourcing internet and public-service disruption reports.

## Struktur Folder

- `index.html`
- `css/style.css`
- `js/app.js`
- `js/map.js`
- `js/chart.js`
- `data/providers.json`
- `data/reports.json`
- `server.js`
- `package.json`
- `README-DB.md`

## Instalasi

1. Pastikan Node.js sudah terpasang.
2. Jalankan dari folder `netdown-app`:

```bash
npm install
```

## Menjalankan Aplikasi

- Buka `index.html` langsung di browser untuk versi static.
- Untuk backend API dan penyimpanan laporan otomatis, jalankan:

```bash
npm start
```

Lalu akses:

- `http://localhost:3000` untuk aplikasi
- `http://localhost:3000/api/reports` untuk data laporan
- `http://localhost:3000/api/providers` untuk daftar provider

## Mode Penyimpanan

Aplikasi backend akan otomatis menggunakan penyimpanan file lokal ketika variabel lingkungan database tidak dikonfigurasi.

Untuk menggunakan database MySQL/MariaDB atau PostgreSQL, lihat `README-DB.md`.
