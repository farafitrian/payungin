// routes/damageRoutes.js
const express = require('express');
const router = express.Router();
const { submitReport, getMyReports, respondPenalty } = require('../controllers/damageController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/report',                             authenticate, upload.array('photos', 5), submitReport);
router.get ('/my-reports',                         authenticate, getMyReports);
router.post('/reports/:reportId/respond-penalty',  authenticate, respondPenalty);

module.exports = router;