# Setup Database dan Backend

Dokumentasi ini menjelaskan cara menggunakan database dengan backend Express di `netdown-app`.

## Persyaratan

- Node.js
- MySQL/MariaDB atau PostgreSQL (opsional)
- `npm install` dari folder `netdown-app`

## 1. Instal dependensi

```bash
npm install
```

## 2. Siapkan database (opsional)

Jika ingin menggunakan MySQL/MariaDB, buka phpMyAdmin atau client database lain dan jalankan:

- `db/netdown.sql`

Jika tidak menggunakan database, backend akan otomatis memakai penyimpanan file lokal di `data/reports.json`.

## 3. Konfigurasi variabel lingkungan

Buat file `.env` di folder `netdown-app` dengan salah satu konfigurasi berikut.

### MySQL/MariaDB

```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=netdown
```

### PostgreSQL

```env
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/netdown
```

## 4. Cara menjalankan dengan SQL

1. Pastikan MySQL/MariaDB aktif (misalnya lewat XAMPP atau Ralafel).
2. Import file SQL:

```bash
# Jalankan dari root project netdown-app
mysql -u root -p < db/netdown.sql
```

Atau gunakan phpMyAdmin untuk memilih file `db/netdown.sql`.

3. Pastikan `.env` sudah berisi konfigurasi database yang benar.
4. Instal dependensi jika belum:

```bash
npm install
```

5. Jalankan backend:

```bash
npm start
```

6. Buka aplikasi di browser:

```text
http://localhost:3000
```

Backend akan menggunakan database SQL jika variabel lingkungan tersedia. Jika tidak, aplikasi akan tetap berjalan dengan penyimpanan file lokal.

## Endpoint API

- `GET /api/health` — status backend dan mode penyimpanan
- `GET /api/reports` — ambil semua laporan
- `POST /api/reports` — tambah laporan baru
- `PUT /api/reports` — perbarui semua laporan
- `GET /api/providers` — ambil daftar provider
