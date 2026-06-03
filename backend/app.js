// src/app.js
// Entry point aplikasi backend Payungin

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const { testConnection } = require('./config/database');
const { sequelize }      = require('./models');

const app  = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════
// MIDDLEWARE GLOBAL
// ═══════════════════════════════════════

// CORS - izinkan request dari semua origin (lokal network)
app.use(cors({
  origin: true, // reflect request origin - works for localhost AND local network IP
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Parse JSON body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve file foto yang diupload (damage reports)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend files so they're accessible on any device on the network
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'payungin.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(frontendPath, 'admin.html')));

// ═══════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════
app.use('/api', require('./routes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Payungin API', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} tidak ditemukan.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Ukuran file terlalu besar. Maksimal 5MB.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ success: false, message: 'Terlalu banyak file. Maksimal 5 foto.' });
  }
  
  res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
});

// ═══════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════
const startServer = async () => {
  await testConnection();

  // Sync database (gunakan { force: false } agar tidak hapus data)
  await sequelize.sync({ alter: true });
  console.log('✅ Database synced!');

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🌂 Payungin Backend berjalan di http://0.0.0.0:${PORT}`);
    console.log(`📱 Akses dari HP/device lain: http://<IP-KOMPUTER>:${PORT}`);
    console.log(`📚 API docs: http://localhost:${PORT}/api`);
    console.log(`❤️  Health: http://localhost:${PORT}/health\n`);
  });
};

startServer();