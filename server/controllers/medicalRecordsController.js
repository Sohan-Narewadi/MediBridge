const pool = require('../../database/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Confirms a doctor has ever had a (non-cancelled) appointment with a given
// patient - the access-control rule for any patient data a doctor requests
// outside their own authored records.
async function doctorHasRelationship(doctorId, patientId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM appointments WHERE doctor_id = ? AND patient_id = ? AND status != 'cancelled' LIMIT 1`,
    [doctorId, patientId]
  );
  return rows.length > 0;
}

const list = asyncHandler(async (req, res) => {
  const { patientId } = req.query;
  const where = [];
  const params = [];

  if (req.user.role === 'patient') {
    where.push('mr.patient_id = ?');
    params.push(req.user.id);
  } else if (req.user.role === 'doctor') {
    if (patientId && patientId != req.user.id) {
      if (!(await doctorHasRelationship(req.user.id, patientId))) {
        throw new ApiError(403, "You can only view records for patients you've had an appointment with.");
      }
      where.push('mr.patient_id = ?');
      params.push(patientId);
    } else {
      where.push('mr.doctor_id = ?');
      params.push(req.user.id);
    }
  } else if (patientId) {
    where.push('mr.patient_id = ?');
    params.push(patientId);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT mr.*, pu.full_name AS patient_name, du.full_name AS doctor_name, s.name AS specialization
     FROM medical_records mr
     JOIN patients p ON p.user_id = mr.patient_id JOIN users pu ON pu.id = p.user_id
     JOIN doctors d ON d.user_id = mr.doctor_id JOIN users du ON du.id = d.user_id
     JOIN specializations s ON s.id = d.specialization_id
     ${whereClause}
     ORDER BY mr.record_date DESC`,
    params
  );
  res.json({ records: rows });
});

const getById = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT mr.*, pu.full_name AS patient_name, du.full_name AS doctor_name, s.name AS specialization
     FROM medical_records mr
     JOIN patients p ON p.user_id = mr.patient_id JOIN users pu ON pu.id = p.user_id
     JOIN doctors d ON d.user_id = mr.doctor_id JOIN users du ON du.id = d.user_id
     JOIN specializations s ON s.id = d.specialization_id
     WHERE mr.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new ApiError(404, 'Medical record not found.');
  const record = rows[0];

  if (req.user.role === 'patient' && record.patient_id !== req.user.id) throw new ApiError(403, 'Not your record.');
  if (req.user.role === 'doctor' && record.doctor_id !== req.user.id && !(await doctorHasRelationship(req.user.id, record.patient_id))) {
    throw new ApiError(403, 'You do not have access to this record.');
  }

  const [prescriptions] = await pool.query('SELECT * FROM prescriptions WHERE medical_record_id = ?', [req.params.id]);
  res.json({ record, prescriptions });
});

// POST /api/medical-records - doctor documents a consultation, optionally
// attached to an appointment (which it then marks completed), with a
// prescriptions[] array that's inserted atomically alongside it.
const create = asyncHandler(async (req, res) => {
  const { appointmentId, patientId, diagnosis, consultationSummary, vitalsBp, vitalsPulse, vitalsTemp, followUpDate, followUpNotes, prescriptions = [] } = req.body;
  if (!patientId || !diagnosis) throw new ApiError(400, 'patientId and diagnosis are required.');

  if (appointmentId) {
    const [apptRows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [appointmentId]);
    if (!apptRows.length) throw new ApiError(404, 'Appointment not found.');
    if (apptRows[0].doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  } else if (!(await doctorHasRelationship(req.user.id, patientId))) {
    throw new ApiError(403, "You can only add records for patients you've had an appointment with.");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO medical_records (appointment_id, patient_id, doctor_id, record_date, diagnosis, consultation_summary,
          vitals_bp, vitals_pulse, vitals_temp, follow_up_date, follow_up_notes)
       VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)`,
      [appointmentId || null, patientId, req.user.id, diagnosis, consultationSummary || null, vitalsBp || null, vitalsPulse || null, vitalsTemp || null, followUpDate || null, followUpNotes || null]
    );
    const recordId = result.insertId;

    for (const p of prescriptions) {
      await conn.query(
        `INSERT INTO prescriptions (medical_record_id, medicine_name, dosage, frequency, duration_days, instructions)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [recordId, p.medicineName, p.dosage, p.frequency, p.durationDays || null, p.instructions || null]
      );
    }
    if (appointmentId) {
      await conn.query(`UPDATE appointments SET status = 'completed' WHERE id = ?`, [appointmentId]);
    }
    await conn.query(
      `INSERT INTO notifications (user_id, type, title, message, related_type, related_id) VALUES (?, 'record', 'New medical record added', 'Your doctor has added notes and a prescription from your recent visit.', 'medical_record', ?)`,
      [patientId, recordId]
    );
    await conn.commit();
    res.status(201).json({ id: recordId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

module.exports = { list, getById, create };
