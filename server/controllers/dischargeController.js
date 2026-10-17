const pool = require('../../database/db');
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
const PLAIN = Object.fromEntries(DEPARTMENT_STEPS.map((s) => [s.department, s.plain]));
const DEPT_LABEL = {
  documentation: 'Medical Records', billing: 'Billing', insurance: 'Insurance', pharmacy: 'Pharmacy', nursing: 'Nursing',
};

const TRANSITIONS = {
  pending: ['in_progress', 'blocked', 'done'],
  in_progress: ['blocked', 'done'],
  blocked: ['in_progress', 'done'],
  done: [],
};

// Shared SELECT for tasks: elapsed minutes are computed by the database
// clock (NOW()) so they line up with timestamps the app itself writes.
const TASK_SELECT = `
  SELECT t.*, TIMESTAMPDIFF(MINUTE, a.cleared_at, COALESCE(t.completed_at, NOW())) AS minutes_since_cleared,
         cu.full_name AS completed_by_name
  FROM discharge_tasks t
  JOIN admissions a ON a.id = t.admission_id
  LEFT JOIN users cu ON cu.id = t.completed_by`;

function shapeTask(t) {
  const minutes = Math.max(0, Number(t.minutes_since_cleared) || 0);
  return {
    ...t,
    minutes_since_cleared: minutes,
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

async function loadTasks(conn, admissionIds) {
  if (!admissionIds.length) return {};
  const [rows] = await conn.query(
    `${TASK_SELECT} WHERE t.admission_id IN (?) ORDER BY FIELD(t.department, 'documentation','billing','insurance','pharmacy','nursing')`,
    [admissionIds]
  );
  const byAdmission = {};
  for (const r of rows) (byAdmission[r.admission_id] ||= []).push(shapeTask(r));
  return byAdmission;
}

const ADMISSION_SELECT = `
  SELECT a.*, pu.full_name AS patient_name, du.full_name AS doctor_name, h.name AS hospital_name,
         TIMESTAMPDIFF(MINUTE, a.cleared_at, COALESCE(a.discharged_at, NOW())) AS waiting_minutes,
         TIMESTAMPDIFF(HOUR, a.admitted_at, COALESCE(a.discharged_at, NOW())) AS hours_admitted
  FROM admissions a
  JOIN users pu ON pu.id = a.patient_id
  JOIN users du ON du.id = a.doctor_id
  JOIN hospitals h ON h.id = a.hospital_id`;

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

async function loadAdmission(conn, id) {
  const [rows] = await conn.query(`${ADMISSION_SELECT} WHERE a.id = ?`, [id]);
  if (!rows.length) throw new ApiError(404, 'Admission not found.');
  return rows[0];
}

async function addEvent(conn, admissionId, taskId, actorId, message) {
  await conn.query(
    `INSERT INTO discharge_events (admission_id, task_id, actor_id, message) VALUES (?, ?, ?, ?)`,
    [admissionId, taskId, actorId, message]
  );
}

async function loadEvents(conn, admissionId) {
  const [rows] = await conn.query(
    `SELECT e.id, e.task_id, e.message, e.created_at, u.full_name AS actor_name, u.role AS actor_role
     FROM discharge_events e LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.admission_id = ? ORDER BY e.created_at DESC, e.id DESC`,
    [admissionId]
  );
  return rows;
}

const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

// ---------------------------------------------------------------------------
// Staff: department queue
// ---------------------------------------------------------------------------

// GET /api/discharge/queue - open tasks for the caller's department, most urgent first.
const queue = asyncHandler(async (req, res) => {
  const staff = await getStaffProfile(pool, req.user.id);
  if (!staff) throw new ApiError(403, 'No staff profile found for this account.');
  if (staff.department === 'transfer_desk') {
    throw new ApiError(400, 'The transfer desk has no discharge queue. Use the Transfers page instead.');
  }

  const [rows] = await pool.query(
    `SELECT t.*, TIMESTAMPDIFF(MINUTE, a.cleared_at, NOW()) AS minutes_since_cleared,
            pu.full_name AS patient_name, a.ward, a.bed, a.diagnosis, a.insurance_provider, a.insurance_policy_no,
            a.cleared_at, du.full_name AS doctor_name
     FROM discharge_tasks t
     JOIN admissions a ON a.id = t.admission_id
     JOIN users pu ON pu.id = a.patient_id
     JOIN users du ON du.id = a.doctor_id
     WHERE t.department = ? AND a.hospital_id = ? AND a.status = 'cleared' AND t.status <> 'done'`,
    [staff.department, staff.hospital_id]
  );
  const tasks = rows.map(shapeTask);

  // Other departments still pending on the same admissions ("who else is this patient waiting on").
  const admissionIds = [...new Set(tasks.map((t) => t.admission_id))];
  const others = {};
  if (admissionIds.length) {
    const [otherRows] = await pool.query(
      `SELECT admission_id, department FROM discharge_tasks
       WHERE admission_id IN (?) AND department <> ? AND status <> 'done'
       ORDER BY FIELD(department, 'documentation','billing','insurance','pharmacy','nursing')`,
      [admissionIds, staff.department]
    );
    for (const o of otherRows) (others[o.admission_id] ||= []).push(o.department);
  }
  for (const t of tasks) t.other_pending = others[t.admission_id] || [];

  // Most urgent first: furthest past (or closest to) SLA, blocked breaking ties.
  tasks.sort((a, b) => ((b.minutes_since_cleared - b.sla_minutes) - (a.minutes_since_cleared - a.sla_minutes))
    || ((b.status === 'blocked') - (a.status === 'blocked')));

  const [[done]] = await pool.query(
    `SELECT COUNT(*) AS doneToday FROM discharge_tasks t JOIN admissions a ON a.id = t.admission_id
     WHERE t.department = ? AND a.hospital_id = ? AND t.status = 'done' AND t.completed_at >= CURDATE()`,
    [staff.department, staff.hospital_id]
  );

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
      doneToday: Number(done.doneToday),
    },
  });
});

