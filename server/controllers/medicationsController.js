const { find, findOne, insert, update, exists, todayStr, isDuplicateKey } = require('../../database/store');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/medications?bucket=today|upcoming|expired
const list = asyncHandler(async (req, res) => {
  const patientId = Number(req.user.role === 'patient' ? req.user.id : req.query.patientId);
  if (!patientId) throw new ApiError(400, 'patientId is required.');
  if (req.user.role === 'doctor' && !(await exists('appointments', { doctor_id: req.user.id, patient_id: patientId }))) {
    throw new ApiError(403, 'No relationship with this patient.');
  }

  const today = todayStr();
  const { bucket } = req.query;
  const filter = { patient_id: patientId };
  if (bucket === 'today') {
    filter.is_active = 1;
    filter.start_date = { $lte: today };
    filter.$or = [{ end_date: null }, { end_date: { $gte: today } }];
  } else if (bucket === 'upcoming') filter.start_date = { $gt: today };
  else if (bucket === 'expired') filter.end_date = { $ne: null, $lt: today };

  const meds = await find('medications', filter, { sort: { start_date: -1, id: -1 } });
  const logs = await find('medication_logs', { medication_id: { $in: meds.map((m) => m.id) }, log_date: today }, { select: 'medication_id status' });
  const statusBy = new Map(logs.map((l) => [l.medication_id, l.status]));
  res.json({ medications: meds.map((m) => ({ ...m, today_status: statusBy.get(m.id) || null })) });
});

const create = asyncHandler(async (req, res) => {
  const { medicineName, dosage, frequency, startDate, endDate, reminderTimes, instructions, prescriptionId } = req.body;
  if (!medicineName || !dosage || !frequency || !startDate) {
    throw new ApiError(400, 'medicineName, dosage, frequency and startDate are required.');
  }
  const created = await insert('medications', {
    patient_id: req.user.id, prescription_id: prescriptionId || null, medicine_name: medicineName, dosage, frequency,
    start_date: startDate, end_date: endDate || null, reminder_times: reminderTimes || '08:00', instructions: instructions || null, is_active: 1,
  });
  res.status(201).json({ id: created.id });
});

async function ownedMedication(req) {
  const med = await findOne('medications', { id: Number(req.params.id) });
  if (!med) throw new ApiError(404, 'Medication not found.');
  if (med.patient_id !== req.user.id) throw new ApiError(403, 'Not your medication.');
  return med;
}

const updateMed = asyncHandler(async (req, res) => {
  await ownedMedication(req);
  const allowed = ['medicine_name', 'dosage', 'frequency', 'start_date', 'end_date', 'reminder_times', 'instructions', 'is_active'];
  const camelMap = { medicineName: 'medicine_name', startDate: 'start_date', endDate: 'end_date', reminderTimes: 'reminder_times', isActive: 'is_active' };
  const set = {};
  for (const [key, value] of Object.entries(req.body)) {
    const field = camelMap[key] || key;
    if (allowed.includes(field)) set[field] = field === 'is_active' ? (value ? 1 : 0) : value;
  }
  if (!Object.keys(set).length) throw new ApiError(400, 'No valid fields to update.');
  await update('medications', { id: Number(req.params.id) }, set);
  res.json({ message: 'Medication updated.' });
});

const remove = asyncHandler(async (req, res) => {
  await ownedMedication(req);
  await update('medications', { id: Number(req.params.id) }, { is_active: 0 });
  res.json({ message: 'Medication stopped.' });
});

// POST /api/medications/:id/log  { status: 'taken' | 'missed' | 'skipped', date? }
const logIntake = asyncHandler(async (req, res) => {
  const { status, date } = req.body;
  if (!['taken', 'missed', 'skipped'].includes(status)) throw new ApiError(400, 'Invalid status.');
  const med = await ownedMedication(req);

  // One log per medication per day: update it if it exists, otherwise create it.
  const filter = { medication_id: med.id, log_date: date || todayStr() };
  const stamp = { status, logged_at: new Date() };
  if (await findOne('medication_logs', filter, { select: 'id' })) await update('medication_logs', filter, stamp);
  else {
    try { await insert('medication_logs', { ...filter, ...stamp }); }
    catch (err) { if (isDuplicateKey(err)) await update('medication_logs', filter, stamp); else throw err; }
  }
  res.json({ message: 'Logged.' });
});

module.exports = { list, create, update: updateMed, remove, logIntake };
