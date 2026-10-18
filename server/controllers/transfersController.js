const { M, find, findOne, insert, insertMany, update, count, exists, byIds, minutesBetween, todayStr } = require('../../database/store');
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
const URGENCY_ORDER = ['critical', 'urgent', 'routine'];
const REQUEST_STATUS_ORDER = ['open', 'accepted', 'completed', 'cancelled'];

async function getHomeHospital() {
  const h = await findOne('hospitals', { is_home: 1 }, { sort: { id: 1 } });
  if (!h) throw new ApiError(500, 'No home hospital is configured.');
  return h;
}

// The hospital a request is sent *from*: the desk's own hospital, the admission's
// hospital when one is given, otherwise the home hospital.
async function resolveFromHospital(req, admission) {
  if (req.staff) return findOne('hospitals', { id: req.staff.hospital_id });
  if (admission) return findOne('hospitals', { id: admission.hospital_id });
  return getHomeHospital();
}

// May this user start a transfer for this patient?
async function assertCanTransferPatient(req, patientId, admissionId) {
  if (!(await exists('patients', { user_id: Number(patientId) }))) throw new ApiError(404, 'Patient not found.');

  let admission = null;
  if (admissionId) {
    admission = await findOne('admissions', { id: Number(admissionId), patient_id: Number(patientId) });
    if (!admission) throw new ApiError(404, 'Admission not found for this patient.');
    if (!['admitted', 'cleared'].includes(admission.status)) throw new ApiError(400, 'This admission is already closed.');
  }

  if (req.user.role === 'doctor') {
    const related = (await exists('appointments', { doctor_id: req.user.id, patient_id: Number(patientId), status: { $ne: 'cancelled' } }))
      || (await exists('admissions', { doctor_id: req.user.id, patient_id: Number(patientId) }));
    if (!related) throw new ApiError(403, 'You can only transfer patients under your care.');
  } else if (req.staff) {
    if (!req.staff.is_home) throw new ApiError(403, 'Only the sending hospital\'s transfer desk can start a transfer.');
    if (admission && admission.hospital_id !== req.staff.hospital_id) throw new ApiError(403, 'This patient is admitted at another hospital.');
  }
  return admission;
}

// Is the caller on the *sending* side of this request (can see everything, complete, cancel)?
async function isSenderSide(req, request) {
  if (req.user.role === 'admin') return true;
  if (req.user.role === 'doctor') {
    if (request.requested_by === req.user.id) return true;
    if (request.admission_id) return exists('admissions', { id: request.admission_id, doctor_id: req.user.id });
    return false;
  }
  return !!req.staff && req.staff.hospital_id === request.from_hospital_id;
}

