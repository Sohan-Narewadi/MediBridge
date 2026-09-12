const pool = require('../../database/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildAvailableSlots } = require('../utils/slots');

async function notify(conn, userId, type, title, message, relatedType, relatedId) {
  await conn.query(
    `INSERT INTO notifications (user_id, type, title, message, related_type, related_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, title, message, relatedType, relatedId]
  );
}

async function assertSlotIsFree(conn, doctorId, date, startTime, excludeAppointmentId) {
  const target = new Date(`${date}T00:00:00`);
  const dayOfWeek = target.getDay();

  const [availabilityRows] = await conn.query(
    `SELECT start_time, end_time, slot_duration_mins FROM doctor_availability WHERE doctor_id = ? AND day_of_week = ? AND is_active = 1`,
    [doctorId, dayOfWeek]
  );
  const [booked] = await conn.query(
    `SELECT start_time FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status != 'cancelled' AND id != ?`,
    [doctorId, date, excludeAppointmentId || 0]
  );
  const freeSlots = buildAvailableSlots(availabilityRows, booked, target, new Date());
  const match = freeSlots.find((s) => s.startTime === startTime);
  if (!match) throw new ApiError(409, 'That time slot is no longer available. Please choose another.');
  return match;
}

// GET /api/appointments - scoped to the caller's role, with optional filters.
const list = asyncHandler(async (req, res) => {
  const { status, from, to, doctorId, patientId } = req.query;
  const where = [];
  const params = [];

  if (req.user.role === 'patient') {
    where.push('a.patient_id = ?');
    params.push(req.user.id);
  } else if (req.user.role === 'doctor') {
    where.push('a.doctor_id = ?');
    params.push(req.user.id);
  } else {
    if (doctorId) { where.push('a.doctor_id = ?'); params.push(doctorId); }
    if (patientId) { where.push('a.patient_id = ?'); params.push(patientId); }
  }
  if (status) { where.push('a.status = ?'); params.push(status); }
  if (from) { where.push('a.appointment_date >= ?'); params.push(from); }
  if (to) { where.push('a.appointment_date <= ?'); params.push(to); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT a.*, pu.full_name AS patient_name, du.full_name AS doctor_name, s.name AS specialization
     FROM appointments a
     JOIN patients p ON p.user_id = a.patient_id JOIN users pu ON pu.id = p.user_id
     JOIN doctors d ON d.user_id = a.doctor_id JOIN users du ON du.id = d.user_id
     JOIN specializations s ON s.id = d.specialization_id
     ${whereClause}
     ORDER BY a.appointment_date DESC, a.start_time DESC`,
    params
  );
  res.json({ appointments: rows });
});

const getById = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.*, pu.full_name AS patient_name, du.full_name AS doctor_name, s.name AS specialization
     FROM appointments a
     JOIN patients p ON p.user_id = a.patient_id JOIN users pu ON pu.id = p.user_id
     JOIN doctors d ON d.user_id = a.doctor_id JOIN users du ON du.id = d.user_id
     JOIN specializations s ON s.id = d.specialization_id
     WHERE a.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new ApiError(404, 'Appointment not found.');
  const appt = rows[0];
  if (req.user.role === 'patient' && appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  res.json({ appointment: appt });
});

// POST /api/appointments - patient books; doctor/admin can book on a patient's behalf.
const create = asyncHandler(async (req, res) => {
  const { doctorId, patientId, date, startTime, reason, consultationMode } = req.body;
  if (!doctorId || !date || !startTime) throw new ApiError(400, 'doctorId, date and startTime are required.');

  const effectivePatientId = req.user.role === 'patient' ? req.user.id : patientId;
  if (!effectivePatientId) throw new ApiError(400, 'patientId is required.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const slot = await assertSlotIsFree(conn, doctorId, date, startTime);

    const [result] = await conn.query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, start_time, end_time, consultation_mode, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [effectivePatientId, doctorId, date, slot.startTime, slot.endTime, consultationMode || 'in_person', reason || null]
    );
    await notify(conn, doctorId, 'appointment', 'New appointment request', `A new appointment request has been booked for ${date} at ${slot.startTime.slice(0, 5)}.`, 'appointment', result.insertId);
    await conn.commit();
    res.status(201).json({ id: result.insertId, message: 'Appointment requested. You will be notified once the doctor confirms.' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// PATCH /api/appointments/:id/status - role-gated status transitions.
const ALLOWED_TRANSITIONS = {
  doctor: { pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'] },
  patient: { pending: ['cancelled'], confirmed: ['cancelled'] },
  admin: { pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'], completed: [], cancelled: [] },
};
const updateStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new ApiError(404, 'Appointment not found.');
  const appt = rows[0];

  if (req.user.role === 'patient' && appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');

  const allowedNext = (ALLOWED_TRANSITIONS[req.user.role] || {})[appt.status] || [];
  if (!allowedNext.includes(status)) {
    throw new ApiError(400, `Cannot move an appointment from "${appt.status}" to "${status}".`);
  }

  await pool.query(
    `UPDATE appointments SET status = ?, cancelled_by = ?, cancellation_reason = ? WHERE id = ?`,
    [status, status === 'cancelled' ? req.user.role : appt.cancelled_by, status === 'cancelled' ? (reason || null) : appt.cancellation_reason, req.params.id]
  );

  const notifyUserId = req.user.role === 'patient' ? appt.doctor_id : appt.patient_id;
  const verb = { confirmed: 'confirmed', cancelled: 'cancelled', completed: 'marked completed' }[status] || status;
  await notify(pool, notifyUserId, 'appointment', `Appointment ${verb}`, `Your appointment on ${appt.appointment_date} has been ${verb}.`, 'appointment', appt.id);

  res.json({ message: `Appointment ${verb}.` });
});

// PATCH /api/appointments/:id/reschedule
const reschedule = asyncHandler(async (req, res) => {
  const { date, startTime } = req.body;
  const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new ApiError(404, 'Appointment not found.');
  const appt = rows[0];

  if (req.user.role === 'patient' && appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (!['pending', 'confirmed'].includes(appt.status)) throw new ApiError(400, 'Only pending or confirmed appointments can be rescheduled.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const slot = await assertSlotIsFree(conn, appt.doctor_id, date, startTime, appt.id);
    await conn.query(
      `UPDATE appointments SET appointment_date = ?, start_time = ?, end_time = ?, status = 'pending' WHERE id = ?`,
      [date, slot.startTime, slot.endTime, appt.id]
    );
    const notifyUserId = req.user.role === 'patient' ? appt.doctor_id : appt.patient_id;
    await notify(conn, notifyUserId, 'appointment', 'Appointment rescheduled', `An appointment has been rescheduled to ${date} at ${slot.startTime.slice(0, 5)}.`, 'appointment', appt.id);
    await conn.commit();
    res.json({ message: 'Appointment rescheduled. Awaiting confirmation.' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// GET /api/appointments/my-patients - doctor's own patient roster, derived
// from appointment history, with just enough clinical context to be useful
// (allergies/conditions) without exposing unrelated patients' data.
const listMyPatients = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.phone, p.blood_group, p.allergies, p.chronic_conditions,
        COUNT(a.id) AS appointment_count,
        MAX(a.appointment_date) AS last_visit,
        SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
     FROM appointments a
     JOIN patients p ON p.user_id = a.patient_id
     JOIN users u ON u.id = p.user_id
     WHERE a.doctor_id = ?
     GROUP BY u.id ORDER BY last_visit DESC`,
    [req.user.id]
  );
  res.json({ patients: rows });
});

module.exports = { list, getById, create, updateStatus, reschedule, listMyPatients };
