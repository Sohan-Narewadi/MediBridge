const pool = require('../../database/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/admin/stats - the headline numbers for the admin dashboard.
const getStats = asyncHandler(async (req, res) => {
  const [[patients]] = await pool.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'patient'`);
  const [[doctors]] = await pool.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'doctor' AND is_active = 1`);
  const [[appointments]] = await pool.query(`SELECT COUNT(*) AS count FROM appointments`);
  const [[completed]] = await pool.query(`SELECT COUNT(*) AS count FROM appointments WHERE status = 'completed'`);
  const [[cancelled]] = await pool.query(`SELECT COUNT(*) AS count FROM appointments WHERE status = 'cancelled'`);
  const [[pending]] = await pool.query(`SELECT COUNT(*) AS count FROM appointments WHERE status = 'pending'`);
  const [[activeToday]] = await pool.query(
    `SELECT COUNT(DISTINCT patient_id) AS count FROM appointments WHERE appointment_date = CURDATE()`
  );
  const [[openReports]] = await pool.query(`SELECT COUNT(*) AS count FROM reported_issues WHERE status = 'open'`);
  const [recentUsers] = await pool.query(
    `SELECT id, full_name, role, email, created_at FROM users ORDER BY created_at DESC LIMIT 6`
  );
  const [recentAppointments] = await pool.query(
    `SELECT a.id, a.appointment_date, a.status, pu.full_name AS patient_name, du.full_name AS doctor_name
     FROM appointments a
     JOIN users pu ON pu.id = a.patient_id JOIN users du ON du.id = a.doctor_id
     ORDER BY a.created_at DESC LIMIT 6`
  );

  res.json({
    totals: {
      patients: patients.count, doctors: doctors.count, appointments: appointments.count,
      completed: completed.count, cancelled: cancelled.count, pending: pending.count,
      activeToday: activeToday.count, openReports: openReports.count,
    },
    recentUsers, recentAppointments,
  });
});

// GET /api/admin/analytics - chart-ready series.
const getAnalytics = asyncHandler(async (req, res) => {
  const [growth] = await pool.query(`
    SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, role, COUNT(*) AS count
    FROM users WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
    GROUP BY month, role ORDER BY month`);

  const [appointmentTrend] = await pool.query(`
    SELECT appointment_date AS date, status, COUNT(*) AS count
    FROM appointments WHERE appointment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY appointment_date, status ORDER BY appointment_date`);

  const [specializationDistribution] = await pool.query(`
    SELECT s.name, COUNT(d.user_id) AS doctor_count
    FROM specializations s LEFT JOIN doctors d ON d.specialization_id = s.id
    GROUP BY s.id ORDER BY doctor_count DESC`);

  const [statusBreakdown] = await pool.query(`
    SELECT status, COUNT(*) AS count FROM appointments GROUP BY status`);

  res.json({ growth, appointmentTrend, specializationDistribution, statusBreakdown });
});

// ---- Patients ----
const listPatients = asyncHandler(async (req, res) => {
  const { q, page = 1, pageSize = 15 } = req.query;
  const where = ["u.role = 'patient'"];
  const params = [];
  if (q) { where.push('(u.full_name LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const limit = Math.min(Number(pageSize) || 15, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users u WHERE ${where.join(' AND ')}`, params);
  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.created_at, p.city, p.blood_group,
        (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = u.id) AS appointment_count
     FROM users u JOIN patients p ON p.user_id = u.id
     WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ patients: rows, total, page: Number(page), pageSize: limit });
});

// ---- Doctors (admin view, includes inactive/unverified) ----
const listDoctors = asyncHandler(async (req, res) => {
  const { q, page = 1, pageSize = 15 } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(u.full_name LIKE ? OR s.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Number(pageSize) || 15, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM doctors d JOIN users u ON u.id = d.user_id JOIN specializations s ON s.id = d.specialization_id ${whereClause}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.is_active, u.created_at, s.name AS specialization,
        d.experience_years, d.consultation_fee, d.rating_avg, d.rating_count, d.is_verified,
        (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = u.id) AS appointment_count
     FROM doctors d JOIN users u ON u.id = d.user_id JOIN specializations s ON s.id = d.specialization_id
     ${whereClause} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ doctors: rows, total, page: Number(page), pageSize: limit });
});

const verifyDoctor = asyncHandler(async (req, res) => {
  await pool.query('UPDATE doctors SET is_verified = 1 WHERE user_id = ?', [req.params.id]);
  res.json({ message: 'Doctor verified.' });
});

const setUserStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, req.params.id]);
  res.json({ message: `User ${isActive ? 'activated' : 'deactivated'}.` });
});

// ---- Reported issues ----
const listReports = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = status ? 'WHERE ri.status = ?' : '';
  const [rows] = await pool.query(
    `SELECT ri.*, u.full_name AS reporter_name, u.role AS reporter_role
     FROM reported_issues ri JOIN users u ON u.id = ri.reporter_id
     ${where} ORDER BY ri.created_at DESC`,
    status ? [status] : []
  );
  res.json({ reports: rows });
});

const updateReport = asyncHandler(async (req, res) => {
  const { status, adminNotes } = req.body;
  if (!['open', 'in_review', 'resolved', 'dismissed'].includes(status)) throw new ApiError(400, 'Invalid status.');
  await pool.query(
    `UPDATE reported_issues SET status = ?, admin_notes = ?, resolved_at = IF(? IN ('resolved','dismissed'), NOW(), resolved_at) WHERE id = ?`,
    [status, adminNotes || null, status, req.params.id]
  );
  res.json({ message: 'Report updated.' });
});

// ---- Audit log ----
const listAuditLogs = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT al.*, u.full_name AS user_name FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC LIMIT 100`
  );
  res.json({ logs: rows });
});

module.exports = {
  getStats, getAnalytics, listPatients, listDoctors, verifyDoctor, setUserStatus,
  listReports, updateReport, listAuditLogs,
};
