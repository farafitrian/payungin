// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  getDashboardStats,
  getAdminStations, createStation, updateStation, deleteStation,
  getAdminUmbrellas, addUmbrellas, updateUmbrella, deleteUmbrella,
  getAdminReports, updateReportStatus,
  getAdminUsers,
} = require('../controllers/adminController');
const { getAllReports, verifyReport } = require('../controllers/damageController');
const { getAllRefundRequests, processRefundRequest } = require('../controllers/refundController');
const {
  adminGetAllTickets, adminGetMessages, adminReply, adminUpdateTicketStatus,
} = require('../controllers/csController');

router.use(authenticate, requireAdmin);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Station
router.get   ('/stations',               getAdminStations);
router.post  ('/stations',               createStation);
router.put   ('/stations/:stationId',    updateStation);
router.delete('/stations/:stationId',    deleteStation);

// Umbrella
router.get   ('/umbrellas',              getAdminUmbrellas);
router.post  ('/umbrellas',              addUmbrellas);
router.put   ('/umbrellas/:umbrellaId',  updateUmbrella);
router.delete('/umbrellas/:umbrellaId',  deleteUmbrella);

// Laporan — alur baru: admin ajukan denda, user konfirmasi
router.get('/reports',                   getAdminReports);
router.put('/reports/:reportId/status',  updateReportStatus);

// Users
router.get('/users', getAdminUsers);

// CS Live Chat (admin side)
router.get ('/cs/tickets',                          adminGetAllTickets);
router.get ('/cs/tickets/:ticketId/messages',       adminGetMessages);
router.post('/cs/tickets/:ticketId/reply',          adminReply);
router.put ('/cs/tickets/:ticketId/status',         adminUpdateTicketStatus);

// Backward compat
router.get('/damage/reports',                       getAllReports);
router.put('/damage/reports/:reportId/verify',      verifyReport);
router.get('/refund/requests',                      getAllRefundRequests);
router.put('/refund/requests/:requestId',           processRefundRequest);

module.exports = router;