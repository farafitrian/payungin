// controllers/adminController.js

const { Station, Umbrella, Loan, User, DamageReport, DamagePhoto, Transaction } = require('../models');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

// ─────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────
const getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, totalUmbrellas, activeLoans, pendingReports, totalStations] = await Promise.all([
      User.count({ where: { role: 'user' } }),
      Umbrella.count(),
      Loan.count({ where: { status: 'active' } }),
      DamageReport.count({ where: { status: 'pending' } }),
      Station.count({ where: { isActive: true } }),
    ]);

    const umbrellaStats = await Umbrella.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('status')), 'count']],
      group: ['status'],
      raw: true,
    });

    const byStatus = {};
    umbrellaStats.forEach(r => { byStatus[r.status] = parseInt(r.count); });

    return res.json({
      success: true,
      data: {
        totalUsers, totalStations, totalUmbrellas, activeLoans, pendingReports,
        umbrellaByStatus: {
          available: byStatus.available || 0,
          borrowed:  byStatus.borrowed  || 0,
          damaged:   byStatus.damaged   || 0,
          lost:      byStatus.lost      || 0,
        },
      },
    });
  } catch (error) {
    console.error('getDashboardStats error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

// ─────────────────────────────────────────
// STATION CRUD
// ─────────────────────────────────────────
const getAdminStations = async (req, res) => {
  try {
    const stations = await Station.findAll({
      include: [{ model: Umbrella, as: 'umbrellas', attributes: ['id', 'umbrellaCode', 'status'], required: false }],
      order: [['name', 'ASC']],
    });
    return res.json({
      success: true,
      data: {
        stations: stations.map(s => ({
          id: s.id, code: s.code, name: s.name,
          locationDesc: s.locationDesc, capacity: s.capacity, isActive: s.isActive,
          totalUmbrellas: s.umbrellas.length,
          available:      s.umbrellas.filter(u => u.status === 'available').length,
          availableCount: s.umbrellas.filter(u => u.status === 'available').length,
          borrowedCount:  s.umbrellas.filter(u => u.status === 'borrowed').length,
          damagedCount:   s.umbrellas.filter(u => u.status === 'damaged').length,
          lostCount:      s.umbrellas.filter(u => u.status === 'lost').length,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

const createStation = async (req, res) => {
  try {
    const { name, locationDesc, capacity, latitude, longitude } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Nama station wajib diisi.' });
    const count = await Station.count();
    const code  = `STN-${String(count + 1).padStart(3, '0')}`;
    const station = await Station.create({
      id: uuidv4(), code, name: name.trim(),
      locationDesc: locationDesc || null, capacity: capacity || 10,
      latitude: latitude || null, longitude: longitude || null,
    });
    return res.status(201).json({ success: true, message: 'Station berhasil ditambahkan.', data: { station } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

const updateStation = async (req, res) => {
  try {
    const { stationId } = req.params;
    const { name, locationDesc, capacity, isActive } = req.body;
    const station = await Station.findByPk(stationId);
    if (!station) return res.status(404).json({ success: false, message: 'Station tidak ditemukan.' });
    await station.update({
      name:         name         || station.name,
      locationDesc: locationDesc !== undefined ? locationDesc : station.locationDesc,
      capacity:     capacity     || station.capacity,
      isActive:     isActive     !== undefined ? isActive     : station.isActive,
    });
    return res.json({ success: true, message: 'Station berhasil diperbarui.', data: { station } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

const deleteStation = async (req, res) => {
  try {
    const { stationId } = req.params;
    const station = await Station.findByPk(stationId);
    if (!station) return res.status(404).json({ success: false, message: 'Station tidak ditemukan.' });
    const umbrellaCount = await Umbrella.count({ where: { stationId, status: 'available' } });
    if (umbrellaCount > 0) {
      await station.update({ isActive: false });
      return res.json({ success: true, message: 'Station dinonaktifkan.' });
    }
    await station.destroy();
    return res.json({ success: true, message: 'Station berhasil dihapus.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

// ─────────────────────────────────────────
// UMBRELLA CRUD
// ─────────────────────────────────────────
const getAdminUmbrellas = async (req, res) => {
  try {
    const { stationId, status } = req.query;
    const where = {};
    if (stationId) where.stationId = stationId;
    if (status)    where.status    = status;
    const umbrellas = await Umbrella.findAll({
      where,
      include: [{ model: Station, as: 'station', attributes: ['name', 'code'] }],
      order: [['umbrellaCode', 'ASC']],
    });
    return res.json({
      success: true,
      data: {
        umbrellas: umbrellas.map(u => ({
          id:             u.id,
          code:           u.umbrellaCode,
          stationId:      u.stationId,
          stationName:    u.station ? u.station.name : 'Tidak ada station',
          status:         u.status,
          conditionNotes: u.conditionNotes,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

const addUmbrellas = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { stationId, count } = req.body;
    if (!stationId || !count || count < 1) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'stationId dan count wajib diisi.' });
    }
    const station = await Station.findByPk(stationId, { transaction: t });
    if (!station) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Station tidak ditemukan.' });
    }
    const lastUmbrella = await Umbrella.findOne({ order: [['umbrellaCode', 'DESC']], transaction: t });
    let nextNum = 1;
    if (lastUmbrella) {
      const match = lastUmbrella.umbrellaCode.match(/\d+/);
      if (match) nextNum = parseInt(match[0]) + 1;
    }
    const newUmbrellas = [];
    for (let i = 0; i < count; i++) {
      newUmbrellas.push({
        id: uuidv4(),
        umbrellaCode: `UMB${String(nextNum + i).padStart(3, '0')}`,
        stationId,
        status: 'available',
      });
    }
    await Umbrella.bulkCreate(newUmbrellas, { transaction: t });
    await t.commit();
    return res.status(201).json({ success: true, message: `${count} payung berhasil ditambahkan ke ${station.name}.` });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

const updateUmbrella = async (req, res) => {
  try {
    const { umbrellaId } = req.params;
    const { status, stationId, conditionNotes } = req.body;
    const umbrella = await Umbrella.findByPk(umbrellaId);
    if (!umbrella) return res.status(404).json({ success: false, message: 'Payung tidak ditemukan.' });
    if (status && !['available', 'borrowed', 'damaged', 'lost'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    }
    await umbrella.update({
      status:         status         !== undefined ? status         : umbrella.status,
      stationId:      stationId      !== undefined ? stationId      : umbrella.stationId,
      conditionNotes: conditionNotes !== undefined ? conditionNotes : umbrella.conditionNotes,
    });
    return res.json({ success: true, message: 'Payung berhasil diperbarui.', data: { umbrella } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

const deleteUmbrella = async (req, res) => {
  try {
    const { umbrellaId } = req.params;
    const umbrella = await Umbrella.findByPk(umbrellaId);
    if (!umbrella) return res.status(404).json({ success: false, message: 'Payung tidak ditemukan.' });
    if (umbrella.status === 'borrowed') return res.status(400).json({ success: false, message: 'Payung sedang dipinjam.' });
    await umbrella.destroy();
    return res.json({ success: true, message: 'Payung berhasil dihapus.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

// ─────────────────────────────────────────
// LAPORAN
// ─────────────────────────────────────────
const getAdminReports = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;

    const reports = await DamageReport.findAll({
      where,
      include: [
        // JOIN ke User via damage_reports.user_id — ini user PELAPOR, bukan admin
        { model: User,        as: 'user',     attributes: ['name', 'email', 'saldo'] },
        { model: Umbrella,    as: 'umbrella', attributes: ['umbrellaCode', 'status'] },
        { model: DamagePhoto, as: 'photos',   attributes: ['filePath'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      success: true,
      data: {
        reports: reports.map(r => ({
          id:             r.id,
          userId:         r.userId,
          umbrellaId:     r.umbrellaId,
          loanId:         r.loanId,
          // user = pelapor (bukan admin verifier)
          userName:       r.user     ? r.user.name           : '-',
          userEmail:      r.user     ? r.user.email          : '-',
          userSaldo:      r.user     ? r.user.saldo          : 0,
          umbrellaCode:   r.umbrella ? r.umbrella.umbrellaCode : '-',
          umbrellaStatus: r.umbrella ? r.umbrella.status      : '-',
          reportType:     r.reportType || 'rusak',
          description:    r.description,
          status:         r.status,
          penaltyAmount:  r.penaltyAmount,
          penaltyCharged: r.penaltyCharged,
          adminNotes:     r.adminNotes,
          photos:         r.photos.map(p => `/uploads/damage-reports/${path.basename(p.filePath)}`),
          createdAt:      r.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('getAdminReports error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

/**
 * PUT /api/admin/reports/:reportId/status
 *
 * action: 'approve'
 *   LAPORAN HILANG:
 *     - Potong saldo user
 *     - umbrella.status = 'lost', stationId = null
 *     - loan.status = 'lost', returnedAt = now, feeCharged = 0, notes = 'closed_by_admin'
 *     - Peminjaman DITUTUP — user tidak perlu kembalikan payung
 *
 *   LAPORAN RUSAK:
 *     - Potong saldo user
 *     - umbrella.status = 'damaged', stationId = null
 *     - loan TETAP ACTIVE — user WAJIB kembalikan payung fisik
 *     - loan.notes = 'has_damage_report' untuk ditampilkan di frontend
 *
 * action: 'reject'
 *   - Hanya update laporan → rejected
 *   - Tidak ada perubahan loan/umbrella
 */
const updateReportStatus = async (req, res) => {
  console.log('\n====== REPORT APPROVAL CALLED ======');
  console.log('reportId :', req.params.reportId);
  console.log('action   :', req.body.action);
  console.log('penalty  :', req.body.penaltyAmount);
  console.log('admin    :', req.user?.id);
  console.log('=====================================\n');

  const t = await sequelize.transaction();
  try {
    const { reportId } = req.params;
    const { action, adminNotes, penaltyAmount } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'action harus approve atau reject.' });
    }

    const report = await DamageReport.findByPk(reportId, { transaction: t });
    if (!report) {
      await t.rollback();
      console.log('[Approval] ERROR: Laporan tidak ditemukan:', reportId);
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
    }
    console.log('[Approval] Report:', report.id, '| status:', report.status, '| type:', report.reportType, '| umbrellaId:', report.umbrellaId, '| loanId:', report.loanId, '| userId:', report.userId);

    if (report.status !== 'pending') {
      await t.rollback();
      console.log('[Approval] SKIP: status bukan pending, status:', report.status);
      return res.status(409).json({ success: false, message: `Laporan sudah diproses (status: ${report.status}).` });
    }

    // ── REJECT ───────────────────────────────────────────────────────────
    if (action === 'reject') {
      await report.update({
        status:     'rejected',
        adminNotes: adminNotes || report.adminNotes,
        verifiedBy: req.user.id,
        verifiedAt: new Date(),
      }, { transaction: t });
      await t.commit();
      console.log('[Approval] REJECTED - laporan ditolak, loan tetap active');
      return res.json({ success: true, message: 'Laporan ditolak. Pinjaman tetap aktif.' });
    }

    // ── APPROVE ──────────────────────────────────────────────────────────
    const penalty = penaltyAmount !== undefined ? parseInt(penaltyAmount) : (report.penaltyAmount || 0);
    const now     = new Date();
    const isHilang = report.reportType === 'hilang';

    // 1. Potong saldo user (jika ada denda)
    if (penalty > 0) {
      // Gunakan raw SQL UPDATE untuk memastikan update ke DB, bukan cache Sequelize
      const [updatedRows] = await sequelize.query(
        'UPDATE users SET saldo = saldo - :penalty WHERE id = :userId AND saldo >= :penalty',
        {
          replacements: { penalty, userId: report.userId },
          transaction: t,
          type: sequelize.QueryTypes.UPDATE,
        }
      );
      console.log('[Approval] User saldo update rows affected:', updatedRows);

      if (updatedRows === 0) {
        // Cek apakah karena saldo tidak cukup atau user tidak ditemukan
        const userCheck = await sequelize.query(
          'SELECT saldo FROM users WHERE id = :userId',
          { replacements: { userId: report.userId }, transaction: t, type: sequelize.QueryTypes.SELECT }
        );
        const currentSaldo = userCheck[0]?.saldo ?? 0;
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Saldo user tidak cukup (Rp ${currentSaldo.toLocaleString('id-ID')}) untuk denda Rp ${penalty.toLocaleString('id-ID')}.`,
        });
      }

      await Transaction.create({
        id:          uuidv4(),
        userId:      report.userId,
        type:        'penalty',
        amount:      penalty,
        status:      'success',
        description: `Denda ${report.reportType} payung - Laporan #${reportId.slice(0, 8)}`,
      }, { transaction: t });
      console.log('[Approval] Transaksi denda dicatat: Rp', penalty);
    }

    // 2. Update umbrella status
    const newUmbrellaStatus = isHilang ? 'lost' : 'damaged';
    const [umbrellaRows] = await sequelize.query(
      'UPDATE umbrellas SET status = :status, station_id = NULL, condition_notes = :notes WHERE id = :umbrellaId',
      {
        replacements: {
          status:      newUmbrellaStatus,
          notes:       adminNotes ? `[Admin] ${adminNotes}` : `Laporan ${report.reportType} disetujui ${now.toLocaleDateString('id-ID')}`,
          umbrellaId:  report.umbrellaId,
        },
        transaction: t,
        type: sequelize.QueryTypes.UPDATE,
      }
    );
    console.log('[Approval] UPDATE UMBRELLA id:', report.umbrellaId, '| status:', newUmbrellaStatus, '| rows:', umbrellaRows);

    // 3. Update loan — BERBEDA untuk hilang vs rusak
    if (isHilang) {
      // HILANG: tutup peminjaman sepenuhnya
      const loanWhere = report.loanId
        ? 'id = :loanId'
        : 'umbrella_id = :umbrellaId AND user_id = :userId AND status = \'active\'';
      const loanReplacements = report.loanId
        ? { loanId: report.loanId, now: now.toISOString().slice(0, 19).replace('T', ' ') }
        : { umbrellaId: report.umbrellaId, userId: report.userId, now: now.toISOString().slice(0, 19).replace('T', ' ') };

      const [loanRows] = await sequelize.query(
        `UPDATE loans SET status = 'lost', returned_at = :now, fee_charged = 0, notes = 'closed_by_admin',
         duration_minutes = TIMESTAMPDIFF(MINUTE, borrowed_at, :now)
         WHERE ${loanWhere}`,
        { replacements: loanReplacements, transaction: t, type: sequelize.QueryTypes.UPDATE }
      );
      console.log('[Approval] UPDATE LOAN (hilang) where:', JSON.stringify(loanReplacements), '| rows:', loanRows);
    } else {
      // RUSAK: loan TETAP ACTIVE, hanya tandai notes='has_damage_report'
      // User masih wajib mengembalikan payung fisik
      const loanWhere = report.loanId
        ? 'id = :loanId'
        : 'umbrella_id = :umbrellaId AND user_id = :userId AND status = \'active\'';
      const loanReplacements = report.loanId
        ? { loanId: report.loanId }
        : { umbrellaId: report.umbrellaId, userId: report.userId };

      const [loanRows] = await sequelize.query(
        `UPDATE loans SET notes = 'has_damage_report' WHERE ${loanWhere} AND status = 'active'`,
        { replacements: loanReplacements, transaction: t, type: sequelize.QueryTypes.UPDATE }
      );
      console.log('[Approval] UPDATE LOAN (rusak) tetap active, notes=has_damage_report | rows:', loanRows);
    }

    // 4. Update laporan
    await report.update({
      status:         'verified',
      penaltyAmount:  penalty,
      penaltyCharged: penalty > 0,
      adminNotes:     adminNotes || report.adminNotes,
      verifiedBy:     req.user.id,
      verifiedAt:     now,
    }, { transaction: t });

    await t.commit();
    console.log('[Approval] COMMIT SUCCESS');

    const msg = penalty > 0
      ? `Laporan disetujui. Payung → ${newUmbrellaStatus}. Denda Rp ${penalty.toLocaleString('id-ID')} dipotong.`
      : `Laporan disetujui. Payung → ${newUmbrellaStatus}.`;

    return res.json({ success: true, message: msg });

  } catch (error) {
    await t.rollback();
    console.error('[Approval] ERROR:', error);
    return res.status(500).json({ success: false, message: `Terjadi kesalahan server: ${error.message}` });
  }
};

// ─────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────
const getAdminUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where:      { role: 'user' },
      attributes: ['id', 'name', 'email', 'phone', 'saldo', 'isActive', 'createdAt'],
      order:      [['createdAt', 'DESC']],
    });
    return res.json({ success: true, data: { users } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

module.exports = {
  getDashboardStats,
  getAdminStations, createStation, updateStation, deleteStation,
  getAdminUmbrellas, addUmbrellas, updateUmbrella, deleteUmbrella,
  getAdminReports, updateReportStatus,
  getAdminUsers,
};