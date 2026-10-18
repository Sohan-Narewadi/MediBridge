const { M, find, count, update, updateMany, byIds, withUsers, todayStr, shiftDate, fmtDate, contains } = require('../../database/store');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Appointment counts per user id, for the admin tables.
async function appointmentCounts(field) {
  const rows = await M.appointments.aggregate([{ $group: { _id: `$${field}`, n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

// GET /api/admin/stats - the headline numbers for the admin dashboard.
const getStats = asyncHandler(async (req, res) => {
  const today = todayStr();
  const [patients, doctors, appointments, completed, cancelled, pending, activeTodayIds, openReports] = await Promise.all([
    count('users', { role: 'patient' }),
    count('users', { role: 'doctor', is_active: 1 }),
    count('appointments'),
    count('appointments', { status: 'completed' }),
    count('appointments', { status: 'cancelled' }),
    count('appointments', { status: 'pending' }),
    M.appointments.distinct('patient_id', { appointment_date: today }),
    count('reported_issues', { status: 'open' }),
  ]);
  const recentUsers = await find('users', {}, { sort: { created_at: -1, id: -1 }, limit: 6, select: 'id full_name role email created_at' });
  const recentAppts = await find('appointments', {}, { sort: { created_at: -1, id: -1 }, limit: 6 });
  await withUsers(recentAppts, { patient_id: 'patient_name', doctor_id: 'doctor_name' });
  const recentAppointments = recentAppts.map((a) => ({ id: a.id, appointment_date: a.appointment_date, status: a.status, patient_name: a.patient_name, doctor_name: a.doctor_name }));

  res.json({
    totals: { patients, doctors, appointments, completed, cancelled, pending, activeToday: activeTodayIds.length, openReports },
    recentUsers, recentAppointments,
  });
});

// GET /api/admin/analytics - chart-ready series.
const getAnalytics = asyncHandler(async (req, res) => {
  const today = todayStr();

  // New users per month and role, last six months (months taken in local time).
  const since = new Date(); since.setMonth(since.getMonth() - 6);
  const newUsers = await find('users', { created_at: { $gte: since } }, { select: 'created_at role' });
  const monthly = new Map();
  for (const u of newUsers) {
    const month = fmtDate(u.created_at).slice(0, 7);
    const key = `${month}|${u.role}`;
    monthly.set(key, (monthly.get(key) || 0) + 1);
  }
  const growth = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, n]) => { const [month, role] = key.split('|'); return { month, role, count: n }; });

  const trendRows = await M.appointments.aggregate([
    { $match: { appointment_date: { $gte: shiftDate(today, -30) } } },
    { $group: { _id: { date: '$appointment_date', status: '$status' }, count: { $sum: 1 } } },
    { $sort: { '_id.date': 1 } },
  ]);
  const appointmentTrend = trendRows.map((t) => ({ date: t._id.date, status: t._id.status, count: t.count }));

  const [specs, perSpec, statuses] = await Promise.all([
    find('specializations'),
    M.doctors.aggregate([{ $group: { _id: '$specialization_id', n: { $sum: 1 } } }]),
    M.appointments.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const perSpecMap = new Map(perSpec.map((r) => [r._id, r.n]));
  const specializationDistribution = specs.map((s) => ({ name: s.name, doctor_count: perSpecMap.get(s.id) || 0 }))
    .sort((a, b) => b.doctor_count - a.doctor_count || a.name.localeCompare(b.name));
  const statusBreakdown = statuses.map((s) => ({ status: s._id, count: s.count }));

  res.json({ growth, appointmentTrend, specializationDistribution, statusBreakdown });
});

// ---- Patients ----
const listPatients = asyncHandler(async (req, res) => {
  const { q, page = 1, pageSize = 15 } = req.query;
  const filter = { role: 'patient' };
  if (q) filter.$or = [{ full_name: contains(q) }, { email: contains(q) }];
  const limit = Math.min(Number(pageSize) || 15, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [total, users, counts] = await Promise.all([
    count('users', filter),
    find('users', filter, { sort: { created_at: -1, id: -1 }, skip, limit, select: 'id full_name email phone is_active created_at' }),
    appointmentCounts('patient_id'),
  ]);
  const profiles = await byIds('patients', users.map((u) => u.id), 'user_id', 'user_id city blood_group');
  const patients = users.map((u) => {
    const p = profiles.get(u.id) || {};
    return { ...u, city: p.city || null, blood_group: p.blood_group || null, appointment_count: counts.get(u.id) || 0 };
  });
  res.json({ patients, total, page: Number(page), pageSize: limit });
});

// ---- Doctors (admin view, includes inactive/unverified) ----
const listDoctors = asyncHandler(async (req, res) => {
  const { q, page = 1, pageSize = 15 } = req.query;
  const limit = Math.min(Number(pageSize) || 15, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const match = q ? { $or: [{ 'u.full_name': contains(q) }, { 's.name': contains(q) }] } : {};

  const [result, counts] = await Promise.all([
    M.doctors.aggregate([
      { $lookup: { from: 'users', localField: 'user_id', foreignField: 'id', as: 'u' } },
      { $unwind: '$u' },
      { $lookup: { from: 'specializations', localField: 'specialization_id', foreignField: 'id', as: 's' } },
      { $unwind: '$s' },
      { $match: match },
      { $sort: { 'u.created_at': -1, user_id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: skip }, { $limit: limit },
            {
              $project: {
                _id: 0, id: '$u.id', full_name: '$u.full_name', email: '$u.email', is_active: '$u.is_active', created_at: '$u.created_at',
                specialization: '$s.name', experience_years: 1, consultation_fee: 1, rating_avg: 1, rating_count: 1, is_verified: 1,
              },
            },
          ],
          total: [{ $count: 'n' }],
        },
      },
    ]),
    appointmentCounts('doctor_id'),
  ]);
  const doctors = result[0].rows.map((d) => ({ ...d, appointment_count: counts.get(d.id) || 0 }));
  res.json({ doctors, total: result[0].total[0] ? result[0].total[0].n : 0, page: Number(page), pageSize: limit });
});

const verifyDoctor = asyncHandler(async (req, res) => {
  await update('doctors', { user_id: Number(req.params.id) }, { is_verified: 1 });
  res.json({ message: 'Doctor verified.' });
});

const setUserStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  await updateMany('users', { id: Number(req.params.id) }, { is_active: isActive ? 1 : 0 });
  res.json({ message: `User ${isActive ? 'activated' : 'deactivated'}.` });
});

// ---- Reported issues ----
const listReports = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const rows = await find('reported_issues', status ? { status } : {}, { sort: { created_at: -1, id: -1 } });
  const users = await byIds('users', rows.map((r) => r.reporter_id), 'id', 'id full_name role');
  res.json({
    reports: rows.map((r) => ({ ...r, reporter_name: users.get(r.reporter_id)?.full_name || null, reporter_role: users.get(r.reporter_id)?.role || null })),
  });
});

const updateReport = asyncHandler(async (req, res) => {
  const { status, adminNotes } = req.body;
  if (!['open', 'in_review', 'resolved', 'dismissed'].includes(status)) throw new ApiError(400, 'Invalid status.');
  const set = { status, admin_notes: adminNotes || null };
  if (['resolved', 'dismissed'].includes(status)) set.resolved_at = new Date();
  await update('reported_issues', { id: Number(req.params.id) }, set);
  res.json({ message: 'Report updated.' });
});

// ---- Audit log ----
const listAuditLogs = asyncHandler(async (req, res) => {
  const rows = await find('audit_logs', {}, { sort: { created_at: -1, id: -1 }, limit: 100 });
  await withUsers(rows, { user_id: 'user_name' });
  res.json({ logs: rows });
});

module.exports = {
  getStats, getAnalytics, listPatients, listDoctors, verifyDoctor, setUserStatus,
  listReports, updateReport, listAuditLogs,
};
