// src/controllers/damageController.js
// Mengelola laporan kerusakan payung

const { DamageReport, DamagePhoto, User, Umbrella, Loan, Transaction } = require('../models');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database');
const path = require('path');

/**
 * POST /api/damage/report
 * User melaporkan kerusakan payung
 * Body (multipart/form-data): { umbrellaId, loanId?, description, photos[] }
 */
const submitReport = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { umbrellaId, loanId, description } = req.body;
    const files = req.files;

    if (!umbrellaId || !description) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'umbrellaId dan deskripsi wajib diisi.' });
    }

    if (!files || files.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Upload minimal 1 foto kerusakan.' });
    }

    // Verifikasi payung ada
    const umbrella = await Umbrella.findByPk(umbrellaId, { transaction: t });
    if (!umbrella) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Payung tidak ditemukan.' });
    }

    // Buat laporan kerusakan
    const report = await DamageReport.create({
      id: uuidv4(),
      userId: req.user.id,
      umbrellaId,
      loanId: loanId || null,
      description,
      status: 'pending',
      penaltyAmount: parseInt(process.env.BIAYA_KERUSAKAN) || 20000,
    }, { transaction: t });

    // Simpan foto-foto kerusakan
    const photos = files.map(file => ({
      id: uuidv4(),
      reportId: report.id,
      filePath: file.path,
    }));

    await DamagePhoto.bulkCreate(photos, { transaction: t });

    await t.commit();

    return res.status(201).json({
      success: true,
      message: 'Laporan kerusakan berhasil dikirim. Admin akan memverifikasi dalam 1x24 jam.',
      data: {
        reportId: report.id,
        status: 'pending',
        photosUploaded: files.length,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error('submitReport error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/damage/my-reports
 * Riwayat laporan kerusakan milik user
 */
const getMyReports = async (req, res) => {
  try {
    const reports = await DamageReport.findAll({
      where: { userId: req.user.id },
      include: [
        { model: Umbrella,    as: 'umbrella', attributes: ['umbrellaCode'] },
        { model: DamagePhoto, as: 'photos',   attributes: ['filePath'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      success: true,
      data: {
        reports: reports.map(r => ({
          id: r.id,
          umbrellaCode: r.umbrella.umbrellaCode,
          description: r.description,
          status: r.status,
          penaltyAmount: r.penaltyAmount,
          penaltyCharged: r.penaltyCharged,
          adminNotes: r.adminNotes,
          photos: r.photos.map(p => `/uploads/${path.basename(p.filePath)}`),
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/admin/damage/reports
 * ADMIN: Daftar semua laporan pending
 */
const getAllReports = async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const reports = await DamageReport.findAll({
      where: status !== 'all' ? { status } : {},
      include: [
        { model: User,        as: 'user',     attributes: ['name', 'email'] },
        { model: Umbrella,    as: 'umbrella', attributes: ['umbrellaCode'] },
        { model: DamagePhoto, as: 'photos',   attributes: ['filePath'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.json({ success: true, data: { reports } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * PUT /api/admin/damage/reports/:reportId/verify
 * ADMIN: Verifikasi laporan kerusakan (approve = potong saldo, reject = tolak)
 * Body: { action: 'approve' | 'reject', adminNotes?, penaltyAmount? }
 */
const verifyReport = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { reportId } = req.params;
    const { action, adminNotes, penaltyAmount } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'action harus approve atau reject.' });
    }

    const report = await DamageReport.findByPk(reportId, {
      include: [{ model: User, as: 'user' }],
      transaction: t,
    });

    if (!report) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
    }

    if (report.status !== 'pending') {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'Laporan sudah diproses sebelumnya.' });
    }

    if (action === 'approve') {
      const penalty = penaltyAmount || report.penaltyAmount;

      // Cek saldo user cukup
      const user = report.user;
      if (user.saldo < penalty) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Saldo user tidak cukup untuk denda Rp ${penalty.toLocaleString('id-ID')}.`,
        });
      }

      // Update laporan
      await report.update({
        status: 'verified',
        penaltyAmount: penalty,
        penaltyCharged: true,
        adminNotes,
        verifiedBy: req.user.id,
        verifiedAt: new Date(),
      }, { transaction: t });

      // Potong saldo user
      await user.update({ saldo: user.saldo - penalty }, { transaction: t });

      // Catat transaksi denda
      await Transaction.create({
        id: uuidv4(),
        userId: user.id,
        type: 'penalty',
        amount: penalty,
        status: 'success',
        description: `Denda kerusakan payung - Laporan #${reportId.slice(0, 8)}`,
      }, { transaction: t });

    } else {
      // Reject
      await report.update({
        status: 'rejected',
        adminNotes,
        verifiedBy: req.user.id,
        verifiedAt: new Date(),
      }, { transaction: t });
    }

    await t.commit();

    return res.json({
      success: true,
      message: action === 'approve'
        ? `Laporan disetujui. Saldo user dipotong Rp ${report.penaltyAmount.toLocaleString('id-ID')}.`
        : 'Laporan ditolak.',
    });
  } catch (error) {
    await t.rollback();
    console.error('verifyReport error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

module.exports = { submitReport, getMyReports, getAllReports, verifyReport };
