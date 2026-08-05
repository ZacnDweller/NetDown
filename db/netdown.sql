-- Database schema untuk NetDown
-- Gunakan untuk MySQL/MariaDB atau sesuaikan untuk PostgreSQL.

CREATE DATABASE IF NOT EXISTS `netdown`;
USE `netdown`;

CREATE TABLE IF NOT EXISTS `reports` (
  `id` VARCHAR(255) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data contoh
INSERT INTO `reports` (`id`, `payload`) VALUES
('seed-1', JSON_OBJECT(
  'id', 'seed-1',
  'provider', 'Telkomsel',
  'category', 'Seluler',
  'type', 'Internet Mati Total',
  'city', 'Jakarta',
  'description', 'Layanan data mati sejak pagi di kawasan Sudirman.',
  'createdAt', '2026-08-03T08:15:00.000Z',
  'lat', -6.2088,
  'lng', 106.8456,
  'validatedCount', 0,
  'status', 'Baru',
  'csNote', ''
));

INSERT INTO `reports` (`id`, `payload`) VALUES
('seed-2', JSON_OBJECT(
  'id', 'seed-2',
  'provider', 'Indihome',
  'category', 'ISP',
  'type', 'Koneksi Lambat',
  'city', 'Jakarta',
  'description', 'Kecepatan turun drastis pada malam hari.',
  'createdAt', '2026-08-03T07:30:00.000Z',
  'lat', -6.2088,
  'lng', 106.8456,
  'validatedCount', 0,
  'status', 'Baru',
  'csNote', ''
));
