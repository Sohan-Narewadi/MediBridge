const pool = require('../../database/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const { appointmentId, rating, comment } = req.body;
  if (!appointmentId || !rating) throw new ApiError(400, 'appointmentId and rating are required.');
  if (rating < 1 || rating > 5) throw new ApiError(400, 'rating must be between 1 and 5.');

  const [apptRows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [appointmentId]);
  if (!apptRows.length) throw new ApiError(404, 'Appointment not found.');
  const appt = apptRows[0];
  if (appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (appt.status !== 'completed') throw new ApiError(400, 'You can only review a completed appointment.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO reviews (doctor_id, patient_id, appointment_id, rating, comment) VALUES (?, ?, ?, ?, ?)`,
      [appt.doctor_id, appt.patient_id, appointmentId, rating, comment || null]
    );
    await conn.query(
      `UPDATE doctors d
       JOIN (SELECT ROUND(AVG(rating), 2) AS avg_rating, COUNT(*) AS cnt FROM reviews WHERE doctor_id = ?) r
       SET d.rating_avg = r.avg_rating, d.rating_count = r.cnt
       WHERE d.user_id = ?`,
      [appt.doctor_id, appt.doctor_id]
    );
    await conn.commit();
    res.status(201).json({ message: 'Thanks for your feedback.' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'You already reviewed this appointment.');
    throw err;
  } finally {
    conn.release();
  }
});

const listForDoctor = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.rating, r.comment, r.created_at, u.full_name AS patient_name
     FROM reviews r JOIN users u ON u.id = r.patient_id
     WHERE r.doctor_id = ? ORDER BY r.created_at DESC`,
    [req.params.doctorId]
  );
  res.json({ reviews: rows });
});

module.exports = { create, listForDoctor };
