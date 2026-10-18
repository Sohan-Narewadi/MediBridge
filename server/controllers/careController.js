const { find, byIds, withUsers, todayStr, shiftDate } = require('../../database/store');
const asyncHandler = require('../utils/asyncHandler');
const { computeCareScore } = require('../utils/careScore');

// GET /api/care/score - the patient's Care Score + breakdown.
const getScore = asyncHandler(async (req, res) => {
  res.json(await computeCareScore(req.user.id));
});

// GET /api/care/timeline - unified chronological feed for the patient:
// appointments, medical records and medication starts merged into one list,
// newest first. This is what powers the Health Timeline view.
const getTimeline = asyncHandler(async (req, res) => {
  const patientId = req.user.id;
  const [appointments, records, medications] = await Promise.all([
    find('appointments', { patient_id: patientId }),
    find('medical_records', { patient_id: patientId }),
    find('medications', { patient_id: patientId }),
  ]);
  await withUsers(appointments, { doctor_id: 'doctor_name' });
  await withUsers(records, { doctor_id: 'doctor_name' });
  const doctors = await byIds('doctors', appointments.map((a) => a.doctor_id), 'user_id', 'user_id specialization_id');
  const specs = await byIds('specializations', [...doctors.values()].map((d) => d.specialization_id));
  const specName = (doctorId) => {
    const d = doctors.get(doctorId);
    return d && specs.get(d.specialization_id) ? specs.get(d.specialization_id).name : '';
  };

  const timeline = [
    ...appointments.map((a) => ({
      type: 'appointment', date: a.appointment_date, id: a.id,
      title: `Appointment with ${a.doctor_name}`,
      detail: `${specName(a.doctor_id)} • ${a.status}${a.reason ? ' • ' + a.reason : ''}`,
      status: a.status,
    })),
    ...records.map((r) => ({
      type: 'medical_record', date: r.record_date, id: r.id,
      title: `Medical record: ${r.diagnosis}`,
      detail: `Documented by ${r.doctor_name}`,
    })),
    ...medications.map((m) => ({
      type: 'medication', date: m.start_date, id: m.id,
      title: `Started ${m.medicine_name}`,
      detail: m.dosage,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ timeline });
});

// GET /api/care/adherence-trend - daily adherence % over the last 14 days,
// for the medication adherence chart on the Medications page.
const getAdherenceTrend = asyncHandler(async (req, res) => {
  const meds = await find('medications', { patient_id: req.user.id }, { select: 'id' });
  const logs = await find('medication_logs', {
    medication_id: { $in: meds.map((m) => m.id) }, log_date: { $gte: shiftDate(todayStr(), -14) },
  }, { select: 'log_date status' });

  const byDay = new Map();
  for (const l of logs) {
    const day = byDay.get(l.log_date) || { taken: 0, total: 0 };
    day.total += 1;
    if (l.status === 'taken') day.taken += 1;
    byDay.set(l.log_date, day);
  }
  const trend = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, adherence_pct: Math.round((100 * d.taken) / d.total) }));
  res.json({ trend });
});

module.exports = { getScore, getTimeline, getAdherenceTrend };
