// src/middleware/auth.js
// Middleware untuk verifikasi JWT token

const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * Middleware: Verifikasi JWT
 * Tambahkan header: Authorization: Bearer <token>
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak ditemukan. Silakan login terlebih dahulu.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cek user masih aktif di database
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'name', 'email', 'role', 'isActive', 'saldo'],
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Akun tidak ditemukan atau sudah dinonaktifkan.',
      });
    }

    req.user = user; // attach user ke request
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token sudah kadaluarsa. Silakan login ulang.' });
    }
    return res.status(401).json({ success: false, message: 'Token tidak valid.' });
  }
};

/**
 * Middleware: Cek role admin
 * Gunakan setelah authenticate
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak. Fitur ini hanya untuk admin.',
    });
  }
  next();
};

module.exports = { authenticate, requireAdmin };