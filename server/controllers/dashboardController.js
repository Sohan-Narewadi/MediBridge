const { M, find, findOne, count, byIds, withUsers, todayStr, shiftDate } = require('../../database/store');
const asyncHandler = require('../utils/asyncHandler');
const { computeCareScore } = require('../utils/careScore');

// GET /api/dashboard/patient - one call that feeds the whole patient dashboard.
const patientSummary = asyncHandler(async (req, res) => {
  const patientId = req.user.id;
  const today = todayStr();

  const nextAppt = await findOne('appointments', {
    patient_id: patientId, status: { $in: ['pending', 'confirmed'] }, appointment_date: { $gte: today },
  }, { sort: { appointment_date: 1, start_time: 1 } });
  if (nextAppt) {
    await withUsers([nextAppt], { doctor_id: 'doctor_name' });
    const doc = await findOne('doctors', { user_id: nextAppt.doctor_id }, { select: 'specialization_id' });
    const spec = doc && (await findOne('specializations', { id: doc.specialization_id }));
    nextAppt.specialization = spec ? spec.name : null;
  }

  const [upcoming, completed, cancelled] = await Promise.all([
    count('appointments', { patient_id: patientId, status: { $in: ['pending', 'confirmed'] }, appointment_date: { $gte: today } }),
    count('appointments', { patient_id: patientId, status: 'completed' }),
    count('appointments', { patient_id: patientId, status: 'cancelled' }),
  ]);

  const meds = await find('medications', {
    patient_id: patientId, is_active: 1, start_date: { $lte: today }, $or: [{ end_date: null }, { end_date: { $gte: today } }],
  });
  const logs = await find('medication_logs', { medication_id: { $in: meds.map((m) => m.id) }, log_date: today }, { select: 'medication_id status' });
  const statusBy = new Map(logs.map((l) => [l.medication_id, l.status]));
  const medicationsToday = meds.map((m) => ({ ...m, today_status: statusBy.get(m.id) || null }));

  const recent = await find('medical_records', { patient_id: patientId }, { sort: { record_date: -1, id: -1 }, limit: 3 });
  await withUsers(recent, { doctor_id: 'doctor_name' });
  const recentRecords = recent.map((r) => ({ id: r.id, record_date: r.record_date, diagnosis: r.diagnosis, doctor_name: r.doctor_name }));

  const unread = await count('notifications', { user_id: patientId, is_read: 0 });
  const careScore = await computeCareScore(patientId);

  res.json({
    nextAppointment: nextAppt || null, counts: { upcoming, completed, cancelled }, medicationsToday, recentRecords,
    unreadNotifications: unread, careScore,
  });
});

// GET /api/dashboard/doctor - one call that feeds the whole doctor dashboard.
const doctorSummary = asyncHandler(async (req, res) => {
  const doctorId = req.user.id;
  const today = todayStr();

  const todayAppointments = await find('appointments', { doctor_id: doctorId, appointment_date: today, status: { $ne: 'cancelled' } }, { sort: { start_time: 1 } });
  const upcomingAppointments = await find('appointments', {
    doctor_id: doctorId, appointment_date: { $gt: today }, status: { $in: ['pending', 'confirmed'] },
  }, { sort: { appointment_date: 1, start_time: 1 }, limit: 8 });
  await withUsers(todayAppointments, { patient_id: 'patient_name' });
  await withUsers(upcomingAppointments, { patient_id: 'patient_name' });

  const [byStatus, distinctPatients] = await Promise.all([
    M.appointments.aggregate([{ $match: { doctor_id: doctorId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    M.appointments.distinct('patient_id', { doctor_id: doctorId }),
  ]);
  const n = (status) => (byStatus.find((s) => s._id === status) || { n: 0 }).n;
  const counts = { total_patients: distinctPatients.length, completed: n('completed'), cancelled: n('cancelled'), pending: n('pending') };

  const trendRows = await M.appointments.aggregate([
    { $match: { doctor_id: doctorId, appointment_date: { $gte: shiftDate(today, -14) } } },
    { $group: { _id: '$appointment_date', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const trend = trendRows.map((t) => ({ date: t._id, count: t.count }));

  const consults = await find('medical_records', { doctor_id: doctorId }, { sort: { record_date: -1, id: -1 }, limit: 5 });
  await withUsers(consults, { patient_id: 'patient_name' });
  const recentConsultations = consults.map((r) => ({ id: r.id, record_date: r.record_date, diagnosis: r.diagnosis, patient_name: r.patient_name }));

  const unread = await count('notifications', { user_id: doctorId, is_read: 0 });
  res.json({ todayAppointments, upcomingAppointments, counts, trend, recentConsultations, unreadNotifications: unread });
});

module.exports = { patientSummary, doctorSummary };
