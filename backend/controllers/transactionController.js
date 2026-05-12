// src/controllers/transactionController.js
// Mengelola top up saldo via QRIS Midtrans dan webhook callback

const { Transaction, User } = require('../models');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database');
const midtransService = require('../services/midtransService');

/**
 * POST /api/transactions/topup
 * User request top up saldo via QRIS
 * Body: { amount } - nominal dalam rupiah (min 10.000)
 */
const createTopup = async (req, res) => {
  try {
    const { amount } = req.body;
    const user = req.user;

    // Validasi nominal
    if (!amount || amount < 10000) {
      return res.status(400).json({
        success: false,
        message: 'Nominal top up minimal Rp 10.000.',
      });
    }
    if (amount > 1000000) {
      return res.status(400).json({
        success: false,
        message: 'Nominal top up maksimal Rp 1.000.000.',
      });
    }

    // Buat ID order unik untuk Midtrans
    const orderId = `PAYUNGIN-TOPUP-${Date.now()}-${user.id.slice(0, 8)}`;

    // Generate QRIS dari Midtrans
    let midtransData;
    try {
      midtransData = await midtransService.createQrisTransaction(orderId, amount, {
        id: user.id,
        name: user.name,
        email: user.email,
      });
    } catch (midtransError) {
      return res.status(502).json({
        success: false,
        message: midtransError.message || 'Gagal membuat QRIS. Coba lagi.',
      });
    }

    // Simpan transaksi ke database (status: pending)
    const transaction = await Transaction.create({
      id: uuidv4(),
      userId: user.id,
      type: 'topup',
      amount,
      status: 'pending',
      midtransOrderId: orderId,
      midtransQrUrl: midtransData.qrUrl,
      midtransExpireAt: midtransData.expireAt ? new Date(midtransData.expireAt) : null,
      description: `Top up saldo via QRIS`,
    });

    return res.status(201).json({
      success: true,
      message: 'QRIS berhasil dibuat! Scan QR code untuk membayar.',
      data: {
        transactionId: transaction.id,
        orderId,
        amount,
        qrUrl: midtransData.qrUrl,         // URL gambar QR code - tampilkan di frontend
        expireAt: midtransData.expireAt,    // Waktu kadaluarsa QR (15 menit)
        status: 'pending',
      },
    });
  } catch (error) {
    console.error('createTopup error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/transactions/topup/:transactionId/status
 * Polling status pembayaran QRIS (frontend bisa poll setiap 3 detik)
 */
const checkTopupStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await Transaction.findOne({
      where: { id: transactionId, userId: req.user.id },
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    // Jika sudah final, kembalikan status tanpa cek ke Midtrans
    if (['success', 'failed', 'expired'].includes(transaction.status)) {
      return res.json({ success: true, data: { status: transaction.status, amount: transaction.amount } });
    }

    // Cek status terbaru ke Midtrans
    let midtransStatus;
    try {
      midtransStatus = await midtransService.getTransactionStatus(transaction.midtransOrderId);
    } catch {
      return res.json({ success: true, data: { status: transaction.status, amount: transaction.amount } });
    }

    // Map status Midtrans ke status internal
    let newStatus = transaction.status;
    if (['settlement', 'capture'].includes(midtransStatus.status)) newStatus = 'success';
    else if (['expire'].includes(midtransStatus.status)) newStatus = 'expired';
    else if (['deny', 'cancel', 'failure'].includes(midtransStatus.status)) newStatus = 'failed';

    // Jika baru success, update saldo
    if (newStatus === 'success' && transaction.status === 'pending') {
      await updateSaldoAfterTopup(transaction);
    } else if (newStatus !== transaction.status) {
      await transaction.update({ status: newStatus });
    }

    return res.json({
      success: true,
      data: { status: newStatus, amount: transaction.amount },
    });
  } catch (error) {
    console.error('checkTopupStatus error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * POST /api/transactions/webhook
 * Webhook callback dari Midtrans setelah pembayaran berhasil
 * PENTING: Endpoint ini TIDAK menggunakan middleware authenticate
 * Midtrans akan POST ke URL ini secara otomatis
 */
const midtransWebhook = async (req, res) => {
  try {
    const notification = req.body;

    const {
      order_id,
      transaction_status,
      gross_amount,
      status_code,
      signature_key,
    } = notification;

    console.log('📩 Midtrans webhook received:', { order_id, transaction_status, gross_amount });

    // Verifikasi signature dari Midtrans (keamanan)
    const isValid = midtransService.verifyWebhookSignature(
      order_id, status_code, gross_amount, signature_key
    );

    if (!isValid) {
      console.warn('⚠️ Webhook signature tidak valid!', { order_id });
      return res.status(403).json({ success: false, message: 'Invalid signature.' });
    }

    // Cari transaksi di database
    const transaction = await Transaction.findOne({
      where: { midtransOrderId: order_id },
    });

    if (!transaction) {
      console.warn('⚠️ Transaksi tidak ditemukan:', order_id);
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    // Jika sudah diproses sebelumnya, skip (idempotent)
    if (transaction.status !== 'pending') {
      return res.json({ success: true, message: 'Already processed.' });
    }

    // Proses berdasarkan status Midtrans
    if (['settlement', 'capture'].includes(transaction_status)) {
      await updateSaldoAfterTopup(transaction);
      console.log(`✅ Topup sukses: ${order_id} - Rp ${gross_amount}`);
    } else if (transaction_status === 'expire') {
      await transaction.update({ status: 'expired' });
    } else if (['deny', 'cancel', 'failure'].includes(transaction_status)) {
      await transaction.update({ status: 'failed' });
    }

    // Midtrans butuh response 200 OK
    return res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * GET /api/transactions/history
 * Riwayat semua transaksi user
 */
const getTransactionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Transaction.findAndCountAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    return res.json({
      success: true,
      data: {
        transactions: rows.map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          status: t.status,
          description: t.description,
          createdAt: t.createdAt,
        })),
        pagination: { total: count, page: parseInt(page), limit: parseInt(limit) },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

// ─── Helper: update saldo user setelah topup sukses ───
const updateSaldoAfterTopup = async (transaction) => {
  const t = await sequelize.transaction();
  try {
    await transaction.update({ status: 'success' }, { transaction: t });

    const user = await User.findByPk(transaction.userId, { transaction: t });
    await user.update({ saldo: user.saldo + transaction.amount }, { transaction: t });

    await t.commit();
    console.log(`💰 Saldo user ${transaction.userId} bertambah Rp ${transaction.amount}`);
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

module.exports = { createTopup, checkTopupStatus, midtransWebhook, getTransactionHistory };
