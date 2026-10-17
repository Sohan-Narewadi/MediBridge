const pool = require('../../database/db');
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
  const [rows] = await pool.query(
    `SELECT 1 FROM appointments WHERE doctor_id = ? AND patient_id = ? AND status != 'cancelled'
     UNION ALL
     SELECT 1 FROM admissions WHERE doctor_id = ? AND patient_id = ?
     LIMIT 1`,
    [doctorId, patientId, doctorId, patientId]
  );
  return rows.length > 0;
}

async function getAppointment(id) {
  const [rows] = await pool.query(
    `SELECT a.*, du.full_name AS doctor_name, s.name AS specialization
     FROM appointments a
     JOIN users du ON du.id = a.doctor_id
     JOIN doctors d ON d.user_id = a.doctor_id
     JOIN specializations s ON s.id = d.specialization_id
     WHERE a.id = ?`,
    [id]
  );
  if (!rows.length) throw new ApiError(404, 'Appointment not found.');
  return rows[0];
}

// Computes the brief's warning flags from real data, ordered by severity.
// Shared by the full brief and the doctor's "today" list.
async function buildFlags(patientId, doctorId, intake, patient) {
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

  const [[missed]] = await pool.query(
    `SELECT COUNT(*) AS n FROM medication_logs ml JOIN medications m ON m.id = ml.medication_id
     WHERE m.patient_id = ? AND ml.status = 'missed' AND ml.log_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
    [patientId]
  );
  if (missed.n >= 2) {
    flags.push({ level: missed.n >= 4 ? 'danger' : 'warning', text: `Missed ${missed.n} doses in last 7 days` });
  }

  const [overdueFollowUps] = await pool.query(
    `SELECT DATEDIFF(CURDATE(), mr.follow_up_date) AS days_overdue
     FROM medical_records mr
     WHERE mr.patient_id = ? AND mr.follow_up_date IS NOT NULL AND mr.follow_up_date < CURDATE()
       AND NOT EXISTS (
         SELECT 1 FROM appointments a2 WHERE a2.patient_id = mr.patient_id AND a2.doctor_id = mr.doctor_id
           AND a2.status = 'completed' AND a2.appointment_date >= mr.follow_up_date)
     ORDER BY mr.follow_up_date DESC LIMIT 1`,
    [patientId]
  );
  if (overdueFollowUps.length) {
    flags.push({ level: 'warning', text: `Follow-up overdue by ${overdueFollowUps[0].days_overdue} days` });
  }

  const [[overdueCommitments]] = await pool.query(
    `SELECT COUNT(*) AS n FROM commitments WHERE patient_id = ? AND status = 'open' AND due_date < CURDATE()`,
    [patientId]
  );
  if (overdueCommitments.n > 0) {
    flags.push({ level: 'warning', text: `${overdueCommitments.n} care-plan item${overdueCommitments.n > 1 ? 's' : ''} overdue` });
  }

  const [stays] = await pool.query(
    `SELECT status, DATEDIFF(CURDATE(), DATE(COALESCE(discharged_at, admitted_at))) AS days
     FROM admissions WHERE patient_id = ?
       AND (status IN ('admitted', 'cleared') OR discharged_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))
     ORDER BY admitted_at DESC LIMIT 1`,
    [patientId]
  );
  if (stays.length) {
    const s = stays[0];
    flags.push({
      level: 'info',
      text: s.status === 'discharged' ? `Discharged from hospital ${s.days} days ago` : 'Currently admitted in hospital',
    });
  }

  if (intake && intake.medication_changes) {
    flags.push({ level: 'info', text: `Medication change reported: ${intake.medication_changes}` });
  }

  const [[seen]] = await pool.query(
    `SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ? AND doctor_id = ? AND status = 'completed'`,
    [patientId, doctorId]
  );
  if (seen.n === 0) flags.push({ level: 'info', text: 'First visit with you' });
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
  const [existing] = await pool.query('SELECT id FROM intake_forms WHERE appointment_id = ?', [appointmentId]);
  await pool.query(
    `INSERT INTO intake_forms (appointment_id, patient_id, chief_complaint, symptoms, symptom_duration, severity,
        medication_changes, new_allergies, questions_for_doctor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE chief_complaint = VALUES(chief_complaint), symptoms = VALUES(symptoms),
        symptom_duration = VALUES(symptom_duration), severity = VALUES(severity),
        medication_changes = VALUES(medication_changes), new_allergies = VALUES(new_allergies),
        questions_for_doctor = VALUES(questions_for_doctor)`,
    [appointmentId, req.user.id, chiefComplaint, symptomList.slice(0, 255) || null, symptomDuration || null,
      severity || null, medicationChanges || null, newAllergies || null, questionsForDoctor || null]
  );

  if (!existing.length) {
    await notify(pool, appt.doctor_id, 'intake', 'Pre-visit info received',
      `Your patient shared their reason for the ${appt.appointment_date} visit. The Smart Brief is ready.`, 'appointment', appt.id);
  }
  await audit(pool, req.user.id, existing.length ? 'intake.updated' : 'intake.submitted', 'appointment', appt.id,
    `Pre-visit intake for appointment on ${appt.appointment_date}`);
  res.status(existing.length ? 200 : 201).json({ message: 'Thanks - your doctor will see this before your visit.' });
});

// GET /api/visit-loop/intake/:appointmentId
const getIntake = asyncHandler(async (req, res) => {
  const appt = await getAppointment(req.params.appointmentId);
  if (req.user.role === 'patient' && appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (req.user.role === 'staff') throw new ApiError(403, 'You do not have permission to perform this action.');
  const [rows] = await pool.query('SELECT * FROM intake_forms WHERE appointment_id = ?', [appt.id]);
  res.json({ intake: rows[0] || null });
});

// GET /api/visit-loop/pending-intakes - upcoming visits still missing an intake.
const pendingIntakes = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.appointment_date, a.start_time, du.full_name AS doctor_name, s.name AS specialization
     FROM appointments a
     JOIN users du ON du.id = a.doctor_id
     JOIN doctors d ON d.user_id = a.doctor_id
     JOIN specializations s ON s.id = d.specialization_id
     LEFT JOIN intake_forms i ON i.appointment_id = a.id
     WHERE a.patient_id = ? AND a.status IN ('pending', 'confirmed') AND a.appointment_date >= CURDATE() AND i.id IS NULL
     ORDER BY a.appointment_date, a.start_time`,
    [req.user.id]
  );
  res.json({ appointments: rows });
});

