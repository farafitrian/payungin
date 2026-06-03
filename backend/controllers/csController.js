// controllers/csController.js
// Live Chat CS — user kirim pesan, admin balas manual
// 2 pesan otomatis sistem saja:
//   1. Saat tiket dibuka (welcome)
//   2. Saat user kirim pesan PERTAMA (acknowledgement)
// Setelah itu: TIDAK ada auto-reply. Hanya admin yang bisa balas.

const { CsTicket, CsMessage, User } = require('../models');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');

/**
 * POST /api/cs/tickets
 * Buat tiket baru, atau kembalikan tiket open/in_progress yang sudah ada.
 * Body: { type: 'kehilangan' | 'lainnya' }
 */
const createTicket = async (req, res) => {
  try {
    const { type = 'lainnya' } = req.body;

    // Cek apakah user sudah punya tiket aktif — kembalikan jika ada
    const existing = await CsTicket.findOne({
      where: { userId: req.user.id, status: { [Op.in]: ['open', 'in_progress'] } },
    });
    if (existing) {
      return res.status(200).json({
        success: true,
        data: { ticketId: existing.id, type: existing.type, status: existing.status, isExisting: true },
      });
    }

    const ticket = await CsTicket.create({
      id: uuidv4(),
      userId: req.user.id,
      type,
      status: 'open',
    });

    // Pesan sistem pertama — welcome (hanya muncul sekali saat tiket dibuat)
    const welcomeMsg = 'Hai! Selamat datang di CS Payungin. Ada yang bisa kami bantu? 😊';
    await CsMessage.create({
      id: uuidv4(),
      ticketId: ticket.id,
      senderType: 'cs',
      senderId: 'system',
      message: welcomeMsg,
    });

    return res.status(201).json({
      success: true,
      data: { ticketId: ticket.id, type, status: 'open', initialMessage: welcomeMsg },
    });
  } catch (error) {
    console.error('createTicket error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/cs/tickets/:ticketId/messages
 * Ambil pesan. ?after=msgId hanya ambil pesan baru (untuk polling).
 */
const getMessages = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { after } = req.query;

    const ticket = await CsTicket.findOne({
      where: { id: ticketId, userId: req.user.id },
    });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });
    }

    const where = { ticketId };
    if (after) {
      const lastMsg = await CsMessage.findByPk(after);
      if (lastMsg) where.createdAt = { [Op.gt]: lastMsg.createdAt };
    }

    const messages = await CsMessage.findAll({
      where,
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
 * User mengirim pesan. Jika ini pesan USER PERTAMA → kirim pesan acknowledgement sistem.
 * Sesudah itu: tidak ada auto-reply apapun.
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
    if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });
    if (ticket.status === 'closed') return res.status(409).json({ success: false, message: 'Tiket sudah ditutup.' });

    // Simpan pesan user
    const userMsg = await CsMessage.create({
      id: uuidv4(),
      ticketId,
      senderType: 'user',
      senderId: req.user.id,
      message: message.trim(),
    });

    // Update status tiket ke in_progress
    if (ticket.status === 'open') {
      await ticket.update({ status: 'in_progress' });
    }

    // Cek apakah ini pesan USER pertama (di luar pesan sistem)
    const userMessageCount = await CsMessage.count({
      where: { ticketId, senderType: 'user' },
    });

    let ackMsg = null;
    if (userMessageCount === 1) {
      // Pesan acknowledgement sistem — hanya dikirim SEKALI
      const ackText = 'Terima kasih sudah menghubungi Payungin. Tim kami akan menindaklanjuti segera. Mohon ditunggu.';
      const ackRecord = await CsMessage.create({
        id: uuidv4(),
        ticketId,
        senderType: 'cs',
        senderId: 'system',
        message: ackText,
      });
      ackMsg = {
        id: ackRecord.id,
        senderType: 'cs',
        message: ackText,
        createdAt: ackRecord.createdAt,
      };
    }

    return res.json({
      success: true,
      data: {
        message: {
          id: userMsg.id,
          senderType: 'user',
          message: userMsg.message,
          createdAt: userMsg.createdAt,
        },
        ackMessage: ackMsg, // null jika bukan pesan pertama
      },
    });
  } catch (error) {
    console.error('sendMessage error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/cs/tickets
 * Tiket milik user (untuk load ulang saat re-open halaman)
 */
const getMyTickets = async (req, res) => {
  try {
    const tickets = await CsTicket.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 10,
    });
    return res.json({ success: true, data: { tickets } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

// ═══════════════════════════════════════
// ADMIN CS ENDPOINTS
// ═══════════════════════════════════════

/**
 * GET /api/admin/cs/tickets
 * Admin lihat semua tiket beserta pesan terakhir
 */
const adminGetAllTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const where = status && status !== 'all' ? { status } : {};

    const tickets = await CsTicket.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['name', 'email'] },
        {
          model: CsMessage,
          as: 'messages',
          order: [['createdAt', 'DESC']],
          limit: 1,
          separate: true,
        },
      ],
      order: [['updatedAt', 'DESC']],
    });

    return res.json({
      success: true,
      data: {
        tickets: tickets.map(t => ({
          id: t.id,
          userId: t.userId,
          userName: t.user?.name || '-',
          userEmail: t.user?.email || '-',
          type: t.type,
          status: t.status,
          lastMessage: t.messages?.[0]?.message || null,
          lastMessageAt: t.messages?.[0]?.createdAt || t.createdAt,
          createdAt: t.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('adminGetAllTickets error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * GET /api/admin/cs/tickets/:ticketId/messages
 * Admin baca semua pesan. ?after=msgId untuk polling.
 */
const adminGetMessages = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { after } = req.query;

    const ticket = await CsTicket.findByPk(ticketId, {
      include: [{ model: User, as: 'user', attributes: ['name', 'email'] }],
    });
    if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });

    const where = { ticketId };
    if (after) {
      const lastMsg = await CsMessage.findByPk(after);
      if (lastMsg) where.createdAt = { [Op.gt]: lastMsg.createdAt };
    }

    const messages = await CsMessage.findAll({ where, order: [['createdAt', 'ASC']] });

    return res.json({
      success: true,
      data: {
        ticket: {
          id: ticket.id,
          type: ticket.type,
          status: ticket.status,
          userName: ticket.user?.name,
          userEmail: ticket.user?.email,
        },
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
 * POST /api/admin/cs/tickets/:ticketId/reply
 * Admin membalas pesan user
 * Body: { message }
 */
const adminReply = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong.' });
    }

    const ticket = await CsTicket.findByPk(ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });

    const msg = await CsMessage.create({
      id: uuidv4(),
      ticketId,
      senderType: 'cs',
      senderId: req.user.id,
      message: message.trim(),
    });

    if (ticket.status === 'open') await ticket.update({ status: 'in_progress' });

    return res.json({
      success: true,
      data: {
        message: {
          id: msg.id,
          senderType: 'cs',
          message: msg.message,
          createdAt: msg.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('adminReply error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * PUT /api/admin/cs/tickets/:ticketId/status
 * Admin update status tiket (resolved/closed)
 * Body: { status }
 */
const adminUpdateTicketStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;

    const ticket = await CsTicket.findByPk(ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });

    await ticket.update({ status });
    return res.json({ success: true, message: 'Status tiket diperbarui.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

module.exports = {
  createTicket, getMessages, sendMessage, getMyTickets,
  adminGetAllTickets, adminGetMessages, adminReply, adminUpdateTicketStatus,
};