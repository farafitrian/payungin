// src/controllers/csController.js
// Mengelola tiket customer service dan chat sederhana

const { CsTicket, CsMessage, User } = require('../models');
const { v4: uuidv4 } = require('uuid');

// Auto-reply CS (bisa dikembangkan ke AI/bot lebih lanjut)
const CS_AUTO_REPLIES = {
  kehilangan: [
    'Halo! Saya CS Payungin. Saya menerima laporan kehilangan payung kamu ya.',
    'Bisa kasih tahu ID payung yang hilang? (contoh: UMB001)',
    'Terima kasih. Kami akan cek ke sistem dan menghubungi kamu dalam 1x24 jam.',
    'Apakah ada yang bisa saya bantu lagi?',
  ],
  lainnya: [
    'Halo! Selamat datang di CS Payungin. Ada yang bisa saya bantu? 😊',
    'Baik, saya catat. Bisa jelaskan lebih detail?',
    'Terima kasih sudah menghubungi Payungin. Tim kami akan menindaklanjuti segera.',
    'Apakah ada hal lain yang bisa saya bantu?',
  ],
};

const CS_BOT_ID = 'cs-payungin-bot';

/**
 * POST /api/cs/tickets
 * User membuka tiket CS baru
 * Body: { type: 'kehilangan' | 'lainnya' }
 */
const createTicket = async (req, res) => {
  try {
    const { type = 'lainnya' } = req.body;

    const ticket = await CsTicket.create({
      id: uuidv4(),
      userId: req.user.id,
      type,
      status: 'open',
    });

    // Kirim pesan sambutan otomatis dari CS
    const greeting = type === 'kehilangan'
      ? 'Halo! Saya CS Payungin. Saya siap membantu laporan kehilangan payung kamu. 🔍'
      : 'Halo! Selamat datang di CS Payungin. Ada yang bisa saya bantu? 😊';

    await CsMessage.create({
      id: uuidv4(),
      ticketId: ticket.id,
      senderType: 'cs',
      senderId: CS_BOT_ID,
      message: greeting,
    });

    return res.status(201).json({
      success: true,
      data: {
        ticketId: ticket.id,
        type,
        status: 'open',
        initialMessage: greeting,
      },
    });
  } catch (error) {
    console.error('createTicket error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/cs/tickets/:ticketId/messages
 * Ambil semua pesan dalam tiket
 */
const getMessages = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await CsTicket.findOne({
      where: { id: ticketId, userId: req.user.id },
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });
    }

    const messages = await CsMessage.findAll({
      where: { ticketId },
      order: [['createdAt', 'ASC']],
    });

    return res.json({
      success: true,
      data: {
        ticket: { id: ticket.id, type: ticket.type, status: ticket.status },
        messages: messages.map(m => ({
          id: m.id,
          senderType: m.senderType,
          message: m.message,
          createdAt: m.createdAt,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * POST /api/cs/tickets/:ticketId/messages
 * User mengirim pesan ke CS
 * Body: { message }
 */
const sendMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong.' });
    }

    const ticket = await CsTicket.findOne({
      where: { id: ticketId, userId: req.user.id },
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });
    }

    if (ticket.status === 'closed') {
      return res.status(409).json({ success: false, message: 'Tiket sudah ditutup.' });
    }

    // Simpan pesan user
    const userMsg = await CsMessage.create({
      id: uuidv4(),
      ticketId,
      senderType: 'user',
      senderId: req.user.id,
      message: message.trim(),
    });

    // Generate auto-reply CS
    const messageCount = await CsMessage.count({ where: { ticketId, senderType: 'user' } });
    const replies = CS_AUTO_REPLIES[ticket.type] || CS_AUTO_REPLIES.lainnya;
    const replyText = replies[(messageCount - 1) % replies.length];

    const csReply = await CsMessage.create({
      id: uuidv4(),
      ticketId,
      senderType: 'cs',
      senderId: CS_BOT_ID,
      message: replyText,
    });

    return res.json({
      success: true,
      data: {
        userMessage: {
          id: userMsg.id,
          senderType: 'user',
          message: userMsg.message,
          createdAt: userMsg.createdAt,
        },
        csReply: {
          id: csReply.id,
          senderType: 'cs',
          message: csReply.message,
          createdAt: csReply.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('sendMessage error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/cs/tickets
 * Daftar tiket milik user
 */
const getMyTickets = async (req, res) => {
  try {
    const tickets = await CsTicket.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });

    return res.json({ success: true, data: { tickets } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

module.exports = { createTicket, getMessages, sendMessage, getMyTickets };
