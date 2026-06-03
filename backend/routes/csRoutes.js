// routes/csRoutes.js
const express = require('express');
const router = express.Router();
const { createTicket, getMessages, sendMessage, getMyTickets } = require('../controllers/csController');
const { authenticate } = require('../middleware/auth');

router.post('/tickets',                         authenticate, createTicket);
router.get ('/tickets',                         authenticate, getMyTickets);
router.get ('/tickets/:ticketId/messages',      authenticate, getMessages);
router.post('/tickets/:ticketId/messages',      authenticate, sendMessage);

module.exports = router;