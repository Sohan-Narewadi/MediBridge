const pool = require('../../database/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyDepartment, audit } = require('../utils/notify');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) return null;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map((p) => `${p[0].toUpperCase()}.`).slice(0, 3).join(' ');
}

function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age;
}

const GENDER_LABEL = { male: 'Male', female: 'Female', other: 'Other', prefer_not_to_say: 'Not stated' };

async function getHomeHospital(conn) {
  const [rows] = await conn.query('SELECT * FROM hospitals WHERE is_home = 1 ORDER BY id LIMIT 1');
  if (!rows.length) throw new ApiError(500, 'No home hospital is configured.');
  return rows[0];
}

// The hospital a request is sent *from*: the desk's own hospital, the admission's
// hospital when one is given, otherwise the home hospital.
async function resolveFromHospital(conn, req, admission) {
  if (req.staff) {
    const [rows] = await conn.query('SELECT * FROM hospitals WHERE id = ?', [req.staff.hospital_id]);
    return rows[0];
  }
  if (admission) {
    const [rows] = await conn.query('SELECT * FROM hospitals WHERE id = ?', [admission.hospital_id]);
    return rows[0];
  }
  return getHomeHospital(conn);
}

// May this user start a transfer for this patient?
async function assertCanTransferPatient(conn, req, patientId, admissionId) {
  const [p] = await conn.query('SELECT user_id FROM patients WHERE user_id = ?', [patientId]);
  if (!p.length) throw new ApiError(404, 'Patient not found.');

  let admission = null;
  if (admissionId) {
    const [rows] = await conn.query('SELECT * FROM admissions WHERE id = ? AND patient_id = ?', [admissionId, patientId]);
    if (!rows.length) throw new ApiError(404, 'Admission not found for this patient.');
    admission = rows[0];
    if (!['admitted', 'cleared'].includes(admission.status)) throw new ApiError(400, 'This admission is already closed.');
  }

  if (req.user.role === 'doctor') {
    const [rel] = await conn.query(
      `SELECT 1 FROM appointments WHERE doctor_id = ? AND patient_id = ? AND status <> 'cancelled'
       UNION SELECT 1 FROM admissions WHERE doctor_id = ? AND patient_id = ? LIMIT 1`,
      [req.user.id, patientId, req.user.id, patientId]
    );
    if (!rel.length) throw new ApiError(403, 'You can only transfer patients under your care.');
  } else if (req.staff) {
    if (!req.staff.is_home) throw new ApiError(403, 'Only the sending hospital\'s transfer desk can start a transfer.');
    if (admission && admission.hospital_id !== req.staff.hospital_id) throw new ApiError(403, 'This patient is admitted at another hospital.');
  }
  return admission;
}

// Is the caller on the *sending* side of this request (can see everything, complete, cancel)?
async function isSenderSide(conn, req, request) {
  if (req.user.role === 'admin') return true;
  if (req.user.role === 'doctor') {
    if (request.requested_by === req.user.id) return true;
    if (request.admission_id) {
      const [rows] = await conn.query('SELECT 1 FROM admissions WHERE id = ? AND doctor_id = ?', [request.admission_id, req.user.id]);
      return rows.length > 0;
    }
    return false;
  }
  return !!req.staff && req.staff.hospital_id === request.from_hospital_id;
}

