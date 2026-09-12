const pool = require('../../database/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/medications?bucket=today|upcoming|expired
const list = asyncHandler(async (req, res) => {
  const patientId = req.user.role === 'patient' ? req.user.id : req.query.patientId;
  if (!patientId) throw new ApiError(400, 'patientId is required.');
  if (req.user.role === 'doctor') {
    const [rel] = await pool.query(`SELECT 1 FROM appointments WHERE doctor_id = ? AND patient_id = ? LIMIT 1`, [req.user.id, patientId]);
    if (!rel.length) throw new ApiError(403, 'No relationship with this patient.');
  }

  const { bucket } = req.query;
  let condition = '1=1';
  if (bucket === 'today') condition = `is_active = 1 AND start_date <= CURDATE() AND (end_date IS NULL OR end_date >= CURDATE())`;
  else if (bucket === 'upcoming') condition = `start_date > CURDATE()`;
  else if (bucket === 'expired') condition = `end_date IS NOT NULL AND end_date < CURDATE()`;

  const [rows] = await pool.query(
    `SELECT m.*, (
        SELECT status FROM medication_logs WHERE medication_id = m.id AND log_date = CURDATE() LIMIT 1
     ) AS today_status
     FROM medications m WHERE patient_id = ? AND ${condition} ORDER BY start_date DESC`,
    [patientId]
  );
  res.json({ medications: rows });
});

const create = asyncHandler(async (req, res) => {
  const { medicineName, dosage, frequency, startDate, endDate, reminderTimes, instructions, prescriptionId } = req.body;
  if (!medicineName || !dosage || !frequency || !startDate) {
    throw new ApiError(400, 'medicineName, dosage, frequency and startDate are required.');
  }
  const [result] = await pool.query(
    `INSERT INTO medications (patient_id, prescription_id, medicine_name, dosage, frequency, start_date, end_date, reminder_times, instructions, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [req.user.id, prescriptionId || null, medicineName, dosage, frequency, startDate, endDate || null, reminderTimes || '08:00', instructions || null]
  );
  res.status(201).json({ id: result.insertId });
});

const update = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM medications WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new ApiError(404, 'Medication not found.');
  if (rows[0].patient_id !== req.user.id) throw new ApiError(403, 'Not your medication.');

  const allowed = ['medicine_name', 'dosage', 'frequency', 'start_date', 'end_date', 'reminder_times', 'instructions', 'is_active'];
  const camelMap = { medicineName: 'medicine_name', startDate: 'start_date', endDate: 'end_date', reminderTimes: 'reminder_times', isActive: 'is_active' };
  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(req.body)) {
    const col = camelMap[key] || key;
    if (allowed.includes(col)) { sets.push(`${col} = ?`); params.push(value); }
  }
  if (!sets.length) throw new ApiError(400, 'No valid fields to update.');
  await pool.query(`UPDATE medications SET ${sets.join(', ')} WHERE id = ?`, [...params, req.params.id]);
  res.json({ message: 'Medication updated.' });
});

const remove = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM medications WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new ApiError(404, 'Medication not found.');
  if (rows[0].patient_id !== req.user.id) throw new ApiError(403, 'Not your medication.');
  await pool.query('UPDATE medications SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.json({ message: 'Medication stopped.' });
});

// POST /api/medications/:id/log  { status: 'taken' | 'missed' | 'skipped', date? }
const logIntake = asyncHandler(async (req, res) => {
  const { status, date } = req.body;
  if (!['taken', 'missed', 'skipped'].includes(status)) throw new ApiError(400, 'Invalid status.');
  const [rows] = await pool.query('SELECT * FROM medications WHERE id = ?', [req.params.id]);
  if (!rows.length) throw new ApiError(404, 'Medication not found.');
  if (rows[0].patient_id !== req.user.id) throw new ApiError(403, 'Not your medication.');

  await pool.query(
    `INSERT INTO medication_logs (medication_id, log_date, status) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE status = ?, logged_at = NOW()`,
    [req.params.id, date || new Date().toISOString().slice(0, 10), status, status]
  );
  res.json({ message: 'Logged.' });
});

module.exports = { list, create, update, remove, logIntake };
