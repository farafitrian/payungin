// controllers/loanController.js
// Biaya: Rp3.000 flat per 24 jam (ceil). Minimal Rp3.000.

const { Loan, Umbrella, Station, User, Transaction, DamageReport } = require('../models');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database');

function hitungBiaya(durationMinutes) {
  const BIAYA_PER_HARI = parseInt(process.env.BIAYA_PER_HARI) || 3000;
  const jamTotal = durationMinutes / 60;
  const hariCeil = Math.max(1, Math.ceil(jamTotal / 24));
  return hariCeil * BIAYA_PER_HARI;
}

// POST /api/loans/borrow
const borrowUmbrella = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { umbrellaId, stationId } = req.body;
    const userId = req.user.id;

    if (!umbrellaId || !stationId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'umbrellaId dan stationId wajib diisi.' });
    }

    const user = await User.findByPk(userId, { transaction: t });
    if (user.saldo < 5000) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Saldo deposit tidak cukup. Top up minimal Rp 5.000.' });
    }

    const umbrella = await Umbrella.findOne({
      where: { id: umbrellaId, status: 'available' },
      transaction: t, lock: true,
    });
    if (!umbrella) {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'Payung sudah tidak tersedia. Pilih payung lain.' });
    }
    if (umbrella.stationId !== stationId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Payung tidak ditemukan di station ini.' });
    }

    const station = await Station.findByPk(stationId, { transaction: t });
    if (!station) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Station tidak ditemukan.' });
    }

    const loan = await Loan.create({
      id: uuidv4(), userId, umbrellaId,
      pickupStationId: stationId,
      status: 'active', borrowedAt: new Date(),
    }, { transaction: t });

    await umbrella.update({ status: 'borrowed', stationId: null }, { transaction: t });
    await t.commit();

    return res.status(201).json({
      success: true,
      message: `Berhasil! Payung ${umbrella.umbrellaCode} dipinjam dari ${station.name}. Selamat beraktivitas! ☂️`,
      data: { loan: { id: loan.id, umbrellaCode: umbrella.umbrellaCode, pickupStation: station.name, borrowedAt: loan.borrowedAt, status: 'active' } },
    });
  } catch (error) {
    await t.rollback();
    console.error('borrowUmbrella error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

// POST /api/loans/:loanId/return
// Jika payung rusak (notes='has_damage_report'): fee = 0, umbrella.status tetap 'damaged'
// Jika payung normal: fee = hitungBiaya, umbrella.status = 'available'
const returnUmbrella = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { loanId } = req.params;
    const { returnStationId } = req.body;
    const userId = req.user.id;

    if (!returnStationId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Pilih station tujuan pengembalian.' });
    }

    const loan = await Loan.findOne({
      where: { id: loanId, userId, status: 'active' },
      include: [{ model: Umbrella, as: 'umbrella' }],
      transaction: t, lock: true,
    });
    if (!loan) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Data peminjaman tidak ditemukan.' });
    }

    const returnStation = await Station.findOne({
      where: { id: returnStationId, isActive: true }, transaction: t,
    });
    if (!returnStation) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Station tujuan tidak ditemukan.' });
    }

    const currentCount = await Umbrella.count({
      where: { stationId: returnStationId, status: 'available' }, transaction: t,
    });
    if (currentCount >= returnStation.capacity) {
      await t.rollback();
      return res.status(409).json({ success: false, message: `Station ${returnStation.name} sudah penuh.` });
    }

    const returnedAt      = new Date();
    const durationMs      = returnedAt - new Date(loan.borrowedAt);
    const durationMinutes = Math.ceil(durationMs / 60000);

    // Cek apakah ini pengembalian payung rusak (denda sudah dipotong admin)
    const hasDamageReport = loan.notes === 'has_damage_report';
    const fee = hasDamageReport ? 0 : hitungBiaya(durationMinutes);

    const user = await User.findByPk(userId, { transaction: t });

    if (!hasDamageReport) {
      // Pengembalian normal: potong biaya sewa
      if (user.saldo < fee) {
        await t.rollback();
        return res.status(400).json({ success: false, message: `Saldo tidak cukup. Biaya Rp ${fee.toLocaleString('id-ID')}.` });
      }
      await user.update({ saldo: user.saldo - fee }, { transaction: t });
      await Transaction.create({
        id: uuidv4(), userId, type: 'fee', amount: fee, status: 'success',
        loanId: loan.id,
        description: `Biaya peminjaman payung ${loan.umbrella.umbrellaCode}`,
      }, { transaction: t });
    }
    // Jika has_damage_report: tidak potong saldo (denda sudah dipotong admin saat approval)

    // Update loan
    await loan.update({
      returnStationId,
      status: 'returned',
      returnedAt,
      durationMinutes,
      feeCharged: fee,
      // Bersihkan notes setelah dikembalikan
      notes: hasDamageReport ? 'returned_after_damage' : null,
    }, { transaction: t });

    // Update umbrella:
    // - Jika payung rusak: kembalikan ke station tapi status tetap 'damaged'
    // - Jika payung normal: status = 'available'
    const umbrellaCurrentStatus = loan.umbrella.status;
    const umbrellaNewStatus = (umbrellaCurrentStatus === 'damaged') ? 'damaged' : 'available';
    await loan.umbrella.update({
      status:    umbrellaNewStatus,
      stationId: returnStationId,
    }, { transaction: t });

    await t.commit();

    const message = hasDamageReport
      ? `Payung rusak berhasil dikembalikan ke ${returnStation.name}. Terima kasih! ☂️`
      : `Payung berhasil dikembalikan ke ${returnStation.name}. Biaya: Rp ${fee.toLocaleString('id-ID')} 🙏`;

    return res.json({
      success: true,
      message,
      data: { loan: { id: loan.id, umbrellaCode: loan.umbrella.umbrellaCode, returnStation: returnStation.name, durationMinutes, feeCharged: fee, returnedAt } },
    });
  } catch (error) {
    await t.rollback();
    console.error('returnUmbrella error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

// GET /api/loans/active
// Kembalikan loan status='active' TERMASUK yang has_damage_report
// agar user tetap bisa kembalikan payung rusak
const getActiveLoans = async (req, res) => {
  try {
    const loans = await Loan.findAll({
      where: { userId: req.user.id, status: 'active' },
      include: [
        { model: Umbrella, as: 'umbrella',      attributes: ['umbrellaCode', 'status'] },
        { model: Station,  as: 'pickupStation', attributes: ['name', 'code'] },
      ],
      order: [['borrowedAt', 'DESC']],
    });

    const now = new Date();
    const result = loans.map(loan => {
      const durationMs = now - new Date(loan.borrowedAt);
      const minutes    = Math.floor(durationMs / 60000);
      return {
        id:              loan.id,
        umbrellaId:      loan.umbrellaId,
        umbrellaCode:    loan.umbrella.umbrellaCode,
        umbrellaStatus:  loan.umbrella.status,   // 'borrowed' atau 'damaged'
        pickupStation:   loan.pickupStation.name,
        borrowedAt:      loan.borrowedAt,
        durationMinutes: minutes,
        estimatedFee:    loan.notes === 'has_damage_report' ? 0 : hitungBiaya(minutes),
        status:          loan.status,
        notes:           loan.notes || null,     // 'has_damage_report' jika laporan rusak disetujui
        hasDamageReport: loan.notes === 'has_damage_report',
      };
    });

    return res.json({ success: true, data: { loans: result } });
  } catch (error) {
    console.error('getActiveLoans error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

// GET /api/loans/history
const getLoanHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * parseInt(limit);

    const { count, rows } = await Loan.findAndCountAll({
      where: { userId: req.user.id },
      include: [
        { model: Umbrella, as: 'umbrella',      attributes: ['umbrellaCode'] },
        { model: Station,  as: 'pickupStation', attributes: ['name'] },
        { model: Station,  as: 'returnStation', attributes: ['name'] },
        {
          model: DamageReport, as: 'damageReports',
          attributes: ['id', 'reportType', 'penaltyAmount', 'status'],
          required: false,
          where: { status: 'verified' },
          limit: 1,
          separate: true,
        },
      ],
      order: [['borrowedAt', 'DESC']],
      limit:  parseInt(limit),
      offset: parseInt(offset),
    });

    return res.json({
      success: true,
      data: {
        loans: rows.map(loan => {
          const dmg           = loan.damageReports && loan.damageReports[0];
          const penaltyAmount = dmg ? dmg.penaltyAmount : 0;
          return {
            id:              loan.id,
            umbrellaCode:    loan.umbrella.umbrellaCode,
            pickupStation:   loan.pickupStation.name,
            returnStation:   loan.returnStation?.name || null,
            borrowedAt:      loan.borrowedAt,
            returnedAt:      loan.returnedAt,
            durationMinutes: loan.durationMinutes,
            feeCharged:      loan.feeCharged,
            penaltyAmount,
            status:          loan.status,
            notes:           loan.notes || null,
          };
        }),
        pagination: { total: count, page: parseInt(page), limit: parseInt(limit) },
      },
    });
  } catch (error) {
    console.error('getLoanHistory error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
};

module.exports = { borrowUmbrella, returnUmbrella, getActiveLoans, getLoanHistory };