// Ranked, explainable list of hospitals that can take a patient needing `specializationId`.
async function computeMatches(conn, { specializationId, needsIcu, fromHospital }) {
  const [caps] = await conn.query(
    `SELECT h.id AS hospital_id, h.name, h.city, h.latitude, h.longitude, s.name AS specialization,
            c.beds_available, c.icu_available
       FROM hospital_capabilities c
       JOIN hospitals h ON h.id = c.hospital_id
       JOIN specializations s ON s.id = c.specialization_id
      WHERE c.specialization_id = ? AND h.id <> ?`,
    [specializationId, fromHospital.id]
  );
  const [history] = await conn.query(
    `SELECT hospital_id,
            SUM(status = 'accepted') AS accepted,
            SUM(status = 'declined') AS declined,
            AVG(TIMESTAMPDIFF(MINUTE, sent_at, responded_at)) AS avg_minutes
       FROM transfer_offers WHERE responded_at IS NOT NULL GROUP BY hospital_id`
  );
  const historyBy = Object.fromEntries(history.map((h) => [h.hospital_id, h]));

  const matches = caps.map((c) => {
    const reasons = [];
    let score = 30; // has the specialization at all
    const beds = Number(c.beds_available);
    const icu = Number(c.icu_available);

    // Capacity: up to 20 points, full marks at 5+ free beds
    if (beds > 0) {
      score += Math.round(Math.min(beds, 5) / 5 * 20);
      reasons.push(`${c.specialization}: ${beds} bed${beds === 1 ? '' : 's'} free`);
    } else {
      score -= 20;
      reasons.push(`${c.specialization}: no beds free right now`);
    }

    // ICU: 15 points; if ICU is required and none is free, heavy penalty
    if (needsIcu) {
      if (icu >= 2) { score += 15; reasons.push(`${icu} ICU beds free`); }
      else if (icu === 1) { score += 10; reasons.push('1 ICU bed free'); }
      else { score -= 25; reasons.push('No ICU bed free (ICU required)'); }
    } else {
      score += 15;
      if (icu > 0) reasons.push(`ICU backup available (${icu})`);
    }

    // Distance: 20 points within 5 km, falling to 0 at 40 km
    const km = haversineKm(fromHospital.latitude, fromHospital.longitude, c.latitude, c.longitude);
    if (km !== null) {
      score += Math.round(Math.max(0, Math.min(1, (40 - km) / 35)) * 20);
      reasons.push(`${km.toFixed(1)} km away`);
    } else {
      score += 10;
    }

    // Responsiveness: 15 points from acceptance rate + response speed history
    const h = historyBy[c.hospital_id];
    const answered = h ? Number(h.accepted) + Number(h.declined) : 0;
    if (answered > 0) {
      const rate = Number(h.accepted) / answered;
      const avgMin = Number(h.avg_minutes) || 0;
      const speed = Math.max(0, 1 - avgMin / 60);
      score += Math.round(15 * (0.6 * rate + 0.4 * speed));
      reasons.push(`Usually responds in ~${Math.max(1, Math.round(avgMin))} min`);
      reasons.push(`Accepted ${Math.round(rate * 100)}% of past requests`);
    } else {
      score += 8;
      reasons.push('No transfer history yet');
    }

    return {
      hospital_id: c.hospital_id,
      name: c.name,
      city: c.city,
      score: Math.max(0, Math.min(100, score)),
      beds_available: beds,
      icu_available: icu,
      distance_km: km !== null ? Number(km.toFixed(1)) : null,
      reasons,
    };
  });

  return matches.sort((a, b) => b.score - a.score || (a.distance_km ?? 999) - (b.distance_km ?? 999));
}

// Builds the transfer summary from data MediBridge already holds - the sender types nothing twice.
async function buildClinicalSummary(conn, { patientId, admission, specializationId, needsIcu, urgency, reason, fromHospital, senderName }) {
  const [[patient]] = await conn.query(
    `SELECT u.full_name, u.phone, p.* FROM patients p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?`,
    [patientId]
  );
  const [[spec]] = await conn.query('SELECT name FROM specializations WHERE id = ?', [specializationId]);
  const [meds] = await conn.query(
    `SELECT medicine_name, dosage, frequency FROM medications
      WHERE patient_id = ? AND is_active = 1 AND start_date <= CURDATE() AND (end_date IS NULL OR end_date >= CURDATE())
      ORDER BY start_date DESC LIMIT 8`,
    [patientId]
  );
  const [records] = await conn.query(
    `SELECT mr.record_date, mr.diagnosis, mr.vitals_bp, mr.vitals_pulse, mr.vitals_temp, u.full_name AS doctor_name
       FROM medical_records mr JOIN users u ON u.id = mr.doctor_id
      WHERE mr.patient_id = ? ORDER BY mr.record_date DESC, mr.id DESC LIMIT 1`,
    [patientId]
  );

  const age = ageFrom(patient.date_of_birth);
  const lines = [];
  lines.push('TRANSFER SUMMARY - auto-generated by MediBridge from existing records');
  lines.push('');
  lines.push(`Patient: ${patient.full_name}${age !== null ? `, ${age} y` : ''}, ${GENDER_LABEL[patient.gender] || 'Not stated'}${patient.blood_group ? `, blood group ${patient.blood_group}` : ''}`);
  if (patient.height_cm || patient.weight_kg) {
    lines.push(`Height / weight: ${patient.height_cm ? `${patient.height_cm} cm` : '-'} / ${patient.weight_kg ? `${patient.weight_kg} kg` : '-'}`);
  }
  lines.push(`Urgency: ${String(urgency).toUpperCase()}  |  Care needed: ${spec ? spec.name : 'Specialist care'}${needsIcu ? ' (ICU bed required)' : ''}`);
  lines.push(`Reason for transfer: ${reason}`);
  lines.push('');
  if (admission) {
    lines.push(`Current admission: ${admission.ward || 'Ward'}${admission.bed ? `, bed ${admission.bed}` : ''} since ${String(admission.admitted_at).slice(0, 16)}`);
    lines.push(`Admission diagnosis: ${admission.diagnosis || 'Not recorded'}`);
    if (admission.insurance_provider) lines.push(`Insurance: ${admission.insurance_provider}${admission.insurance_policy_no ? ` (${admission.insurance_policy_no})` : ''}`);
    else lines.push('Insurance: self-pay');
  }
  if (records.length) {
    const r = records[0];
    const vitals = [r.vitals_bp && `BP ${r.vitals_bp}`, r.vitals_pulse && `pulse ${r.vitals_pulse}`, r.vitals_temp && `temp ${r.vitals_temp}`].filter(Boolean).join(', ');
    lines.push(`Latest record (${r.record_date}, ${r.doctor_name}): ${r.diagnosis || 'No diagnosis recorded'}`);
    if (vitals) lines.push(`Last recorded vitals: ${vitals}`);
  }
  lines.push(`Allergies: ${patient.allergies || 'None recorded'}`);
  lines.push(`Chronic conditions: ${patient.chronic_conditions || 'None recorded'}`);
  lines.push(`Current medications: ${meds.length ? meds.map((m) => `${m.medicine_name} ${m.dosage} (${m.frequency})`).join('; ') : 'None recorded'}`);
  if (patient.emergency_contact_name) {
    lines.push(`Emergency contact: ${patient.emergency_contact_name}${patient.emergency_contact_phone ? `, ${patient.emergency_contact_phone}` : ''}`);
  }
  lines.push('');
  lines.push(`Sent by: ${senderName}, ${fromHospital.name}${fromHospital.phone ? ` (${fromHospital.phone})` : ''}`);
  return lines.join('\n');
}

