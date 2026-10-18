const { M, find, findOne, insert, insertMany, update, count, byIds, withUsers, minutesBetween } = require('../../database/store');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyDepartment, audit, getStaffProfile } = require('../utils/notify');

// The five department steps every discharge goes through once a doctor
// clears the patient. sla = target minutes from "cleared" to "done".
const DEPARTMENT_STEPS = [
  { department: 'documentation', title: 'Discharge summary & medical certificates', sla: 60, plain: 'Discharge papers & certificates' },
  { department: 'billing', title: 'Final bill prepared and settled', sla: 90, plain: 'Final bill' },
  { department: 'insurance', title: 'Insurance pre-authorisation / claim approval', sla: 120, plain: 'Insurance approval' },
  { department: 'pharmacy', title: 'Take-home medicines dispensed', sla: 45, plain: 'Take-home medicines' },
  { department: 'nursing', title: 'Discharge teaching & nursing handover', sla: 30, plain: 'Going-home instructions from your nurse' },
];
const DEPT_ORDER = DEPARTMENT_STEPS.map((s) => s.department);
const PLAIN = Object.fromEntries(DEPARTMENT_STEPS.map((s) => [s.department, s.plain]));
const DEPT_LABEL = {
  documentation: 'Medical Records', billing: 'Billing', insurance: 'Insurance', pharmacy: 'Pharmacy', nursing: 'Nursing',
};
const STATUS_ORDER = ['cleared', 'admitted', 'discharged', 'transferred'];

const TRANSITIONS = {
  pending: ['in_progress', 'blocked', 'done'],
  in_progress: ['blocked', 'done'],
  blocked: ['in_progress', 'done'],
  done: [],
};

const deptRank = (d) => DEPT_ORDER.indexOf(d);
// Minutes from a to b (default: now), or null when a is missing (SQL NULL arithmetic).
const mins = (a, b) => (a ? minutesBetween(a, b || new Date()) : null);

// Adds elapsed time (measured from the admission's clearance, or until the task
// completed) plus who completed it.
function shapeTask(t, admission, completedByName) {
  const minutes = Math.max(0, Number(mins(admission.cleared_at, t.completed_at)) || 0);
  return {
    ...t,
    minutes_since_cleared: minutes,
    completed_by_name: completedByName || null,
    overdue: t.status !== 'done' && minutes > t.sla_minutes,
    department_label: DEPT_LABEL[t.department],
    patient_label: PLAIN[t.department],
  };
}

// Which department is holding the patient back right now.
// An explicitly blocked task wins (it has a reported obstacle, and the steps
// still pending are usually waiting on it); otherwise the open task furthest
// past its SLA; otherwise the open task with the least SLA headroom left.
function findBottleneck(tasks) {
  const open = tasks.filter((t) => t.status !== 'done');
  if (!open.length) return null;
  const overrun = (t) => t.minutes_since_cleared - t.sla_minutes;
  const blocked = open.filter((t) => t.status === 'blocked');
  const pastSla = open.filter((t) => overrun(t) > 0);
  const rank = { blocked: 0, pending: 1, in_progress: 2 };
  let pick;
  if (blocked.length) pick = blocked.sort((a, b) => overrun(b) - overrun(a))[0];
  else if (pastSla.length) pick = pastSla.sort((a, b) => overrun(b) - overrun(a))[0];
  else pick = open.sort((a, b) => (rank[a.status] - rank[b.status]) || (overrun(b) - overrun(a)))[0];
  return {
    task_id: pick.id,
    department: pick.department,
    department_label: DEPT_LABEL[pick.department],
    patient_label: PLAIN[pick.department],
    title: pick.title,
    minutes: pick.minutes_since_cleared,
    sla_minutes: pick.sla_minutes,
    status: pick.status,
    reason: pick.blocked_reason,
    overdue: pick.overdue,
  };
}

// Tasks for a set of admissions, grouped by admission id, in department order.
async function loadTasks(admissions) {
  if (!admissions.length) return {};
  const byAdmission = new Map(admissions.map((a) => [a.id, a]));
  const rows = await find('discharge_tasks', { admission_id: { $in: admissions.map((a) => a.id) } });
  const people = await byIds('users', rows.map((r) => r.completed_by), 'id', 'id full_name');
  rows.sort((a, b) => deptRank(a.department) - deptRank(b.department));
  const grouped = {};
  for (const r of rows) {
    const shaped = shapeTask(r, byAdmission.get(r.admission_id), people.get(r.completed_by)?.full_name);
    (grouped[r.admission_id] ||= []).push(shaped);
  }
  return grouped;
}