// Ranked, explainable list of hospitals that can take a patient needing `specializationId`.
async function computeMatches({ specializationId, needsIcu, fromHospital }) {
  const caps = await find('hospital_capabilities', { specialization_id: specializationId, hospital_id: { $ne: fromHospital.id } });
  const hospitals = await byIds('hospitals', caps.map((c) => c.hospital_id));
  const spec = await findOne('specializations', { id: specializationId });

  // Each hospital's track record: how often it accepted, and how fast it replied.
  const answered = await find('transfer_offers', { responded_at: { $ne: null } }, { select: 'hospital_id status sent_at responded_at' });
  const historyBy = {};
  for (const o of answered) {
    const h = (historyBy[o.hospital_id] ||= { accepted: 0, declined: 0, minutes: 0, n: 0 });
    if (o.status === 'accepted') h.accepted += 1;
    if (o.status === 'declined') h.declined += 1;
    h.minutes += minutesBetween(o.sent_at, o.responded_at);
    h.n += 1;
  }

  const matches = caps.map((c) => {
    const h = hospitals.get(c.hospital_id);
    const reasons = [];
    let score = 30; // has the specialization at all
    const beds = Number(c.beds_available);
    const icu = Number(c.icu_available);

    // Capacity: up to 20 points, full marks at 5+ free beds
    if (beds > 0) {
      score += Math.round(Math.min(beds, 5) / 5 * 20);
      reasons.push(`${spec.name}: ${beds} bed${beds === 1 ? '' : 's'} free`);
    } else {
      score -= 20;
      reasons.push(`${spec.name}: no beds free right now`);
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
    const km = haversineKm(fromHospital.latitude, fromHospital.longitude, h.latitude, h.longitude);
    if (km !== null) {
      score += Math.round(Math.max(0, Math.min(1, (40 - km) / 35)) * 20);
      reasons.push(`${km.toFixed(1)} km away`);
    } else {
      score += 10;
    }

    // Responsiveness: 15 points from acceptance rate + response speed history
    const hist = historyBy[c.hospital_id];
    const answeredCount = hist ? hist.accepted + hist.declined : 0;
    if (answeredCount > 0) {
      const rate = hist.accepted / answeredCount;
      const avgMin = hist.minutes / hist.n || 0;
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
      name: h.name,
      city: h.city,
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
async function buildClinicalSummary({ patientId, admission, specializationId, needsIcu, urgency, reason, fromHospital, senderName }) {
  const user = await findOne('users', { id: patientId }, { select: 'full_name phone' });
  const patient = { ...(await findOne('patients', { user_id: patientId })), full_name: user.full_name, phone: user.phone };
  const spec = await findOne('specializations', { id: specializationId }, { select: 'name' });
  const today = todayStr();
  const meds = await find('medications', {
    patient_id: patientId, is_active: 1, start_date: { $lte: today }, $or: [{ end_date: null }, { end_date: { $gte: today } }],
  }, { sort: { start_date: -1, id: -1 }, limit: 8 });
  const lastRecord = await findOne('medical_records', { patient_id: patientId }, { sort: { record_date: -1, id: -1 } });
  const recordDoctor = lastRecord ? await findOne('users', { id: lastRecord.doctor_id }, { select: 'full_name' }) : null;

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
    const admitted = new Date(admission.admitted_at);
    const stamp = `${String(admitted.getFullYear())}-${String(admitted.getMonth() + 1).padStart(2, '0')}-${String(admitted.getDate()).padStart(2, '0')} ${String(admitted.getHours()).padStart(2, '0')}:${String(admitted.getMinutes()).padStart(2, '0')}`;
    lines.push(`Current admission: ${admission.ward || 'Ward'}${admission.bed ? `, bed ${admission.bed}` : ''} since ${stamp}`);
    lines.push(`Admission diagnosis: ${admission.diagnosis || 'Not recorded'}`);
    if (admission.insurance_provider) lines.push(`Insurance: ${admission.insurance_provider}${admission.insurance_policy_no ? ` (${admission.insurance_policy_no})` : ''}`);
    else lines.push('Insurance: self-pay');
  }
  if (lastRecord) {
    const r = lastRecord;
    const vitals = [r.vitals_bp && `BP ${r.vitals_bp}`, r.vitals_pulse && `pulse ${r.vitals_pulse}`, r.vitals_temp && `temp ${r.vitals_temp}`].filter(Boolean).join(', ');
    lines.push(`Latest record (${r.record_date}, ${recordDoctor ? recordDoctor.full_name : 'doctor'}): ${r.diagnosis || 'No diagnosis recorded'}`);
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

// Offers for a set of requests, grouped by request id, best match first.
async function loadOffers(requestIds) {
  if (!requestIds.length) return {};
  const rows = await find('transfer_offers', { request_id: { $in: requestIds } }, { sort: { match_score: -1, id: 1 } });
  const hospitals = await byIds('hospitals', rows.map((o) => o.hospital_id), 'id', 'id name');
  const by = {};
  for (const o of rows) {
    (by[o.request_id] ||= []).push({
      offer_id: o.id, request_id: o.request_id, hospital_id: o.hospital_id, hospital_name: hospitals.get(o.hospital_id)?.name || null,
      status: o.status, match_score: o.match_score, response_note: o.response_note, sent_at: o.sent_at, responded_at: o.responded_at,
      summary_viewed_at: o.summary_viewed_at,
      response_minutes: o.responded_at ? minutesBetween(o.sent_at, o.responded_at) : null,
      minutes_since_sent: minutesBetween(o.sent_at),
    });
  }
  return by;
}

// Requests joined to patient, specialization and hospital names, plus time elapsed since creation.
async function loadRequests(filter, { limit, newestFirst } = {}) {
  let rows = await find('transfer_requests', filter);
  rows.sort((a, b) => (newestFirst ? 0 : REQUEST_STATUS_ORDER.indexOf(a.status) - REQUEST_STATUS_ORDER.indexOf(b.status)) || (new Date(b.created_at) - new Date(a.created_at)));
  if (limit) rows = rows.slice(0, limit);
  const [users, patients, specs, hospitals] = await Promise.all([
    byIds('users', [...rows.map((r) => r.patient_id), ...rows.map((r) => r.requested_by)], 'id', 'id full_name'),
    byIds('patients', rows.map((r) => r.patient_id), 'user_id', 'user_id date_of_birth gender'),
    byIds('specializations', rows.map((r) => r.specialization_id)),
    byIds('hospitals', [...rows.map((r) => r.from_hospital_id), ...rows.map((r) => r.accepted_hospital_id)]),
  ]);
  return rows.map((r) => ({
    ...r,
    minutes_ago: minutesBetween(r.created_at),
    patient_name: users.get(r.patient_id)?.full_name || null,
    date_of_birth: patients.get(r.patient_id)?.date_of_birth || null,
    gender: patients.get(r.patient_id)?.gender || null,
    specialization: specs.get(r.specialization_id)?.name || null,
    from_hospital: hospitals.get(r.from_hospital_id)?.name || null,
    accepted_hospital: hospitals.get(r.accepted_hospital_id)?.name || null,
    requested_by_name: users.get(r.requested_by)?.full_name || null,
  }));
}

// ---------------------------------------------------------------------------
// Middleware: staff must be a transfer desk; attaches req.staff
// ---------------------------------------------------------------------------
const loadDesk = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'staff') return next();
  const s = await findOne('staff', { user_id: req.user.id });
  const h = s && (await findOne('hospitals', { id: s.hospital_id }));
  if (!s || !h || s.department !== 'transfer_desk') {
    throw new ApiError(403, 'TransferConnect is handled by the transfer desk.');
  }
  req.staff = { user_id: s.user_id, hospital_id: s.hospital_id, department: s.department, hospital_name: h.name, is_home: h.is_home };
  next();
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// GET /api/transfers/desk - who am I on the transfer network (fallback for /api/staff/me)
const getDesk = asyncHandler(async (req, res) => {
  if (req.staff) return res.json({ desk: { ...req.staff, role: 'staff' } });
  const home = await getHomeHospital();
  res.json({ desk: { hospital_id: home.id, hospital_name: home.name, is_home: 1, role: req.user.role } });
});

// GET /api/transfers/hospitals
const listHospitals = asyncHandler(async (req, res) => {
  const hospitals = await find('hospitals', {}, { select: 'id name city address phone is_home latitude longitude' });
  hospitals.sort((a, b) => (b.is_home - a.is_home) || a.name.localeCompare(b.name));
  const caps = await find('hospital_capabilities');
  const specs = await byIds('specializations', caps.map((c) => c.specialization_id));
  const capRows = caps.map((c) => ({
    hospital_id: c.hospital_id, specialization_id: c.specialization_id, specialization: specs.get(c.specialization_id)?.name || null,
    beds_available: c.beds_available, icu_available: c.icu_available,
  })).sort((a, b) => String(a.specialization).localeCompare(String(b.specialization)));
  res.json({
    hospitals: hospitals.map((h) => ({
      ...h,
      capabilities: capRows.filter((c) => c.hospital_id === h.id).map(({ hospital_id, ...rest }) => rest),
    })),
  });
});

// GET /api/transfers/candidates - patients the caller may start a transfer for
const listCandidates = asyncHandler(async (req, res) => {
  if (req.staff && !req.staff.is_home) return res.json({ patients: [] });
  const filter = { status: { $in: ['admitted', 'cleared'] } };
  if (req.user.role === 'doctor') filter.doctor_id = req.user.id;
  if (req.staff) filter.hospital_id = req.staff.hospital_id;

  const admissions = await find('admissions', filter, { sort: { admitted_at: -1 } });
  const admittedIds = new Set(admissions.map((a) => a.patient_id));
  const users = await byIds('users', admissions.map((a) => a.patient_id), 'id', 'id full_name');
  const profiles = await byIds('patients', admissions.map((a) => a.patient_id), 'user_id', 'user_id date_of_birth gender');
  const admitted = admissions.map((a) => ({
    id: a.patient_id, full_name: users.get(a.patient_id)?.full_name, date_of_birth: profiles.get(a.patient_id)?.date_of_birth,
    gender: profiles.get(a.patient_id)?.gender, admission_id: a.id, ward: a.ward, bed: a.bed, diagnosis: a.diagnosis,
  }));

  let outpatients = [];
  if (req.user.role === 'doctor') {
    const appts = await find('appointments', { doctor_id: req.user.id, status: { $ne: 'cancelled' } }, { select: 'patient_id' });
    const ids = [...new Set(appts.map((a) => a.patient_id))].filter((id) => !admittedIds.has(id));
    const outUsers = await byIds('users', ids, 'id', 'id full_name');
    const outProfiles = await byIds('patients', ids, 'user_id', 'user_id date_of_birth gender');
    outpatients = ids.map((id) => ({
      id, full_name: outUsers.get(id)?.full_name, date_of_birth: outProfiles.get(id)?.date_of_birth, gender: outProfiles.get(id)?.gender,
    })).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  }
  const shape = (r) => ({
    id: r.id, full_name: r.full_name, age: ageFrom(r.date_of_birth), gender: r.gender,
    admission_id: r.admission_id || null, ward: r.ward || null, bed: r.bed || null, diagnosis: r.diagnosis || null,
  });
  res.json({ patients: [...admitted.map(shape), ...outpatients.map(shape)] });
});

// POST /api/transfers/match
const match = asyncHandler(async (req, res) => {
  if (req.staff && !req.staff.is_home) throw new ApiError(403, 'Only the sending hospital can search for receiving hospitals.');
  const fromHospital = await resolveFromHospital(req, null);
  const matches = await computeMatches({
    specializationId: Number(req.body.specializationId),
    needsIcu: !!req.body.needsIcu,
    fromHospital,
  });
  res.json({ matches });
});

// POST /api/transfers/preview-summary - shows the sender exactly what will be shared
const previewSummary = asyncHandler(async (req, res) => {
  const { patientId, admissionId, specializationId, needsIcu, urgency, reason } = req.body;
  const admission = await assertCanTransferPatient(req, patientId, admissionId || null);
  const fromHospital = await resolveFromHospital(req, admission);
  const summary = await buildClinicalSummary({
    patientId: Number(patientId), admission, specializationId: Number(specializationId), needsIcu: !!needsIcu, urgency: urgency || 'urgent',
    reason: reason || '(reason not entered yet)', fromHospital, senderName: req.user.name || 'Sender',
  });
  res.json({ summary });
});

// POST /api/transfers
const create = asyncHandler(async (req, res) => {
  const { patientId, admissionId, specializationId, needsIcu, urgency, reason, consentGiven, consentNote, hospitalIds } = req.body;
  if (consentGiven !== true) throw new ApiError(400, 'Patient consent is required before sharing records with another hospital.');

  const admission = await assertCanTransferPatient(req, patientId, admissionId || null);
  const fromHospital = await resolveFromHospital(req, admission);

  if (await exists('transfer_requests', { patient_id: Number(patientId), status: { $in: ['open', 'accepted'] } })) {
    throw new ApiError(409, 'This patient already has an active transfer request.');
  }

  const matches = await computeMatches({ specializationId: Number(specializationId), needsIcu: !!needsIcu, fromHospital });
  const byId = Object.fromEntries(matches.map((m) => [m.hospital_id, m]));
  const targets = [...new Set(hospitalIds.map(Number))].filter((id) => byId[id]);
  if (!targets.length) throw new ApiError(400, 'None of the selected hospitals can provide this care.');

  const summary = await buildClinicalSummary({
    patientId: Number(patientId), admission, specializationId: Number(specializationId), needsIcu: !!needsIcu, urgency, reason, fromHospital,
    senderName: req.user.name || 'Sender',
  });

  const request = await insert('transfer_requests', {
    patient_id: Number(patientId), admission_id: admission ? admission.id : null, from_hospital_id: fromHospital.id, requested_by: req.user.id,
    specialization_id: Number(specializationId), needs_icu: needsIcu ? 1 : 0, urgency, reason, clinical_summary: summary, consent_given: 1,
    consent_note: consentNote || null,
  });
  const spec = await findOne('specializations', { id: Number(specializationId) }, { select: 'name' });

  await insertMany('transfer_offers', targets.map((hospitalId) => ({ request_id: request.id, hospital_id: hospitalId, match_score: byId[hospitalId].score })));
  for (const hospitalId of targets) {
    await notifyDepartment('transfer_desk', hospitalId, 'transfer_request',
      `${urgency === 'critical' ? 'CRITICAL ' : ''}Transfer request: ${spec.name}`,
      `${fromHospital.name} is asking if you can accept a ${spec.name} patient${needsIcu ? ' needing ICU' : ''}. Please respond.`,
      'transfer_request', request.id);
  }
  await audit(req.user.id, 'transfer.requested', 'transfer_request', request.id,
    `${urgency} ${spec.name} transfer sent to ${targets.length} hospital(s)`);

  res.status(201).json({ request: { id: request.id, hospitalsContacted: targets.length } });
});

// GET /api/transfers - outgoing for senders, incoming for partner desks, everything for admin
const list = asyncHandler(async (req, res) => {
  const filter = {};
  const partnerDesk = req.staff && !req.staff.is_home;

  if (req.user.role === 'doctor') {
    const mine = await find('admissions', { doctor_id: req.user.id }, { select: 'id' });
    filter.$or = [{ requested_by: req.user.id }, { admission_id: { $in: mine.map((a) => a.id) } }];
  } else if (partnerDesk) {
    const offered = await find('transfer_offers', { hospital_id: req.staff.hospital_id }, { select: 'request_id' });
    filter.id = { $in: offered.map((o) => o.request_id) };
  } else if (req.staff) {
    filter.from_hospital_id = req.staff.hospital_id;
  }
  if (req.query.status) filter.status = req.query.status;

  const rows = await loadRequests(filter, { limit: 100 });
  const offersBy = await loadOffers(rows.map((r) => r.id));

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
  const offers = await find('transfer_offers', { hospital_id: req.staff.hospital_id });
  const requests = await byIds('transfer_requests', offers.map((o) => o.request_id));
  const [specs, hospitals, users, profiles] = await Promise.all([
    byIds('specializations', [...requests.values()].map((r) => r.specialization_id)),
    byIds('hospitals', [...requests.values()].map((r) => r.from_hospital_id), 'id', 'id name'),
    byIds('users', [...requests.values()].map((r) => r.patient_id), 'id', 'id full_name'),
    byIds('patients', [...requests.values()].map((r) => r.patient_id), 'user_id', 'user_id date_of_birth gender'),
  ]);

  const rows = offers.filter((o) => requests.has(o.request_id)).map((o) => {
    const r = requests.get(o.request_id);
    return {
      offer_id: o.id,
      request_id: o.request_id,
      status: o.status,
      request_status: r.status,
      urgency: r.urgency,
      specialization: specs.get(r.specialization_id)?.name || null,
      needs_icu: !!r.needs_icu,
      reason: r.reason,
      minutes_waiting: minutesBetween(o.sent_at, o.responded_at || new Date()),
      from_hospital: hospitals.get(r.from_hospital_id)?.name || null,
      patient_initials: initials(users.get(r.patient_id)?.full_name),
      patient_age: ageFrom(profiles.get(r.patient_id)?.date_of_birth),
      patient_gender: GENDER_LABEL[profiles.get(r.patient_id)?.gender] || 'Not stated',
      match_score: o.match_score,
      response_note: o.response_note,
      summary_viewed: !!o.summary_viewed_at,
      sent_at: o.sent_at,
      responded_at: o.responded_at,
    };
  });
  // Pending first, then most urgent, then newest.
  rows.sort((a, b) => ((b.status === 'pending') - (a.status === 'pending'))
    || (URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency))
    || (new Date(b.sent_at) - new Date(a.sent_at)));

  res.json({ hospital: { id: req.staff.hospital_id, name: req.staff.hospital_name }, offers: rows.slice(0, 100) });
});

// GET /api/transfers/:id
const getById = asyncHandler(async (req, res) => {
  const [r] = await loadRequests({ id: Number(req.params.id) });
  if (!r) throw new ApiError(404, 'Transfer request not found.');
  const offersBy = await loadOffers([r.id]);
  let offers = offersBy[r.id] || [];

  const sender = await isSenderSide(req, r);
  let myOffer = null;
  if (!sender) {
    if (!req.staff) throw new ApiError(403, 'You do not have access to this transfer request.');
    myOffer = offers.find((o) => o.hospital_id === req.staff.hospital_id);
    if (!myOffer) throw new ApiError(403, 'This request was not sent to your hospital.');
    offers = [myOffer];
    // Opening the request reveals the clinical summary - record that access.
    if (!myOffer.summary_viewed_at) await update('transfer_offers', { id: myOffer.offer_id }, { summary_viewed_at: new Date() });
    await audit(req.user.id, 'transfer.summary_viewed', 'transfer_request', r.id,
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
      clinical_summary: r.clinical_summary,
      offers,
      my_offer: myOffer,
      viewer: sender ? 'sender' : 'receiver',
    },
  });
});

// POST /api/transfers/offers/:id/respond - receiving desk accepts or declines.
// There are no multi-document transactions on a standalone MongoDB server, so
// each step that must win a race is a single atomic conditional update:
//   1. reserve the bed (only if one is still free),
//   2. claim the request (only if it is still open),
//   3. mark this offer accepted and stand the others down.
// If a later step loses the race, the earlier ones are undone.
const respond = asyncHandler(async (req, res) => {
  if (!req.staff) throw new ApiError(403, 'Only a receiving transfer desk can respond.');
  const { decision, note } = req.body;

  const offer = await findOne('transfer_offers', { id: Number(req.params.id) });
  if (!offer) throw new ApiError(404, 'Offer not found.');
  if (offer.hospital_id !== req.staff.hospital_id) throw new ApiError(403, 'This request was not sent to your hospital.');

  const request = await findOne('transfer_requests', { id: offer.request_id });
  if (offer.status !== 'pending') throw new ApiError(409, `You already ${offer.status === 'withdrawn' ? 'lost this request to another hospital' : offer.status + ' this request'}.`);
  if (request.status !== 'open') throw new ApiError(409, 'This request has already been placed with another hospital.');

  const spec = await findOne('specializations', { id: request.specialization_id }, { select: 'name' });
  const patient = await findOne('users', { id: request.patient_id }, { select: 'full_name' });
  const hospitalName = req.staff.hospital_name;
  const now = new Date();

  if (decision === 'decline') {
    const done = await M.transfer_offers.updateOne(
      { id: offer.id, status: 'pending' },
      { $set: { status: 'declined', response_note: note || null, responded_by: req.user.id, responded_at: now, summary_viewed_at: offer.summary_viewed_at || now } }
    );
    if (!done.modifiedCount) throw new ApiError(409, 'This request was just updated. Please refresh.');
    await notify(request.requested_by, 'transfer_declined', `${hospitalName} declined the transfer`,
      `${hospitalName} cannot take ${patient.full_name} (${spec.name})${note ? `: ${note}` : '.'}`, 'transfer_request', request.id);

    const left = await count('transfer_offers', { request_id: request.id, status: 'pending' });
    if (left === 0) {
      await notify(request.requested_by, 'transfer_all_declined', 'All hospitals declined',
        `Every hospital contacted for ${patient.full_name} has declined. Send the request to more hospitals.`, 'transfer_request', request.id);
    }
    await audit(req.user.id, 'transfer.declined', 'transfer_request', request.id, `${hospitalName} declined`);
  } else {
    // Accepting reserves a bed, so the hospital must actually list one free.
    const capFilter = { hospital_id: offer.hospital_id, specialization_id: request.specialization_id, beds_available: { $gte: 1 } };
    if (request.needs_icu) capFilter.icu_available = { $gte: 1 };
    const reserved = await M.hospital_capabilities.updateOne(capFilter, {
      $inc: { beds_available: -1, icu_available: request.needs_icu ? -1 : 0 }, $set: { updated_at: now },
    });
    if (!reserved.modifiedCount) {
      const cap = await findOne('hospital_capabilities', { hospital_id: offer.hospital_id, specialization_id: request.specialization_id });
      if (!cap || cap.beds_available < 1) throw new ApiError(409, `Your hospital lists no free ${spec.name} bed right now, so this request can only be declined.`);
      throw new ApiError(409, 'Your hospital lists no free ICU bed right now, so this request can only be declined.');
    }

    const giveBedBack = () => M.hospital_capabilities.updateOne(
      { hospital_id: offer.hospital_id, specialization_id: request.specialization_id },
      { $inc: { beds_available: 1, icu_available: request.needs_icu ? 1 : 0 } }
    );

    // First accept wins: only one request can move from 'open' to 'accepted'.
    const claimed = await M.transfer_requests.updateOne(
      { id: request.id, status: 'open' },
      { $set: { status: 'accepted', accepted_hospital_id: offer.hospital_id, accepted_at: now } }
    );
    if (!claimed.modifiedCount) {
      await giveBedBack();
      throw new ApiError(409, 'This request has already been placed with another hospital.');
    }
    const accepted = await M.transfer_offers.updateOne(
      { id: offer.id, status: 'pending' },
      { $set: { status: 'accepted', response_note: note || null, responded_by: req.user.id, responded_at: now, summary_viewed_at: offer.summary_viewed_at || now } }
    );
    if (!accepted.modifiedCount) {
      await giveBedBack();
      await update('transfer_requests', { id: request.id }, { status: 'open', accepted_hospital_id: null, accepted_at: null });
      throw new ApiError(409, 'This request was just updated. Please refresh.');
    }

    // Everyone else is stood down.
    const others = await find('transfer_offers', { request_id: request.id, id: { $ne: offer.id }, status: 'pending' }, { select: 'id hospital_id' });
    await M.transfer_offers.updateMany({ request_id: request.id, id: { $ne: offer.id }, status: 'pending' }, { $set: { status: 'withdrawn' } });
    for (const o of others) {
      await notifyDepartment('transfer_desk', o.hospital_id, 'transfer_withdrawn', 'Transfer request filled',
        `The ${spec.name} transfer from another hospital has been placed elsewhere. No action needed.`, 'transfer_request', request.id);
    }
    await notify(request.requested_by, 'transfer_accepted', `${hospitalName} accepted the transfer`,
      `${hospitalName} will receive ${patient.full_name} (${spec.name}).${note ? ` Note: ${note}` : ''}`, 'transfer_request', request.id);
    await notify(request.patient_id, 'transfer_accepted', 'Your transfer has been arranged',
      `${hospitalName} has accepted you for ${spec.name} care. Your care team will arrange the move and has shared your records with your consent.`,
      'transfer_request', request.id);
    await audit(req.user.id, 'transfer.accepted', 'transfer_request', request.id, `${hospitalName} accepted the transfer`);
  }

  res.json({ message: decision === 'accept' ? 'Transfer accepted. The sending team has been notified.' : 'Response sent.' });
});

async function loadRequestForSender(req) {
  const request = await findOne('transfer_requests', { id: Number(req.params.id) });
  if (!request) throw new ApiError(404, 'Transfer request not found.');
  if (!(await isSenderSide(req, request))) throw new ApiError(403, 'Only the sending team can change this request.');
  return request;
}

// POST /api/transfers/:id/complete - patient has physically moved
const complete = asyncHandler(async (req, res) => {
  const request = await loadRequestForSender(req);
  if (request.status !== 'accepted') throw new ApiError(400, 'Only an accepted transfer can be completed.');
  const done = await M.transfer_requests.updateOne({ id: request.id, status: 'accepted' }, { $set: { status: 'completed' } });
  if (!done.modifiedCount) throw new ApiError(400, 'Only an accepted transfer can be completed.');

  if (request.admission_id) {
    await M.admissions.updateOne(
      { id: request.admission_id, status: { $in: ['admitted', 'cleared'] } },
      { $set: { status: 'transferred', discharged_at: new Date() } }
    );
  }
  await notifyDepartment('transfer_desk', request.accepted_hospital_id, 'transfer_completed', 'Patient is on the way',
    'The sending hospital has marked the transfer complete - the patient has left for your hospital.', 'transfer_request', request.id);
  await audit(req.user.id, 'transfer.completed', 'transfer_request', request.id, 'Transfer completed');
  res.json({ message: 'Transfer marked complete.' });
});

// POST /api/transfers/:id/cancel
const cancel = asyncHandler(async (req, res) => {
  const request = await loadRequestForSender(req);
  if (!['open', 'accepted'].includes(request.status)) throw new ApiError(400, 'This request is already closed.');

  const active = await find('transfer_offers', { request_id: request.id, status: { $in: ['pending', 'accepted'] } }, { select: 'hospital_id' });
  const done = await M.transfer_requests.updateOne({ id: request.id, status: request.status }, { $set: { status: 'cancelled' } });
  if (!done.modifiedCount) throw new ApiError(400, 'This request is already closed.');
  await M.transfer_offers.updateMany({ request_id: request.id, status: 'pending' }, { $set: { status: 'withdrawn' } });
  if (request.status === 'accepted') {
    // Give the reserved bed back.
    await M.hospital_capabilities.updateOne(
      { hospital_id: request.accepted_hospital_id, specialization_id: request.specialization_id },
      { $inc: { beds_available: 1, icu_available: request.needs_icu ? 1 : 0 } }
    );
  }
  for (const o of active) {
    await notifyDepartment('transfer_desk', o.hospital_id, 'transfer_cancelled', 'Transfer request cancelled',
      'The sending hospital cancelled a transfer request sent to you. No action needed.', 'transfer_request', request.id);
  }
  await audit(req.user.id, 'transfer.cancelled', 'transfer_request', request.id, 'Transfer request cancelled');
  res.json({ message: 'Transfer request cancelled.' });
});

// GET /api/transfers/analytics (admin)
const analytics = asyncHandler(async (req, res) => {
  const [open, accepted, completed] = await Promise.all([
    count('transfer_requests', { status: 'open' }),
    count('transfer_requests', { status: 'accepted' }),
    count('transfer_requests', { status: 'completed' }),
  ]);
  const answered = await find('transfer_offers', { responded_at: { $ne: null } }, { select: 'status sent_at responded_at' });
  const acc = answered.filter((o) => o.status === 'accepted').length;
  const dec = answered.filter((o) => o.status === 'declined').length;
  const avgMinutes = answered.length ? answered.reduce((s, o) => s + minutesBetween(o.sent_at, o.responded_at), 0) / answered.length : null;
  const recent = await loadRequests({}, { limit: 8, newestFirst: true });
  res.json({
    open, accepted, completed,
    avgResponseMinutes: avgMinutes !== null ? Math.round(avgMinutes) : null,
    acceptanceRate: acc + dec ? Math.round((acc / (acc + dec)) * 100) : null,
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
