# 🌂 Payungin Backend

Backend API untuk layanan peminjaman payung digital di area kampus IPB Dramaga.

**Tech Stack:** Node.js · Express.js · MySQL · Sequelize · JWT · Midtrans QRIS

---

## 📁 Struktur Folder

```
payungin-backend/
├── src/
│   ├── app.js                    ← Entry point server
│   ├── config/
│   │   └── database.js           ← Koneksi Sequelize
│   ├── middleware/
│   │   ├── auth.js               ← JWT verify + admin check
│   │   └── upload.js             ← Multer file upload
│   ├── models/
│   │   └── index.js              ← Semua model + relasi
│   ├── controllers/
│   │   ├── authController.js     ← Register / login
│   │   ├── stationController.js  ← Station & scan QR
│   │   ├── loanController.js     ← Pinjam & kembalikan
│   │   ├── transactionController.js ← Top up QRIS + webhook
│   │   ├── damageController.js   ← Laporan kerusakan
│   │   ├── refundController.js   ← Tarik deposit
│   │   └── csController.js       ← Customer service chat
│   ├── routes/
│   │   ├── index.js              ← Router utama
│   │   ├── authRoutes.js
│   │   ├── stationRoutes.js
│   │   ├── loanRoutes.js
│   │   ├── transactionRoutes.js
│   │   ├── damageRoutes.js
│   │   ├── refundRoutes.js
│   │   ├── csRoutes.js
│   │   └── adminRoutes.js
│   └── services/
│       └── midtransService.js    ← Integrasi Midtrans QRIS
├── uploads/
│   └── damage-reports/           ← Foto laporan kerusakan
├── docs/
│   ├── schema.sql                ← SQL lengkap database
│   └── frontend-integration.js  ← Contoh integrasi frontend
├── .env.example                  ← Contoh env variables
└── package.json
```

---

## 🗄️ Desain Database (ERD)

```
users ──────────── loans ──────────── umbrellas
  │                  │                    │
  │                  ├── pickup_station   │
  │                  └── return_station ──┤
  │                                    stations
  │
  ├── transactions (topup, fee, refund, penalty)
  ├── damage_reports ── damage_photos
  ├── refund_requests
  └── cs_tickets ── cs_messages
```

**Tabel utama:**
| Tabel | Fungsi |
|-------|--------|
| `users` | Data akun + saldo deposit |
| `stations` | Lokasi stasiun payung |
| `umbrellas` | Data setiap payung (kode unik, status, lokasi) |
| `loans` | Record peminjaman (pickup/return station, durasi, biaya) |
| `transactions` | Semua transaksi keuangan (topup, fee, penalty, refund) |
| `damage_reports` | Laporan kerusakan + foto |
| `damage_photos` | Foto-foto laporan kerusakan |
| `refund_requests` | Permintaan tarik deposit (manual admin) |
| `cs_tickets` | Tiket customer service |
| `cs_messages` | Pesan dalam tiket CS |

---

## 🚀 Cara Menjalankan

### 1. Install Dependencies

```bash
cd payungin-backend
npm install
```

### 2. Setup Database MySQL

Buat database dulu:
```sql
CREATE DATABASE payungin_db CHARACTER SET utf8mb4;
```

Atau jalankan schema lengkap:
```bash
mysql -u root -p payungin_db < docs/schema.sql
```

### 3. Setup Environment

```bash
cp .env.example .env
```