// Admission rows plus names and the two elapsed-time figures the screens use.
async function decorateAdmissions(rows) {
  await withUsers(rows, { patient_id: 'patient_name', doctor_id: 'doctor_name' });
  const hospitals = await byIds('hospitals', rows.map((r) => r.hospital_id), 'id', 'id name');
  for (const a of rows) {
    a.hospital_name = hospitals.get(a.hospital_id)?.name || null;
    a.waiting_minutes = a.cleared_at ? mins(a.cleared_at, a.discharged_at) : null;
    a.hours_admitted = Math.trunc(((a.discharged_at ? new Date(a.discharged_at) : new Date()) - new Date(a.admitted_at)) / 3600000);
  }
  return rows;
}

function shapeAdmission(a, tasks = []) {
  return {
    ...a,
    waiting_minutes: a.cleared_at ? Math.max(0, Number(a.waiting_minutes) || 0) : null,
    tasks_done: tasks.filter((t) => t.status === 'done').length,
    tasks_total: tasks.length,
    tasks,
    bottleneck: a.status === 'cleared' ? findBottleneck(tasks) : null,
  };
}

async function loadAdmission(id) {
  const a = await findOne('admissions', { id: Number(id) });
  if (!a) throw new ApiError(404, 'Admission not found.');
  return (await decorateAdmissions([a]))[0];
}

async function addEvent(admissionId, taskId, actorId, message) {
  await insert('discharge_events', { admission_id: admissionId, task_id: taskId, actor_id: actorId, message });
}

async function loadEvents(admissionId) {
  const rows = await find('discharge_events', { admission_id: admissionId }, { sort: { created_at: -1, id: -1 } });
  const people = await byIds('users', rows.map((r) => r.actor_id), 'id', 'id full_name role');
  return rows.map((e) => ({
    id: e.id, task_id: e.task_id, message: e.message, created_at: e.created_at,
    actor_name: people.get(e.actor_id)?.full_name || null, actor_role: people.get(e.actor_id)?.role || null,
  }));
}

const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

// ---------------------------------------------------------------------------
// Staff: department queue
// ---------------------------------------------------------------------------

// GET /api/discharge/queue - open tasks for the caller's department, most urgent first.
const queue = asyncHandler(async (req, res) => {
  const staff = await getStaffProfile(req.user.id);
  if (!staff) throw new ApiError(403, 'No staff profile found for this account.');
  if (staff.department === 'transfer_desk') {
    throw new ApiError(400, 'The transfer desk has no discharge queue. Use the Transfers page instead.');
  }

  const clearedHere = await find('admissions', { hospital_id: staff.hospital_id, status: 'cleared' });
  const admissionById = new Map(clearedHere.map((a) => [a.id, a]));
  const ids = clearedHere.map((a) => a.id);
  const rows = await find('discharge_tasks', { department: staff.department, status: { $ne: 'done' }, admission_id: { $in: ids } });
  await withUsers(clearedHere, { patient_id: 'patient_name', doctor_id: 'doctor_name' });

  const tasks = rows.map((r) => {
    const a = admissionById.get(r.admission_id);
    const { completed_by_name: _unused, ...shaped } = shapeTask(r, a);
    return {
      ...shaped,
      patient_name: a.patient_name, ward: a.ward, bed: a.bed, diagnosis: a.diagnosis, insurance_provider: a.insurance_provider,
      insurance_policy_no: a.insurance_policy_no, cleared_at: a.cleared_at, doctor_name: a.doctor_name,
    };
  });

  // Other departments still pending on the same admissions ("who else is this patient waiting on").
  const others = {};
  const otherRows = await find('discharge_tasks', { admission_id: { $in: [...new Set(tasks.map((t) => t.admission_id))] }, department: { $ne: staff.department }, status: { $ne: 'done' } });
  otherRows.sort((a, b) => deptRank(a.department) - deptRank(b.department));
  for (const o of otherRows) (others[o.admission_id] ||= []).push(o.department);
  for (const t of tasks) t.other_pending = others[t.admission_id] || [];

  // Most urgent first: furthest past (or closest to) SLA, blocked breaking ties.
  tasks.sort((a, b) => ((b.minutes_since_cleared - b.sla_minutes) - (a.minutes_since_cleared - a.sla_minutes))
    || ((b.status === 'blocked') - (a.status === 'blocked')));

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const hospitalAdmissionIds = (await find('admissions', { hospital_id: staff.hospital_id }, { select: 'id' })).map((a) => a.id);
  const doneToday = await count('discharge_tasks', {
    department: staff.department, status: 'done', completed_at: { $gte: startOfToday }, admission_id: { $in: hospitalAdmissionIds },
  });

  res.json({
    department: staff.department,
    department_label: DEPT_LABEL[staff.department],
    hospital_name: staff.hospital_name,
    tasks,
    stats: {
      pending: tasks.filter((t) => t.status === 'pending').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      blocked: tasks.filter((t) => t.status === 'blocked').length,
      overdue: tasks.filter((t) => t.overdue).length,
      doneToday,
    },
  });
});

