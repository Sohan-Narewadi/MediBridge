// Adds a second layer of fictional demo data so every screen looks lived-in:
// richer patient profiles (allergies, conditions), more inpatients in every
// discharge state, transfers in every status, extra visits with intake forms,
// more medication history and notifications for each role.
// Purely additive: it never deletes anything. It skips itself if its marker
// admission already exists (re-seeding with `npm run db:v2` removes the marker).
// Usage: npm run db:demo   (also runs at the end of npm run db:v2)
require('dotenv').config();
const { connectDb } = require('./db');
const { mongoose, find, findOne, insert, insertMany, update, exists, dayOffset } = require('./store');

const HOURS = 3600 * 1000;
const ago = (h) => new Date(Date.now() - h * HOURS);
const day = (offset) => dayOffset(offset);

const MARKER_DX = 'Total knee replacement, post-op day 2';
const DEPT_TASKS = [
  ['documentation', 'Discharge summary & medical certificates', 60],
  ['billing', 'Final bill prepared and settled', 90],
  ['insurance', 'Insurance pre-authorisation / claim approval', 120],
  ['pharmacy', 'Take-home medicines dispensed', 45],
  ['nursing', 'Discharge teaching & nursing handover', 30],
];
const DEPT_EMAIL = {
  billing: 'billing@medibridge.demo', insurance: 'insurance@medibridge.demo', pharmacy: 'pharmacy@medibridge.demo',
  nursing: 'nursing@medibridge.demo', documentation: 'records@medibridge.demo',
};

