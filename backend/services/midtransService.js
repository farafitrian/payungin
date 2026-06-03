// src/services/midtransService.js
// Integrasi Midtrans Sandbox untuk generate QRIS top up saldo

const midtransClient = require('midtrans-client');
require('dotenv').config();

// Inisialisasi Midtrans Core API (untuk QRIS)
const coreApi = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

/**
 * Generate transaksi QRIS via Midtrans
 * @param {string} orderId   - ID unik order (dari tabel transactions)
 * @param {number} amount    - Nominal dalam rupiah
 * @param {object} customer  - { id, name, email }
 * @returns {object}         - { qrCode, qrUrl, expireAt }
 */
const createQrisTransaction = async (orderId, amount, customer) => {
  const parameter = {
    payment_type: 'qris',
    transaction_details: {
      order_id: orderId,
      gross_amount: amount,
    },
    qris: {
      acquirer: 'gopay', // Midtrans sandbox menggunakan gopay acquirer
    },
    customer_details: {
      first_name: customer.name,
      email: customer.email,
    },
    // Waktu kadaluarsa QR: 15 menit
    custom_expiry: {
      expiry_duration: 15,
      unit: 'minute',
    },
  };

  try {
    const response = await coreApi.charge(parameter);
    
    // Format respons dari Midtrans
    const qrAction = response.actions?.find(a => a.name === 'generate-qr-code');
    
    return {
      transactionId: response.transaction_id,
      orderId: response.order_id,
      qrUrl: qrAction?.url || null,  // URL QR code image
      status: response.transaction_status,
      expireAt: response.expiry_time,
    };
  } catch (error) {
    console.error('Midtrans createQrisTransaction error:', error);
    throw new Error(error.ApiResponse?.error_messages?.[0] || 'Gagal membuat QRIS. Coba lagi ya.');
  }
};

/**
 * Cek status transaksi Midtrans
 * @param {string} orderId
 */
const getTransactionStatus = async (orderId) => {
  try {
    const response = await coreApi.transaction.status(orderId);
    return {
      orderId: response.order_id,
      status: response.transaction_status, // pending | settlement | expire | cancel
      grossAmount: response.gross_amount,
      paymentType: response.payment_type,
      transactionTime: response.transaction_time,
      settlementTime: response.settlement_time,
    };
  } catch (error) {
    console.error('Midtrans getTransactionStatus error:', error);
    throw new Error('Gagal mengecek status pembayaran.');
  }
};

/**
 * Verifikasi signature dari webhook Midtrans
 * Untuk memastikan request webhook benar dari Midtrans
 * @param {string} orderId
 * @param {string} statusCode      - HTTP status code dari Midtrans
 * @param {string} grossAmount     - Nominal transaksi
 * @param {string} receivedSignature - Signature dari request body
 */
const verifyWebhookSignature = (orderId, statusCode, grossAmount, receivedSignature) => {
  const crypto = require('crypto');
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  
  const payload = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  const calculatedSignature = crypto.createHash('sha512').update(payload).digest('hex');
  
  return calculatedSignature === receivedSignature;
};

module.exports = { createQrisTransaction, getTransactionStatus, verifyWebhookSignature };