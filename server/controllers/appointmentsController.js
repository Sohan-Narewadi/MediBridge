const { M, find, findOne, insert, update, byIds, withUsers, isDuplicateKey } = require('../../database/store');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildAvailableSlots } = require('../utils/slots');
const { notify } = require('../utils/notify');

// Resolves a free slot or throws. The unique index on
// (doctor_id, appointment_date, start_time) is the final guard against a race.
async function assertSlotIsFree(doctorId, date, startTime, excludeAppointmentId) {
  const target = new Date(`${date}T00:00:00`);
  const dayOfWeek = target.getDay();

  const availabilityRows = await find('doctor_availability', { doctor_id: doctorId, day_of_week: dayOfWeek, is_active: 1 });
  const booked = await find('appointments', {
    doctor_id: doctorId, appointment_date: date, status: { $ne: 'cancelled' }, id: { $ne: excludeAppointmentId || 0 },
  }, { select: 'start_time' });
  const freeSlots = buildAvailableSlots(availabilityRows, booked, target, new Date());
  const match = freeSlots.find((s) => s.startTime === startTime);
  if (!match) throw new ApiError(409, 'That time slot is no longer available. Please choose another.');
  return match;
}

// Adds patient_name, doctor_name and specialization to appointment rows.
async function decorate(rows) {
  await withUsers(rows, { patient_id: 'patient_name', doctor_id: 'doctor_name' });
  const doctors = await byIds('doctors', rows.map((a) => a.doctor_id), 'user_id', 'user_id specialization_id');
  const specs = await byIds('specializations', [...doctors.values()].map((d) => d.specialization_id));
  for (const a of rows) {
    const d = doctors.get(a.doctor_id);
    a.specialization = d && specs.get(d.specialization_id) ? specs.get(d.specialization_id).name : null;
  }
  return rows;
}

// GET /api/appointments - scoped to the caller's role, with optional filters.
const list = asyncHandler(async (req, res) => {
  const { status, from, to, doctorId, patientId } = req.query;
  const filter = {};

  if (req.user.role === 'patient') filter.patient_id = req.user.id;
  else if (req.user.role === 'doctor') filter.doctor_id = req.user.id;
  else {
    if (doctorId) filter.doctor_id = Number(doctorId);
    if (patientId) filter.patient_id = Number(patientId);
  }
  if (status) filter.status = status;
  if (from || to) filter.appointment_date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

  const rows = await find('appointments', filter, { sort: { appointment_date: -1, start_time: -1 } });
  res.json({ appointments: await decorate(rows) });
});