// PATCH /api/discharge/tasks/:id - a department moves its own step forward.
const updateTask = asyncHandler(async (req, res) => {
  const { status, blockedReason } = req.body;
  if (status === 'blocked' && !(blockedReason && blockedReason.trim())) {
    throw new ApiError(400, 'Please say what is blocking this step.');
  }

  const task = await findOne('discharge_tasks', { id: Number(req.params.id) });
  if (!task) throw new ApiError(404, 'Task not found.');
  const admission = await findOne('admissions', { id: task.admission_id });
  const patient = await findOne('users', { id: admission.patient_id }, { select: 'full_name' });

  if (req.user.role === 'staff') {
    const staff = await getStaffProfile(req.user.id);
    if (!staff || staff.department !== task.department || staff.hospital_id !== admission.hospital_id) {
      throw new ApiError(403, 'Only the responsible department can update this step.');
    }
  }
  if (admission.status !== 'cleared') throw new ApiError(400, 'This discharge is no longer in progress.');
  if (!TRANSITIONS[task.status].includes(status)) {
    throw new ApiError(400, `Cannot move a step from "${task.status}" to "${status}".`);
  }

  // Conditional on the status we validated, so two simultaneous updates cannot both apply.
  const now = new Date();
  const set = status === 'done'
    ? { status: 'done', blocked_reason: null, started_at: task.started_at || now, completed_at: now, completed_by: req.user.id }
    : { status, blocked_reason: status === 'blocked' ? blockedReason.trim() : null, started_at: task.started_at || now };
  const result = await M.discharge_tasks.updateOne({ id: task.id, status: task.status }, { $set: set });
  if (!result.modifiedCount) throw new ApiError(409, 'This step was just updated by someone else. Please refresh.');

  const verb = { in_progress: 'started', blocked: `blocked: ${status === 'blocked' ? blockedReason.trim() : ''}`, done: 'completed' }[status];
  await addEvent(task.admission_id, task.id, req.user.id, `${task.title} - ${verb}.`);
  await audit(req.user.id, `discharge.task_${status}`, 'admission', task.admission_id, `${DEPT_LABEL[task.department]}: ${task.title} ${verb}`);

  if (status === 'blocked') {
    await notify(admission.doctor_id, 'discharge', `Discharge blocked: ${DEPT_LABEL[task.department]}`,
      `${patient.full_name}: ${blockedReason.trim()}`, 'admission', task.admission_id);
  }
  if (status === 'done') {
    await notify(admission.patient_id, 'discharge', `${PLAIN[task.department]} - done`,
      'One more step before you go home is complete.', 'admission', task.admission_id);
    const left = await count('discharge_tasks', { admission_id: task.admission_id, status: { $ne: 'done' } });
    if (left === 0) {
      await addEvent(task.admission_id, null, null, 'All departments have cleared the patient. Ready to go home.');
      await notify(admission.doctor_id, 'discharge', 'Ready for discharge',
        `${patient.full_name}: every department has signed off. Complete the discharge.`, 'admission', task.admission_id);
      await notify(admission.patient_id, 'discharge', 'You are ready to go home',
        'Every department has signed off. Your doctor will complete the discharge shortly.', 'admission', task.admission_id);
    }
  }

  const updated = await findOne('discharge_tasks', { id: task.id });
  const completedBy = updated.completed_by ? await findOne('users', { id: updated.completed_by }, { select: 'full_name' }) : null;
  res.json({ task: shapeTask(updated, admission, completedBy && completedBy.full_name) });
});

