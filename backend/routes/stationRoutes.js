// src/routes/stationRoutes.js
const express = require('express');
const router = express.Router();
const { getAllStations, getAvailableUmbrellas, scanStation } = require('../controllers/stationController');
const { authenticate } = require('../middleware/auth');

router.get ('/',                         authenticate, getAllStations);
router.get ('/scan/:stationCode',        authenticate, scanStation);
router.get ('/:stationId/umbrellas',     authenticate, getAvailableUmbrellas);

module.exports = router;