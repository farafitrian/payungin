// src/controllers/loanController.js
// Mengelola peminjaman dan pengembalian payung

const { Loan, Umbrella, Station, User, Transaction } = require('../models');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * POST /api/loans/borrow
 * User meminjam payung setelah scan QR dan memilih ID payung
 * Body: { umbrellaId, stationId }
 */
const borrowUmbrella = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { umbrellaId, stationId } = req.body;
    const userId = req.user.id;

    if (!umbrellaId || !stationId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'umbrellaId dan stationId wajib diisi.' });
    }

    // Cek saldo user minimal Rp 5.000 sebagai jaminan
    const user = await User.findByPk(userId, { transaction: t });
    if (user.saldo < 5000) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Saldo deposit tidak cukup. Top up minimal Rp 5.000 untuk meminjam payung.',
      });
    }

    // Cek payung tersedia
    const umbrella = await Umbrella.findOne({
      where: { id: umbrellaId, status: 'available' },
      transaction: t,
      lock: true, // Lock row untuk mencegah race condition
    });

    if (!umbrella) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: 'Payung sudah tidak tersedia. Pilih payung lain.',
      });
    }

    // Verifikasi payung memang ada di station yang di-scan
    if (umbrella.stationId !== stationId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Payung tidak ditemukan di station ini.',
      });
    }

    // Cek station valid
    const station = await Station.findByPk(stationId, { transaction: t });
    if (!station) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Station tidak ditemukan.' });
    }

    // Buat record peminjaman
    const loan = await Loan.create({
      id: uuidv4(),
      userId,
      umbrellaId,
      pickupStationId: stationId,
      status: 'active',
      borrowedAt: new Date(),
    }, { transaction: t });

    // Update status payung menjadi 'borrowed' dan hapus dari station
    await umbrella.update({
      status: 'borrowed',
      stationId: null, // Payung tidak lagi di station manapun
    }, { transaction: t });

    await t.commit();

    return res.status(201).json({
      success: true,
      message: `Berhasil! Payung ${umbrella.umbrellaCode} dipinjam dari ${station.name}. Selamat beraktivitas! ☂️`,
      data: {
        loan: {
          id: loan.id,
          umbrellaCode: umbrella.umbrellaCode,
          pickupStation: station.name,
          borrowedAt: loan.borrowedAt,
          status: 'active',
        },
      },
    });
  } catch (error) {
    await t.rollback();
    console.error('borrowUmbrella error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * POST /api/loans/:loanId/return
 * User mengembalikan payung ke station tujuan
 * Body: { returnStationId }
 */
const returnUmbrella = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { loanId } = req.params;
    const { returnStationId } = req.body;
    const userId = req.user.id;

    if (!returnStationId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Pilih station tujuan pengembalian.' });
    }

    // Cari data peminjaman
    const loan = await Loan.findOne({
      where: { id: loanId, userId, status: 'active' },
      include: [{ model: Umbrella, as: 'umbrella' }],
      transaction: t,
      lock: true,
    });

    if (!loan) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Data peminjaman tidak ditemukan.' });
    }

    // Cek station tujuan valid dan aktif
    const returnStation = await Station.findOne({
      where: { id: returnStationId, isActive: true },
      transaction: t,
    });

    if (!returnStation) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Station tujuan tidak ditemukan.' });
    }

    // Cek kapasitas station tujuan
    const currentCount = await Umbrella.count({
      where: { stationId: returnStationId, status: 'available' },
      transaction: t,
    });

    if (currentCount >= returnStation.capacity) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: `Station ${returnStation.name} sudah penuh. Pilih station lain.`,
      });
    }

    // Hitung durasi peminjaman
    const returnedAt = new Date();
    const durationMs = returnedAt - new Date(loan.borrowedAt);
    const durationMinutes = Math.ceil(durationMs / 60000);

    // Hitung biaya (Rp 2.000 per jam, dibulatkan ke atas)
    const BIAYA_PER_JAM = parseInt(process.env.BIAYA_PER_JAM) || 2000;
    const jam = Math.ceil(durationMinutes / 60);
    const fee = jam * BIAYA_PER_JAM;

    // Cek saldo cukup untuk bayar biaya
    const user = await User.findByPk(userId, { transaction: t });
    if (user.saldo < fee) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Saldo tidak cukup. Biaya peminjaman Rp ${fee.toLocaleString('id-ID')} untuk ${durationMinutes} menit.`,
      });
    }

    // Update loan
    await loan.update({
      returnStationId,
      status: 'returned',
      returnedAt,
      durationMinutes,
      feeCharged: fee,
    }, { transaction: t });

    // Update status payung: kembalikan ke station tujuan
    await loan.umbrella.update({
      status: 'available',
      stationId: returnStationId,
    }, { transaction: t });

    // Potong saldo user
    await user.update({ saldo: user.saldo - fee }, { transaction: t });

    // Catat transaksi biaya peminjaman
    await Transaction.create({
      id: uuidv4(),
      userId,
      type: 'fee',
      amount: fee,
      status: 'success',
      loanId: loan.id,
      description: `Biaya peminjaman payung ${loan.umbrella.umbrellaCode} selama ${durationMinutes} menit`,
    }, { transaction: t });

    await t.commit();

    return res.json({
      success: true,
      message: `Payung berhasil dikembalikan ke ${returnStation.name}. Terima kasih sudah menggunakan Payungin! 🙏`,
      data: {
        loan: {
          id: loan.id,
          umbrellaCode: loan.umbrella.umbrellaCode,
          returnStation: returnStation.name,
          durationMinutes,
          feeCharged: fee,
          returnedAt,
        },
      },
    });
  } catch (error) {
    await t.rollback();
    console.error('returnUmbrella error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/loans/active
 * Daftar peminjaman aktif milik user yang login
 */
const getActiveLoans = async (req, res) => {
  try {
    const loans = await Loan.findAll({
      where: { userId: req.user.id, status: 'active' },
      include: [
        { model: Umbrella, as: 'umbrella', attributes: ['umbrellaCode'] },
        { model: Station,  as: 'pickupStation', attributes: ['name', 'code'] },
      ],
      order: [['borrowedAt', 'DESC']],
    });

    const now = new Date();
    const result = loans.map(loan => {
      const durationMs = now - new Date(loan.borrowedAt);
      const minutes = Math.floor(durationMs / 60000);
      return {
        id: loan.id,
        umbrellaCode: loan.umbrella.umbrellaCode,
        pickupStation: loan.pickupStation.name,
        borrowedAt: loan.borrowedAt,
        durationMinutes: minutes,
        status: loan.status,
      };
    });

    return res.json({ success: true, data: { loans: result } });
  } catch (error) {
    console.error('getActiveLoans error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/loans/history
 * Riwayat semua peminjaman user
 */
const getLoanHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Loan.findAndCountAll({
      where: { userId: req.user.id },
      include: [
        { model: Umbrella, as: 'umbrella',      attributes: ['umbrellaCode'] },
        { model: Station,  as: 'pickupStation', attributes: ['name'] },
        { model: Station,  as: 'returnStation', attributes: ['name'] },
      ],
      order: [['borrowedAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    return res.json({
      success: true,
      data: {
        loans: rows.map(loan => ({
          id: loan.id,
          umbrellaCode: loan.umbrella.umbrellaCode,
          pickupStation: loan.pickupStation.name,
          returnStation: loan.returnStation?.name || null,
          borrowedAt: loan.borrowedAt,
          returnedAt: loan.returnedAt,
          durationMinutes: loan.durationMinutes,
          feeCharged: loan.feeCharged,
          status: loan.status,
        })),
        pagination: { total: count, page: parseInt(page), limit: parseInt(limit) },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

module.exports = { borrowUmbrella, returnUmbrella, getActiveLoans, getLoanHistory };
