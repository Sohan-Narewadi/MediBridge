const pool = require('../../database/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/prescriptions - a flattened view of every prescription line item
// across a patient's medical records (or a doctor's authored records),
// newest first. This is what backs the dedicated Prescriptions page.
const list = asyncHandler(async (req, res) => {
  const where = req.user.role === 'patient' ? 'mr.patient_id = ?' : 'mr.doctor_id = ?';
  const [rows] = await pool.query(
    `SELECT p.*, mr.record_date, mr.diagnosis, du.full_name AS doctor_name, pu.full_name AS patient_name,
            EXISTS(SELECT 1 FROM medications m WHERE m.prescription_id = p.id) AS already_tracked
     FROM prescriptions p
     JOIN medical_records mr ON mr.id = p.medical_record_id
     JOIN users du ON du.id = mr.doctor_id
     JOIN users pu ON pu.id = mr.patient_id
     WHERE ${where}
     ORDER BY mr.record_date DESC`,
    [req.user.id]
  );
  res.json({ prescriptions: rows });
});

module.exports = { list };
