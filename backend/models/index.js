// models/index.js
const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────
// MODEL: User
// ─────────────────────────────────────────
const User = sequelize.define('User', {
  id:       { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
  name:     { type: DataTypes.STRING(100), allowNull: false },
  email:    { type: DataTypes.STRING(150), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  phone:    { type: DataTypes.STRING(20) },
  saldo:    { type: DataTypes.INTEGER, defaultValue: 0 },
  role:     { type: DataTypes.ENUM('user', 'admin'), defaultValue: 'user' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'users' });

// ─────────────────────────────────────────
// MODEL: Station
// ─────────────────────────────────────────
const Station = sequelize.define('Station', {
  id:           { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
  code:         { type: DataTypes.STRING(20), unique: true, allowNull: false },
  name:         { type: DataTypes.STRING(150), allowNull: false },
  locationDesc: { type: DataTypes.STRING(255) },
  latitude:     { type: DataTypes.DECIMAL(10, 8) },
  longitude:    { type: DataTypes.DECIMAL(11, 8) },
  capacity:     { type: DataTypes.INTEGER, defaultValue: 10 },
  isActive:     { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'stations' });

// ─────────────────────────────────────────
// MODEL: Umbrella
// ─────────────────────────────────────────
const Umbrella = sequelize.define('Umbrella', {
  id:             { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
  umbrellaCode:   { type: DataTypes.STRING(20), unique: true, allowNull: false },
  stationId:      { type: DataTypes.STRING(36), allowNull: true },
  status:         { type: DataTypes.ENUM('available', 'borrowed', 'damaged', 'lost'), defaultValue: 'available' },
  conditionNotes: { type: DataTypes.TEXT },
}, { tableName: 'umbrellas' });

// ─────────────────────────────────────────
// MODEL: Loan
// status ENUM diperluas: tambah 'damaged' untuk laporan kerusakan
// ─────────────────────────────────────────
const Loan = sequelize.define('Loan', {
  id:               { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
  userId:           { type: DataTypes.STRING(36), allowNull: false },
  umbrellaId:       { type: DataTypes.STRING(36), allowNull: false },
  pickupStationId:  { type: DataTypes.STRING(36), allowNull: false },
  returnStationId:  { type: DataTypes.STRING(36), allowNull: true },
  // 'damaged' = ditutup karena laporan kerusakan disetujui
  // 'lost'    = ditutup karena laporan kehilangan disetujui
  status:           { type: DataTypes.ENUM('active', 'returned', 'overdue', 'lost', 'damaged'), defaultValue: 'active' },
  borrowedAt:       { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  returnedAt:       { type: DataTypes.DATE },
  durationMinutes:  { type: DataTypes.INTEGER },
  feeCharged:       { type: DataTypes.INTEGER, defaultValue: 0 },
  notes:            { type: DataTypes.TEXT },
}, { tableName: 'loans' });

// ─────────────────────────────────────────
// MODEL: Transaction
// ─────────────────────────────────────────
const Transaction = sequelize.define('Transaction', {
  id:                 { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
  userId:             { type: DataTypes.STRING(36), allowNull: false },
  type:               { type: DataTypes.ENUM('topup', 'fee', 'refund', 'penalty'), allowNull: false },
  amount:             { type: DataTypes.INTEGER, allowNull: false },
  status:             { type: DataTypes.ENUM('pending', 'success', 'failed', 'expired'), defaultValue: 'pending' },
  midtransOrderId:    { type: DataTypes.STRING(100), unique: true },
  midtransToken:      { type: DataTypes.STRING(500) },
  midtransQrUrl:      { type: DataTypes.STRING(500) },
  midtransExpireAt:   { type: DataTypes.DATE },
  loanId:             { type: DataTypes.STRING(36) },
  description:        { type: DataTypes.STRING(255) },
}, { tableName: 'transactions' });

// ─────────────────────────────────────────
// MODEL: DamageReport
// ─────────────────────────────────────────
const DamageReport = sequelize.define('DamageReport', {
  id:             { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
  userId:         { type: DataTypes.STRING(36), allowNull: false },
  umbrellaId:     { type: DataTypes.STRING(36), allowNull: false },
  loanId:         { type: DataTypes.STRING(36) },
  reportType:     { type: DataTypes.ENUM('rusak', 'hilang'), defaultValue: 'rusak' },
  description:    { type: DataTypes.TEXT, allowNull: false },
  status:         {
    type: DataTypes.ENUM('pending', 'verified', 'rejected'),
    defaultValue: 'pending',
  },
  penaltyAmount:  { type: DataTypes.INTEGER, defaultValue: 20000 },
  penaltyCharged: { type: DataTypes.BOOLEAN, defaultValue: false },
  adminNotes:     { type: DataTypes.TEXT },
  verifiedBy:     { type: DataTypes.STRING(36) },
  verifiedAt:     { type: DataTypes.DATE },
}, { tableName: 'damage_reports' });

// ─────────────────────────────────────────
// MODEL: DamagePhoto
// ─────────────────────────────────────────
const DamagePhoto = sequelize.define('DamagePhoto', {
  id:        { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
  reportId:  { type: DataTypes.STRING(36), allowNull: false },
  filePath:  { type: DataTypes.STRING(500), allowNull: false },
}, { tableName: 'damage_photos', updatedAt: false });

// ─────────────────────────────────────────
// MODEL: RefundRequest
// ─────────────────────────────────────────
const RefundRequest = sequelize.define('RefundRequest', {
  id:            { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
  userId:        { type: DataTypes.STRING(36), allowNull: false },
  amount:        { type: DataTypes.INTEGER, allowNull: false },
  method:        { type: DataTypes.ENUM('bank', 'ewallet'), allowNull: false },
  providerName:  { type: DataTypes.STRING(100), allowNull: false },
  accountName:   { type: DataTypes.STRING(150), allowNull: false },
  accountNumber: { type: DataTypes.STRING(100), allowNull: false },
  status:        { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
  adminNotes:    { type: DataTypes.TEXT },
  processedBy:   { type: DataTypes.STRING(36) },
  processedAt:   { type: DataTypes.DATE },
}, { tableName: 'refund_requests' });

// ─────────────────────────────────────────
// MODEL: CsTicket
// ─────────────────────────────────────────
const CsTicket = sequelize.define('CsTicket', {
  id:     { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
  userId: { type: DataTypes.STRING(36), allowNull: false },
  type:   { type: DataTypes.ENUM('kehilangan', 'lainnya'), defaultValue: 'lainnya' },
  status: { type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed'), defaultValue: 'open' },
}, { tableName: 'cs_tickets' });

// ─────────────────────────────────────────
// MODEL: CsMessage
// ─────────────────────────────────────────
const CsMessage = sequelize.define('CsMessage', {
  id:         { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
  ticketId:   { type: DataTypes.STRING(36), allowNull: false },
  senderType: { type: DataTypes.ENUM('user', 'cs'), allowNull: false },
  senderId:   { type: DataTypes.STRING(36), allowNull: false },
  message:    { type: DataTypes.TEXT, allowNull: false },
}, { tableName: 'cs_messages', updatedAt: false });

// ═══════════════════════════════════════════
// RELASI
// ═══════════════════════════════════════════
User.hasMany(Loan,          { foreignKey: 'userId',    as: 'loans' });
User.hasMany(Transaction,   { foreignKey: 'userId',    as: 'transactions' });
User.hasMany(DamageReport,  { foreignKey: 'userId',    as: 'damageReports' });
User.hasMany(RefundRequest, { foreignKey: 'userId',    as: 'refundRequests' });
User.hasMany(CsTicket,      { foreignKey: 'userId',    as: 'tickets' });

Station.hasMany(Umbrella,  { foreignKey: 'stationId',       as: 'umbrellas' });
Station.hasMany(Loan,      { foreignKey: 'pickupStationId',  as: 'pickupLoans' });
Station.hasMany(Loan,      { foreignKey: 'returnStationId',  as: 'returnLoans' });

Umbrella.belongsTo(Station, { foreignKey: 'stationId',  as: 'station' });
Umbrella.hasMany(Loan,      { foreignKey: 'umbrellaId', as: 'loans' });

Loan.belongsTo(User,    { foreignKey: 'userId',          as: 'user' });
Loan.belongsTo(Umbrella,{ foreignKey: 'umbrellaId',      as: 'umbrella' });
Loan.belongsTo(Station, { foreignKey: 'pickupStationId', as: 'pickupStation' });
Loan.belongsTo(Station, { foreignKey: 'returnStationId', as: 'returnStation' });
Loan.hasMany(Transaction,  { foreignKey: 'loanId', as: 'transactions' });
Loan.hasMany(DamageReport, { foreignKey: 'loanId', as: 'damageReports' });

Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Transaction.belongsTo(Loan, { foreignKey: 'loanId', as: 'loan' });

DamageReport.belongsTo(User,     { foreignKey: 'userId',    as: 'user' });
DamageReport.belongsTo(Umbrella, { foreignKey: 'umbrellaId',as: 'umbrella' });
DamageReport.belongsTo(Loan,     { foreignKey: 'loanId',    as: 'loan' });
DamageReport.hasMany(DamagePhoto,{ foreignKey: 'reportId',  as: 'photos' });

DamagePhoto.belongsTo(DamageReport, { foreignKey: 'reportId', as: 'report' });

RefundRequest.belongsTo(User, { foreignKey: 'userId', as: 'user' });

CsTicket.belongsTo(User,    { foreignKey: 'userId',   as: 'user' });
CsTicket.hasMany(CsMessage, { foreignKey: 'ticketId', as: 'messages' });
CsMessage.belongsTo(CsTicket,{ foreignKey: 'ticketId', as: 'ticket' });

module.exports = {
  sequelize,
  User, Station, Umbrella, Loan,
  Transaction, DamageReport, DamagePhoto,
  RefundRequest, CsTicket, CsMessage,
};