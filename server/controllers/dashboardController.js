const pool = require('../../database/db');
const asyncHandler = require('../utils/asyncHandler');
const { computeCareScore } = require('../utils/careScore');

// GET /api/dashboard/patient - one call that feeds the whole patient dashboard.
const patientSummary = asyncHandler(async (req, res) => {
  const patientId = req.user.id;

  const [nextApptRows] = await pool.query(
    `SELECT a.*, du.full_name AS doctor_name, s.name AS specialization
     FROM appointments a JOIN doctors d ON d.user_id = a.doctor_id JOIN users du ON du.id = d.user_id
     JOIN specializations s ON s.id = d.specialization_id
     WHERE a.patient_id = ? AND a.status IN ('pending','confirmed') AND a.appointment_date >= CURDATE()
     ORDER BY a.appointment_date ASC, a.start_time ASC LIMIT 1`,
    [patientId]
  );
  const nextAppt = nextApptRows[0] || null;

  const [[counts]] = await pool.query(
    `SELECT
        SUM(CASE WHEN status IN ('pending','confirmed') AND appointment_date >= CURDATE() THEN 1 ELSE 0 END) AS upcoming,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
     FROM appointments WHERE patient_id = ?`,
    [patientId]
  );

  const [medicationsToday] = await pool.query(
    `SELECT m.*, (SELECT status FROM medication_logs WHERE medication_id = m.id AND log_date = CURDATE() LIMIT 1) AS today_status
     FROM medications m WHERE patient_id = ? AND is_active = 1 AND start_date <= CURDATE() AND (end_date IS NULL OR end_date >= CURDATE())`,
    [patientId]
  );

  const [recentRecords] = await pool.query(
    `SELECT mr.id, mr.record_date, mr.diagnosis, du.full_name AS doctor_name
     FROM medical_records mr JOIN users du ON du.id = mr.doctor_id
     WHERE mr.patient_id = ? ORDER BY mr.record_date DESC LIMIT 3`,
    [patientId]
  );

  const [[{ unread }]] = await pool.query(`SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0`, [patientId]);
  const careScore = await computeCareScore(pool, patientId);

  res.json({ nextAppointment: nextAppt, counts, medicationsToday, recentRecords, unreadNotifications: unread, careScore });
});

// GET /api/dashboard/doctor - one call that feeds the whole doctor dashboard.
const doctorSummary = asyncHandler(async (req, res) => {
  const doctorId = req.user.id;

  const [todayAppointments] = await pool.query(
    `SELECT a.*, pu.full_name AS patient_name
     FROM appointments a JOIN users pu ON pu.id = a.patient_id
     WHERE a.doctor_id = ? AND a.appointment_date = CURDATE() AND a.status != 'cancelled'
     ORDER BY a.start_time ASC`,
    [doctorId]
  );
  const [upcomingAppointments] = await pool.query(
    `SELECT a.*, pu.full_name AS patient_name
     FROM appointments a JOIN users pu ON pu.id = a.patient_id
     WHERE a.doctor_id = ? AND a.appointment_date > CURDATE() AND a.status IN ('pending','confirmed')
     ORDER BY a.appointment_date ASC, a.start_time ASC LIMIT 8`,
    [doctorId]
  );
  const [[counts]] = await pool.query(
    `SELECT
        COUNT(DISTINCT patient_id) AS total_patients,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
     FROM appointments WHERE doctor_id = ?`,
    [doctorId]
  );
  const [trend] = await pool.query(
    `SELECT appointment_date AS date, COUNT(*) AS count
     FROM appointments WHERE doctor_id = ? AND appointment_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
     GROUP BY appointment_date ORDER BY appointment_date`,
    [doctorId]
  );
  const [recentConsultations] = await pool.query(
    `SELECT mr.id, mr.record_date, mr.diagnosis, pu.full_name AS patient_name
     FROM medical_records mr JOIN users pu ON pu.id = mr.patient_id
     WHERE mr.doctor_id = ? ORDER BY mr.record_date DESC LIMIT 5`,
    [doctorId]
  );
  const [[{ unread }]] = await pool.query(`SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0`, [doctorId]);

  res.json({ todayAppointments, upcomingAppointments, counts, trend, recentConsultations, unreadNotifications: unread });
});

module.exports = { patientSummary, doctorSummary };
