// Seeds demo data for the v2 modules (hospitals, staff, intake forms, care plans,
// admissions + discharge tasks, transfer requests). Safe to re-run: it clears
// only the v2 tables and the demo staff users first.
// Usage: npm run db:v2  (applies migrate_v2.sql then this file)
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const HOURS = 3600 * 1000;
const ago = (hours) => new Date(Date.now() - hours * HOURS);
// Local wall-clock time, matching MySQL NOW()/CURRENT_TIMESTAMP (toISOString would write UTC
// and make every seeded "3 hours ago" look hours older than intended).
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return fmt(d).slice(0, 10); };

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
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medibridge',
  });
  const q = async (sql, params) => (await conn.query(sql, params))[0];

  // ---- clean previous demo staff (v2 tables were already recreated by migrate_v2.sql)
  await q(`DELETE FROM users WHERE role = 'staff'`);

  // ---- hospitals + capabilities --------------------------------------------
  const hospitals = [
    ['MediBridge City Hospital', 'Bengaluru', 'MG Road', 12.9756, 77.6068, '+91 80 4000 1000', 1],
    ['Lakeview Multispeciality Hospital', 'Bengaluru', 'Bellandur', 12.9260, 77.6762, '+91 80 4100 2000', 0],
    ['Sunrise Heart & Vascular Institute', 'Bengaluru', 'Jayanagar', 12.9250, 77.5938, '+91 80 4200 3000', 0],
    ['St. Agnes Neuro Centre', 'Bengaluru', 'Hebbal', 13.0358, 77.5970, '+91 80 4300 4000', 0],
    ['Cedar Valley Trauma Centre', 'Bengaluru', 'Whitefield', 12.9698, 77.7500, '+91 80 4400 5000', 0],
    ['Riverside Children\'s Hospital', 'Bengaluru', 'Malleshwaram', 13.0035, 77.5710, '+91 80 4500 6000', 0],
  ];
  const hid = [];
  for (const h of hospitals) {
    const r = await q(
      `INSERT INTO hospitals (name, city, address, latitude, longitude, phone, is_home) VALUES (?,?,?,?,?,?,?)`, h);
    hid.push(r.insertId);
  }
  const specs = {};
  for (const s of await q('SELECT id, name FROM specializations')) specs[s.name] = s.id;

  // hospital index -> [[specialization, beds, icu], ...]
  const caps = {
    0: [['General Medicine', 14, 2], ['Orthopedics', 6, 0], ['Gynecology', 5, 0], ['Gastroenterology', 4, 0]],
    1: [['General Medicine', 9, 1], ['Gastroenterology', 5, 1], ['Endocrinology', 4, 0], ['Pulmonology', 3, 2], ['Urology', 4, 0]],
    2: [['Cardiology', 7, 3], ['Pulmonology', 2, 1], ['General Medicine', 3, 0]],
    3: [['Neurology', 6, 2], ['Psychiatry', 5, 0], ['Orthopedics', 2, 0]],
    4: [['Orthopedics', 8, 2], ['General Medicine', 4, 1], ['Neurology', 1, 0], ['Cardiology', 0, 0]],
    5: [['Pediatrics', 10, 3], ['Pulmonology', 3, 1], ['ENT', 2, 0]],
  };
  for (const [idx, list] of Object.entries(caps)) {
    for (const [name, beds, icu] of list) {
      await q(`INSERT INTO hospital_capabilities (hospital_id, specialization_id, beds_available, icu_available) VALUES (?,?,?,?)`,
        [hid[idx], specs[name], beds, icu]);
    }
  }

  // ---- staff logins ---------------------------------------------------------
  const staffHash = await bcrypt.hash('Staff@123', 10);
  const staffDefs = [
    ['billing@medibridge.demo', 'Meera Pillai (Billing)', 0, 'billing'],
    ['insurance@medibridge.demo', 'Rahul Verma (Insurance Desk)', 0, 'insurance'],
    ['pharmacy@medibridge.demo', 'Sana Qureshi (Pharmacy)', 0, 'pharmacy'],
    ['nursing@medibridge.demo', 'Joseph D\'Souza (Nursing)', 0, 'nursing'],
    ['records@medibridge.demo', 'Kavya Rao (Medical Records)', 0, 'documentation'],
    ['transfer@medibridge.demo', 'Anita Joshi (Transfer Desk, City Hospital)', 0, 'transfer_desk'],
    ['desk@medibridge.demo', 'Vikram Nambiar (Transfer Desk, Lakeview)', 1, 'transfer_desk'],
    ['desk.sunrise@medibridge.demo', 'Dr. Lata Menon (Transfer Desk, Sunrise Heart)', 2, 'transfer_desk'],
    ['desk.agnes@medibridge.demo', 'Farhan Ali (Transfer Desk, St. Agnes)', 3, 'transfer_desk'],
    ['desk.cedar@medibridge.demo', 'Neha Kulkarni (Transfer Desk, Cedar Valley)', 4, 'transfer_desk'],
    ['desk.riverside@medibridge.demo', 'Ishaan Bhat (Transfer Desk, Riverside)', 5, 'transfer_desk'],
  ];
  const staffIds = {};
  for (const [email, name, hIdx, dept] of staffDefs) {
    const r = await q(`INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?,?, 'staff', ?, '+91 9000000001')`,
      [email, staffHash, name]);
    await q(`INSERT INTO staff (user_id, hospital_id, department) VALUES (?,?,?)`, [r.insertId, hid[hIdx], dept]);
    staffIds[email] = r.insertId;
  }

  // ---- people we already have ------------------------------------------------
  const demoPatient = (await q(`SELECT id FROM users WHERE email = 'patient@medibridge.demo'`))[0].id;
  const demoDoctor = (await q(`SELECT id FROM users WHERE email = 'doctor@medibridge.demo'`))[0].id;
  const otherPatients = (await q(`SELECT id FROM users WHERE role = 'patient' AND id <> ? ORDER BY id LIMIT 12`, [demoPatient])).map((r) => r.id);
  const doctors = (await q(`SELECT user_id AS id, specialization_id FROM doctors ORDER BY user_id LIMIT 8`)).map((r) => r.id);
  const adminId = (await q(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`))[0].id;

  // ---- intake forms for the demo patient's upcoming appointments -------------
  // The demo doctor gets a short run of visits today/tomorrow so the Smart Brief list is never empty
  // on demo day. ON DUPLICATE KEY keeps re-runs of this script from tripping the slot unique key.
  const briefVisits = [
    [otherPatients[6], day(0), '18:00:00', '18:30:00', 'confirmed', 'Palpitations at night'],
    [otherPatients[7], day(0), '18:30:00', '19:00:00', 'confirmed', 'BP medication review'],
    [otherPatients[8], day(1), '09:00:00', '09:30:00', 'pending', 'Chest discomfort on exertion'],
  ];
  const briefApptIds = [];
  for (const [pid, date, start, end, status, reason] of briefVisits) {
    const r = await q(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, start_time, end_time, consultation_mode, status, reason)
       VALUES (?,?,?,?,?, 'in_person', ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), patient_id = VALUES(patient_id), status = VALUES(status), reason = VALUES(reason)`,
      [pid, demoDoctor, date, start, end, status, reason]);
    briefApptIds.push({ id: r.insertId, patient_id: pid });
  }
  // two of the three filled in their pre-visit form; the third shows the "no intake" flag
  await q(`INSERT INTO intake_forms (appointment_id, patient_id, chief_complaint, symptoms, symptom_duration, severity, medication_changes, new_allergies, questions_for_doctor)
           VALUES (?,?,?,?,?,?,?,?,?)`,
    [briefApptIds[0].id, briefApptIds[0].patient_id, 'Heart racing when lying down at night', 'Palpitations,Anxiety,Poor sleep', '10 days', 4,
      'Stopped my thyroid tablet last month', 'Sulfa drugs (rash)', 'Could this be related to my thyroid?']);
  await q(`INSERT INTO intake_forms (appointment_id, patient_id, chief_complaint, symptoms, symptom_duration, severity, questions_for_doctor)
           VALUES (?,?,?,?,?,?,?)`,
    [briefApptIds[1].id, briefApptIds[1].patient_id, 'Routine BP medication review', 'Mild headache', '1 month', 2, 'Can I reduce the dose?']);

  const upcoming = await q(
    `SELECT id, patient_id, doctor_id FROM appointments WHERE appointment_date >= CURDATE() AND status IN ('pending','confirmed') ORDER BY appointment_date, start_time`);
  // Demo patient: intake filled for the visit with the demo doctor (so the doctor's brief is rich);
  // their other upcoming visits stay without one so the "Before your visit" prompt shows.
  const heroAppt = upcoming.find((u) => u.patient_id === demoPatient && u.doctor_id === demoDoctor);
  if (heroAppt) {
    await q(`INSERT INTO intake_forms (appointment_id, patient_id, chief_complaint, symptoms, symptom_duration, severity, medication_changes, new_allergies, questions_for_doctor)
             VALUES (?,?,?,?,?,?,?,?,?)`,
      [heroAppt.id, demoPatient, 'Shortness of breath while climbing stairs', 'Breathlessness,Fatigue,Chest tightness', '2 weeks', 3,
        'Started a new multivitamin last week', null, 'Is it safe to continue my evening walks?']);
  }
  // a few other upcoming appointments get intake forms so the doctor's list looks lived-in
  const complaints = [
    ['Recurring migraine headaches', 'Headache,Nausea,Light sensitivity', '3 days', 4],
    ['Follow-up on blood sugar readings', 'Thirst,Fatigue', '1 month', 2],
    ['Lower back pain after lifting', 'Back pain,Stiffness', '5 days', 3],
    ['Skin rash on forearms', 'Itching,Redness', '1 week', 2],
  ];
  let ci = 0;
  const hasIntake = new Set(briefApptIds.map((b) => b.id));
  for (const a of upcoming.filter((u) => u.patient_id !== demoPatient && !hasIntake.has(u.id)).slice(0, 4)) {
    const c = complaints[ci++ % complaints.length];
    await q(`INSERT INTO intake_forms (appointment_id, patient_id, chief_complaint, symptoms, symptom_duration, severity) VALUES (?,?,?,?,?,?)`,
      [a.id, a.patient_id, c[0], c[1], c[2], c[3]]);
  }

  // ---- Visit Loop: care plans + commitments for the demo patient -------------
  const rec = await q(`SELECT id FROM medical_records WHERE patient_id = ? AND doctor_id = ? ORDER BY record_date DESC LIMIT 2`, [demoPatient, demoDoctor]);
  const plan1 = await q(
    `INSERT INTO care_plans (patient_id, doctor_id, medical_record_id, plain_summary, created_at) VALUES (?,?,?,?,?)`,
    [demoPatient, demoDoctor, rec[0] ? rec[0].id : null,
      'Your blood pressure is slightly high but manageable. Take the new tablet every morning, cut down on salt, and walk 30 minutes a day. Come back in two weeks so we can check how the tablet is working. Call us earlier if you feel chest pain or dizziness.',
      fmt(ago(24 * 6))]);
  const plan2 = await q(
    `INSERT INTO care_plans (patient_id, doctor_id, medical_record_id, plain_summary, created_at) VALUES (?,?,?,?,?)`,
    [demoPatient, demoDoctor, rec[1] ? rec[1].id : null,
      'Your cholesterol report was mildly raised. Eat fewer fried foods, repeat the blood test after a month, and keep taking your evening tablet.',
      fmt(ago(24 * 40))]);
  const commits = [
    [plan1.insertId, 'doctor', 'follow_up', 'Follow-up visit to review blood pressure', day(8), 'open'],
    [plan1.insertId, 'patient', 'medication', 'Take BP tablet every morning', day(14), 'open'],
    [plan1.insertId, 'patient', 'lifestyle', 'Walk 30 minutes daily', day(14), 'open'],
    [plan1.insertId, 'patient', 'test', 'Book fasting blood sugar test', day(3), 'open'],
    [plan2.insertId, 'patient', 'test', 'Repeat lipid profile blood test', day(-9), 'open'],   // overdue: shows a broken loop
    [plan2.insertId, 'patient', 'lifestyle', 'Cut down on fried food', day(-12), 'done'],
  ];
  for (const c of commits) {
    await q(`INSERT INTO commitments (care_plan_id, patient_id, owner_role, kind, title, due_date, status, completed_at) VALUES (?,?,?,?,?,?,?,?)`,
      [c[0], demoPatient, c[1], c[2], c[3], c[4], c[5], c[5] === 'done' ? fmt(ago(24 * 13)) : null]);
  }
  // other patients: some overdue commitments so the admin loop analytics have signal
  for (const pid of otherPatients.slice(0, 6)) {
    const p = await q(`INSERT INTO care_plans (patient_id, doctor_id, plain_summary, created_at) VALUES (?,?,?,?)`,
      [pid, doctors[pid % doctors.length], 'Take your medicines as prescribed and return for a review.', fmt(ago(24 * 20))]);
    await q(`INSERT INTO commitments (care_plan_id, patient_id, owner_role, kind, title, due_date, status) VALUES (?,?, 'patient', 'follow_up', 'Follow-up review visit', ?, ?)`,
      [p.insertId, pid, day(-(pid % 7) - 1), pid % 3 === 0 ? 'done' : 'open']);
    await q(`INSERT INTO commitments (care_plan_id, patient_id, owner_role, kind, title, due_date, status) VALUES (?,?, 'patient', 'test', 'Repeat blood test', ?, 'open')`,
      [p.insertId, pid, day((pid % 5) - 1)]);
  }

  // ---- Admissions + Discharge Flow -------------------------------------------
  async function admit({ patient, doctor, ward, bed, dx, insurer, policy, admittedHoursAgo, clearedHoursAgo, tasks }) {
    const cleared = clearedHoursAgo != null;
    const r = await q(
      `INSERT INTO admissions (patient_id, hospital_id, doctor_id, ward, bed, diagnosis, insurance_provider, insurance_policy_no, admitted_at, status, cleared_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [patient, hid[0], doctor, ward, bed, dx, insurer, policy, fmt(ago(admittedHoursAgo)),
        cleared ? 'cleared' : 'admitted', cleared ? fmt(ago(clearedHoursAgo)) : null]);
    const admissionId = r.insertId;
    if (cleared) {
      await q(`INSERT INTO discharge_events (admission_id, actor_id, message, created_at) VALUES (?,?,?,?)`,
        [admissionId, doctor, 'Doctor marked the patient medically fit for discharge. Discharge clock started.', fmt(ago(clearedHoursAgo))]);
      for (const [dept, title, sla] of DEPT_TASKS) {
        const t = tasks[dept] || { status: 'pending' };
        const tr = await q(
          `INSERT INTO discharge_tasks (admission_id, department, title, status, blocked_reason, sla_minutes, started_at, completed_at, completed_by)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [admissionId, dept, title, t.status, t.reason || null, sla,
            t.startedAgo != null ? fmt(ago(t.startedAgo)) : null,
            t.doneAgo != null ? fmt(ago(t.doneAgo)) : null,
            t.doneAgo != null ? staffIds[DEPT_EMAIL[dept]] : null]);
        if (t.doneAgo != null) {
          await q(`INSERT INTO discharge_events (admission_id, task_id, actor_id, message, created_at) VALUES (?,?,?,?,?)`,
            [admissionId, tr.insertId, null, `${title} - completed.`, fmt(ago(t.doneAgo))]);
        }
        if (t.status === 'blocked') {
          await q(`INSERT INTO discharge_events (admission_id, task_id, actor_id, message, created_at) VALUES (?,?,?,?,?)`,
            [admissionId, tr.insertId, null, `${title} - blocked: ${t.reason}`, fmt(ago(t.startedAgo || 1))]);
        }
      }
    }
    return admissionId;
  }

  // Hero case: the demo patient has been cleared 3h ago and is stuck on Insurance
  const heroAdm = await admit({
    patient: demoPatient, doctor: demoDoctor, ward: 'Cardiac Ward', bed: 'C-12', dx: 'Hypertensive episode, observation',
    insurer: 'Star Health', policy: 'SH-4471-2209', admittedHoursAgo: 52, clearedHoursAgo: 3,
    tasks: {
      documentation: { status: 'done', startedAgo: 2.8, doneAgo: 2.2 },
      billing: { status: 'in_progress', startedAgo: 1.2 },
      insurance: { status: 'blocked', reason: 'Awaiting TPA pre-authorisation approval', startedAgo: 2.5 },
      pharmacy: { status: 'pending' },
      nursing: { status: 'done', startedAgo: 2.6, doneAgo: 2.4 },
    },
  });
  // care plan attached to the discharge so the patient leaves with a plain-language plan
  await q(`INSERT INTO care_plans (patient_id, doctor_id, admission_id, plain_summary) VALUES (?,?,?,?)`,
    [demoPatient, demoDoctor, heroAdm,
      'You were admitted because your blood pressure spiked. It is now stable. Take your new tablets as per the pharmacy sheet, rest for three days, avoid salty food, and come for a review in one week.']);

  await admit({
    patient: otherPatients[0], doctor: doctors[1], ward: 'General Ward', bed: 'G-04', dx: 'Community-acquired pneumonia',
    insurer: 'HDFC ERGO', policy: 'HE-90321', admittedHoursAgo: 70, clearedHoursAgo: 5.5,
    tasks: {
      documentation: { status: 'done', startedAgo: 5, doneAgo: 4.5 },
      billing: { status: 'blocked', reason: 'Final bill pending itemised implant/consumable sheet from OT', startedAgo: 4 },
      insurance: { status: 'in_progress', startedAgo: 3 },
      pharmacy: { status: 'done', startedAgo: 2, doneAgo: 1.4 },
      nursing: { status: 'pending' },
    },
  });
  await admit({
    patient: otherPatients[1], doctor: doctors[2], ward: 'Orthopaedic Ward', bed: 'O-07', dx: 'Fractured wrist, post-fixation',
    insurer: null, policy: null, admittedHoursAgo: 40, clearedHoursAgo: 1,
    tasks: { documentation: { status: 'in_progress', startedAgo: 0.5 }, insurance: { status: 'done', doneAgo: 0.9, startedAgo: 0.95 } },
  });
  await admit({
    patient: otherPatients[2], doctor: doctors[3], ward: 'General Ward', bed: 'G-09', dx: 'Acute gastroenteritis',
    insurer: 'Niva Bupa', policy: 'NB-77120', admittedHoursAgo: 30, clearedHoursAgo: 0.4, tasks: {},
  });
  // Still in treatment (not cleared yet)
  await admit({ patient: otherPatients[3], doctor: doctors[0], ward: 'ICU', bed: 'ICU-2', dx: 'Acute myocardial infarction',
    insurer: 'Star Health', policy: 'SH-8812', admittedHoursAgo: 20, clearedHoursAgo: null, tasks: {} });
  await admit({ patient: otherPatients[4], doctor: doctors[1], ward: 'General Ward', bed: 'G-02', dx: 'Dengue fever, monitoring',
    insurer: null, policy: null, admittedHoursAgo: 28, clearedHoursAgo: null, tasks: {} });

  // Historical discharged cases give the admin analytics real averages by department
  const dayMs = 24 * HOURS;
  for (let i = 0; i < 14; i++) {
    const clearedAt = new Date(Date.now() - (i + 1) * dayMs * 1.5);
    const patient = otherPatients[(i + 5) % otherPatients.length];
    const doctor = doctors[i % doctors.length];
    const r = await q(
      `INSERT INTO admissions (patient_id, hospital_id, doctor_id, ward, bed, diagnosis, insurance_provider, admitted_at, status, cleared_at, discharged_at)
       VALUES (?,?,?,?,?,?,?,?, 'discharged', ?, ?)`,
      [patient, hid[0], doctor, 'General Ward', `G-${10 + i}`, ['Appendicitis', 'Pneumonia', 'Dengue', 'Cellulitis', 'Kidney stones'][i % 5],
        i % 3 === 0 ? null : 'Star Health', fmt(new Date(clearedAt.getTime() - 3 * dayMs)), fmt(clearedAt), null]);
    // Insurance is the usual bottleneck (the story the admin dashboard tells), billing second
    const mins = { documentation: 35 + (i * 7) % 40, billing: 70 + (i * 13) % 90, insurance: 110 + (i * 29) % 200, pharmacy: 25 + (i * 5) % 40, nursing: 15 + (i * 3) % 20 };
    let last = 0;
    for (const [dept, title, sla] of DEPT_TASKS) {
      const m = mins[dept];
      last = Math.max(last, m);
      await q(`INSERT INTO discharge_tasks (admission_id, department, title, status, sla_minutes, started_at, completed_at) VALUES (?,?,?, 'done', ?, ?, ?)`,
        [r.insertId, dept, title, sla, fmt(new Date(clearedAt.getTime() + 5 * 60000)), fmt(new Date(clearedAt.getTime() + m * 60000))]);
    }
    await q(`UPDATE admissions SET discharged_at = ? WHERE id = ?`, [fmt(new Date(clearedAt.getTime() + last * 60000)), r.insertId]);
  }

  // ---- TransferConnect --------------------------------------------------------
  const cardiology = specs['Cardiology'];
  const summaryFor = (name, text) => `${name}\n${text}`;
  // 1) Open request, 3 offers in different states (the demo walk-through)
  const t1 = await q(
    `INSERT INTO transfer_requests (patient_id, admission_id, from_hospital_id, requested_by, specialization_id, needs_icu, urgency, reason, clinical_summary, consent_given, consent_note, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'open', ?)`,
    [otherPatients[3], null, hid[0], doctors[0], cardiology, 1, 'critical',
      'Needs primary angioplasty; cath lab at City Hospital is under maintenance',
      summaryFor('52M, acute anterior STEMI, door-to-balloon window open',
        'BP 100/70, pulse 108, on aspirin + heparin. Allergies: none known. Chronic: type 2 diabetes. ECG attached in record. Needs cath lab + CCU bed.'),
      1, 'Consent obtained from patient\'s son at bedside', fmt(ago(0.7))]);
  const offers1 = [[2, 96, 'accepted', 'Cath lab ready, CCU bed 4 reserved. Send ambulance now.', 0.4],
    [4, 40, 'declined', 'No cardiology cover tonight.', 0.5]];
  for (const [hIdx, score, status, note, respAgo] of offers1) {
    await q(`INSERT INTO transfer_offers (request_id, hospital_id, match_score, status, response_note, sent_at, responded_at, summary_viewed_at, responded_by)
             VALUES (?,?,?,?,?,?,?,?,?)`,
      [t1.insertId, hid[hIdx], score, status, note, fmt(ago(0.7)), respAgo != null ? fmt(ago(respAgo)) : null,
        status === 'pending' ? null : fmt(ago(0.6)), status === 'pending' ? null : staffIds[hIdx === 2 ? 'desk.sunrise@medibridge.demo' : 'desk.cedar@medibridge.demo']]);
  }
  await q(`UPDATE transfer_requests SET status = 'accepted', accepted_hospital_id = ?, accepted_at = ? WHERE id = ?`, [hid[2], fmt(ago(0.4)), t1.insertId]);

  // 2) Fresh request with no responses yet (a pending one for receiving desks to act on)
  const t2 = await q(
    `INSERT INTO transfer_requests (patient_id, from_hospital_id, requested_by, specialization_id, needs_icu, urgency, reason, clinical_summary, consent_given, consent_note, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'open', ?)`,
    [otherPatients[4], hid[0], doctors[1], specs['Neurology'], 0, 'urgent',
      'Needs neurosurgical evaluation after head injury; not available here',
      summaryFor('34M, road-traffic injury, GCS 14', 'CT head: small subdural bleed. Vitals stable. No known allergies.'),
      1, 'Consent from patient', fmt(ago(0.2))]);
  for (const [hIdx, score] of [[3, 92], [4, 48]]) {
    await q(`INSERT INTO transfer_offers (request_id, hospital_id, match_score, status, sent_at) VALUES (?,?,?, 'pending', ?)`,
      [t2.insertId, hid[hIdx], score, fmt(ago(0.2))]);
  }

  // 3) Completed one (history)
  const t3 = await q(
    `INSERT INTO transfer_requests (patient_id, from_hospital_id, requested_by, specialization_id, needs_icu, urgency, reason, clinical_summary, consent_given, status, accepted_hospital_id, created_at, accepted_at)
     VALUES (?,?,?,?,?,?,?,?,?, 'completed', ?, ?, ?)`,
    [otherPatients[5], hid[0], doctors[2], specs['Pediatrics'], 0, 'routine', 'Paediatric surgical opinion',
      summaryFor('6F, recurrent abdominal pain', 'Ultrasound normal. Needs paediatric surgeon review.'), 1, hid[5], fmt(ago(60)), fmt(ago(58.5))]);
  await q(`INSERT INTO transfer_offers (request_id, hospital_id, match_score, status, response_note, sent_at, responded_at) VALUES (?,?,?, 'accepted', 'Accepted. Bed ready.', ?, ?)`,
    [t3.insertId, hid[5], 88, fmt(ago(60)), fmt(ago(58.5))]);

  // ---- audit trail entries so the audit log shows the new modules -------------
  const audit = [
    [doctors[0], 'transfer.requested', 'transfer_request', t1.insertId, 'Critical cardiac transfer requested (3 hospitals contacted)'],
    [staffIds['desk.sunrise@medibridge.demo'], 'transfer.accepted', 'transfer_request', t1.insertId, 'Sunrise Heart & Vascular accepted the transfer'],
    [demoDoctor, 'discharge.cleared', 'admission', heroAdm, 'Patient marked medically fit; discharge workflow started'],
    [staffIds['insurance@medibridge.demo'], 'discharge.task_blocked', 'admission', heroAdm, 'Insurance blocked: awaiting TPA pre-authorisation'],
  ];
  for (const [uid, action, type, id, details] of audit) {
    await q(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)`, [uid, action, type, id, details]);
  }

  await conn.end();
  console.log('v2 demo data seeded.');
  console.log('Staff logins (password Staff@123): billing@, insurance@, pharmacy@, nursing@, records@, transfer@ (home desk), desk@ (Lakeview), desk.sunrise@, desk.agnes@, desk.cedar@, desk.riverside@  - all @medibridge.demo');
}

main().catch((e) => { console.error('Seed v2 failed:', e); process.exit(1); });