async function loadOffers(conn, requestIds) {
  if (!requestIds.length) return {};
  const [rows] = await conn.query(
    `SELECT o.id AS offer_id, o.request_id, o.hospital_id, h.name AS hospital_name, o.status, o.match_score,
            o.response_note, o.sent_at, o.responded_at, o.summary_viewed_at,
            CASE WHEN o.responded_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, o.sent_at, o.responded_at) END AS response_minutes,
            TIMESTAMPDIFF(MINUTE, o.sent_at, NOW()) AS minutes_since_sent
       FROM transfer_offers o JOIN hospitals h ON h.id = o.hospital_id
      WHERE o.request_id IN (?)
      ORDER BY o.match_score DESC`,
    [requestIds]
  );
  const by = {};
  for (const r of rows) (by[r.request_id] = by[r.request_id] || []).push(r);
  return by;
}

const REQUEST_SELECT = `
  SELECT r.id, r.patient_id, r.admission_id, r.from_hospital_id, r.requested_by, r.specialization_id, r.needs_icu,
         r.urgency, r.reason, r.consent_given, r.consent_note, r.status, r.accepted_hospital_id, r.created_at, r.accepted_at,
         TIMESTAMPDIFF(MINUTE, r.created_at, NOW()) AS minutes_ago,
         pu.full_name AS patient_name, p.date_of_birth, p.gender,
         s.name AS specialization, fh.name AS from_hospital, ah.name AS accepted_hospital,
         ru.full_name AS requested_by_name
    FROM transfer_requests r
    JOIN users pu ON pu.id = r.patient_id
    JOIN patients p ON p.user_id = r.patient_id
    JOIN specializations s ON s.id = r.specialization_id
    JOIN hospitals fh ON fh.id = r.from_hospital_id
    LEFT JOIN hospitals ah ON ah.id = r.accepted_hospital_id
    LEFT JOIN users ru ON ru.id = r.requested_by`;

// ---------------------------------------------------------------------------
// Middleware: staff must be a transfer desk; attaches req.staff
// ---------------------------------------------------------------------------
const loadDesk = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'staff') return next();
  const [rows] = await pool.query(
    `SELECT s.user_id, s.hospital_id, s.department, h.name AS hospital_name, h.is_home
       FROM staff s JOIN hospitals h ON h.id = s.hospital_id WHERE s.user_id = ?`,
    [req.user.id]
  );
  const staff = rows[0];
  if (!staff || staff.department !== 'transfer_desk') {
    throw new ApiError(403, 'TransferConnect is handled by the transfer desk.');
  }
  req.staff = staff;
  next();
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// GET /api/transfers/desk - who am I on the transfer network (fallback for /api/staff/me)
const getDesk = asyncHandler(async (req, res) => {
  if (req.staff) return res.json({ desk: { ...req.staff, role: 'staff' } });
  const home = await getHomeHospital(pool);
  res.json({ desk: { hospital_id: home.id, hospital_name: home.name, is_home: 1, role: req.user.role } });
});

