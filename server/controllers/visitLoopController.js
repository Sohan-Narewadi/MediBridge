const {
  M, find, findOne, insert, insertMany, update, count, exists, byIds, withUsers,
  todayStr, shiftDate, daysBetween, fmtDate,
} = require('../../database/store');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { computeCareScore } = require('../utils/careScore');
const { notify, audit } = require('../utils/notify');

// Smart Brief + Visit Loop.
//
// "Enter once, reuse everywhere": the patient answers a short pre-visit intake
// (only the visit-specific questions - everything else comes from their
// profile and history), and the doctor gets one auto-compiled brief before the
// visit. After the visit the doctor writes a plain-language care plan with
// commitments that patient, doctor and admin all track until the loop closes.

// A doctor has a care relationship with a patient they've seen (non-cancelled
// appointment) or are attending as an inpatient.
async function doctorHasRelationship(doctorId, patientId) {
  const d = Number(doctorId);
  const p = Number(patientId);
  return (await exists('appointments', { doctor_id: d, patient_id: p, status: { $ne: 'cancelled' } }))
    || (await exists('admissions', { doctor_id: d, patient_id: p }));
}

// Appointment plus the doctor's name and specialization.
async function getAppointment(id) {
  const appt = await findOne('appointments', { id: Number(id) });
  if (!appt) throw new ApiError(404, 'Appointment not found.');
  await withUsers([appt], { doctor_id: 'doctor_name' });
  const doc = await findOne('doctors', { user_id: appt.doctor_id }, { select: 'specialization_id' });
  const spec = doc && (await findOne('specializations', { id: doc.specialization_id }));
  appt.specialization = spec ? spec.name : null;
  return appt;
}

// Overdue = open, has a due date, and the date is before today. Null dates never count.
const isOverdue = (c, today) => c.status === 'open' && !!c.due_date && c.due_date < today;
// SQL-style ordering for commitments: dated items first (soonest first), undated last.
const byDueDate = (a, b) => (a.due_date === null) - (b.due_date === null) || String(a.due_date).localeCompare(String(b.due_date));

async function patientMedIds(patientId) {
  return (await find('medications', { patient_id: patientId }, { select: 'id' })).map((m) => m.id);
}

// Computes the brief's warning flags from real data, ordered by severity.
// Shared by the full brief and the doctor's "today" list.
async function buildFlags(patientId, doctorId, intake, patient) {
  const today = todayStr();
  const flags = [];

  if (patient && patient.allergies) {
    flags.push({ level: 'danger', text: `Allergy: ${patient.allergies}` });
  }
  if (intake && intake.new_allergies) {
    flags.push({ level: 'danger', text: `New allergy reported in intake: ${intake.new_allergies}` });
  }
  if (intake && intake.severity >= 4) {
    flags.push({ level: 'danger', text: `Patient-reported severity ${intake.severity}/5` });
  }

  const missed = await count('medication_logs', {
    medication_id: { $in: await patientMedIds(patientId) }, status: 'missed', log_date: { $gte: shiftDate(today, -7) },
  });
  if (missed >= 2) {
    flags.push({ level: missed >= 4 ? 'danger' : 'warning', text: `Missed ${missed} doses in last 7 days` });
  }

  // Latest follow-up date that has passed without a later completed visit with the same doctor.
  const pastDue = await find('medical_records', { patient_id: patientId, follow_up_date: { $ne: null, $lt: today } }, { sort: { follow_up_date: -1 } });
  if (pastDue.length) {
    const visits = await find('appointments', { patient_id: patientId, status: 'completed' }, { select: 'doctor_id appointment_date' });
    const open = pastDue.find((r) => !visits.some((a) => a.doctor_id === r.doctor_id && a.appointment_date >= r.follow_up_date));
    if (open) flags.push({ level: 'warning', text: `Follow-up overdue by ${daysBetween(open.follow_up_date, today)} days` });
  }

  const overdueCommitments = await count('commitments', { patient_id: patientId, status: 'open', due_date: { $lt: today } });
  if (overdueCommitments > 0) {
    flags.push({ level: 'warning', text: `${overdueCommitments} care-plan item${overdueCommitments > 1 ? 's' : ''} overdue` });
  }

  const monthAgo = new Date(Date.now() - 30 * 86400000);
  const stay = await findOne('admissions', {
    patient_id: patientId, $or: [{ status: { $in: ['admitted', 'cleared'] } }, { discharged_at: { $gte: monthAgo } }],
  }, { sort: { admitted_at: -1 } });
  if (stay) {
    const days = daysBetween(fmtDate(stay.discharged_at || stay.admitted_at), today);
    flags.push({
      level: 'info',
      text: stay.status === 'discharged' ? `Discharged from hospital ${days} days ago` : 'Currently admitted in hospital',
    });
  }

  if (intake && intake.medication_changes) {
    flags.push({ level: 'info', text: `Medication change reported: ${intake.medication_changes}` });
  }

  const seen = await count('appointments', { patient_id: patientId, doctor_id: doctorId, status: 'completed' });
  if (seen === 0) flags.push({ level: 'info', text: 'First visit with you' });
  if (!intake) flags.push({ level: 'info', text: 'No pre-visit intake submitted' });

  const rank = { danger: 0, warning: 1, info: 2 };
  return flags.sort((a, b) => rank[a.level] - rank[b.level]);
}

