// routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const {
  createTopup,
  checkTopupStatus,
  midtransWebhook,
  simulateTopupSuccess,
  getTransactionHistory,
} = require('../controllers/transactionController');
const { authenticate } = require('../middleware/auth');

// PENTING: webhook TIDAK pakai middleware authenticate (Midtrans yang hit endpoint ini)
router.post('/webhook',                               midtransWebhook);

// Top up QRIS
router.post('/topup',                                 authenticate, createTopup);
router.get ('/topup/:transactionId/status',           authenticate, checkTopupStatus);

// SANDBOX ONLY — simulasi bayar berhasil, diblokir otomatis di production
router.post('/topup/:transactionId/simulate-success', authenticate, simulateTopupSuccess);

// Riwayat transaksi
router.get ('/history',                               authenticate, getTransactionHistory);

module.exports = router;