// GET /api/transfers/hospitals
const listHospitals = asyncHandler(async (req, res) => {
  const [hospitals] = await pool.query('SELECT id, name, city, address, phone, is_home, latitude, longitude FROM hospitals ORDER BY is_home DESC, name');
  const [caps] = await pool.query(
    `SELECT c.hospital_id, s.id AS specialization_id, s.name AS specialization, c.beds_available, c.icu_available
       FROM hospital_capabilities c JOIN specializations s ON s.id = c.specialization_id ORDER BY s.name`
  );
  res.json({
    hospitals: hospitals.map((h) => ({
      ...h,
      capabilities: caps.filter((c) => c.hospital_id === h.id).map(({ hospital_id, ...rest }) => rest),
    })),
  });
});

// GET /api/transfers/candidates - patients the caller may start a transfer for
const listCandidates = asyncHandler(async (req, res) => {
  if (req.staff && !req.staff.is_home) return res.json({ patients: [] });
  const params = [];
  let admissionWhere = `a.status IN ('admitted', 'cleared')`;
  if (req.user.role === 'doctor') { admissionWhere += ' AND a.doctor_id = ?'; params.push(req.user.id); }
  if (req.staff) { admissionWhere += ' AND a.hospital_id = ?'; params.push(req.staff.hospital_id); }

  const [admitted] = await pool.query(
    `SELECT u.id, u.full_name, p.date_of_birth, p.gender, a.id AS admission_id, a.ward, a.bed, a.diagnosis
       FROM admissions a JOIN users u ON u.id = a.patient_id JOIN patients p ON p.user_id = a.patient_id
      WHERE ${admissionWhere} ORDER BY a.admitted_at DESC`,
    params
  );
  let outpatients = [];
  if (req.user.role === 'doctor') {
    [outpatients] = await pool.query(
      `SELECT DISTINCT u.id, u.full_name, p.date_of_birth, p.gender
         FROM appointments ap JOIN users u ON u.id = ap.patient_id JOIN patients p ON p.user_id = ap.patient_id
        WHERE ap.doctor_id = ? AND ap.status <> 'cancelled' ORDER BY u.full_name`,
      [req.user.id]
    );
  }
  const admittedIds = new Set(admitted.map((a) => a.id));
  const shape = (r) => ({
    id: r.id, full_name: r.full_name, age: ageFrom(r.date_of_birth), gender: r.gender,
    admission_id: r.admission_id || null, ward: r.ward || null, bed: r.bed || null, diagnosis: r.diagnosis || null,
  });
  res.json({ patients: [...admitted.map(shape), ...outpatients.filter((o) => !admittedIds.has(o.id)).map(shape)] });
});

// POST /api/transfers/match
const match = asyncHandler(async (req, res) => {
  if (req.staff && !req.staff.is_home) throw new ApiError(403, 'Only the sending hospital can search for receiving hospitals.');
  const fromHospital = await resolveFromHospital(pool, req, null);
  const matches = await computeMatches(pool, {
    specializationId: Number(req.body.specializationId),
    needsIcu: !!req.body.needsIcu,
    fromHospital,
  });
  res.json({ matches });
});

// POST /api/transfers/preview-summary - shows the sender exactly what will be shared
const previewSummary = asyncHandler(async (req, res) => {
  const { patientId, admissionId, specializationId, needsIcu, urgency, reason } = req.body;
  const admission = await assertCanTransferPatient(pool, req, patientId, admissionId || null);
  const fromHospital = await resolveFromHospital(pool, req, admission);
  const summary = await buildClinicalSummary(pool, {
    patientId, admission, specializationId, needsIcu: !!needsIcu, urgency: urgency || 'urgent',
    reason: reason || '(reason not entered yet)', fromHospital, senderName: req.user.name || 'Sender',
  });
  res.json({ summary });
});