// GET /api/visit-loop/intake-status - ids of the caller's appointments that already have an intake
// (used to show "Intake sent" / "Intake received" badges on appointment lists).
const intakeStatus = asyncHandler(async (req, res) => {
  const column = req.user.role === 'doctor' ? 'a.doctor_id' : 'a.patient_id';
  const [rows] = await pool.query(
    `SELECT i.appointment_id FROM intake_forms i JOIN appointments a ON a.id = i.appointment_id WHERE ${column} = ?`,
    [req.user.id]
  );
  res.json({ appointmentIds: rows.map((r) => r.appointment_id) });
});

// ---------------------------------------------------------------------------
// Smart Brief (doctor, before the visit)
// ---------------------------------------------------------------------------

// GET /api/visit-loop/brief/:appointmentId - everything the doctor needs, compiled.
const getBrief = asyncHandler(async (req, res) => {
  const appt = await getAppointment(req.params.appointmentId);
  if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  const patientId = appt.patient_id;

  const [[patient]] = await pool.query(
    `SELECT u.id, u.full_name, u.phone, p.gender, p.blood_group, p.height_cm, p.weight_kg, p.city,
            p.allergies, p.chronic_conditions, p.emergency_contact_name, p.emergency_contact_phone,
            TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) AS age
     FROM users u JOIN patients p ON p.user_id = u.id WHERE u.id = ?`,
    [patientId]
  );
  const h = Number(patient.height_cm);
  const w = Number(patient.weight_kg);
  patient.bmi = h > 0 && w > 0 ? Math.round((w / ((h / 100) ** 2)) * 10) / 10 : null;

  const [intakeRows] = await pool.query('SELECT * FROM intake_forms WHERE appointment_id = ?', [appt.id]);
  const intake = intakeRows[0] || null;

  const [medications] = await pool.query(
    `SELECT m.id, m.medicine_name AS name, m.dosage, m.frequency,
            ROUND(100 * SUM(ml.status = 'taken') / NULLIF(COUNT(ml.id), 0)) AS adherence_pct_7d
     FROM medications m
     LEFT JOIN medication_logs ml ON ml.medication_id = m.id AND ml.log_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     WHERE m.patient_id = ? AND m.is_active = 1 AND (m.end_date IS NULL OR m.end_date >= CURDATE())
     GROUP BY m.id ORDER BY m.start_date DESC`,
    [patientId]
  );
  medications.forEach((m) => { m.adherence_pct_7d = m.adherence_pct_7d === null ? null : Number(m.adherence_pct_7d); });

  const [[adh]] = await pool.query(
    `SELECT ROUND(100 * SUM(ml.status = 'taken') / NULLIF(COUNT(*), 0)) AS pct30,
            SUM(ml.status = 'missed' AND ml.log_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS missed7
     FROM medication_logs ml JOIN medications m ON m.id = ml.medication_id
     WHERE m.patient_id = ? AND ml.log_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    [patientId]
  );

  const [recentRecords] = await pool.query(
    `SELECT mr.id, mr.record_date, mr.diagnosis, mr.follow_up_date, mr.vitals_bp, mr.vitals_pulse, du.full_name AS doctor_name
     FROM medical_records mr JOIN users du ON du.id = mr.doctor_id
     WHERE mr.patient_id = ? ORDER BY mr.record_date DESC LIMIT 5`,
    [patientId]
  );

  const [openCommitments] = await pool.query(
    `SELECT title, kind, due_date, (due_date IS NOT NULL AND due_date < CURDATE()) AS overdue
     FROM commitments WHERE patient_id = ? AND status = 'open' ORDER BY due_date IS NULL, due_date`,
    [patientId]
  );
  openCommitments.forEach((c) => { c.overdue = !!c.overdue; });

  const [[visits]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(doctor_id = ?) AS withThisDoctor, MAX(appointment_date) AS lastVisit
     FROM appointments WHERE patient_id = ? AND status = 'completed'`,
    [appt.doctor_id, patientId]
  );

  const flags = await buildFlags(patientId, appt.doctor_id, intake, patient);
  const careScore = await computeCareScore(pool, patientId);

  await audit(pool, req.user.id, 'brief.viewed', 'appointment', appt.id, `Smart Brief opened for ${patient.full_name}`);

  res.json({
    appointment: {
      id: appt.id, appointment_date: appt.appointment_date, start_time: appt.start_time,
      consultation_mode: appt.consultation_mode, status: appt.status, reason: appt.reason,
    },
    patient,
    intake,
    medications,
    adherence: { pct30: adh.pct30 === null ? null : Number(adh.pct30), missedLast7: Number(adh.missed7 || 0) },
    recentRecords,
    openCommitments,
    visitHistory: { total: visits.total, withThisDoctor: Number(visits.withThisDoctor || 0), lastVisit: visits.lastVisit },
    flags,
    careScore,
  });
});