// PATCH /api/discharge/tasks/:id - a department moves its own step forward.
const updateTask = asyncHandler(async (req, res) => {
  const { status, blockedReason } = req.body;
  if (status === 'blocked' && !(blockedReason && blockedReason.trim())) {
    throw new ApiError(400, 'Please say what is blocking this step.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT t.*, a.hospital_id, a.patient_id, a.doctor_id, a.status AS admission_status, pu.full_name AS patient_name
       FROM discharge_tasks t JOIN admissions a ON a.id = t.admission_id JOIN users pu ON pu.id = a.patient_id
       WHERE t.id = ? FOR UPDATE`,
      [req.params.id]
    );
    if (!rows.length) throw new ApiError(404, 'Task not found.');
    const task = rows[0];

    if (req.user.role === 'staff') {
      const staff = await getStaffProfile(conn, req.user.id);
      if (!staff || staff.department !== task.department || staff.hospital_id !== task.hospital_id) {
        throw new ApiError(403, 'Only the responsible department can update this step.');
      }
    }
    if (task.admission_status !== 'cleared') throw new ApiError(400, 'This discharge is no longer in progress.');
    if (!TRANSITIONS[task.status].includes(status)) {
      throw new ApiError(400, `Cannot move a step from "${task.status}" to "${status}".`);
    }

    if (status === 'done') {
      await conn.query(
        `UPDATE discharge_tasks SET status = 'done', blocked_reason = NULL, started_at = COALESCE(started_at, NOW()),
           completed_at = NOW(), completed_by = ? WHERE id = ?`,
        [req.user.id, task.id]
      );
    } else {
      await conn.query(
        `UPDATE discharge_tasks SET status = ?, blocked_reason = ?, started_at = COALESCE(started_at, NOW()) WHERE id = ?`,
        [status, status === 'blocked' ? blockedReason.trim() : null, task.id]
      );
    }

    const verb = { in_progress: 'started', blocked: `blocked: ${status === 'blocked' ? blockedReason.trim() : ''}`, done: 'completed' }[status];
    await addEvent(conn, task.admission_id, task.id, req.user.id, `${task.title} - ${verb}.`);
    await audit(conn, req.user.id, `discharge.task_${status}`, 'admission', task.admission_id,
      `${DEPT_LABEL[task.department]}: ${task.title} ${verb}`);

    if (status === 'blocked') {
      await notify(conn, task.doctor_id, 'discharge', `Discharge blocked: ${DEPT_LABEL[task.department]}`,
        `${task.patient_name}: ${blockedReason.trim()}`, 'admission', task.admission_id);
    }
    if (status === 'done') {
      await notify(conn, task.patient_id, 'discharge', `${PLAIN[task.department]} - done`,
        `One more step before you go home is complete.`, 'admission', task.admission_id);
      const [[left]] = await conn.query(
        `SELECT COUNT(*) AS n FROM discharge_tasks WHERE admission_id = ? AND status <> 'done'`, [task.admission_id]);
      if (Number(left.n) === 0) {
        await addEvent(conn, task.admission_id, null, null, 'All departments have cleared the patient. Ready to go home.');
        await notify(conn, task.doctor_id, 'discharge', 'Ready for discharge',
          `${task.patient_name}: every department has signed off. Complete the discharge.`, 'admission', task.admission_id);
        await notify(conn, task.patient_id, 'discharge', 'You are ready to go home',
          'Every department has signed off. Your doctor will complete the discharge shortly.', 'admission', task.admission_id);
      }
    }

    await conn.commit();
    const [updated] = await pool.query(`${TASK_SELECT} WHERE t.id = ?`, [task.id]);
    res.json({ task: shapeTask(updated[0]) });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// POST /api/discharge/tasks/:id/nudge - ping the department that is holding things up.
const nudgeTask = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.*, a.hospital_id, a.doctor_id, a.bed, a.ward, a.status AS admission_status, pu.full_name AS patient_name,
            TIMESTAMPDIFF(MINUTE, a.cleared_at, NOW()) AS minutes_since_cleared,
            TIMESTAMPDIFF(MINUTE, t.last_nudged_at, NOW()) AS minutes_since_nudge
     FROM discharge_tasks t JOIN admissions a ON a.id = t.admission_id JOIN users pu ON pu.id = a.patient_id
     WHERE t.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new ApiError(404, 'Task not found.');
  const task = rows[0];

  if (req.user.role === 'doctor' && task.doctor_id !== req.user.id) {
    throw new ApiError(403, 'Only the attending doctor can nudge departments for this patient.');
  }
  if (req.user.role === 'staff') {
    const staff = await getStaffProfile(pool, req.user.id);
    if (!staff || staff.hospital_id !== task.hospital_id) throw new ApiError(403, 'Not your hospital.');
  }
  if (task.admission_status !== 'cleared' || task.status === 'done') {
    throw new ApiError(400, 'This step is already complete.');
  }
  if (task.minutes_since_nudge != null && Number(task.minutes_since_nudge) < 5) {
    throw new ApiError(409, `${DEPT_LABEL[task.department]} was nudged ${task.minutes_since_nudge} min ago. Give them a moment.`);
  }

  const waited = fmtMins(Math.max(0, Number(task.minutes_since_cleared) || 0));
  const notified = await notifyDepartment(pool, task.department, task.hospital_id, 'discharge',
    `Nudge: ${task.patient_name} is waiting on you`,
    `${task.title} - ${task.ward || ''} ${task.bed || ''} - patient cleared ${waited} ago.`, 'admission', task.admission_id);
  await pool.query(`UPDATE discharge_tasks SET last_nudged_at = NOW() WHERE id = ?`, [task.id]);
  await addEvent(pool, task.admission_id, task.id, req.user.id, `${DEPT_LABEL[task.department]} nudged after ${waited} wait.`);
  await audit(pool, req.user.id, 'discharge.nudge', 'admission', task.admission_id, `Nudged ${DEPT_LABEL[task.department]} (${notified} staff)`);

  res.json({ message: `${DEPT_LABEL[task.department]} has been alerted (${notified} staff).`, notified });
});

// ---------------------------------------------------------------------------
// Doctor / admin: admissions
// ---------------------------------------------------------------------------

// GET /api/discharge/admissions?status=
const listAdmissions = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = [];
  const params = [];
  if (req.user.role === 'doctor') { where.push('a.doctor_id = ?'); params.push(req.user.id); }
  if (status) {
    where.push('a.status = ?'); params.push(status);
  } else {
    // Default view: everyone currently in hospital plus the last week's discharges.
    where.push(`(a.status IN ('admitted','cleared') OR a.discharged_at >= NOW() - INTERVAL 7 DAY)`);
  }
  const [rows] = await pool.query(
    `${ADMISSION_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY FIELD(a.status, 'cleared', 'admitted', 'discharged', 'transferred'), a.cleared_at ASC, a.admitted_at DESC
     LIMIT 100`,
    params
  );
  const tasks = await loadTasks(pool, rows.map((r) => r.id));
  res.json({ admissions: rows.map((a) => shapeAdmission(a, tasks[a.id] || [])) });
});

// GET /api/discharge/admissions/:id
const getAdmission = asyncHandler(async (req, res) => {
  const a = await loadAdmission(pool, req.params.id);
  if (req.user.role === 'doctor' && a.doctor_id !== req.user.id) throw new ApiError(403, 'Not your patient.');
  if (req.user.role === 'patient' && a.patient_id !== req.user.id) throw new ApiError(403, 'Not your admission.');
  if (req.user.role === 'staff') {
    const staff = await getStaffProfile(pool, req.user.id);
    if (!staff || staff.hospital_id !== a.hospital_id) throw new ApiError(403, 'Not your hospital.');
  }
  const tasks = (await loadTasks(pool, [a.id]))[a.id] || [];
  const admission = shapeAdmission(a, tasks);
  res.json({ admission, tasks, events: await loadEvents(pool, a.id), bottleneck: admission.bottleneck });
});

// POST /api/discharge/admissions/:id/clear - "medically fit to leave": starts the clock.
const clearAdmission = asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT a.*, pu.full_name AS patient_name FROM admissions a JOIN users pu ON pu.id = a.patient_id WHERE a.id = ? FOR UPDATE`,
      [req.params.id]
    );
    if (!rows.length) throw new ApiError(404, 'Admission not found.');
    const a = rows[0];
    if (a.doctor_id !== req.user.id) throw new ApiError(403, 'Only the attending doctor can clear this patient.');
    if (a.status !== 'admitted') throw new ApiError(400, 'This patient has already been cleared or discharged.');

    await conn.query(`UPDATE admissions SET status = 'cleared', cleared_at = NOW() WHERE id = ?`, [a.id]);
    await addEvent(conn, a.id, null, req.user.id, 'Doctor marked the patient medically fit for discharge. Discharge clock started.');

    const selfPay = !a.insurance_provider;
    for (const step of DEPARTMENT_STEPS) {
      // Self-pay patients have nothing for the insurance desk to approve - skip that step automatically.
      const skip = selfPay && step.department === 'insurance';
      const [r] = await conn.query(
        `INSERT INTO discharge_tasks (admission_id, department, title, status, sla_minutes, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ${skip ? 'NOW(), NOW()' : 'NULL, NULL'})`,
        [a.id, step.department, step.title, skip ? 'done' : 'pending', step.sla]
      );
      if (skip) {
        await addEvent(conn, a.id, r.insertId, null, 'Self-pay patient: insurance approval not required.');
      } else {
        await notifyDepartment(conn, step.department, a.hospital_id, 'discharge', `New discharge: ${a.patient_name}`,
          `${step.title} - ${a.ward || ''} ${a.bed || ''}. Patient is medically cleared; SLA ${fmtMins(step.sla)}.`, 'admission', a.id);
      }
    }
    await notify(conn, a.patient_id, 'discharge', 'You are medically cleared to go home',
      'Your doctor has cleared you. Track the remaining steps live on your Hospital Stay page.', 'admission', a.id);
    await audit(conn, req.user.id, 'discharge.cleared', 'admission', a.id, `${a.patient_name} marked medically fit; discharge workflow started`);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const a = await loadAdmission(pool, req.params.id);
  const tasks = (await loadTasks(pool, [a.id]))[a.id] || [];
  res.json({ admission: shapeAdmission(a, tasks) });
});

// POST /api/discharge/admissions/:id/discharge - only once every department has signed off.
const completeDischarge = asyncHandler(async (req, res) => {
  const a = await loadAdmission(pool, req.params.id);
  if (req.user.role === 'doctor' && a.doctor_id !== req.user.id) throw new ApiError(403, 'Not your patient.');
  if (a.status !== 'cleared') throw new ApiError(400, 'Only a cleared patient can be discharged.');
  const [[left]] = await pool.query(
    `SELECT COUNT(*) AS n, GROUP_CONCAT(department) AS depts FROM discharge_tasks WHERE admission_id = ? AND status <> 'done'`, [a.id]);
  if (Number(left.n) > 0) {
    const names = left.depts.split(',').map((d) => DEPT_LABEL[d]).join(', ');
    throw new ApiError(409, `Still waiting on: ${names}.`);
  }

  await pool.query(`UPDATE admissions SET status = 'discharged', discharged_at = NOW() WHERE id = ?`, [a.id]);
  const waited = fmtMins(Math.max(0, Number(a.waiting_minutes) || 0));
  await addEvent(pool, a.id, null, req.user.id, `Patient discharged. Total wait after clearance: ${waited}.`);
  await notify(pool, a.patient_id, 'discharge', 'You have been discharged',
    'Wishing you a smooth recovery. Your care plan and follow-ups are on your My Care Plan page.', 'admission', a.id);
  await audit(pool, req.user.id, 'discharge.completed', 'admission', a.id, `${a.patient_name} discharged after ${waited} wait`);

  const updated = await loadAdmission(pool, a.id);
  const tasks = (await loadTasks(pool, [a.id]))[a.id] || [];
  res.json({ admission: shapeAdmission(updated, tasks) });
});

// ---------------------------------------------------------------------------
// Patient: live "why am I still waiting" view
// ---------------------------------------------------------------------------

// GET /api/discharge/my-stay
const myStay = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `${ADMISSION_SELECT}
     WHERE a.patient_id = ? AND (a.status IN ('admitted','cleared') OR a.discharged_at >= NOW() - INTERVAL 2 DAY)
     ORDER BY FIELD(a.status, 'cleared', 'admitted', 'discharged', 'transferred'), a.admitted_at DESC LIMIT 1`,
    [req.user.id]
  );
  if (!rows.length) {
    return res.json({ admission: null, tasks: [], bottleneck: null, events: [], carePlan: null, waiting_minutes: null });
  }
  const tasks = (await loadTasks(pool, [rows[0].id]))[rows[0].id] || [];
  const admission = shapeAdmission(rows[0], tasks);

  const [plans] = await pool.query(
    `SELECT cp.id, cp.plain_summary, cp.created_at, u.full_name AS doctor_name
     FROM care_plans cp JOIN users u ON u.id = cp.doctor_id
     WHERE cp.admission_id = ? ORDER BY cp.created_at DESC LIMIT 1`,
    [admission.id]
  );
  let carePlan = plans[0] || null;
  if (carePlan) {
    const [commitments] = await pool.query(
      `SELECT id, title, kind, owner_role, due_date, status FROM commitments WHERE care_plan_id = ? ORDER BY due_date`,
      [carePlan.id]
    );
    carePlan = { ...carePlan, commitments };
  }

  res.json({
    admission,
    tasks,
    bottleneck: admission.bottleneck,
    events: await loadEvents(pool, admission.id),
    carePlan,
    waiting_minutes: admission.waiting_minutes,
  });
});