async function main() {
  await connectDb();

  if (await exists('admissions', { diagnosis: MARKER_DX })) {
    console.log('Extra demo data already present. Nothing to do.');
    await mongoose.disconnect();
    return;
  }
  const hospitals = await find('hospitals', {}, { sort: { id: 1 } });
  if (hospitals.length < 6) { console.log('Run npm run db:v2 first (hospitals are missing).'); await mongoose.disconnect(); return; }
  const hid = hospitals.map((h) => h.id);
  const specs = {};
  for (const s of await find('specializations')) specs[s.name] = s.id;
  const staffIds = {};
  for (const s of await find('users', { role: 'staff' }, { select: 'id email' })) staffIds[s.email] = s.id;
  const demoPatient = (await findOne('users', { email: 'patient@medibridge.demo' })).id;
  const demoDoctor = (await findOne('users', { email: 'doctor@medibridge.demo' })).id;
  const adminId = (await findOne('users', { role: 'admin' })).id;
  const P = (await find('users', { role: 'patient', id: { $ne: demoPatient } }, { sort: { id: 1 }, select: 'id' })).map((r) => r.id);
  const D = (await find('doctors', { user_id: { $ne: demoDoctor } }, { sort: { user_id: 1 }, limit: 8, select: 'user_id' })).map((r) => r.user_id);
  if (P.length < 14) { console.log('Not enough demo patients to seed extra data.'); await mongoose.disconnect(); return; }

  // ---------------------------------------------------------------- patient profiles
  // Fill gaps only; never overwrite something already recorded.
  await update('patients', { user_id: demoPatient }, { allergies: 'Penicillin (rash), Dust', chronic_conditions: 'Hypertension, Pre-diabetes' });
  const allergyPool = ['Penicillin', 'Peanuts', 'Shellfish', 'Ibuprofen', 'Pollen', 'Latex', 'Sulfa drugs', 'Dust mites'];
  const conditionPool = ['Asthma', 'Type 2 Diabetes', 'Hypertension', 'Hypothyroidism', 'Migraine', 'High Cholesterol', 'Arthritis', 'Anaemia'];
  for (const [i, id] of P.entries()) {
    const p = await findOne('patients', { user_id: id });
    const set = {};
    if (!p.allergies && i % 3 !== 2) set.allergies = allergyPool[i % allergyPool.length];
    if (!p.chronic_conditions && i % 4 !== 3) set.chronic_conditions = conditionPool[(i + 2) % conditionPool.length];
    if (Object.keys(set).length) await update('patients', { user_id: id }, set);
  }

  // ---------------------------------------------------------------- visits + intake for the demo doctor
  const extraVisits = [
    [P[9], day(0), '16:30:00', '17:00:00', 'confirmed', 'Persistent cough for two weeks'],
    [P[10], day(2), '10:30:00', '11:00:00', 'confirmed', 'Knee pain follow-up'],
    [P[11], day(2), '11:00:00', '11:30:00', 'pending', 'Annual health check'],
    [P[12], day(3), '09:30:00', '10:00:00', 'confirmed', 'Dizziness when standing'],
  ];
  const complaints = [
    ['Dry cough that is worse at night', 'Cough,Fatigue,Sore throat', '2 weeks', 3, 'Started an antihistamine last week', null, 'Do I need a chest X-ray?'],
    ['Knee swelling after physiotherapy', 'Knee pain,Swelling,Stiffness', '4 days', 3, null, null, 'When can I stop the walker?'],
    null,
    ['Light-headed on standing up', 'Dizziness,Fatigue', '1 week', 4, 'Doubled my BP tablet by mistake once', null, 'Could my tablets be causing this?'],
  ];
  for (const [i, [pid, date, start, end, status, reason]] of extraVisits.entries()) {
    const existing = await findOne('appointments', { doctor_id: demoDoctor, appointment_date: date, start_time: start });
    let apptId;
    if (existing) { apptId = existing.id; await update('appointments', { id: apptId }, { patient_id: pid, status, reason }); }
    else {
      apptId = (await insert('appointments', {
        patient_id: pid, doctor_id: demoDoctor, appointment_date: date, start_time: start, end_time: end,
        consultation_mode: i === 1 ? 'video' : 'in_person', status, reason,
      })).id;
    }
    const c = complaints[i];
    if (c && !(await exists('intake_forms', { appointment_id: apptId }))) {
      await insert('intake_forms', {
        appointment_id: apptId, patient_id: pid, chief_complaint: c[0], symptoms: c[1], symptom_duration: c[2], severity: c[3],
        medication_changes: c[4], new_allergies: c[5], questions_for_doctor: c[6],
      });
    }
  }

  // ---------------------------------------------------------------- more medication history for the demo patient
  const med = await insert('medications', {
    patient_id: demoPatient, medicine_name: 'Atorvastatin 10mg', dosage: '1 tablet', frequency: 'Once a day at night',
    start_date: day(-45), end_date: day(45), reminder_times: '21:00', instructions: 'Take after dinner', is_active: 1,
  });
  for (let i = 1; i <= 14; i++) {
    await insert('medication_logs', { medication_id: med.id, log_date: day(-i), status: i === 4 || i === 9 ? 'missed' : 'taken' });
  }

  // ---------------------------------------------------------------- admissions in every discharge state
  async function admit({ patient, doctor, ward, bed, dx, insurer, policy, admittedHoursAgo, clearedHoursAgo, tasks = {}, status }) {
    const cleared = clearedHoursAgo != null;
    const adm = await insert('admissions', {
      patient_id: patient, hospital_id: hid[0], doctor_id: doctor, ward, bed, diagnosis: dx, insurance_provider: insurer, insurance_policy_no: policy,
      admitted_at: ago(admittedHoursAgo), status: status || (cleared ? 'cleared' : 'admitted'), cleared_at: cleared ? ago(clearedHoursAgo) : null,
    });
    const id = adm.id;
    if (!cleared) return id;
    await insert('discharge_events', { admission_id: id, actor_id: doctor, message: 'Doctor marked the patient medically fit for discharge. Discharge clock started.', created_at: ago(clearedHoursAgo) });
    for (const [dept, title, sla] of DEPT_TASKS) {
      const selfPay = !insurer && dept === 'insurance';
      const t = selfPay ? { status: 'done', startedAgo: clearedHoursAgo, doneAgo: clearedHoursAgo } : (tasks[dept] || { status: 'pending' });
      const doneBy = t.doneAgo != null && !selfPay ? staffIds[DEPT_EMAIL[dept]] : null;
      const task = await insert('discharge_tasks', {
        admission_id: id, department: dept, title, status: t.status, blocked_reason: t.reason || null, sla_minutes: sla,
        started_at: t.startedAgo != null ? ago(t.startedAgo) : null, completed_at: t.doneAgo != null ? ago(t.doneAgo) : null,
        completed_by: doneBy, last_nudged_at: t.nudgedAgo != null ? ago(t.nudgedAgo) : null,
      });
      if (selfPay) {
        await insert('discharge_events', { admission_id: id, task_id: task.id, actor_id: null, message: 'Self-pay patient: insurance approval not required.', created_at: ago(clearedHoursAgo) });
      } else if (t.doneAgo != null) {
        await insert('discharge_events', { admission_id: id, task_id: task.id, actor_id: doneBy, message: `${title} - completed.`, created_at: ago(t.doneAgo) });
      }
      if (t.status === 'blocked') {
        await insert('discharge_events', { admission_id: id, task_id: task.id, actor_id: staffIds[DEPT_EMAIL[dept]] || null, message: `${title} - blocked: ${t.reason}`, created_at: ago(t.startedAgo || 1) });
      }
      if (t.nudgedAgo != null) {
        await insert('discharge_events', { admission_id: id, task_id: task.id, actor_id: doctor, message: `${dept.charAt(0).toUpperCase() + dept.slice(1)} nudged.`, created_at: ago(t.nudgedAgo) });
      }
    }
    if (tasks.__allDone) {
      await insert('discharge_events', { admission_id: id, actor_id: null, message: 'All departments have cleared the patient. Ready to go home.', created_at: ago(tasks.__allDone) });
    }
    return id;
  }

  // Ready to discharge: every department signed off, waiting for the doctor
  const ready = await admit({
    patient: P[6], doctor: demoDoctor, ward: 'Medical Ward', bed: 'M-03', dx: 'Urinary tract infection, resolved',
    insurer: 'ICICI Lombard', policy: 'IL-30551', admittedHoursAgo: 58, clearedHoursAgo: 4,
    tasks: {
      documentation: { status: 'done', startedAgo: 3.9, doneAgo: 3.2 },
      billing: { status: 'done', startedAgo: 3.5, doneAgo: 2.4 },
      insurance: { status: 'done', startedAgo: 3.8, doneAgo: 1.9 },
      pharmacy: { status: 'done', startedAgo: 2.6, doneAgo: 1.7 },
      nursing: { status: 'done', startedAgo: 2, doneAgo: 1.1 },
      __allDone: 1.1,
    },
  });
  // Blocked on pharmacy, with a nudge already sent
  const afibAdm = await admit({
    patient: P[7], doctor: demoDoctor, ward: 'Cardiac Ward', bed: 'C-08', dx: 'Atrial fibrillation, rate controlled',
    insurer: 'Star Health', policy: 'SH-5530-1188', admittedHoursAgo: 66, clearedHoursAgo: 6.5,
    tasks: {
      documentation: { status: 'done', startedAgo: 6, doneAgo: 5.4 },
      billing: { status: 'in_progress', startedAgo: 3 },
      insurance: { status: 'done', startedAgo: 6, doneAgo: 3.8 },
      pharmacy: { status: 'blocked', reason: 'Apixaban out of stock, sourcing from the central store', startedAgo: 2.2, nudgedAgo: 0.6 },
      nursing: { status: 'pending' },
    },
  });
  // Blocked on medical records (doctor has not signed the summary)
  await admit({
    patient: P[8], doctor: D[2], ward: 'Orthopaedic Ward', bed: 'O-11', dx: 'Lumbar disc prolapse, conservative management',
    insurer: 'Niva Bupa', policy: 'NB-61844', admittedHoursAgo: 80, clearedHoursAgo: 9,
    tasks: {
      documentation: { status: 'blocked', reason: 'Discharge summary awaiting consultant signature', startedAgo: 7 },
      billing: { status: 'in_progress', startedAgo: 5 },
      insurance: { status: 'in_progress', startedAgo: 8 },
      pharmacy: { status: 'done', startedAgo: 6, doneAgo: 4.5 },
      nursing: { status: 'pending' },
    },
  });
  // Longest wait, insurance still in progress
  await admit({
    patient: P[9], doctor: D[3], ward: 'General Ward', bed: 'G-14', dx: 'Diabetic ketoacidosis, stabilised',
    insurer: 'Care Health', policy: 'CH-90412', admittedHoursAgo: 120, clearedHoursAgo: 22,
    tasks: {
      documentation: { status: 'done', startedAgo: 21, doneAgo: 20 },
      billing: { status: 'done', startedAgo: 20, doneAgo: 17 },
      insurance: { status: 'in_progress', startedAgo: 19, nudgedAgo: 3 },
      pharmacy: { status: 'in_progress', startedAgo: 2 },
      nursing: { status: 'pending' },
    },
  });
  // In treatment
  const kneeAdm = await admit({ patient: P[10], doctor: demoDoctor, ward: 'Orthopaedic Ward', bed: 'O-02', dx: MARKER_DX, insurer: 'HDFC ERGO', policy: 'HE-44190', admittedHoursAgo: 46 });
  const icuAdm = await admit({ patient: P[11], doctor: demoDoctor, ward: 'ICU', bed: 'ICU-4', dx: 'Severe pneumonia with respiratory failure', insurer: 'Star Health', policy: 'SH-9021', admittedHoursAgo: 31 });
  const gastroAdm = await admit({ patient: P[12], doctor: demoDoctor, ward: 'General Ward', bed: 'G-06', dx: 'Chronic pancreatitis flare', insurer: null, policy: null, admittedHoursAgo: 18 });

  // Care plans written for two of the cleared patients
  await insert('care_plans', {
    patient_id: P[6], doctor_id: demoDoctor, admission_id: ready,
    plain_summary: 'The infection has cleared. Finish your last two days of antibiotics, drink plenty of water, and call us if the burning or fever returns. We will see you in a week.',
  });
  await insert('care_plans', {
    patient_id: P[7], doctor_id: demoDoctor, admission_id: afibAdm,
    plain_summary: 'Your heart rate is now under control. Take the blood thinner every day without missing a dose. Avoid alcohol and come back for an ECG in two weeks.',
  });

  // Discharged this week (fills the "Discharged" tab). Each patient's earlier stay ends before any current admission starts.
  const recent = [
    [P[5], D[0], 'General Ward', 'G-12', 'Appendicectomy, recovered', 'Star Health', 150, 122, [35, 80, 150, 40, 20]],
    [P[5], D[1], 'Medical Ward', 'M-07', 'Acute bronchitis', null, 60, 30, [30, 65, 0, 28, 18]],
    [demoPatient, demoDoctor, 'Medical Ward', 'M-05', 'Gastritis, resolved', 'Star Health', 160, 128, [42, 95, 170, 33, 25]],
    [P[6], demoDoctor, 'Surgical Ward', 'S-02', 'Kidney stones, passed', 'ICICI Lombard', 152, 126, [38, 72, 105, 36, 22]],
  ];
  for (const [patient, doctor, ward, bed, dx, insurer, admH, clearH, mins] of recent) {
    const longest = Math.max(...mins);
    const adm = await insert('admissions', {
      patient_id: patient, hospital_id: hid[0], doctor_id: doctor, ward, bed, diagnosis: dx, insurance_provider: insurer, admitted_at: ago(admH),
      status: 'discharged', cleared_at: ago(clearH), discharged_at: ago(clearH - longest / 60),
    });
    await insertMany('discharge_tasks', DEPT_TASKS.filter(([dept]) => insurer || dept !== 'insurance').map(([dept, title, sla]) => ({
      admission_id: adm.id, department: dept, title, status: 'done', sla_minutes: sla, started_at: ago(clearH - 0.05),
      completed_at: ago(clearH - mins[DEPT_TASKS.findIndex((t) => t[0] === dept)] / 60), completed_by: staffIds[DEPT_EMAIL[dept]] || null,
    })));
    await insertMany('discharge_events', [
      { admission_id: adm.id, actor_id: doctor, message: 'Doctor marked the patient medically fit for discharge. Discharge clock started.', created_at: ago(clearH) },
      { admission_id: adm.id, actor_id: doctor, message: `Patient discharged. Total wait after clearance: ${Math.floor(longest / 60)}h ${longest % 60}m.`, created_at: ago(clearH - longest / 60) },
    ]);
  }

  // ---------------------------------------------------------------- transfers in every status
  async function transfer({ patient, admission, requestedBy, spec, icu, urgency, reason, summary, createdAgo, status, acceptedHospital, acceptedAgo, offers, audit }) {
    const req = await insert('transfer_requests', {
      patient_id: patient, admission_id: admission || null, from_hospital_id: hid[0], requested_by: requestedBy, specialization_id: specs[spec],
      needs_icu: icu ? 1 : 0, urgency, reason, clinical_summary: summary, consent_given: 1, consent_note: 'Consent obtained from patient or family',
      status, accepted_hospital_id: acceptedHospital != null ? hid[acceptedHospital] : null, created_at: ago(createdAgo),
      accepted_at: acceptedAgo != null ? ago(acceptedAgo) : null,
    });
    await insertMany('transfer_offers', offers.map((o) => ({
      request_id: req.id, hospital_id: hid[o.h], match_score: o.score, status: o.status, response_note: o.note || null, sent_at: ago(createdAgo),
      responded_at: o.respAgo != null ? ago(o.respAgo) : null, summary_viewed_at: o.viewedAgo != null ? ago(o.viewedAgo) : null,
      responded_by: o.by ? staffIds[o.by] : null,
    })));
    await insertMany('audit_logs', (audit || []).map(([uid, action, details, hoursAgo]) => ({
      user_id: uid, action, entity_type: 'transfer_request', entity_id: req.id, details, created_at: ago(hoursAgo),
    })));
    return req.id;
  }

  // Open: one hospital declined, one still deciding (shows on Cedar Valley's desk)
  await transfer({
    patient: P[10], admission: kneeAdm, requestedBy: demoDoctor, spec: 'Orthopedics', icu: false, urgency: 'urgent',
    reason: 'Prosthesis loosening needs revision surgery by a joint specialist',
    summary: 'TRANSFER SUMMARY\nPatient: knee replacement, post-op day 2, new pain and instability. X-ray suggests loosening. Vitals stable. Allergies: none recorded.',
    createdAgo: 1.6, status: 'open',
    offers: [
      { h: 4, score: 90, status: 'pending', viewedAgo: 1.2 },
      { h: 3, score: 61, status: 'declined', note: 'Orthopaedic theatre fully booked until tomorrow', respAgo: 1.1, viewedAgo: 1.3, by: 'desk.agnes@medibridge.demo' },
    ],
    audit: [[demoDoctor, 'transfer.requested', 'Urgent orthopaedic transfer requested (2 hospitals contacted)', 1.6]],
  });
  // Open: every hospital declined, so the sender needs to act
  await transfer({
    patient: P[11], admission: icuAdm, requestedBy: demoDoctor, spec: 'Pulmonology', icu: true, urgency: 'critical',
    reason: 'Needs ventilator support and a pulmonology team not available here',
    summary: 'TRANSFER SUMMARY\nPatient: severe pneumonia with respiratory failure, SpO2 86% on high-flow oxygen. Needs ICU bed with ventilator. Allergies: none recorded.',
    createdAgo: 2.4, status: 'open',
    offers: [
      { h: 2, score: 72, status: 'declined', note: 'No ICU bed free tonight', respAgo: 2.1, viewedAgo: 2.2, by: 'desk.sunrise@medibridge.demo' },
      { h: 1, score: 66, status: 'declined', note: 'Pulmonologist off-site until 8am', respAgo: 1.8, viewedAgo: 2, by: 'desk@medibridge.demo' },
      { h: 5, score: 41, status: 'declined', note: 'Paediatric centre, adult admissions not accepted', respAgo: 1.7, viewedAgo: 2, by: 'desk.riverside@medibridge.demo' },
    ],
    audit: [[demoDoctor, 'transfer.requested', 'Critical pulmonology transfer requested (3 hospitals contacted)', 2.4]],
  });
  // Cancelled by the sender
  await transfer({
    patient: P[12], admission: gastroAdm, requestedBy: demoDoctor, spec: 'Gastroenterology', icu: false, urgency: 'routine',
    reason: 'Opinion on endoscopic drainage',
    summary: 'TRANSFER SUMMARY\nPatient: chronic pancreatitis flare, pain controlled. Opinion requested on endoscopic options.',
    createdAgo: 30, status: 'cancelled',
    offers: [{ h: 1, score: 74, status: 'withdrawn', viewedAgo: 29 }],
    audit: [[demoDoctor, 'transfer.requested', 'Routine gastroenterology transfer requested (1 hospital contacted)', 30], [demoDoctor, 'transfer.cancelled', 'Transfer request cancelled', 27]],
  });
  // Completed and closed the admission as transferred
  const movedAdm = await admit({ patient: P[13], doctor: demoDoctor, ward: 'Cardiac Ward', bed: 'C-03', dx: 'Unstable angina', insurer: 'Star Health', policy: 'SH-2290', admittedHoursAgo: 140, status: 'transferred' });
  await update('admissions', { id: movedAdm }, { discharged_at: ago(94) });
  await transfer({
    patient: P[13], admission: movedAdm, requestedBy: demoDoctor, spec: 'Cardiology', icu: true, urgency: 'urgent',
    reason: 'Needs angiography and stenting, cath lab not available here',
    summary: 'TRANSFER SUMMARY\nPatient: unstable angina, troponin rising. Angiography advised. Allergies: none recorded.',
    createdAgo: 100, status: 'completed', acceptedHospital: 2, acceptedAgo: 98.8,
    offers: [{ h: 2, score: 94, status: 'accepted', note: 'Cath lab slot at 6pm, CCU bed reserved', respAgo: 98.8, viewedAgo: 99.5, by: 'desk.sunrise@medibridge.demo' }],
    audit: [
      [demoDoctor, 'transfer.requested', 'Urgent cardiology transfer requested (1 hospital contacted)', 100],
      [staffIds['desk.sunrise@medibridge.demo'], 'transfer.accepted', 'Sunrise Heart & Vascular accepted the transfer', 98.8],
      [demoDoctor, 'transfer.completed', 'Transfer completed', 94],
    ],
  });

  // ---------------------------------------------------------------- notifications for each role
  const notes = [];
  const n = (user, type, title, message, relType, relId, hoursAgo, read = 0) => notes.push({
    user_id: user, type, title, message, related_type: relType, related_id: relId, is_read: read, created_at: ago(hoursAgo),
  });
  n(demoDoctor, 'discharge', 'Ready for discharge', 'Every department has signed off. Complete the discharge.', 'admission', ready, 1.1);
  n(demoDoctor, 'discharge', 'Discharge blocked: Pharmacy', 'Apixaban out of stock, sourcing from the central store', 'admission', afibAdm, 2.2);
  n(demoDoctor, 'transfer_declined', 'All hospitals declined', 'Every hospital contacted for the pulmonology request has declined. Send the request to more hospitals.', 'transfer_request', null, 1.7);
  n(demoDoctor, 'transfer_declined', 'St. Agnes declined the transfer', 'Orthopaedic theatre fully booked until tomorrow', 'transfer_request', null, 1.1, 1);
  n(demoPatient, 'discharge', 'Pharmacy and Nursing steps remaining', 'Two steps are still pending before you can go home. Track them on Hospital Stay.', 'admission', null, 2);
  n(demoPatient, 'care_plan', 'New to-do from your care plan', 'Book a fasting blood sugar test within three days.', null, null, 5, 1);
  n(adminId, 'system', 'Insurance is the slowest desk', 'Insurance approvals average over target for the last 30 days. Review the Operations Center.', null, null, 3);
  n(adminId, 'system', 'Transfer request unanswered', 'An urgent orthopaedic request has been waiting more than an hour for a reply.', 'transfer_request', null, 0.5);
  for (const [email, title, msg] of [
    ['pharmacy@medibridge.demo', 'Nudge: patient is waiting on you', 'Take-home medicines for Cardiac Ward C-08. Patient cleared 6 hours ago.'],
    ['insurance@medibridge.demo', 'New discharge: long wait', 'Insurance approval for General Ward G-14 has been open for 19 hours.'],
    ['records@medibridge.demo', 'Summary awaiting signature', 'Discharge summary for Orthopaedic Ward O-11 is blocked on consultant signature.'],
    ['billing@medibridge.demo', 'New discharge: Medical Ward M-03', 'Final bill was completed. No action needed.'],
    ['nursing@medibridge.demo', 'New discharge: Cardiac Ward C-08', 'Discharge teaching and handover pending.'],
    ['desk.cedar@medibridge.demo', 'Transfer request: Orthopedics', 'MediBridge City Hospital is asking if you can accept an orthopaedic patient. Please respond.'],
    ['desk.agnes@medibridge.demo', 'Transfer request: Neurology', 'MediBridge City Hospital is asking if you can accept a neurology patient. Please respond.'],
    ['transfer@medibridge.demo', 'All hospitals declined', 'A critical pulmonology request needs to be re-sent to more hospitals.'],
  ]) if (staffIds[email]) n(staffIds[email], 'discharge', title, msg, null, null, 1);
  await insertMany('notifications', notes);

  // A few audit entries so the admin log shows the new activity
  await insertMany('audit_logs', [
    [demoDoctor, 'discharge.cleared', 'admission', ready, 'Patient marked medically fit; discharge workflow started', 4],
    [staffIds['pharmacy@medibridge.demo'], 'discharge.task_blocked', 'admission', afibAdm, 'Pharmacy blocked: Apixaban out of stock', 2.2],
    [demoDoctor, 'discharge.nudge', 'admission', afibAdm, 'Nudged Pharmacy (1 staff)', 0.6],
  ].map(([uid, action, type, id, details, h]) => ({ user_id: uid, action, entity_type: type, entity_id: id, details, created_at: ago(h) })));

  await mongoose.disconnect();
  console.log('Extra demo data added: richer profiles, discharge cases in every state, transfers in every status, visits, medication history and notifications.');
}

main().catch((e) => { console.error('Extra demo seed failed:', e); process.exit(1); });
