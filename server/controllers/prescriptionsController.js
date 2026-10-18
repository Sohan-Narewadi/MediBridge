const { find, withUsers } = require('../../database/store');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/prescriptions - a flattened view of every prescription line item
// across a patient's medical records (or a doctor's authored records),
// newest first. This is what backs the dedicated Prescriptions page.
const list = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'patient' ? { patient_id: req.user.id } : { doctor_id: req.user.id };
  const records = await find('medical_records', filter);
  const recordById = new Map(records.map((r) => [r.id, r]));
  const items = await find('prescriptions', { medical_record_id: { $in: records.map((r) => r.id) } });

  const tracked = await find('medications', { prescription_id: { $in: items.map((p) => p.id) } }, { select: 'prescription_id' });
  const trackedIds = new Set(tracked.map((m) => m.prescription_id));
  await withUsers(records, { doctor_id: 'doctor_name', patient_id: 'patient_name' });

  const rows = items.map((p) => {
    const r = recordById.get(p.medical_record_id);
    return { ...p, record_date: r.record_date, diagnosis: r.diagnosis, doctor_name: r.doctor_name, patient_name: r.patient_name, already_tracked: trackedIds.has(p.id) ? 1 : 0 };
  });
  rows.sort((a, b) => String(b.record_date).localeCompare(String(a.record_date)) || b.id - a.id);
  res.json({ prescriptions: rows });
});

module.exports = { list };