// POST /api/discharge/tasks/:id/nudge - ping the department that is holding things up.
const nudgeTask = asyncHandler(async (req, res) => {
  const task = await findOne('discharge_tasks', { id: Number(req.params.id) });
  if (!task) throw new ApiError(404, 'Task not found.');
  const admission = await findOne('admissions', { id: task.admission_id });
  const patient = await findOne('users', { id: admission.patient_id }, { select: 'full_name' });

  if (req.user.role === 'doctor' && admission.doctor_id !== req.user.id) {
    throw new ApiError(403, 'Only the attending doctor can nudge departments for this patient.');
  }
  if (req.user.role === 'staff') {
    const staff = await getStaffProfile(req.user.id);
    if (!staff || staff.hospital_id !== admission.hospital_id) throw new ApiError(403, 'Not your hospital.');
  }
  if (admission.status !== 'cleared' || task.status === 'done') {
    throw new ApiError(400, 'This step is already complete.');
  }
  const sinceNudge = task.last_nudged_at ? minutesBetween(task.last_nudged_at) : null;
  if (sinceNudge !== null && sinceNudge < 5) {
    throw new ApiError(409, `${DEPT_LABEL[task.department]} was nudged ${sinceNudge} min ago. Give them a moment.`);
  }

  const waited = fmtMins(Math.max(0, mins(admission.cleared_at) || 0));
  const notified = await notifyDepartment(task.department, admission.hospital_id, 'discharge',
    `Nudge: ${patient.full_name} is waiting on you`,
    `${task.title} - ${admission.ward || ''} ${admission.bed || ''} - patient cleared ${waited} ago.`, 'admission', task.admission_id);
  await update('discharge_tasks', { id: task.id }, { last_nudged_at: new Date() });
  await addEvent(task.admission_id, task.id, req.user.id, `${DEPT_LABEL[task.department]} nudged after ${waited} wait.`);
  await audit(req.user.id, 'discharge.nudge', 'admission', task.admission_id, `Nudged ${DEPT_LABEL[task.department]} (${notified} staff)`);

  res.json({ message: `${DEPT_LABEL[task.department]} has been alerted (${notified} staff).`, notified });
});

// ---------------------------------------------------------------------------
// Doctor / admin: admissions
// ---------------------------------------------------------------------------

// GET /api/discharge/admissions?status=
const listAdmissions = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (req.user.role === 'doctor') filter.doctor_id = req.user.id;
  if (status) filter.status = status;
  else {
    // Default view: everyone currently in hospital plus the last week's discharges.
    filter.$or = [{ status: { $in: ['admitted', 'cleared'] } }, { discharged_at: { $gte: new Date(Date.now() - 7 * 86400000) } }];
  }
  const rows = await find('admissions', filter);
  // cleared first, then admitted, discharged, transferred; longest-waiting first; nulls first like SQL ASC
  rows.sort((a, b) => (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
    || ((a.cleared_at ? new Date(a.cleared_at) : 0) - (b.cleared_at ? new Date(b.cleared_at) : 0))
    || (new Date(b.admitted_at) - new Date(a.admitted_at)));
  const page = rows.slice(0, 100);
  await decorateAdmissions(page);
  const tasks = await loadTasks(page);
  res.json({ admissions: page.map((a) => shapeAdmission(a, tasks[a.id] || [])) });
});

// GET /api/discharge/admissions/:id
const getAdmission = asyncHandler(async (req, res) => {
  const a = await loadAdmission(req.params.id);
  if (req.user.role === 'doctor' && a.doctor_id !== req.user.id) throw new ApiError(403, 'Not your patient.');
  if (req.user.role === 'patient' && a.patient_id !== req.user.id) throw new ApiError(403, 'Not your admission.');
  if (req.user.role === 'staff') {
    const staff = await getStaffProfile(req.user.id);
    if (!staff || staff.hospital_id !== a.hospital_id) throw new ApiError(403, 'Not your hospital.');
  }
  const tasks = (await loadTasks([a]))[a.id] || [];
  const admission = shapeAdmission(a, tasks);
  res.json({ admission, tasks, events: await loadEvents(a.id), bottleneck: admission.bottleneck });
});

