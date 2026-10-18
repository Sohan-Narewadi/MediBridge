const { find, findOne, insert, insertMany, update, exists, byIds, withUsers, todayStr } = require('../../database/store');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Confirms a doctor has ever had a (non-cancelled) appointment with a given
// patient - the access-control rule for any patient data a doctor requests
// outside their own authored records.
function doctorHasRelationship(doctorId, patientId) {
  return exists('appointments', { doctor_id: Number(doctorId), patient_id: Number(patientId), status: { $ne: 'cancelled' } });
}

// Adds patient_name, doctor_name and the doctor's specialization to records.
async function decorate(rows) {
  await withUsers(rows, { patient_id: 'patient_name', doctor_id: 'doctor_name' });
  const doctors = await byIds('doctors', rows.map((r) => r.doctor_id), 'user_id', 'user_id specialization_id');
  const specs = await byIds('specializations', [...doctors.values()].map((d) => d.specialization_id));
  for (const r of rows) {
    const d = doctors.get(r.doctor_id);
    r.specialization = d && specs.get(d.specialization_id) ? specs.get(d.specialization_id).name : null;
  }
  return rows;
}

const list = asyncHandler(async (req, res) => {
  const { patientId } = req.query;
  const filter = {};

  if (req.user.role === 'patient') {
    filter.patient_id = req.user.id;
  } else if (req.user.role === 'doctor') {
    if (patientId && Number(patientId) !== req.user.id) {
      if (!(await doctorHasRelationship(req.user.id, patientId))) {
        throw new ApiError(403, "You can only view records for patients you've had an appointment with.");
      }
      filter.patient_id = Number(patientId);
    } else {
      filter.doctor_id = req.user.id;
    }
  } else if (patientId) {
    filter.patient_id = Number(patientId);
  }

  const rows = await find('medical_records', filter, { sort: { record_date: -1, id: -1 } });
  res.json({ records: await decorate(rows) });
});

const getById = asyncHandler(async (req, res) => {
  const found = await findOne('medical_records', { id: Number(req.params.id) });
  if (!found) throw new ApiError(404, 'Medical record not found.');
  const [record] = await decorate([found]);

  if (req.user.role === 'patient' && record.patient_id !== req.user.id) throw new ApiError(403, 'Not your record.');
  if (req.user.role === 'doctor' && record.doctor_id !== req.user.id && !(await doctorHasRelationship(req.user.id, record.patient_id))) {
    throw new ApiError(403, 'You do not have access to this record.');
  }

  const prescriptions = await find('prescriptions', { medical_record_id: record.id }, { sort: { id: 1 } });
  res.json({ record, prescriptions });
});

// POST /api/medical-records - doctor documents a consultation, optionally
// attached to an appointment (which it then marks completed), with a
// prescriptions[] array written alongside it. All checks happen before the
// first write; writes then go parent-first (record, prescriptions,
// appointment, notification) so a failure never leaves a child without its parent.
const create = asyncHandler(async (req, res) => {
  const { appointmentId, patientId, diagnosis, consultationSummary, vitalsBp, vitalsPulse, vitalsTemp, followUpDate, followUpNotes, prescriptions = [] } = req.body;
  if (!patientId || !diagnosis) throw new ApiError(400, 'patientId and diagnosis are required.');

  if (appointmentId) {
    const appt = await findOne('appointments', { id: Number(appointmentId) });
    if (!appt) throw new ApiError(404, 'Appointment not found.');
    if (appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  } else if (!(await doctorHasRelationship(req.user.id, patientId))) {
    throw new ApiError(403, "You can only add records for patients you've had an appointment with.");
  }

  const record = await insert('medical_records', {
    appointment_id: appointmentId ? Number(appointmentId) : null, patient_id: Number(patientId), doctor_id: req.user.id,
    record_date: todayStr(), diagnosis, consultation_summary: consultationSummary || null, vitals_bp: vitalsBp || null,
    vitals_pulse: vitalsPulse || null, vitals_temp: vitalsTemp || null, follow_up_date: followUpDate || null, follow_up_notes: followUpNotes || null,
  });

  await insertMany('prescriptions', prescriptions.map((p) => ({
    medical_record_id: record.id, medicine_name: p.medicineName, dosage: p.dosage, frequency: p.frequency,
    duration_days: p.durationDays || null, instructions: p.instructions || null,
  })));
  if (appointmentId) await update('appointments', { id: Number(appointmentId) }, { status: 'completed', updated_at: new Date() });
  await insert('notifications', {
    user_id: Number(patientId), type: 'record', title: 'New medical record added',
    message: 'Your doctor has added notes and a prescription from your recent visit.', related_type: 'medical_record', related_id: record.id,
  });
  res.status(201).json({ id: record.id });
});

module.exports = { list, getById, create };
