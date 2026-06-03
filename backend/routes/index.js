const express = require('express');
const router = express.Router();

router.use('/auth',         require('./authRoutes'));
router.use('/stations',     require('./stationRoutes'));
router.use('/loans',        require('./loanRoutes'));
router.use('/transactions', require('./transactionRoutes'));
router.use('/damage',       require('./damageRoutes'));
router.use('/refund',       require('./refundRoutes'));
router.use('/cs',           require('./csRoutes'));
router.use('/admin',        require('./adminRoutes'));

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Payungin API running'
  });
});

module.exports = router;