// POST /api/discharge/admissions/:id/clear - "medically fit to leave": starts the clock.
const clearAdmission = asyncHandler(async (req, res) => {
  const a = await findOne('admissions', { id: Number(req.params.id) });
  if (!a) throw new ApiError(404, 'Admission not found.');
  if (a.doctor_id !== req.user.id) throw new ApiError(403, 'Only the attending doctor can clear this patient.');
  if (a.status !== 'admitted') throw new ApiError(400, 'This patient has already been cleared or discharged.');
  const patient = await findOne('users', { id: a.patient_id }, { select: 'full_name' });

  // Only one request can move the admission from 'admitted' to 'cleared'.
  const claimed = await M.admissions.updateOne({ id: a.id, status: 'admitted' }, { $set: { status: 'cleared', cleared_at: new Date() } });
  if (!claimed.modifiedCount) throw new ApiError(400, 'This patient has already been cleared or discharged.');

  await addEvent(a.id, null, req.user.id, 'Doctor marked the patient medically fit for discharge. Discharge clock started.');

  const selfPay = !a.insurance_provider;
  for (const step of DEPARTMENT_STEPS) {
    // Self-pay patients have nothing for the insurance desk to approve - skip that step automatically.
    const skip = selfPay && step.department === 'insurance';
    const now = new Date();
    const task = await insert('discharge_tasks', {
      admission_id: a.id, department: step.department, title: step.title, status: skip ? 'done' : 'pending', sla_minutes: step.sla,
      started_at: skip ? now : null, completed_at: skip ? now : null,
    });
    if (skip) {
      await addEvent(a.id, task.id, null, 'Self-pay patient: insurance approval not required.');
    } else {
      await notifyDepartment(step.department, a.hospital_id, 'discharge', `New discharge: ${patient.full_name}`,
        `${step.title} - ${a.ward || ''} ${a.bed || ''}. Patient is medically cleared; SLA ${fmtMins(step.sla)}.`, 'admission', a.id);
    }
  }
  await notify(a.patient_id, 'discharge', 'You are medically cleared to go home',
    'Your doctor has cleared you. Track the remaining steps live on your Hospital Stay page.', 'admission', a.id);
  await audit(req.user.id, 'discharge.cleared', 'admission', a.id, `${patient.full_name} marked medically fit; discharge workflow started`);

  const full = await loadAdmission(a.id);
  const tasks = (await loadTasks([full]))[full.id] || [];
  res.json({ admission: shapeAdmission(full, tasks) });
});

// POST /api/discharge/admissions/:id/discharge - only once every department has signed off.
const completeDischarge = asyncHandler(async (req, res) => {
  const a = await loadAdmission(req.params.id);
  if (req.user.role === 'doctor' && a.doctor_id !== req.user.id) throw new ApiError(403, 'Not your patient.');
  if (a.status !== 'cleared') throw new ApiError(400, 'Only a cleared patient can be discharged.');
  const open = await find('discharge_tasks', { admission_id: a.id, status: { $ne: 'done' } }, { select: 'department' });
  if (open.length > 0) {
    const names = open.sort((x, y) => deptRank(x.department) - deptRank(y.department)).map((t) => DEPT_LABEL[t.department]).join(', ');
    throw new ApiError(409, `Still waiting on: ${names}.`);
  }

  const claimed = await M.admissions.updateOne({ id: a.id, status: 'cleared' }, { $set: { status: 'discharged', discharged_at: new Date() } });
  if (!claimed.modifiedCount) throw new ApiError(400, 'Only a cleared patient can be discharged.');
  const waited = fmtMins(Math.max(0, Number(a.waiting_minutes) || 0));
  await addEvent(a.id, null, req.user.id, `Patient discharged. Total wait after clearance: ${waited}.`);
  await notify(a.patient_id, 'discharge', 'You have been discharged',
    'Wishing you a smooth recovery. Your care plan and follow-ups are on your My Care Plan page.', 'admission', a.id);
  await audit(req.user.id, 'discharge.completed', 'admission', a.id, `${a.patient_name} discharged after ${waited} wait`);

  const updated = await loadAdmission(a.id);
  const tasks = (await loadTasks([updated]))[a.id] || [];
  res.json({ admission: shapeAdmission(updated, tasks) });
});

// ---------------------------------------------------------------------------
// Patient: live "why am I still waiting" view
// ---------------------------------------------------------------------------