const getById = asyncHandler(async (req, res) => {
  const appt = await findOne('appointments', { id: Number(req.params.id) });
  if (!appt) throw new ApiError(404, 'Appointment not found.');
  if (req.user.role === 'patient' && appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  const [decorated] = await decorate([appt]);
  res.json({ appointment: decorated });
});

// POST /api/appointments - patient books; doctor/admin can book on a patient's behalf.
const create = asyncHandler(async (req, res) => {
  const { doctorId, patientId, date, startTime, reason, consultationMode } = req.body;
  if (!doctorId || !date || !startTime) throw new ApiError(400, 'doctorId, date and startTime are required.');

  const effectivePatientId = req.user.role === 'patient' ? req.user.id : Number(patientId);
  if (!effectivePatientId) throw new ApiError(400, 'patientId is required.');

  const slot = await assertSlotIsFree(Number(doctorId), date, startTime);
  let created;
  try {
    created = await insert('appointments', {
      patient_id: effectivePatientId, doctor_id: Number(doctorId), appointment_date: date, start_time: slot.startTime,
      end_time: slot.endTime, consultation_mode: consultationMode || 'in_person', status: 'pending', reason: reason || null,
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw new ApiError(409, 'That time slot is no longer available. Please choose another.');
    throw err;
  }
  await notify(Number(doctorId), 'appointment', 'New appointment request', `A new appointment request has been booked for ${date} at ${slot.startTime.slice(0, 5)}.`, 'appointment', created.id);
  res.status(201).json({ id: created.id, message: 'Appointment requested. You will be notified once the doctor confirms.' });
});

// PATCH /api/appointments/:id/status - role-gated status transitions.
const ALLOWED_TRANSITIONS = {
  doctor: { pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'] },
  patient: { pending: ['cancelled'], confirmed: ['cancelled'] },
  admin: { pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'], completed: [], cancelled: [] },
};
const updateStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  const appt = await findOne('appointments', { id: Number(req.params.id) });
  if (!appt) throw new ApiError(404, 'Appointment not found.');

  if (req.user.role === 'patient' && appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');

  const allowedNext = (ALLOWED_TRANSITIONS[req.user.role] || {})[appt.status] || [];
  if (!allowedNext.includes(status)) {
    throw new ApiError(400, `Cannot move an appointment from "${appt.status}" to "${status}".`);
  }

  // Conditional on the status we just read, so two clicks cannot both succeed.
  const result = await M.appointments.updateOne({ id: appt.id, status: appt.status }, {
    $set: {
      status,
      cancelled_by: status === 'cancelled' ? req.user.role : appt.cancelled_by,
      cancellation_reason: status === 'cancelled' ? (reason || null) : appt.cancellation_reason,
      updated_at: new Date(),
    },
  });
  if (!result.modifiedCount) throw new ApiError(409, 'This appointment was just updated by someone else. Please refresh.');

  const notifyUserId = req.user.role === 'patient' ? appt.doctor_id : appt.patient_id;
  const verb = { confirmed: 'confirmed', cancelled: 'cancelled', completed: 'marked completed' }[status] || status;
  await notify(notifyUserId, 'appointment', `Appointment ${verb}`, `Your appointment on ${appt.appointment_date} has been ${verb}.`, 'appointment', appt.id);

  res.json({ message: `Appointment ${verb}.` });
});

// PATCH /api/appointments/:id/reschedule
const reschedule = asyncHandler(async (req, res) => {
  const { date, startTime } = req.body;
  const appt = await findOne('appointments', { id: Number(req.params.id) });
  if (!appt) throw new ApiError(404, 'Appointment not found.');

  if (req.user.role === 'patient' && appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (!['pending', 'confirmed'].includes(appt.status)) throw new ApiError(400, 'Only pending or confirmed appointments can be rescheduled.');

  const slot = await assertSlotIsFree(appt.doctor_id, date, startTime, appt.id);
  try {
    await update('appointments', { id: appt.id }, { appointment_date: date, start_time: slot.startTime, end_time: slot.endTime, status: 'pending', updated_at: new Date() });
  } catch (err) {
    if (isDuplicateKey(err)) throw new ApiError(409, 'That time slot is no longer available. Please choose another.');
    throw err;
  }
  const notifyUserId = req.user.role === 'patient' ? appt.doctor_id : appt.patient_id;
  await notify(notifyUserId, 'appointment', 'Appointment rescheduled', `An appointment has been rescheduled to ${date} at ${slot.startTime.slice(0, 5)}.`, 'appointment', appt.id);
  res.json({ message: 'Appointment rescheduled. Awaiting confirmation.' });
});

// GET /api/appointments/my-patients - doctor's own patient roster, derived
// from appointment history, with just enough clinical context to be useful
// (allergies/conditions) without exposing unrelated patients' data.
const listMyPatients = asyncHandler(async (req, res) => {
  const grouped = await M.appointments.aggregate([
    { $match: { doctor_id: req.user.id } },
    {
      $group: {
        _id: '$patient_id',
        appointment_count: { $sum: 1 },
        last_visit: { $max: '$appointment_date' },
        completed_count: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      },
    },
    { $sort: { last_visit: -1 } },
  ]);
  const ids = grouped.map((g) => g._id);
  const users = await byIds('users', ids, 'id', 'id full_name phone');
  const profiles = await byIds('patients', ids, 'user_id', 'user_id blood_group allergies chronic_conditions');
  const patients = grouped.filter((g) => profiles.has(g._id) && users.has(g._id)).map((g) => {
    const u = users.get(g._id);
    const p = profiles.get(g._id);
    return {
      id: u.id, full_name: u.full_name, phone: u.phone, blood_group: p.blood_group, allergies: p.allergies,
      chronic_conditions: p.chronic_conditions, appointment_count: g.appointment_count, last_visit: g.last_visit, completed_count: g.completed_count,
    };
  });
  res.json({ patients });
});

module.exports = { list, getById, create, updateStatus, reschedule, listMyPatients };
