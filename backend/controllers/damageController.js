// controllers/damageController.js
// Laporan kerusakan/kehilangan payung + alur konfirmasi denda user

const { DamageReport, DamagePhoto, User, Umbrella, Loan, Transaction } = require('../models');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database');
const path = require('path');

/**
 * POST /api/damage/report
 * Body (multipart): { umbrellaId, loanId?, description, reportType: 'rusak'|'hilang', photos[] }
 */
const submitReport = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { umbrellaId, loanId, description, reportType = 'rusak' } = req.body;
    const files = req.files;

    if (!umbrellaId || !description) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'umbrellaId dan deskripsi wajib diisi.' });
    }
    if (!files || files.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Upload minimal 1 foto.' });
    }
    if (!['rusak', 'hilang'].includes(reportType)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'reportType harus rusak atau hilang.' });
    }

    const umbrella = await Umbrella.findByPk(umbrellaId, { transaction: t });
    if (!umbrella) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Payung tidak ditemukan.' });
    }

    const report = await DamageReport.create({
      id: uuidv4(),
      userId: req.user.id,
      umbrellaId,
      loanId: loanId || null,
      reportType,
      description,
      status: 'pending',
      penaltyAmount: parseInt(process.env.BIAYA_KERUSAKAN) || 20000,
    }, { transaction: t });

    const photos = files.map(file => ({
      id: uuidv4(),
      reportId: report.id,
      filePath: file.path,
    }));
    await DamagePhoto.bulkCreate(photos, { transaction: t });
    await t.commit();

    return res.status(201).json({
      success: true,
      message: 'Laporan berhasil dikirim. Admin akan memverifikasi dalam 1x24 jam.',
      data: { reportId: report.id, status: 'pending', photosUploaded: files.length },
    });
  } catch (error) {
    await t.rollback();
    console.error('submitReport error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/damage/my-reports
 * Riwayat laporan user — termasuk status penalty_requested agar user bisa merespons
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
          reportType: r.reportType,
          description: r.description,
          status: r.status,
          penaltyAmount: r.penaltyAmount,
          penaltyCharged: r.penaltyCharged,
          adminNotes: r.adminNotes,
          photos: r.photos.map(p => `/uploads/damage-reports/${path.basename(p.filePath)}`),
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * POST /api/damage/reports/:reportId/respond-penalty
 * User merespons pengajuan denda dari admin
 * Body: { action: 'agree' | 'reject' }
 */
const respondPenalty = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { reportId } = req.params;
    const { action } = req.body;

    if (!['agree', 'reject'].includes(action)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'action harus agree atau reject.' });
    }

    const report = await DamageReport.findOne({
      where: { id: reportId, userId: req.user.id, status: 'penalty_requested' },
      transaction: t,
    });

    if (!report) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan atau status tidak sesuai.' });
    }

    if (action === 'agree') {
      const user = await User.findByPk(req.user.id, { transaction: t });
      if (user.saldo < report.penaltyAmount) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Saldo tidak cukup untuk denda Rp ${report.penaltyAmount.toLocaleString('id-ID')}.`,
        });
      }
      // Potong saldo
      await user.update({ saldo: user.saldo - report.penaltyAmount }, { transaction: t });
      // Catat transaksi
      await Transaction.create({
        id: uuidv4(),
        userId: user.id,
        type: 'penalty',
        amount: report.penaltyAmount,
        status: 'success',
        description: `Denda ${report.reportType} payung - Laporan #${reportId.slice(0, 8)}`,
      }, { transaction: t });
      // Update status laporan
      await report.update({ status: 'verified', penaltyCharged: true }, { transaction: t });
      await t.commit();
      return res.json({ success: true, message: 'Denda disetujui dan saldo dipotong.' });
    } else {
      // User tolak denda
      await report.update({ status: 'penalty_rejected' }, { transaction: t });
      await t.commit();
      return res.json({ success: true, message: 'Penolakan denda dicatat.' });
    }
  } catch (error) {
    await t.rollback();
    console.error('respondPenalty error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/admin/damage/reports (backward compat)
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
 * PUT /api/admin/damage/reports/:reportId/verify (backward compat — tidak dipakai lagi, pakai adminController)
 */
const verifyReport = async (req, res) => {
  return res.status(410).json({ success: false, message: 'Endpoint ini sudah digantikan. Gunakan /api/admin/reports/:id/status' });
};

module.exports = { submitReport, getMyReports, respondPenalty, getAllReports, verifyReport };