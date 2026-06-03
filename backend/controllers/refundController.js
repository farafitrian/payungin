// src/controllers/refundController.js
// Mengelola penarikan deposit (refund manual via admin)

const { RefundRequest, User, Transaction } = require('../models');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database');

/**
 * POST /api/refund/request
 * User mengajukan penarikan deposit
 * Body: { amount, method, providerName, accountName, accountNumber }
 */
const createRefundRequest = async (req, res) => {
  try {
    const { amount, method, providerName, accountName, accountNumber } = req.body;
    const user = await User.findByPk(req.user.id);

    // Validasi input
    if (!amount || !method || !providerName || !accountName || !accountNumber) {
      return res.status(400).json({ success: false, message: 'Semua field wajib diisi.' });
    }
    if (!['bank', 'ewallet'].includes(method)) {
      return res.status(400).json({ success: false, message: 'Metode harus bank atau ewallet.' });
    }
    if (amount < 5000) {
      return res.status(400).json({ success: false, message: 'Minimal penarikan Rp 5.000.' });
    }
    if (user.saldo < amount) {
      return res.status(400).json({
        success: false,
        message: `Saldo tidak cukup. Saldo kamu: Rp ${user.saldo.toLocaleString('id-ID')}.`,
      });
    }

    // Cek tidak ada request pending sebelumnya
    const pending = await RefundRequest.findOne({
      where: { userId: req.user.id, status: 'pending' },
    });
    if (pending) {
      return res.status(409).json({
        success: false,
        message: 'Kamu masih punya permintaan penarikan yang sedang diproses. Tunggu dulu ya!',
      });
    }

    // Buat refund request (saldo belum dipotong, admin yang approve dulu)
    const refundRequest = await RefundRequest.create({
      id: uuidv4(),
      userId: req.user.id,
      amount,
      method,
      providerName,
      accountName,
      accountNumber,
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Permintaan penarikan berhasil diajukan. Admin akan memproses dalam 1-3 hari kerja.',
      data: {
        requestId: refundRequest.id,
        amount,
        method,
        providerName,
        accountNumber,
        status: 'pending',
        createdAt: refundRequest.createdAt,
      },
    });
  } catch (error) {
    console.error('createRefundRequest error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/refund/my-requests
 * Riwayat permintaan penarikan milik user
 */
const getMyRefundRequests = async (req, res) => {
  try {
    const requests = await RefundRequest.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      success: true,
      data: {
        requests: requests.map(r => ({
          id: r.id,
          amount: r.amount,
          method: r.method,
          providerName: r.providerName,
          accountName: r.accountName,
          accountNumber: r.accountNumber,
          status: r.status,
          adminNotes: r.adminNotes,
          processedAt: r.processedAt,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/admin/refund/requests
 * ADMIN: Daftar semua permintaan refund
 */
const getAllRefundRequests = async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const requests = await RefundRequest.findAll({
      where: status !== 'all' ? { status } : {},
      include: [{ model: User, as: 'user', attributes: ['name', 'email', 'saldo'] }],
      order: [['createdAt', 'DESC']],
    });

    return res.json({ success: true, data: { requests } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * PUT /api/admin/refund/requests/:requestId
 * ADMIN: Approve atau reject permintaan refund
 * Body: { action: 'approve' | 'reject', adminNotes? }
 */
const processRefundRequest = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { requestId } = req.params;
    const { action, adminNotes } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'action harus approve atau reject.' });
    }

    const refundRequest = await RefundRequest.findByPk(requestId, {
      include: [{ model: User, as: 'user' }],
      transaction: t,
    });

    if (!refundRequest) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Permintaan tidak ditemukan.' });
    }

    if (refundRequest.status !== 'pending') {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'Permintaan sudah diproses.' });
    }

    if (action === 'approve') {
      const user = refundRequest.user;

      // Cek saldo user masih mencukupi
      if (user.saldo < refundRequest.amount) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Saldo user tidak mencukupi untuk refund ini.',
        });
      }

      // Kurangi saldo user
      await user.update({ saldo: user.saldo - refundRequest.amount }, { transaction: t });

      // Catat transaksi refund
      await Transaction.create({
        id: uuidv4(),
        userId: user.id,
        type: 'refund',
        amount: refundRequest.amount,
        status: 'success',
        description: `Penarikan deposit ke ${refundRequest.providerName} (${refundRequest.accountNumber})`,
      }, { transaction: t });

      await refundRequest.update({
        status: 'approved',
        adminNotes,
        processedBy: req.user.id,
        processedAt: new Date(),
      }, { transaction: t });

    } else {
      await refundRequest.update({
        status: 'rejected',
        adminNotes,
        processedBy: req.user.id,
        processedAt: new Date(),
      }, { transaction: t });
    }

    await t.commit();

    return res.json({
      success: true,
      message: action === 'approve'
        ? `Refund Rp ${refundRequest.amount.toLocaleString('id-ID')} disetujui dan saldo dipotong.`
        : 'Permintaan refund ditolak.',
    });
  } catch (error) {
    await t.rollback();
    console.error('processRefundRequest error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

module.exports = { createRefundRequest, getMyRefundRequests, getAllRefundRequests, processRefundRequest };