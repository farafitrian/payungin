// src/controllers/stationController.js
// Mengelola data station dan daftar payung tersedia

const { Station, Umbrella } = require('../models');
const { Op } = require('sequelize');

/**
 * GET /api/stations
 * Daftar semua station aktif + jumlah payung tersedia
 */
const getAllStations = async (req, res) => {
  try {
    const stations = await Station.findAll({
      where: { isActive: true },
      include: [{
        model: Umbrella,
        as: 'umbrellas',
        where: { status: 'available' },
        required: false, // LEFT JOIN - tampilkan station meski 0 payung
        attributes: ['id', 'umbrellaCode', 'status'],
      }],
      order: [['name', 'ASC']],
    });

    const result = stations.map(s => ({
      id: s.id,
      code: s.code,
      name: s.name,
      locationDesc: s.locationDesc,
      latitude: s.latitude,
      longitude: s.longitude,
      capacity: s.capacity,
      availableCount: s.umbrellas.length,
    }));

    return res.json({ success: true, data: { stations: result } });
  } catch (error) {
    console.error('getAllStations error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/stations/:stationId/umbrellas
 * Daftar payung TERSEDIA di station tertentu (setelah scan QR)
 * Ini adalah data yang ditampilkan ke user agar bisa pilih payung mana yang diambil
 */
const getAvailableUmbrellas = async (req, res) => {
  try {
    const { stationId } = req.params;

    const station = await Station.findOne({
      where: { id: stationId, isActive: true },
    });

    if (!station) {
      return res.status(404).json({ success: false, message: 'Station tidak ditemukan.' });
    }

    const umbrellas = await Umbrella.findAll({
      where: { stationId, status: 'available' },
      attributes: ['id', 'umbrellaCode', 'status'],
      order: [['umbrellaCode', 'ASC']],
    });

    return res.json({
      success: true,
      data: {
        station: {
          id: station.id,
          code: station.code,
          name: station.name,
          locationDesc: station.locationDesc,
          availableCount: umbrellas.length,
        },
        umbrellas: umbrellas.map(u => ({
          id: u.id,
          code: u.umbrellaCode,
          status: u.status,
        })),
      },
    });
  } catch (error) {
    console.error('getAvailableUmbrellas error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/stations/scan/:stationCode
 * Endpoint yang dipanggil setelah user scan QR code station
 * QR code berisi kode stasiun (contoh: STN-001)
 */
const scanStation = async (req, res) => {
  try {
    const { stationCode } = req.params;

    const station = await Station.findOne({
      where: { code: stationCode, isActive: true },
    });

    if (!station) {
      return res.status(404).json({
        success: false,
        message: `Station dengan kode ${stationCode} tidak ditemukan.`,
      });
    }

    const umbrellas = await Umbrella.findAll({
      where: { stationId: station.id, status: 'available' },
      attributes: ['id', 'umbrellaCode'],
      order: [['umbrellaCode', 'ASC']],
    });

    if (umbrellas.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          station: { id: station.id, name: station.name, code: station.code },
          umbrellas: [],
          message: 'Maaf, payung di station ini sedang habis. Coba station lain ya!',
        },
      });
    }

    return res.json({
      success: true,
      data: {
        station: {
          id: station.id,
          code: station.code,
          name: station.name,
          locationDesc: station.locationDesc,
        },
        umbrellas: umbrellas.map(u => ({
          id: u.id,
          code: u.umbrellaCode,
        })),
        totalAvailable: umbrellas.length,
      },
    });
  } catch (error) {
    console.error('scanStation error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

// ADMIN: Tambah station baru
const createStation = async (req, res) => {
  try {
    const { code, name, locationDesc, latitude, longitude, capacity } = req.body;
    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Kode dan nama station wajib diisi.' });
    }
    const { v4: uuidv4 } = require('uuid');
    const station = await Station.create({
      id: uuidv4(), code, name, locationDesc, latitude, longitude, capacity: capacity || 10,
    });
    return res.status(201).json({ success: true, message: 'Station berhasil ditambahkan.', data: { station } });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: 'Kode station sudah digunakan.' });
    }
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

module.exports = { getAllStations, getAvailableUmbrellas, scanStation, createStation };