// ---------------------------------------------------------------------------
// Intake (patient, before the visit)
// ---------------------------------------------------------------------------

// POST /api/visit-loop/intake - create or update the pre-visit intake.
const saveIntake = asyncHandler(async (req, res) => {
  const { appointmentId, chiefComplaint, symptoms = [], symptomDuration, severity, medicationChanges, newAllergies, questionsForDoctor } = req.body;
  const appt = await getAppointment(appointmentId);
  if (appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (!['pending', 'confirmed'].includes(appt.status)) {
    throw new ApiError(400, 'Pre-visit information can only be added to an upcoming appointment.');
  }

  const symptomList = Array.isArray(symptoms) ? symptoms.map((s) => String(s).trim()).filter(Boolean).join(',') : String(symptoms || '');
  const fields = {
    chief_complaint: chiefComplaint, symptoms: symptomList.slice(0, 255) || null, symptom_duration: symptomDuration || null,
    severity: severity || null, medication_changes: medicationChanges || null, new_allergies: newAllergies || null,
    questions_for_doctor: questionsForDoctor || null,
  };
  const existing = await findOne('intake_forms', { appointment_id: appt.id }, { select: 'id' });
  if (existing) await update('intake_forms', { appointment_id: appt.id }, fields);
  else await insert('intake_forms', { appointment_id: appt.id, patient_id: req.user.id, ...fields });

  if (!existing) {
    await notify(appt.doctor_id, 'intake', 'Pre-visit info received',
      `Your patient shared their reason for the ${appt.appointment_date} visit. The Smart Brief is ready.`, 'appointment', appt.id);
  }
  await audit(req.user.id, existing ? 'intake.updated' : 'intake.submitted', 'appointment', appt.id,
    `Pre-visit intake for appointment on ${appt.appointment_date}`);
  res.status(existing ? 200 : 201).json({ message: 'Thanks - your doctor will see this before your visit.' });
});

// GET /api/visit-loop/intake/:appointmentId
const getIntake = asyncHandler(async (req, res) => {
  const appt = await getAppointment(req.params.appointmentId);
  if (req.user.role === 'patient' && appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (req.user.role === 'staff') throw new ApiError(403, 'You do not have permission to perform this action.');
  res.json({ intake: (await findOne('intake_forms', { appointment_id: appt.id })) || null });
});

// GET /api/visit-loop/pending-intakes - upcoming visits still missing an intake.
const pendingIntakes = asyncHandler(async (req, res) => {
  const appts = await find('appointments', {
    patient_id: req.user.id, status: { $in: ['pending', 'confirmed'] }, appointment_date: { $gte: todayStr() },
  }, { sort: { appointment_date: 1, start_time: 1 } });
  const done = new Set((await find('intake_forms', { appointment_id: { $in: appts.map((a) => a.id) } }, { select: 'appointment_id' })).map((i) => i.appointment_id));
  const open = appts.filter((a) => !done.has(a.id));
  await withUsers(open, { doctor_id: 'doctor_name' });
  const doctors = await byIds('doctors', open.map((a) => a.doctor_id), 'user_id', 'user_id specialization_id');
  const specs = await byIds('specializations', [...doctors.values()].map((d) => d.specialization_id));
  res.json({
    appointments: open.map((a) => {
      const d = doctors.get(a.doctor_id);
      return {
        id: a.id, appointment_date: a.appointment_date, start_time: a.start_time, doctor_name: a.doctor_name,
        specialization: d && specs.get(d.specialization_id) ? specs.get(d.specialization_id).name : null,
      };
    }),
  });
});

// GET /api/visit-loop/intake-status - ids of the caller's appointments that already have an intake
// (used to show "Intake sent" / "Intake received" badges on appointment lists).
const intakeStatus = asyncHandler(async (req, res) => {
  const field = req.user.role === 'doctor' ? 'doctor_id' : 'patient_id';
  const appts = await find('appointments', { [field]: req.user.id }, { select: 'id' });
  const forms = await find('intake_forms', { appointment_id: { $in: appts.map((a) => a.id) } }, { select: 'appointment_id' });
  res.json({ appointmentIds: forms.map((f) => f.appointment_id) });
});

// ---------------------------------------------------------------------------
// Smart Brief (doctor, before the visit)
// ---------------------------------------------------------------------------

function ageFrom(dob) {
  if (!dob) return null;
  const [y, m, d] = String(dob).slice(0, 10).split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

// GET /api/visit-loop/brief/:appointmentId - everything the doctor needs, compiled.
const getBrief = asyncHandler(async (req, res) => {
  const appt = await getAppointment(req.params.appointmentId);
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  const patientId = appt.patient_id;
  const today = todayStr();

  const user = await findOne('users', { id: patientId }, { select: 'id full_name phone' });
  const p = await findOne('patients', { user_id: patientId });
  const patient = {
    id: user.id, full_name: user.full_name, phone: user.phone, gender: p.gender, blood_group: p.blood_group, height_cm: p.height_cm,
    weight_kg: p.weight_kg, city: p.city, allergies: p.allergies, chronic_conditions: p.chronic_conditions,
    emergency_contact_name: p.emergency_contact_name, emergency_contact_phone: p.emergency_contact_phone, age: ageFrom(p.date_of_birth),
  };
  const h = Number(patient.height_cm);
  const w = Number(patient.weight_kg);
  patient.bmi = h > 0 && w > 0 ? Math.round((w / ((h / 100) ** 2)) * 10) / 10 : null;

  const intake = (await findOne('intake_forms', { appointment_id: appt.id })) || null;

  const medIds = await patientMedIds(patientId);
  const logs30 = await find('medication_logs', { medication_id: { $in: medIds }, log_date: { $gte: shiftDate(today, -30) } }, { select: 'medication_id log_date status' });
  const weekStart = shiftDate(today, -7);
  const activeMeds = await find('medications', {
    patient_id: patientId, is_active: 1, $or: [{ end_date: null }, { end_date: { $gte: today } }],
  }, { sort: { start_date: -1 } });
  const medications = activeMeds.map((m) => {
    const week = logs30.filter((l) => l.medication_id === m.id && l.log_date >= weekStart);
    return {
      id: m.id, name: m.medicine_name, dosage: m.dosage, frequency: m.frequency,
      adherence_pct_7d: week.length ? Math.round((100 * week.filter((l) => l.status === 'taken').length) / week.length) : null,
    };
  });

  const taken30 = logs30.filter((l) => l.status === 'taken').length;
  const adherence = {
    pct30: logs30.length ? Math.round((100 * taken30) / logs30.length) : null,
    missedLast7: logs30.filter((l) => l.status === 'missed' && l.log_date >= weekStart).length,
  };

  const recent = await find('medical_records', { patient_id: patientId }, { sort: { record_date: -1, id: -1 }, limit: 5 });
  await withUsers(recent, { doctor_id: 'doctor_name' });
  const recentRecords = recent.map((r) => ({
    id: r.id, record_date: r.record_date, diagnosis: r.diagnosis, follow_up_date: r.follow_up_date, vitals_bp: r.vitals_bp,
    vitals_pulse: r.vitals_pulse, doctor_name: r.doctor_name,
  }));

  const openCommitments = (await find('commitments', { patient_id: patientId, status: 'open' })).sort(byDueDate)
    .map((c) => ({ title: c.title, kind: c.kind, due_date: c.due_date, overdue: isOverdue(c, today) }));

  const completedVisits = await find('appointments', { patient_id: patientId, status: 'completed' }, { select: 'doctor_id appointment_date' });
  const visitHistory = {
    total: completedVisits.length,
    withThisDoctor: completedVisits.filter((a) => a.doctor_id === appt.doctor_id).length,
    lastVisit: completedVisits.length ? completedVisits.map((a) => a.appointment_date).sort().pop() : null,
  };

  const flags = await buildFlags(patientId, appt.doctor_id, intake, patient);
  const careScore = await computeCareScore(patientId);

  await audit(req.user.id, 'brief.viewed', 'appointment', appt.id, `Smart Brief opened for ${patient.full_name}`);

  res.json({
    appointment: {
      id: appt.id, appointment_date: appt.appointment_date, start_time: appt.start_time,
      consultation_mode: appt.consultation_mode, status: appt.status, reason: appt.reason,
    },
    patient, intake, medications, adherence, recentRecords, openCommitments, visitHistory, flags, careScore,
  });
});

// GET /api/visit-loop/briefs/today - the doctor's next ~3 days of visits with brief readiness.
const briefsToday = asyncHandler(async (req, res) => {
  const today = todayStr();
  const appts = await find('appointments', {
    doctor_id: req.user.id, status: { $ne: 'cancelled' }, appointment_date: { $gte: today, $lte: shiftDate(today, 6) },
  }, { sort: { appointment_date: 1, start_time: 1 } });
  await withUsers(appts, { patient_id: 'patient_name' });
  const profiles = await byIds('patients', appts.map((a) => a.patient_id), 'user_id', 'user_id allergies');
  const intakes = await byIds('intake_forms', appts.map((a) => a.id), 'appointment_id');

  const items = [];
  for (const a of appts) {
    const intake = intakes.get(a.id) || null;
    const flags = await buildFlags(a.patient_id, req.user.id, intake, { allergies: profiles.get(a.patient_id)?.allergies || null });
    items.push({
      appointment_id: a.id,
      patient_id: a.patient_id,
      patient_name: a.patient_name,
      appointment_date: a.appointment_date,
      start_time: a.start_time,
      intake_done: !!intake,
      flag_count: flags.filter((f) => f.level !== 'info').length,
      top_flag: flags[0] || null,
    });
  }
  res.json({ items });
});

// ---------------------------------------------------------------------------
// Care plans + commitments (after the visit)
// ---------------------------------------------------------------------------

const KINDS = ['follow_up', 'test', 'medication', 'lifestyle', 'other'];
const OWNERS = ['patient', 'doctor', 'hospital'];

// POST /api/visit-loop/care-plans - doctor writes a plain-language plan + commitments.
const createCarePlan = asyncHandler(async (req, res) => {
  const { patientId, medicalRecordId, admissionId, plainSummary, commitments = [] } = req.body;

  if (medicalRecordId) {
    const rec = await findOne('medical_records', { id: Number(medicalRecordId) }, { select: 'doctor_id patient_id' });
    if (!rec) throw new ApiError(404, 'Medical record not found.');
    if (rec.doctor_id !== req.user.id || rec.patient_id !== Number(patientId)) {
      throw new ApiError(403, 'That medical record is not yours for this patient.');
    }
  } else if (admissionId) {
    const adm = await findOne('admissions', { id: Number(admissionId) }, { select: 'doctor_id patient_id' });
    if (!adm) throw new ApiError(404, 'Admission not found.');
    if (adm.doctor_id !== req.user.id || adm.patient_id !== Number(patientId)) {
      throw new ApiError(403, 'You are not the attending doctor for this admission.');
    }
  } else if (!(await doctorHasRelationship(req.user.id, patientId))) {
    throw new ApiError(403, "You can only write care plans for patients you've had an appointment with.");
  }

  const items = commitments
    .filter((c) => c && String(c.title || '').trim())
    .map((c) => ({
      title: String(c.title).trim().slice(0, 200),
      kind: KINDS.includes(c.kind) ? c.kind : 'other',
      ownerRole: OWNERS.includes(c.ownerRole) ? c.ownerRole : 'patient',
      dueDate: c.dueDate || null,
    }));

  const plan = await insert('care_plans', {
    patient_id: Number(patientId), doctor_id: req.user.id, medical_record_id: medicalRecordId ? Number(medicalRecordId) : null,
    admission_id: admissionId ? Number(admissionId) : null, plain_summary: plainSummary,
  });
  await insertMany('commitments', items.map((c) => ({
    care_plan_id: plan.id, patient_id: Number(patientId), owner_role: c.ownerRole, kind: c.kind, title: c.title, due_date: c.dueDate,
  })));
  await notify(Number(patientId), 'care_plan', 'Your care plan is ready',
    `Your doctor shared a plain-language plan${items.length ? ` with ${items.length} next step${items.length > 1 ? 's' : ''}` : ''}.`, 'care_plan', plan.id);
  await audit(req.user.id, 'care_plan.created', 'care_plan', plan.id, `Care plan with ${items.length} commitments`);
  res.status(201).json({ id: plan.id });
});

async function attachCommitments(plans) {
  if (!plans.length) return plans;
  const today = todayStr();
  const rows = await find('commitments', { care_plan_id: { $in: plans.map((p) => p.id) } });
  rows.sort(byDueDate);
  for (const p of plans) {
    p.commitments = rows.filter((r) => r.care_plan_id === p.id).map((r) => ({
      id: r.id, care_plan_id: r.care_plan_id, title: r.title, kind: r.kind, owner_role: r.owner_role, due_date: r.due_date,
      status: r.status, completed_at: r.completed_at, overdue: isOverdue(r, today),
    }));
  }
  return plans;
}

// GET /api/visit-loop/care-plans - patient: own; doctor: ?patientId= (or own authored); admin: ?patientId=.
const listCarePlans = asyncHandler(async (req, res) => {
  const { patientId } = req.query;
  const filter = {};
  if (req.user.role === 'patient') {
    filter.patient_id = req.user.id;
  } else if (req.user.role === 'doctor') {
    if (patientId) {
      if (!(await doctorHasRelationship(req.user.id, patientId))) {
        throw new ApiError(403, "You can only view care plans for patients you've had an appointment with.");
      }
      filter.patient_id = Number(patientId);
    } else {
      filter.doctor_id = req.user.id;
    }
  } else if (patientId) {
    filter.patient_id = Number(patientId);
  }

  const rows = await find('care_plans', filter, { sort: { created_at: -1, id: -1 }, limit: 50 });
  await withUsers(rows, { doctor_id: 'doctor_name', patient_id: 'patient_name' });
  const records = await byIds('medical_records', rows.map((p) => p.medical_record_id), 'id', 'id diagnosis');
  const plans = rows.map((cp) => ({
    id: cp.id, patient_id: cp.patient_id, doctor_id: cp.doctor_id, medical_record_id: cp.medical_record_id, admission_id: cp.admission_id,
    plain_summary: cp.plain_summary, created_at: cp.created_at, doctor_name: cp.doctor_name, patient_name: cp.patient_name,
    diagnosis: records.get(cp.medical_record_id)?.diagnosis || null,
  }));
  res.json({ plans: await attachCommitments(plans) });
});

// GET /api/visit-loop/commitments - the patient's checklist, grouped.
const listCommitments = asyncHandler(async (req, res) => {
  let patientId = req.user.id;
  if (req.user.role !== 'patient') {
    patientId = Number(req.query.patientId);
    if (!patientId) throw new ApiError(400, 'patientId is required.');
    if (req.user.role === 'doctor' && !(await doctorHasRelationship(req.user.id, patientId))) {
      throw new ApiError(403, "You can only view commitments for patients you've had an appointment with.");
    }
  }
  const rows = (await find('commitments', { patient_id: patientId })).sort(byDueDate);
  const plans = await byIds('care_plans', rows.map((c) => c.care_plan_id), 'id', 'id doctor_id');
  const doctors = await byIds('users', [...plans.values()].map((p) => p.doctor_id), 'id', 'id full_name');
  const shaped = rows.map((c) => ({
    id: c.id, title: c.title, kind: c.kind, owner_role: c.owner_role, due_date: c.due_date, status: c.status,
    completed_at: c.completed_at, care_plan_id: c.care_plan_id,
    doctor_name: doctors.get(plans.get(c.care_plan_id)?.doctor_id)?.full_name || null,
  }));

  const today = todayStr();
  const open = [];
  const overdue = [];
  const done = [];
  for (const r of shaped) {
    if (r.status !== 'open') done.push(r);
    else if (r.due_date && r.due_date < today) overdue.push(r);
    else open.push(r);
  }
  done.sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
  res.json({ open, overdue, done });
});

// PATCH /api/visit-loop/commitments/:id - check off / reopen / skip.
const updateCommitment = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const c = await findOne('commitments', { id: Number(req.params.id) });
  if (!c) throw new ApiError(404, 'Commitment not found.');
  const plan = await findOne('care_plans', { id: c.care_plan_id }, { select: 'doctor_id' });

  const isPatientOwner = req.user.role === 'patient' && c.patient_id === req.user.id;
  const isDoctorOwner = req.user.role === 'doctor' && plan && plan.doctor_id === req.user.id && c.owner_role === 'doctor';
  if (!isPatientOwner && !isDoctorOwner && req.user.role !== 'admin') {
    throw new ApiError(403, 'You cannot update this item.');
  }

  await update('commitments', { id: c.id }, { status, completed_at: status === 'open' ? null : new Date() });
  if (status === 'done' && req.user.role === 'patient' && plan) {
    await notify(plan.doctor_id, 'care_plan', 'Care-plan step completed', `Your patient marked "${c.title}" as done.`, 'commitment', c.id);
  }
  await audit(req.user.id, `commitment.${status}`, 'commitment', c.id, c.title);
  res.json({ message: status === 'done' ? 'Marked as done.' : status === 'skipped' ? 'Marked as skipped.' : 'Reopened.' });
});

// GET /api/visit-loop/analytics - admin view of where care loops are breaking.
const analytics = asyncHandler(async (req, res) => {
  const today = todayStr();
  const all = await find('commitments');
  const openCount = all.filter((c) => c.status === 'open').length;
  const overdueRows = all.filter((c) => isOverdue(c, today));
  const done = all.filter((c) => c.status === 'done').length;
  const skipped = all.filter((c) => c.status === 'skipped').length;
  const settled = done + skipped + overdueRows.length;

  const kinds = new Map();
  for (const c of overdueRows) kinds.set(c.kind, (kinds.get(c.kind) || 0) + 1);
  const overdueByKind = [...kinds.entries()].map(([kind, n]) => ({ kind, count: n })).sort((a, b) => b.count - a.count);

  const top = [...overdueRows].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 10);
  const plans = await byIds('care_plans', top.map((c) => c.care_plan_id), 'id', 'id doctor_id');
  const names = await byIds('users', [...top.map((c) => c.patient_id), ...[...plans.values()].map((p) => p.doctor_id)], 'id', 'id full_name');
  const overdueList = top.map((c) => ({
    id: c.id, patient_name: names.get(c.patient_id)?.full_name || null, title: c.title, kind: c.kind, due_date: c.due_date,
    doctor_name: names.get(plans.get(c.care_plan_id)?.doctor_id)?.full_name || null, days_overdue: daysBetween(c.due_date, today),
  }));

  res.json({
    openCount,
    overdueCount: overdueRows.length,
    completionRate: settled ? Math.round((done / settled) * 100) : null,
    overdueByKind,
    overdueList,
  });
});

module.exports = {
  saveIntake, getIntake, pendingIntakes, intakeStatus, getBrief, briefsToday,
  createCarePlan, listCarePlans, listCommitments, updateCommitment, analytics,
};