// GET /api/visit-loop/briefs/today - the doctor's next ~3 days of visits with brief readiness.
const briefsToday = asyncHandler(async (req, res) => {
  const [appts] = await pool.query(
    `SELECT a.id AS appointment_id, a.patient_id, pu.full_name AS patient_name, a.appointment_date, a.start_time,
            p.allergies, i.id AS intake_id
     FROM appointments a
     JOIN users pu ON pu.id = a.patient_id
     JOIN patients p ON p.user_id = a.patient_id
     LEFT JOIN intake_forms i ON i.appointment_id = a.id
     WHERE a.doctor_id = ? AND a.status != 'cancelled'
       AND a.appointment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 6 DAY)
     ORDER BY a.appointment_date, a.start_time`,
    [req.user.id]
  );

  const items = [];
  for (const a of appts) {
    let intake = null;
    if (a.intake_id) {
      const [rows] = await pool.query('SELECT * FROM intake_forms WHERE id = ?', [a.intake_id]);
      intake = rows[0] || null;
    }
    const flags = await buildFlags(a.patient_id, req.user.id, intake, { allergies: a.allergies });
    const meaningful = flags.filter((f) => f.level !== 'info');
    items.push({
      appointment_id: a.appointment_id,
      patient_id: a.patient_id,
      patient_name: a.patient_name,
      appointment_date: a.appointment_date,
      start_time: a.start_time,
      intake_done: !!intake,
      flag_count: meaningful.length,
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
    const [rows] = await pool.query('SELECT doctor_id, patient_id FROM medical_records WHERE id = ?', [medicalRecordId]);
    if (!rows.length) throw new ApiError(404, 'Medical record not found.');
    if (rows[0].doctor_id !== req.user.id || rows[0].patient_id !== Number(patientId)) {
      throw new ApiError(403, 'That medical record is not yours for this patient.');
    }
  } else if (admissionId) {
    const [rows] = await pool.query('SELECT doctor_id, patient_id FROM admissions WHERE id = ?', [admissionId]);
    if (!rows.length) throw new ApiError(404, 'Admission not found.');
    if (rows[0].doctor_id !== req.user.id || rows[0].patient_id !== Number(patientId)) {
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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO care_plans (patient_id, doctor_id, medical_record_id, admission_id, plain_summary) VALUES (?, ?, ?, ?, ?)`,
      [patientId, req.user.id, medicalRecordId || null, admissionId || null, plainSummary]
    );
    const planId = result.insertId;
    for (const c of items) {
      await conn.query(
        `INSERT INTO commitments (care_plan_id, patient_id, owner_role, kind, title, due_date) VALUES (?, ?, ?, ?, ?, ?)`,
        [planId, patientId, c.ownerRole, c.kind, c.title, c.dueDate]
      );
    }
    await notify(conn, patientId, 'care_plan', 'Your care plan is ready',
      `Your doctor shared a plain-language plan${items.length ? ` with ${items.length} next step${items.length > 1 ? 's' : ''}` : ''}.`, 'care_plan', planId);
    await audit(conn, req.user.id, 'care_plan.created', 'care_plan', planId, `Care plan with ${items.length} commitments`);
    await conn.commit();
    res.status(201).json({ id: planId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

async function attachCommitments(plans) {
  if (!plans.length) return plans;
  const [rows] = await pool.query(
    `SELECT id, care_plan_id, title, kind, owner_role, due_date, status, completed_at,
            (status = 'open' AND due_date IS NOT NULL AND due_date < CURDATE()) AS overdue
     FROM commitments WHERE care_plan_id IN (?) ORDER BY due_date IS NULL, due_date`,
    [plans.map((p) => p.id)]
  );
  for (const p of plans) {
    p.commitments = rows.filter((r) => r.care_plan_id === p.id).map((r) => ({ ...r, overdue: !!r.overdue }));
  }
  return plans;
}

// GET /api/visit-loop/care-plans - patient: own; doctor: ?patientId= (or own authored); admin: ?patientId=.
const listCarePlans = asyncHandler(async (req, res) => {
  const { patientId } = req.query;
  const where = [];
  const params = [];
  if (req.user.role === 'patient') {
    where.push('cp.patient_id = ?');
    params.push(req.user.id);
  } else if (req.user.role === 'doctor') {
    if (patientId) {
      if (!(await doctorHasRelationship(req.user.id, patientId))) {
        throw new ApiError(403, "You can only view care plans for patients you've had an appointment with.");
      }
      where.push('cp.patient_id = ?');
      params.push(patientId);
    } else {
      where.push('cp.doctor_id = ?');
      params.push(req.user.id);
    }
  } else if (patientId) {
    where.push('cp.patient_id = ?');
    params.push(patientId);
  }

  const [plans] = await pool.query(
    `SELECT cp.id, cp.patient_id, cp.doctor_id, cp.medical_record_id, cp.admission_id, cp.plain_summary, cp.created_at,
            du.full_name AS doctor_name, pu.full_name AS patient_name, mr.diagnosis
     FROM care_plans cp
     JOIN users du ON du.id = cp.doctor_id
     JOIN users pu ON pu.id = cp.patient_id
     LEFT JOIN medical_records mr ON mr.id = cp.medical_record_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY cp.created_at DESC LIMIT 50`,
    params
  );
  res.json({ plans: await attachCommitments(plans) });
});

// GET /api/visit-loop/commitments - the patient's checklist, grouped.
const listCommitments = asyncHandler(async (req, res) => {
  let patientId = req.user.id;
  if (req.user.role !== 'patient') {
    patientId = req.query.patientId;
    if (!patientId) throw new ApiError(400, 'patientId is required.');
    if (req.user.role === 'doctor' && !(await doctorHasRelationship(req.user.id, patientId))) {
      throw new ApiError(403, "You can only view commitments for patients you've had an appointment with.");
    }
  }
  const [rows] = await pool.query(
    `SELECT c.id, c.title, c.kind, c.owner_role, c.due_date, c.status, c.completed_at, c.care_plan_id,
            du.full_name AS doctor_name
     FROM commitments c
     JOIN care_plans cp ON cp.id = c.care_plan_id
     JOIN users du ON du.id = cp.doctor_id
     WHERE c.patient_id = ?
     ORDER BY c.due_date IS NULL, c.due_date`,
    [patientId]
  );
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const open = [];
  const overdue = [];
  const done = [];
  for (const r of rows) {
    if (r.status !== 'open') done.push(r);
    else if (r.due_date && r.due_date < todayStr) overdue.push(r);
    else open.push(r);
  }
  done.sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
  res.json({ open, overdue, done });
});

// PATCH /api/visit-loop/commitments/:id - check off / reopen / skip.
const updateCommitment = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const [rows] = await pool.query(
    `SELECT c.*, cp.doctor_id FROM commitments c JOIN care_plans cp ON cp.id = c.care_plan_id WHERE c.id = ?`,
    [req.params.id]
  );
  if (!rows.length) throw new ApiError(404, 'Commitment not found.');
  const c = rows[0];

  const isPatientOwner = req.user.role === 'patient' && c.patient_id === req.user.id;
  const isDoctorOwner = req.user.role === 'doctor' && c.doctor_id === req.user.id && c.owner_role === 'doctor';
  if (!isPatientOwner && !isDoctorOwner && req.user.role !== 'admin') {
    throw new ApiError(403, 'You cannot update this item.');
  }

  await pool.query(
    `UPDATE commitments SET status = ?, completed_at = ? WHERE id = ?`,
    [status, status === 'open' ? null : new Date(), c.id]
  );
  if (status === 'done' && req.user.role === 'patient') {
    await notify(pool, c.doctor_id, 'care_plan', 'Care-plan step completed', `Your patient marked "${c.title}" as done.`, 'commitment', c.id);
  }
  await audit(pool, req.user.id, `commitment.${status}`, 'commitment', c.id, c.title);
  res.json({ message: status === 'done' ? 'Marked as done.' : status === 'skipped' ? 'Marked as skipped.' : 'Reopened.' });
});

// GET /api/visit-loop/analytics - admin view of where care loops are breaking.
const analytics = asyncHandler(async (req, res) => {
  const [[counts]] = await pool.query(
    `SELECT SUM(status = 'open') AS openCount,
            SUM(status = 'open' AND due_date < CURDATE()) AS overdueCount,
            SUM(status = 'done') AS doneCount,
            SUM(status = 'skipped') AS skippedCount
     FROM commitments`
  );
  const done = Number(counts.doneCount || 0);
  const settled = done + Number(counts.skippedCount || 0) + Number(counts.overdueCount || 0);

  const [overdueByKind] = await pool.query(
    `SELECT kind, COUNT(*) AS count FROM commitments
     WHERE status = 'open' AND due_date < CURDATE() GROUP BY kind ORDER BY count DESC`
  );
  const [overdueList] = await pool.query(
    `SELECT c.id, pu.full_name AS patient_name, c.title, c.kind, c.due_date, du.full_name AS doctor_name,
            DATEDIFF(CURDATE(), c.due_date) AS days_overdue
     FROM commitments c
     JOIN care_plans cp ON cp.id = c.care_plan_id
     JOIN users pu ON pu.id = c.patient_id
     JOIN users du ON du.id = cp.doctor_id
     WHERE c.status = 'open' AND c.due_date < CURDATE()
     ORDER BY c.due_date LIMIT 10`
  );

  res.json({
    openCount: Number(counts.openCount || 0),
    overdueCount: Number(counts.overdueCount || 0),
    completionRate: settled ? Math.round((done / settled) * 100) : null,
    overdueByKind,
    overdueList,
  });
});

module.exports = {
  saveIntake, getIntake, pendingIntakes, intakeStatus, getBrief, briefsToday,
  createCarePlan, listCarePlans, listCommitments, updateCommitment, analytics,
};
