-- ============================================================
-- PAYUNGIN DATABASE SCHEMA
-- Platform peminjaman payung digital - IPB Dramaga
-- ============================================================
-- Jalankan file ini di MySQL Workbench atau terminal:
-- mysql -u root -p payungin_db < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS payungin_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE payungin_db;

-- ─────────────────────────────────────────
-- 1. TABEL USERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  phone       VARCHAR(20)  DEFAULT NULL,
  saldo       INT          NOT NULL DEFAULT 0 COMMENT 'Saldo deposit dalam rupiah',
  role        ENUM('user','admin') NOT NULL DEFAULT 'user',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- 2. TABEL STATIONS (Lokasi payung)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stations (
  id            VARCHAR(36)   NOT NULL PRIMARY KEY,
  code          VARCHAR(20)   NOT NULL UNIQUE COMMENT 'Kode unik stasiun, contoh: STN-001',
  name          VARCHAR(150)  NOT NULL,
  location_desc VARCHAR(255)  DEFAULT NULL COMMENT 'Deskripsi lokasi teks',
  latitude      DECIMAL(10,8) DEFAULT NULL,
  longitude     DECIMAL(11,8) DEFAULT NULL,
  capacity      INT           NOT NULL DEFAULT 10 COMMENT 'Maksimum payung yang bisa ditampung',
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- 3. TABEL UMBRELLAS (Data payung)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS umbrellas (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  umbrella_code   VARCHAR(20)  NOT NULL UNIQUE COMMENT 'Kode payung, contoh: UMB001',
  station_id      VARCHAR(36)  DEFAULT NULL COMMENT 'NULL jika sedang dipinjam',
  status          ENUM('available','borrowed','damaged','lost') NOT NULL DEFAULT 'available',
  condition_notes TEXT         DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL,
  INDEX idx_station (station_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- 4. TABEL LOANS (Peminjaman payung)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loans (
  id                VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id           VARCHAR(36)  NOT NULL,
  umbrella_id       VARCHAR(36)  NOT NULL,
  pickup_station_id VARCHAR(36)  NOT NULL COMMENT 'Stasiun asal pengambilan',
  return_station_id VARCHAR(36)  DEFAULT NULL COMMENT 'Stasiun tujuan pengembalian',
  status            ENUM('active','returned','overdue','lost') NOT NULL DEFAULT 'active',
  borrowed_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at       DATETIME     DEFAULT NULL,
  duration_minutes  INT          DEFAULT NULL COMMENT 'Durasi peminjaman dalam menit',
  fee_charged       INT          NOT NULL DEFAULT 0 COMMENT 'Biaya yang dikenakan',
  notes             TEXT         DEFAULT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)           REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (umbrella_id)       REFERENCES umbrellas(id) ON DELETE RESTRICT,
  FOREIGN KEY (pickup_station_id) REFERENCES stations(id) ON DELETE RESTRICT,
  FOREIGN KEY (return_station_id) REFERENCES stations(id) ON DELETE SET NULL,
  INDEX idx_user   (user_id),
  INDEX idx_status (status),
  INDEX idx_umbrella (umbrella_id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- 5. TABEL TRANSACTIONS (Top up saldo via Midtrans QRIS)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id              VARCHAR(36)   NOT NULL PRIMARY KEY,
  user_id         VARCHAR(36)   NOT NULL,
  type            ENUM('topup','fee','refund','penalty') NOT NULL,
  amount          INT           NOT NULL COMMENT 'Jumlah transaksi dalam rupiah',
  status          ENUM('pending','success','failed','expired') NOT NULL DEFAULT 'pending',
  -- Midtrans fields
  midtrans_order_id    VARCHAR(100) DEFAULT NULL UNIQUE,
  midtrans_token       VARCHAR(500) DEFAULT NULL COMMENT 'Snap token',
  midtrans_qr_url      VARCHAR(500) DEFAULT NULL COMMENT 'URL QR code dari Midtrans',
  midtrans_expire_at   DATETIME     DEFAULT NULL,
  -- Relasi ke loan jika transaksi terkait peminjaman
  loan_id         VARCHAR(36)   DEFAULT NULL,
  description     VARCHAR(255)  DEFAULT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (loan_id) REFERENCES loans(id)  ON DELETE SET NULL,
  INDEX idx_user   (user_id),
  INDEX idx_status (status),
  INDEX idx_order_id (midtrans_order_id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- 6. TABEL DAMAGE_REPORTS (Laporan kerusakan)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS damage_reports (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id         VARCHAR(36)  NOT NULL,
  umbrella_id     VARCHAR(36)  NOT NULL,
  loan_id         VARCHAR(36)  DEFAULT NULL,
  description     TEXT         NOT NULL,
  status          ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  penalty_amount  INT          NOT NULL DEFAULT 20000 COMMENT 'Denda kerusakan',
  penalty_charged TINYINT(1)   NOT NULL DEFAULT 0,
  admin_notes     TEXT         DEFAULT NULL,
  verified_by     VARCHAR(36)  DEFAULT NULL COMMENT 'ID admin yang verifikasi',
  verified_at     DATETIME     DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (umbrella_id) REFERENCES umbrellas(id) ON DELETE RESTRICT,
  FOREIGN KEY (loan_id)     REFERENCES loans(id)     ON DELETE SET NULL,
  FOREIGN KEY (verified_by) REFERENCES users(id)     ON DELETE SET NULL,
  INDEX idx_user   (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- 7. TABEL DAMAGE_PHOTOS (Foto laporan kerusakan)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS damage_photos (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  report_id   VARCHAR(36)  NOT NULL,
  file_path   VARCHAR(500) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES damage_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- 8. TABEL REFUND_REQUESTS (Tarik deposit - manual admin)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refund_requests (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id         VARCHAR(36)  NOT NULL,
  amount          INT          NOT NULL COMMENT 'Jumlah yang ingin ditarik',
  method          ENUM('bank','ewallet') NOT NULL,
  provider_name   VARCHAR(100) NOT NULL COMMENT 'Nama bank / e-wallet, contoh: GoPay',
  account_name    VARCHAR(150) NOT NULL COMMENT 'Nama pemilik rekening',
  account_number  VARCHAR(100) NOT NULL COMMENT 'Nomor rekening / nomor HP',
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_notes     TEXT         DEFAULT NULL,
  processed_by    VARCHAR(36)  DEFAULT NULL COMMENT 'ID admin yang proses',
  processed_at    DATETIME     DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user   (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- 9. TABEL CS_TICKETS (Customer service / chat)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_tickets (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  type        ENUM('kehilangan','lainnya') NOT NULL DEFAULT 'lainnya',
  status      ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user   (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- 10. TABEL CS_MESSAGES (Pesan chat CS)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_messages (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  ticket_id   VARCHAR(36)  NOT NULL,
  sender_type ENUM('user','cs') NOT NULL,
  sender_id   VARCHAR(36)  NOT NULL,
  message     TEXT         NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES cs_tickets(id) ON DELETE CASCADE,
  INDEX idx_ticket (ticket_id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────
-- DATA SEED - Station & Payung awal
-- ─────────────────────────────────────────
INSERT INTO stations (id, code, name, location_desc, latitude, longitude, capacity) VALUES
('stn-001', 'STN-001', 'Perpustakaan LSI IPB',        'Gedung LSI, depan pintu utama',            -6.5604, 106.7296, 15),
('stn-002', 'STN-002', 'Kantin FMIPA IPB',            'Kantin utama Fakultas MIPA',               -6.5598, 106.7285, 12),
('stn-003', 'STN-003', 'Halte Fakultas Peternakan IPB','Halte depan Fapet, dekat jalan utama',    -6.5612, 106.7308, 10),
('stn-004', 'STN-004', 'Green Campus IPB',            'Area taman Green Campus, dekat danau',     -6.5588, 106.7275, 12),
('stn-005', 'STN-005', 'Kantin Perikanan IPB',        'Kantin Fakultas Perikanan dan Ilmu Kelautan', -6.5620, 106.7320, 10);

-- Payung awal (UMB001 - UMB020)
INSERT INTO umbrellas (id, umbrella_code, station_id, status) VALUES
('umb-001', 'UMB001', 'stn-001', 'available'),
('umb-002', 'UMB002', 'stn-001', 'available'),
('umb-003', 'UMB003', 'stn-001', 'available'),
('umb-004', 'UMB004', 'stn-001', 'available'),
('umb-005', 'UMB005', 'stn-002', 'available'),
('umb-006', 'UMB006', 'stn-002', 'available'),
('umb-007', 'UMB007', 'stn-002', 'available'),
('umb-008', 'UMB008', 'stn-003', 'available'),
('umb-009', 'UMB009', 'stn-003', 'available'),
('umb-010', 'UMB010', 'stn-004', 'available'),
('umb-011', 'UMB011', 'stn-004', 'available'),
('umb-012', 'UMB012', 'stn-004', 'available'),
('umb-013', 'UMB013', 'stn-005', 'available'),
('umb-014', 'UMB014', 'stn-005', 'available');

-- Admin default (password: admin123)
-- Hash: $2a$10$hashedpassword - generate ulang dengan bcrypt
INSERT INTO users (id, name, email, password, role, saldo) VALUES
('usr-admin-001', 'Admin Payungin', 'admin@payungin.id',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LkdynWpT9lu',
 'admin', 0);