// POST /api/transfers
const create = asyncHandler(async (req, res) => {
  const { patientId, admissionId, specializationId, needsIcu, urgency, reason, consentGiven, consentNote, hospitalIds } = req.body;
  if (consentGiven !== true) throw new ApiError(400, 'Patient consent is required before sharing records with another hospital.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const admission = await assertCanTransferPatient(conn, req, patientId, admissionId || null);
    const fromHospital = await resolveFromHospital(conn, req, admission);

    const [open] = await conn.query(
      `SELECT id FROM transfer_requests WHERE patient_id = ? AND status IN ('open', 'accepted') LIMIT 1`,
      [patientId]
    );
    if (open.length) throw new ApiError(409, 'This patient already has an active transfer request.');

    const matches = await computeMatches(conn, { specializationId, needsIcu: !!needsIcu, fromHospital });
    const byId = Object.fromEntries(matches.map((m) => [m.hospital_id, m]));
    const targets = [...new Set(hospitalIds.map(Number))].filter((id) => byId[id]);
    if (!targets.length) throw new ApiError(400, 'None of the selected hospitals can provide this care.');

    const summary = await buildClinicalSummary(conn, {
      patientId, admission, specializationId, needsIcu: !!needsIcu, urgency, reason, fromHospital,
      senderName: req.user.name || 'Sender',
    });

    const [result] = await conn.query(
      `INSERT INTO transfer_requests (patient_id, admission_id, from_hospital_id, requested_by, specialization_id, needs_icu,
                                      urgency, reason, clinical_summary, consent_given, consent_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [patientId, admission ? admission.id : null, fromHospital.id, req.user.id, specializationId, needsIcu ? 1 : 0,
        urgency, reason, summary, consentNote || null]
    );
    const requestId = result.insertId;
    const [[spec]] = await conn.query('SELECT name FROM specializations WHERE id = ?', [specializationId]);

    for (const hospitalId of targets) {
      await conn.query(
        'INSERT INTO transfer_offers (request_id, hospital_id, match_score) VALUES (?, ?, ?)',
        [requestId, hospitalId, byId[hospitalId].score]
      );
      await notifyDepartment(conn, 'transfer_desk', hospitalId, 'transfer_request',
        `${urgency === 'critical' ? 'CRITICAL ' : ''}Transfer request: ${spec.name}`,
        `${fromHospital.name} is asking if you can accept a ${spec.name} patient${needsIcu ? ' needing ICU' : ''}. Please respond.`,
        'transfer_request', requestId);
    }
    await audit(conn, req.user.id, 'transfer.requested', 'transfer_request', requestId,
      `${urgency} ${spec.name} transfer sent to ${targets.length} hospital(s)`);

    await conn.commit();
    res.status(201).json({ request: { id: requestId, hospitalsContacted: targets.length } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// GET /api/transfers - outgoing for senders, incoming for partner desks, everything for admin
const list = asyncHandler(async (req, res) => {
  const where = [];
  const params = [];
  const partnerDesk = req.staff && !req.staff.is_home;

  if (req.user.role === 'doctor') {
    where.push('(r.requested_by = ? OR r.admission_id IN (SELECT id FROM admissions WHERE doctor_id = ?))');
    params.push(req.user.id, req.user.id);
  } else if (partnerDesk) {
    where.push('r.id IN (SELECT request_id FROM transfer_offers WHERE hospital_id = ?)');
    params.push(req.staff.hospital_id);
  } else if (req.staff) {
    where.push('r.from_hospital_id = ?');
    params.push(req.staff.hospital_id);
  }
  if (req.query.status) { where.push('r.status = ?'); params.push(req.query.status); }

  const [rows] = await pool.query(
    `${REQUEST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY FIELD(r.status, 'open', 'accepted', 'completed', 'cancelled'), r.created_at DESC LIMIT 100`,
    params
  );
  const offersBy = await loadOffers(pool, rows.map((r) => r.id));

  res.json({
    requests: rows.map((r) => {
      let offers = offersBy[r.id] || [];
      if (partnerDesk) offers = offers.filter((o) => o.hospital_id === req.staff.hospital_id);
      return {
        id: r.id,
        patient_id: partnerDesk ? undefined : r.patient_id,
        admission_id: r.admission_id,
        patient_name: partnerDesk ? initials(r.patient_name) : r.patient_name,
        patient_age: ageFrom(r.date_of_birth),
        patient_gender: GENDER_LABEL[r.gender] || 'Not stated',
        specialization: r.specialization,
        needs_icu: !!r.needs_icu,
        urgency: r.urgency,
        reason: r.reason,
        status: r.status,
        from_hospital: r.from_hospital,
        requested_by_name: r.requested_by_name,
        created_at: r.created_at,
        minutes_ago: r.minutes_ago,
        accepted_hospital: r.accepted_hospital,
        consent_note: r.consent_note,
        offers,
      };
    }),
  });
});

// GET /api/transfers/incoming - the partner desk's queue (privacy-reduced)
const incoming = asyncHandler(async (req, res) => {
  if (!req.staff) throw new ApiError(403, 'Only transfer desks receive transfer requests.');
  const [rows] = await pool.query(
    `SELECT o.id AS offer_id, o.request_id, o.status, o.match_score, o.response_note, o.summary_viewed_at,
            o.sent_at, o.responded_at,
            TIMESTAMPDIFF(MINUTE, o.sent_at, COALESCE(o.responded_at, NOW())) AS minutes_waiting,
            r.urgency, r.needs_icu, r.reason, r.status AS request_status, s.name AS specialization,
            fh.name AS from_hospital, pu.full_name AS patient_name, p.date_of_birth, p.gender
       FROM transfer_offers o
       JOIN transfer_requests r ON r.id = o.request_id
       JOIN specializations s ON s.id = r.specialization_id
       JOIN hospitals fh ON fh.id = r.from_hospital_id
       JOIN users pu ON pu.id = r.patient_id
       JOIN patients p ON p.user_id = r.patient_id
      WHERE o.hospital_id = ?
      ORDER BY o.status = 'pending' DESC, FIELD(r.urgency, 'critical', 'urgent', 'routine'), o.sent_at DESC
      LIMIT 100`,
    [req.staff.hospital_id]
  );
  res.json({
    hospital: { id: req.staff.hospital_id, name: req.staff.hospital_name },
    offers: rows.map((r) => ({
      offer_id: r.offer_id,
      request_id: r.request_id,
      status: r.status,
      request_status: r.request_status,
      urgency: r.urgency,
      specialization: r.specialization,
      needs_icu: !!r.needs_icu,
      reason: r.reason,
      minutes_waiting: r.minutes_waiting,
      from_hospital: r.from_hospital,
      patient_initials: initials(r.patient_name),
      patient_age: ageFrom(r.date_of_birth),
      patient_gender: GENDER_LABEL[r.gender] || 'Not stated',
      match_score: r.match_score,
      response_note: r.response_note,
      summary_viewed: !!r.summary_viewed_at,
      sent_at: r.sent_at,
      responded_at: r.responded_at,
    })),
  });
});

// GET /api/transfers/:id
const getById = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`${REQUEST_SELECT} WHERE r.id = ?`, [req.params.id]);
  if (!rows.length) throw new ApiError(404, 'Transfer request not found.');
  const r = rows[0];
  const [[full]] = await pool.query('SELECT clinical_summary FROM transfer_requests WHERE id = ?', [r.id]);
  const offersBy = await loadOffers(pool, [r.id]);
  let offers = offersBy[r.id] || [];

  const sender = await isSenderSide(pool, req, r);
  let myOffer = null;
  if (!sender) {
    if (!req.staff) throw new ApiError(403, 'You do not have access to this transfer request.');
    myOffer = offers.find((o) => o.hospital_id === req.staff.hospital_id);
    if (!myOffer) throw new ApiError(403, 'This request was not sent to your hospital.');
    offers = [myOffer];
    // Opening the request reveals the clinical summary - record that access.
    await pool.query('UPDATE transfer_offers SET summary_viewed_at = COALESCE(summary_viewed_at, NOW()) WHERE id = ?', [myOffer.offer_id]);
    await audit(pool, req.user.id, 'transfer.summary_viewed', 'transfer_request', r.id,
      `${req.staff.hospital_name} viewed the clinical summary`);
  }

  res.json({
    request: {
      id: r.id,
      patient_name: r.patient_name,
      patient_age: ageFrom(r.date_of_birth),
      patient_gender: GENDER_LABEL[r.gender] || 'Not stated',
      specialization: r.specialization,
      needs_icu: !!r.needs_icu,
      urgency: r.urgency,
      reason: r.reason,
      status: r.status,
      from_hospital: r.from_hospital,
      requested_by_name: r.requested_by_name,
      created_at: r.created_at,
      minutes_ago: r.minutes_ago,
      accepted_hospital: r.accepted_hospital,
      consent_given: !!r.consent_given,
      consent_note: r.consent_note,
      clinical_summary: full.clinical_summary,
      offers,
      my_offer: myOffer,
      viewer: sender ? 'sender' : 'receiver',
    },
  });
});

// POST /api/transfers/offers/:id/respond - receiving desk accepts or declines
const respond = asyncHandler(async (req, res) => {
  if (!req.staff) throw new ApiError(403, 'Only a receiving transfer desk can respond.');
  const { decision, note } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [offers] = await conn.query('SELECT * FROM transfer_offers WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!offers.length) throw new ApiError(404, 'Offer not found.');
    const offer = offers[0];
    if (offer.hospital_id !== req.staff.hospital_id) throw new ApiError(403, 'This request was not sent to your hospital.');

    const [requests] = await conn.query('SELECT * FROM transfer_requests WHERE id = ? FOR UPDATE', [offer.request_id]);
    const request = requests[0];
    if (offer.status !== 'pending') throw new ApiError(409, `You already ${offer.status === 'withdrawn' ? 'lost this request to another hospital' : offer.status + ' this request'}.`);
    if (request.status !== 'open') throw new ApiError(409, 'This request has already been placed with another hospital.');

    const [[spec]] = await conn.query('SELECT name FROM specializations WHERE id = ?', [request.specialization_id]);
    const [[patient]] = await conn.query('SELECT full_name FROM users WHERE id = ?', [request.patient_id]);
    const hospitalName = req.staff.hospital_name;

    if (decision === 'decline') {
      await conn.query(
        `UPDATE transfer_offers SET status = 'declined', response_note = ?, responded_by = ?, responded_at = NOW(),
                summary_viewed_at = COALESCE(summary_viewed_at, NOW()) WHERE id = ?`,
        [note || null, req.user.id, offer.id]
      );
      await notify(conn, request.requested_by, 'transfer_declined', `${hospitalName} declined the transfer`,
        `${hospitalName} cannot take ${patient.full_name} (${spec.name})${note ? `: ${note}` : '.'}`, 'transfer_request', request.id);

      const [[left]] = await conn.query(
        `SELECT COUNT(*) AS n FROM transfer_offers WHERE request_id = ? AND status = 'pending'`, [request.id]);
      if (left.n === 0) {
        await notify(conn, request.requested_by, 'transfer_all_declined', 'All hospitals declined',
          `Every hospital contacted for ${patient.full_name} has declined. Send the request to more hospitals.`, 'transfer_request', request.id);
      }
      await audit(conn, req.user.id, 'transfer.declined', 'transfer_request', request.id, `${hospitalName} declined`);
    } else {
      // Accepting reserves a bed, so the hospital must actually list one free.
      const [[cap]] = await conn.query(
        'SELECT beds_available, icu_available FROM hospital_capabilities WHERE hospital_id = ? AND specialization_id = ? FOR UPDATE',
        [offer.hospital_id, request.specialization_id]
      );
      if (!cap || cap.beds_available < 1) throw new ApiError(409, `Your hospital lists no free ${spec.name} bed right now, so this request can only be declined.`);
      if (request.needs_icu && cap.icu_available < 1) throw new ApiError(409, 'Your hospital lists no free ICU bed right now, so this request can only be declined.');

      await conn.query(
        `UPDATE transfer_offers SET status = 'accepted', response_note = ?, responded_by = ?, responded_at = NOW(),
                summary_viewed_at = COALESCE(summary_viewed_at, NOW()) WHERE id = ?`,
        [note || null, req.user.id, offer.id]
      );
      await conn.query(
        `UPDATE transfer_requests SET status = 'accepted', accepted_hospital_id = ?, accepted_at = NOW() WHERE id = ?`,
        [offer.hospital_id, request.id]
      );
      // First accept wins: everyone else is stood down.
      const [others] = await conn.query(
        `SELECT hospital_id FROM transfer_offers WHERE request_id = ? AND id <> ? AND status = 'pending'`,
        [request.id, offer.id]
      );
      await conn.query(
        `UPDATE transfer_offers SET status = 'withdrawn' WHERE request_id = ? AND id <> ? AND status = 'pending'`,
        [request.id, offer.id]
      );
      for (const o of others) {
        await notifyDepartment(conn, 'transfer_desk', o.hospital_id, 'transfer_withdrawn', 'Transfer request filled',
          `The ${spec.name} transfer from another hospital has been placed elsewhere. No action needed.`, 'transfer_request', request.id);
      }
      // Reserve the bed at the receiving hospital (capacity checked above, so cancel can give it back exactly).
      await conn.query(
        `UPDATE hospital_capabilities
            SET beds_available = beds_available - 1,
                icu_available = IF(?, icu_available - 1, icu_available)
          WHERE hospital_id = ? AND specialization_id = ?`,
        [request.needs_icu ? 1 : 0, offer.hospital_id, request.specialization_id]
      );
      await notify(conn, request.requested_by, 'transfer_accepted', `${hospitalName} accepted the transfer`,
        `${hospitalName} will receive ${patient.full_name} (${spec.name}).${note ? ` Note: ${note}` : ''}`, 'transfer_request', request.id);
      await notify(conn, request.patient_id, 'transfer_accepted', 'Your transfer has been arranged',
        `${hospitalName} has accepted you for ${spec.name} care. Your care team will arrange the move and has shared your records with your consent.`,
        'transfer_request', request.id);
      await audit(conn, req.user.id, 'transfer.accepted', 'transfer_request', request.id, `${hospitalName} accepted the transfer`);
    }

    await conn.commit();
    res.json({ message: decision === 'accept' ? 'Transfer accepted. The sending team has been notified.' : 'Response sent.' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

async function loadRequestForSender(conn, req) {
  const [rows] = await conn.query('SELECT * FROM transfer_requests WHERE id = ? FOR UPDATE', [req.params.id]);
  if (!rows.length) throw new ApiError(404, 'Transfer request not found.');
  if (!(await isSenderSide(conn, req, rows[0]))) throw new ApiError(403, 'Only the sending team can change this request.');
  return rows[0];
}

// POST /api/transfers/:id/complete - patient has physically moved
const complete = asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const request = await loadRequestForSender(conn, req);
    if (request.status !== 'accepted') throw new ApiError(400, 'Only an accepted transfer can be completed.');
    await conn.query(`UPDATE transfer_requests SET status = 'completed' WHERE id = ?`, [request.id]);
    if (request.admission_id) {
      await conn.query(
        `UPDATE admissions SET status = 'transferred', discharged_at = NOW() WHERE id = ? AND status IN ('admitted', 'cleared')`,
        [request.admission_id]
      );
    }
    await notifyDepartment(conn, 'transfer_desk', request.accepted_hospital_id, 'transfer_completed', 'Patient is on the way',
      'The sending hospital has marked the transfer complete - the patient has left for your hospital.', 'transfer_request', request.id);
    await audit(conn, req.user.id, 'transfer.completed', 'transfer_request', request.id, 'Transfer completed');
    await conn.commit();
    res.json({ message: 'Transfer marked complete.' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// POST /api/transfers/:id/cancel
const cancel = asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const request = await loadRequestForSender(conn, req);
    if (!['open', 'accepted'].includes(request.status)) throw new ApiError(400, 'This request is already closed.');

    const [active] = await conn.query(
      `SELECT hospital_id FROM transfer_offers WHERE request_id = ? AND status IN ('pending', 'accepted')`, [request.id]);
    await conn.query(`UPDATE transfer_offers SET status = 'withdrawn' WHERE request_id = ? AND status = 'pending'`, [request.id]);
    await conn.query(`UPDATE transfer_requests SET status = 'cancelled' WHERE id = ?`, [request.id]);
    if (request.status === 'accepted') {
      // Give the reserved bed back.
      await conn.query(
        `UPDATE hospital_capabilities
            SET beds_available = beds_available + 1, icu_available = icu_available + IF(?, 1, 0)
          WHERE hospital_id = ? AND specialization_id = ?`,
        [request.needs_icu ? 1 : 0, request.accepted_hospital_id, request.specialization_id]
      );
    }
    for (const o of active) {
      await notifyDepartment(conn, 'transfer_desk', o.hospital_id, 'transfer_cancelled', 'Transfer request cancelled',
        'The sending hospital cancelled a transfer request sent to you. No action needed.', 'transfer_request', request.id);
    }
    await audit(conn, req.user.id, 'transfer.cancelled', 'transfer_request', request.id, 'Transfer request cancelled');
    await conn.commit();
    res.json({ message: 'Transfer request cancelled.' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// GET /api/transfers/analytics (admin)
const analytics = asyncHandler(async (req, res) => {
  const [[counts]] = await pool.query(
    `SELECT SUM(status = 'open') AS open, SUM(status = 'accepted') AS accepted, SUM(status = 'completed') AS completed
       FROM transfer_requests`
  );
  const [[offerStats]] = await pool.query(
    `SELECT AVG(TIMESTAMPDIFF(MINUTE, sent_at, responded_at)) AS avg_minutes,
            SUM(status = 'accepted') AS accepted, SUM(status = 'declined') AS declined
       FROM transfer_offers WHERE responded_at IS NOT NULL`
  );
  const answered = Number(offerStats.accepted || 0) + Number(offerStats.declined || 0);
  const [recent] = await pool.query(`${REQUEST_SELECT} ORDER BY r.created_at DESC LIMIT 8`);
  res.json({
    open: Number(counts.open || 0),
    accepted: Number(counts.accepted || 0),
    completed: Number(counts.completed || 0),
    avgResponseMinutes: offerStats.avg_minutes !== null ? Math.round(Number(offerStats.avg_minutes)) : null,
    acceptanceRate: answered ? Math.round((Number(offerStats.accepted) / answered) * 100) : null,
    recent: recent.map((r) => ({
      id: r.id, patient_name: r.patient_name, specialization: r.specialization, urgency: r.urgency,
      status: r.status, created_at: r.created_at, minutes_ago: r.minutes_ago, accepted_hospital: r.accepted_hospital,
    })),
  });
});

module.exports = {
  loadDesk, getDesk, listHospitals, listCandidates, match, previewSummary, create, list, incoming, getById,
  respond, complete, cancel, analytics,
};