// ---------------------------------------------------------------------------
// Admin: live board + analytics
// ---------------------------------------------------------------------------

// GET /api/discharge/board - every cleared patient still waiting to leave.
const board = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`${ADMISSION_SELECT} WHERE a.status = 'cleared' ORDER BY a.cleared_at ASC`);
  const tasks = await loadTasks(pool, rows.map((r) => r.id));
  const admissions = rows.map((a) => shapeAdmission(a, tasks[a.id] || []));
  const [[inTreatment]] = await pool.query(`SELECT COUNT(*) AS n FROM admissions WHERE status = 'admitted'`);
  res.json({ admissions, inTreatment: Number(inTreatment.n) });
});

// GET /api/discharge/analytics - where discharge time actually goes (last 30 days).
const analytics = asyncHandler(async (req, res) => {
  const [[waiting]] = await pool.query(`SELECT COUNT(*) AS n FROM admissions WHERE status = 'cleared'`);
  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS discharges, AVG(TIMESTAMPDIFF(MINUTE, cleared_at, discharged_at)) AS avg_wait
     FROM admissions WHERE status = 'discharged' AND cleared_at IS NOT NULL AND discharged_at >= NOW() - INTERVAL 30 DAY`
  );
  const [dept] = await pool.query(
    `SELECT t.department, MAX(t.sla_minutes) AS sla_minutes,
            AVG(TIMESTAMPDIFF(MINUTE, a.cleared_at, t.completed_at)) AS avg_minutes,
            100 * SUM(TIMESTAMPDIFF(MINUTE, a.cleared_at, t.completed_at) > t.sla_minutes) / COUNT(*) AS breach_pct,
            COUNT(*) AS completed
     FROM discharge_tasks t JOIN admissions a ON a.id = t.admission_id
     WHERE t.status = 'done' AND t.completed_at IS NOT NULL AND a.cleared_at >= NOW() - INTERVAL 30 DAY
     GROUP BY t.department
     ORDER BY FIELD(t.department, 'documentation','billing','insurance','pharmacy','nursing')`
  );
  const deptAvg = dept.map((d) => ({
    department: d.department,
    department_label: DEPT_LABEL[d.department],
    avg_minutes: Math.round(Number(d.avg_minutes) || 0),
    sla_minutes: Number(d.sla_minutes),
    breach_pct: Math.round(Number(d.breach_pct) || 0),
    completed: Number(d.completed),
  }));
  const worst = [...deptAvg].sort((a, b) => (b.avg_minutes - b.sla_minutes) - (a.avg_minutes - a.sla_minutes))[0];
  const topBottleneck = worst && worst.avg_minutes > worst.sla_minutes
    ? { department: worst.department, department_label: worst.department_label, avg_minutes: worst.avg_minutes,
      sla_minutes: worst.sla_minutes, breach_pct: worst.breach_pct }
    : null;

  res.json({
    currentWaiting: Number(waiting.n),
    avgWaitMinutes: summary.avg_wait == null ? null : Math.round(Number(summary.avg_wait)),
    dischargesLast30: Number(summary.discharges),
    deptAvg,
    topBottleneck,
  });
});

module.exports = {
  queue, updateTask, nudgeTask, listAdmissions, getAdmission, clearAdmission, completeDischarge, myStay, board, analytics,
};