Edit `.env` dan isi:
- `DB_USER`, `DB_PASS` → kredensial MySQL kamu
- `JWT_SECRET` → string random yang aman
- `MIDTRANS_SERVER_KEY` dan `MIDTRANS_CLIENT_KEY` → dari [sandbox.midtrans.com](https://sandbox.midtrans.com)

### 4. Daftar Akun Midtrans Sandbox

1. Buka https://sandbox.midtrans.com
2. Daftar / login
3. Settings → Access Keys
4. Salin **Server Key** dan **Client Key**
5. Paste ke `.env`

### 5. Setup ngrok (untuk webhook Midtrans)

Midtrans perlu hit endpoint webhook kamu. Di local development, gunakan ngrok:

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000
```

Salin URL ngrok (contoh: `https://abc123.ngrok.io`), lalu:
- Set `BACKEND_URL=https://abc123.ngrok.io` di `.env`
- Di Midtrans Dashboard → Settings → Configuration → Payment Notification URL:
  ```
  https://abc123.ngrok.io/api/transactions/webhook
  ```

### 6. Jalankan Server

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server berjalan di: **http://localhost:3000**

---

## 📡 Daftar Endpoint API

### Authentication
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/auth/register` | Daftar akun baru |
| POST | `/api/auth/login` | Login |
| GET  | `/api/auth/me` | Data user yang login 🔒 |
| PUT  | `/api/auth/profile` | Update profil 🔒 |

### Station
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/stations` | Semua station + jumlah payung tersedia 🔒 |
| GET | `/api/stations/scan/:stationCode` | Scan QR → daftar payung 🔒 |
| GET | `/api/stations/:id/umbrellas` | Payung tersedia di station 🔒 |

### Peminjaman
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/loans/borrow` | Pinjam payung 🔒 |
| POST | `/api/loans/:loanId/return` | Kembalikan payung 🔒 |
| GET  | `/api/loans/active` | Pinjaman aktif user 🔒 |
| GET  | `/api/loans/history` | Riwayat peminjaman 🔒 |

### Transaksi & Top Up
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/transactions/topup` | Generate QRIS top up 🔒 |
| GET  | `/api/transactions/topup/:id/status` | Cek status pembayaran 🔒 |
| POST | `/api/transactions/webhook` | Webhook Midtrans (tanpa auth) |
| GET  | `/api/transactions/history` | Riwayat transaksi 🔒 |

### Laporan Kerusakan
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/damage/report` | Kirim laporan (multipart/form-data) 🔒 |
| GET  | `/api/damage/my-reports` | Laporan milik user 🔒 |

### Refund
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/refund/request` | Ajukan penarikan deposit 🔒 |
| GET  | `/api/refund/my-requests` | Status permintaan refund 🔒 |

### Customer Service
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/cs/tickets` | Buka tiket baru 🔒 |
| GET  | `/api/cs/tickets` | Daftar tiket milik user 🔒 |
| GET  | `/api/cs/tickets/:id/messages` | Pesan dalam tiket 🔒 |
| POST | `/api/cs/tickets/:id/messages` | Kirim pesan 🔒 |

### Admin 🔑
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET  | `/api/admin/dashboard` | Dashboard admin |
| POST | `/api/admin/stations` | Tambah station baru |
| GET  | `/api/admin/damage/reports` | Semua laporan kerusakan |
| PUT  | `/api/admin/damage/reports/:id/verify` | Verifikasi laporan |
| GET  | `/api/admin/refund/requests` | Semua permintaan refund |
| PUT  | `/api/admin/refund/requests/:id` | Approve/reject refund |

🔒 = Butuh JWT token  🔑 = Butuh role admin

---

## 💳 Flow QRIS Midtrans

```
1. User pilih nominal  →  POST /api/transactions/topup
2. Backend → Midtrans API → Generate QR
3. Backend simpan transaksi (status: pending)
4. Frontend tampilkan QR code (dari qrUrl)
5. User scan QR → bayar via GoPay/OVO/DANA/dll
6. Midtrans → POST /api/transactions/webhook
7. Backend verifikasi signature → update saldo user
8. Frontend polling /topup/:id/status → deteksi success
```

---

## 🌂 Flow Peminjaman

```
1. User scan QR station  →  GET /api/stations/scan/STN-001
2. Backend return daftar payung tersedia  →  [UMB001, UMB002, ...]
3. User pilih payung yang diambil
4. POST /api/loans/borrow { umbrellaId, stationId }
5. Backend:
   - Cek saldo user
   - Lock payung (status → borrowed, stationId → null)
   - Buat record loan
6. Timer peminjaman mulai di frontend
```

## 🔄 Flow Pengembalian

```
1. User klik "Kembalikan" di loan card
2. Frontend ambil daftar station: GET /api/stations
3. User pilih station tujuan
4. POST /api/loans/:loanId/return { returnStationId }
5. Backend:
   - Hitung durasi & biaya (Rp 2.000/jam)
   - Potong saldo user
   - Update payung (status → available, stationId → station tujuan)
   - Catat transaksi biaya
```

---

## 🔐 Format Request / Response

### Login
```json
// Request
POST /api/auth/login
{ "email": "user@ipb.ac.id", "password": "password123" }

// Response
{
  "success": true,
  "message": "Login berhasil!",
  "data": {
    "token": "eyJhbGc...",
    "user": { "id": "...", "name": "Fara", "email": "...", "saldo": 25000 }
  }
}
```

### Top Up QRIS
```json
// Request
POST /api/transactions/topup
Authorization: Bearer <token>
{ "amount": 25000 }

// Response
{
  "success": true,
  "data": {
    "transactionId": "uuid",
    "orderId": "PAYUNGIN-TOPUP-...",
    "amount": 25000,
    "qrUrl": "https://api.midtrans.com/qr/...",  ← tampilkan sebagai <img>
    "expireAt": "2026-05-12T15:00:00Z",
    "status": "pending"
  }
}
```

### Pinjam Payung
```json
// Request
POST /api/loans/borrow
{ "umbrellaId": "umb-001", "stationId": "stn-001" }

// Response
{
  "success": true,
  "message": "Berhasil! Payung UMB001 dipinjam dari Perpustakaan LSI IPB ☂️",
  "data": {
    "loan": {
      "id": "uuid",
      "umbrellaCode": "UMB001",
      "pickupStation": "Perpustakaan LSI IPB",
      "borrowedAt": "2026-05-12T10:00:00Z",
      "status": "active"
    }
  }
}
```

---

## 🐛 Troubleshooting

**Masalah:** `Error: Access denied for user 'root'@'localhost'`
**Solusi:** Cek `DB_PASS` di `.env` sudah benar

**Masalah:** Midtrans error `Invalid Server Key`
**Solusi:** Pastikan `MIDTRANS_SERVER_KEY` sudah benar dan `MIDTRANS_IS_PRODUCTION=false`

**Masalah:** Webhook tidak terpanggil
**Solusi:** Pastikan ngrok aktif dan URL sudah diset di Midtrans Dashboard

**Masalah:** Upload foto gagal
**Solusi:** Buat folder `uploads/damage-reports/` dan pastikan permission read/write

---

## 👨‍💻 Pengembangan Lebih Lanjut

- [ ] Socket.io untuk real-time chat CS
- [ ] Push notification ketika pembayaran sukses
- [ ] Admin dashboard web terpisah (React/Next.js)
- [ ] Aplikasi mobile (React Native / Flutter)
- [ ] QR code generator untuk cetak stiker station
- [ ] Laporan analytics penggunaan payung

---

*Dibuat untuk project kampus Payungin - IPB Dramaga* 🌂