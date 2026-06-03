// src/routes/loanRoutes.js
const express = require('express');
const router = express.Router();
const { borrowUmbrella, returnUmbrella, getActiveLoans, getLoanHistory } = require('../controllers/loanController');
const { authenticate } = require('../middleware/auth');

router.post('/borrow',              authenticate, borrowUmbrella);
router.post('/:loanId/return',        authenticate, returnUmbrella);
router.get ('/active',                authenticate, getActiveLoans);
router.get ('/history',               authenticate, getLoanHistory);

module.exports = router;