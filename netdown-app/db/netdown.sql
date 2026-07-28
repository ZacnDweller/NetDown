CREATE DATABASE IF NOT EXISTS netdown;
USE netdown;

CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(255) PRIMARY KEY,
  payload JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS providers (
  provider VARCHAR(255) PRIMARY KEY,
  category VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO providers (provider, category) VALUES
('Telkomsel', 'Seluler'),
('Indihome', 'ISP'),
('Biznet', 'ISP'),
('XL Axiata', 'Seluler'),
('Indosat Ooredoo', 'Seluler'),
('Situs Web Kominfo', 'Layanan Publik')
ON DUPLICATE KEY UPDATE category = VALUES(category);