// GET /api/discharge/my-stay
const myStay = asyncHandler(async (req, res) => {
  const candidates = await find('admissions', {
    patient_id: req.user.id,
    $or: [{ status: { $in: ['admitted', 'cleared'] } }, { discharged_at: { $gte: new Date(Date.now() - 2 * 86400000) } }],
  });
  candidates.sort((a, b) => (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) || (new Date(b.admitted_at) - new Date(a.admitted_at)));
  if (!candidates.length) {
    return res.json({ admission: null, tasks: [], bottleneck: null, events: [], carePlan: null, waiting_minutes: null });
  }
  const [row] = await decorateAdmissions([candidates[0]]);
  const tasks = (await loadTasks([row]))[row.id] || [];
  const admission = shapeAdmission(row, tasks);

  const plan = await findOne('care_plans', { admission_id: admission.id }, { sort: { created_at: -1, id: -1 } });
  let carePlan = null;
  if (plan) {
    const doctor = await findOne('users', { id: plan.doctor_id }, { select: 'full_name' });
    const commitments = (await find('commitments', { care_plan_id: plan.id }, { sort: { due_date: 1 } }))
      .map((c) => ({ id: c.id, title: c.title, kind: c.kind, owner_role: c.owner_role, due_date: c.due_date, status: c.status }));
    carePlan = { id: plan.id, plain_summary: plan.plain_summary, created_at: plan.created_at, doctor_name: doctor ? doctor.full_name : null, commitments };
  }

  res.json({
    admission, tasks, bottleneck: admission.bottleneck, events: await loadEvents(admission.id), carePlan, waiting_minutes: admission.waiting_minutes,
  });
});

// ---------------------------------------------------------------------------
// Admin: live board + analytics
// ---------------------------------------------------------------------------

// GET /api/discharge/board - every cleared patient still waiting to leave.
const board = asyncHandler(async (req, res) => {
  const rows = await find('admissions', { status: 'cleared' }, { sort: { cleared_at: 1 } });
  await decorateAdmissions(rows);
  const tasks = await loadTasks(rows);
  const inTreatment = await count('admissions', { status: 'admitted' });
  res.json({ admissions: rows.map((a) => shapeAdmission(a, tasks[a.id] || [])), inTreatment });
});

// GET /api/discharge/analytics - where discharge time actually goes (last 30 days).
const analytics = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 30 * 86400000);
  const currentWaiting = await count('admissions', { status: 'cleared' });

  const recent = await find('admissions', { status: 'discharged', cleared_at: { $ne: null }, discharged_at: { $gte: since } }, { select: 'cleared_at discharged_at' });
  const waits = recent.map((a) => minutesBetween(a.cleared_at, a.discharged_at));
  const avgWait = waits.length ? waits.reduce((s, m) => s + m, 0) / waits.length : null;

  const clearedRecently = await find('admissions', { cleared_at: { $gte: since } }, { select: 'id cleared_at' });
  const clearedAt = new Map(clearedRecently.map((a) => [a.id, a.cleared_at]));
  const doneTasks = await find('discharge_tasks', { status: 'done', completed_at: { $ne: null }, admission_id: { $in: [...clearedAt.keys()] } });
  const perDept = {};
  for (const t of doneTasks) {
    const m = minutesBetween(clearedAt.get(t.admission_id), t.completed_at);
    const d = (perDept[t.department] ||= { sla: 0, total: 0, breaches: 0, n: 0 });
    d.sla = Math.max(d.sla, t.sla_minutes);
    d.total += m;
    d.n += 1;
    if (m > t.sla_minutes) d.breaches += 1;
  }
  const deptAvg = DEPT_ORDER.filter((d) => perDept[d]).map((d) => ({
    department: d,
    department_label: DEPT_LABEL[d],
    avg_minutes: Math.round(perDept[d].total / perDept[d].n),
    sla_minutes: perDept[d].sla,
    breach_pct: Math.round((100 * perDept[d].breaches) / perDept[d].n),
    completed: perDept[d].n,
  }));
  const worst = [...deptAvg].sort((a, b) => (b.avg_minutes - b.sla_minutes) - (a.avg_minutes - a.sla_minutes))[0];
  const topBottleneck = worst && worst.avg_minutes > worst.sla_minutes
    ? { department: worst.department, department_label: worst.department_label, avg_minutes: worst.avg_minutes, sla_minutes: worst.sla_minutes, breach_pct: worst.breach_pct }
    : null;

  res.json({
    currentWaiting,
    avgWaitMinutes: avgWait == null ? null : Math.round(avgWait),
    dischargesLast30: recent.length,
    deptAvg,
    topBottleneck,
  });
});

module.exports = {
  queue, updateTask, nudgeTask, listAdmissions, getAdmission, clearAdmission, completeDischarge, myStay, board, analytics,
};
