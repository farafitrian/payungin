// src/controllers/authController.js
// Mengelola registrasi, login, dan profil user

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User } = require('../models');

/**
 * POST /api/auth/register
 * Body: { name, email, password, phone? }
 */
const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Validasi input
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal 6 karakter.' });
    }

    // Cek email sudah terdaftar
    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar. Silakan login.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Buat user baru
    const user = await User.create({
      id: uuidv4(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      phone: phone || null,
      saldo: 0, // Saldo awal 0, user harus top up dulu
    });

    // Generate token
    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: 'Registrasi berhasil! Selamat datang di Payungin.',
      data: {
        token,
        user: formatUser(user),
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    }

    // Cari user
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Email atau password salah.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Akun kamu sudah dinonaktifkan. Hubungi CS.' });
    }

    // Verifikasi password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Email atau password salah.' });
    }

    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Login berhasil!',
      data: {
        token,
        user: formatUser(user),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email', 'phone', 'saldo', 'role', 'createdAt'],
    });
    return res.json({ success: true, data: { user } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * PUT /api/auth/profile
 * Update nama dan nomor HP
 */
const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    await User.update(
      { name: name || req.user.name, phone: phone || req.user.phone },
      { where: { id: req.user.id } }
    );
    const updated = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email', 'phone', 'saldo'],
    });
    return res.json({ success: true, message: 'Profil berhasil diperbarui.', data: { user: updated } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

// ─── Helper ───────────────────────────────
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const formatUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  saldo: user.saldo,
  role: user.role,
});

module.exports = { register, login, getMe, updateProfile };
