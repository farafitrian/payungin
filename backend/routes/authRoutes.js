const express = require('express');
const router = express.Router();

const {
  register,
  login,
  getMe,
  updateProfile,
  addSaldo
} = require('../controllers/authController');

const { authenticate } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);

router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, updateProfile);

router.post('/add-saldo', authenticate, addSaldo);

module.exports = router;