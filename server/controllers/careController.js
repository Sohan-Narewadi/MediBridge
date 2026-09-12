const pool = require('../../database/db');
const asyncHandler = require('../utils/asyncHandler');
const { computeCareScore } = require('../utils/careScore');

// GET /api/care/score - the patient's Care Score + breakdown.
const getScore = asyncHandler(async (req, res) => {
  const result = await computeCareScore(pool, req.user.id);
  res.json(result);
});

// GET /api/care/timeline - unified chronological feed for the patient:
// appointments, medical records and medication starts merged into one list,
// newest first. This is what powers the Health Timeline view.
const getTimeline = asyncHandler(async (req, res) => {
  const patientId = req.user.id;

  const [appointments] = await pool.query(
    `SELECT a.id, a.appointment_date AS date, a.status, a.reason, du.full_name AS doctor_name, s.name AS specialization
     FROM appointments a
     JOIN doctors d ON d.user_id = a.doctor_id JOIN users du ON du.id = d.user_id
     JOIN specializations s ON s.id = d.specialization_id
     WHERE a.patient_id = ?`,
    [patientId]
  );
  const [records] = await pool.query(
    `SELECT mr.id, mr.record_date AS date, mr.diagnosis, du.full_name AS doctor_name
     FROM medical_records mr JOIN users du ON du.id = mr.doctor_id
     WHERE mr.patient_id = ?`,
    [patientId]
  );
  const [medications] = await pool.query(
    `SELECT id, start_date AS date, medicine_name, dosage FROM medications WHERE patient_id = ?`,
    [patientId]
  );

  const timeline = [
    ...appointments.map((a) => ({
      type: 'appointment', date: a.date, id: a.id,
      title: `Appointment with ${a.doctor_name}`,
      detail: `${a.specialization} • ${a.status}${a.reason ? ' • ' + a.reason : ''}`,
      status: a.status,
    })),
    ...records.map((r) => ({
      type: 'medical_record', date: r.date, id: r.id,
      title: `Medical record: ${r.diagnosis}`,
      detail: `Documented by ${r.doctor_name}`,
    })),
    ...medications.map((m) => ({
      type: 'medication', date: m.date, id: m.id,
      title: `Started ${m.medicine_name}`,
      detail: m.dosage,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ timeline });
});

// GET /api/care/adherence-trend - daily adherence % over the last 14 days,
// for the medication adherence chart on the Medications page.
const getAdherenceTrend = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ml.log_date AS date,
        ROUND(100 * SUM(CASE WHEN ml.status = 'taken' THEN 1 ELSE 0 END) / COUNT(*)) AS adherence_pct
     FROM medication_logs ml
     JOIN medications m ON m.id = ml.medication_id
     WHERE m.patient_id = ? AND ml.log_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
     GROUP BY ml.log_date ORDER BY ml.log_date`,
    [req.user.id]
  );
  res.json({ trend: rows });
});

module.exports = { getScore, getTimeline, getAdherenceTrend };
