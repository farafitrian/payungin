// src/routes/refundRoutes.js
const express = require('express');
const router = express.Router();
const { createRefundRequest, getMyRefundRequests } = require('../controllers/refundController');
const { authenticate } = require('../middleware/auth');

router.post('/request',     authenticate, createRefundRequest);
router.get ('/my-requests', authenticate, getMyRefundRequests);

module.exports = router;