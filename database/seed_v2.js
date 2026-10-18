// Seeds demo data for the v2 modules (hospitals, staff, intake forms, care plans,
// admissions + discharge tasks, transfer requests) and the extra demo layer.
// Safe to re-run: it clears only the v2 collections and the demo staff users first.
// Usage: npm run db:v2   (run after npm run db:seed)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDb } = require('./db');
const { mongoose, M, insert, insertMany, find, findOne, update, remove, shiftDate, dayOffset } = require('./store');

const HOURS = 3600 * 1000;
const ago = (hours) => new Date(Date.now() - hours * HOURS);
const day = (offset) => dayOffset(offset);

const V2_COLLECTIONS = [
  'hospitals', 'hospital_capabilities', 'staff', 'intake_forms', 'care_plans', 'commitments',
  'admissions', 'discharge_tasks', 'discharge_events', 'transfer_requests', 'transfer_offers',
];

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
  for (const model of Object.values(M)) await model.createCollection().catch(() => {});
  for (const model of Object.values(M)) await model.syncIndexes();

  // ---- clean previous v2 data and demo staff -------------------------------
  const staffUsers = await find('users', { role: 'staff' }, { select: 'id' });
  await M.users.deleteMany({ role: 'staff' });
  for (const name of V2_COLLECTIONS) {
    await M[name].deleteMany({});
    await mongoose.connection.collection('counters').deleteOne({ _id: name });
  }
  void staffUsers;

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
  for (const [name, city, address, latitude, longitude, phone, isHome] of hospitals) {
    hid.push((await insert('hospitals', { name, city, address, latitude, longitude, phone, is_home: isHome })).id);
  }
  const specs = {};
  for (const s of await find('specializations')) specs[s.name] = s.id;

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
    await insertMany('hospital_capabilities', list.map(([name, beds, icu]) => ({
      hospital_id: hid[idx], specialization_id: specs[name], beds_available: beds, icu_available: icu,
    })));
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
    const u = await insert('users', { email, password_hash: staffHash, role: 'staff', full_name: name, phone: '+91 9000000001' });
    await insert('staff', { user_id: u.id, hospital_id: hid[hIdx], department: dept });
    staffIds[email] = u.id;
  }

  // ---- people we already have ------------------------------------------------
  const demoPatient = (await findOne('users', { email: 'patient@medibridge.demo' })).id;
  const demoDoctor = (await findOne('users', { email: 'doctor@medibridge.demo' })).id;
  const otherPatients = (await find('users', { role: 'patient', id: { $ne: demoPatient } }, { sort: { id: 1 }, limit: 12, select: 'id' })).map((r) => r.id);
  const doctors = (await find('doctors', {}, { sort: { user_id: 1 }, limit: 8, select: 'user_id' })).map((r) => r.user_id);
  void (await findOne('users', { role: 'admin' }));

  // ---- intake forms for the demo doctor's upcoming appointments --------------
  // The demo doctor gets a short run of visits today/tomorrow so the Smart Brief list is never empty
  // on demo day.
  async function upsertAppointment(patientId, doctorId, date, start, end, status, reason, mode = 'in_person') {
    const existing = await findOne('appointments', { doctor_id: doctorId, appointment_date: date, start_time: start });
    if (existing) {
      await update('appointments', { id: existing.id }, { patient_id: patientId, status, reason });
      return existing.id;
    }
    return (await insert('appointments', {
      patient_id: patientId, doctor_id: doctorId, appointment_date: date, start_time: start, end_time: end, consultation_mode: mode, status, reason,
    })).id;
  }

  const briefVisits = [
    [otherPatients[6], day(0), '18:00:00', '18:30:00', 'confirmed', 'Palpitations at night'],
    [otherPatients[7], day(0), '18:30:00', '19:00:00', 'confirmed', 'BP medication review'],
    [otherPatients[8], day(1), '09:00:00', '09:30:00', 'pending', 'Chest discomfort on exertion'],
  ];
  const briefApptIds = [];
  for (const [pid, date, start, end, status, reason] of briefVisits) {
    briefApptIds.push({ id: await upsertAppointment(pid, demoDoctor, date, start, end, status, reason), patient_id: pid });
  }
  // two of the three filled in their pre-visit form; the third shows the "no intake" flag
  await insert('intake_forms', {
    appointment_id: briefApptIds[0].id, patient_id: briefApptIds[0].patient_id, chief_complaint: 'Heart racing when lying down at night',
    symptoms: 'Palpitations,Anxiety,Poor sleep', symptom_duration: '10 days', severity: 4, medication_changes: 'Stopped my thyroid tablet last month',
    new_allergies: 'Sulfa drugs (rash)', questions_for_doctor: 'Could this be related to my thyroid?',
  });
  await insert('intake_forms', {
    appointment_id: briefApptIds[1].id, patient_id: briefApptIds[1].patient_id, chief_complaint: 'Routine BP medication review',
    symptoms: 'Mild headache', symptom_duration: '1 month', severity: 2, questions_for_doctor: 'Can I reduce the dose?',
  });

  const upcoming = await find('appointments', { appointment_date: { $gte: day(0) }, status: { $in: ['pending', 'confirmed'] } }, { sort: { appointment_date: 1, start_time: 1 } });
  // Demo patient: intake filled for the visit with the demo doctor (so the doctor's brief is rich);
  // their other upcoming visits stay without one so the "Before your visit" prompt shows.
  const heroAppt = upcoming.find((u) => u.patient_id === demoPatient && u.doctor_id === demoDoctor);
  if (heroAppt) {
    await insert('intake_forms', {
      appointment_id: heroAppt.id, patient_id: demoPatient, chief_complaint: 'Shortness of breath while climbing stairs',
      symptoms: 'Breathlessness,Fatigue,Chest tightness', symptom_duration: '2 weeks', severity: 3,
      medication_changes: 'Started a new multivitamin last week', new_allergies: null, questions_for_doctor: 'Is it safe to continue my evening walks?',
    });
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
    await insert('intake_forms', { appointment_id: a.id, patient_id: a.patient_id, chief_complaint: c[0], symptoms: c[1], symptom_duration: c[2], severity: c[3] });
  }

  // ---- Visit Loop: care plans + commitments for the demo patient -------------
  const rec = await find('medical_records', { patient_id: demoPatient, doctor_id: demoDoctor }, { sort: { record_date: -1, id: -1 }, limit: 2, select: 'id' });
  const plan1 = await insert('care_plans', {
    patient_id: demoPatient, doctor_id: demoDoctor, medical_record_id: rec[0] ? rec[0].id : null,
    plain_summary: 'Your blood pressure is slightly high but manageable. Take the new tablet every morning, cut down on salt, and walk 30 minutes a day. Come back in two weeks so we can check how the tablet is working. Call us earlier if you feel chest pain or dizziness.',
    created_at: ago(24 * 6),
  });
  const plan2 = await insert('care_plans', {
    patient_id: demoPatient, doctor_id: demoDoctor, medical_record_id: rec[1] ? rec[1].id : null,
    plain_summary: 'Your cholesterol report was mildly raised. Eat fewer fried foods, repeat the blood test after a month, and keep taking your evening tablet.',
    created_at: ago(24 * 40),
  });
  const commits = [
    [plan1.id, 'doctor', 'follow_up', 'Follow-up visit to review blood pressure', day(8), 'open'],
    [plan1.id, 'patient', 'medication', 'Take BP tablet every morning', day(14), 'open'],
    [plan1.id, 'patient', 'lifestyle', 'Walk 30 minutes daily', day(14), 'open'],
    [plan1.id, 'patient', 'test', 'Book fasting blood sugar test', day(3), 'open'],
    [plan2.id, 'patient', 'test', 'Repeat lipid profile blood test', day(-9), 'open'], // overdue: shows a broken loop
    [plan2.id, 'patient', 'lifestyle', 'Cut down on fried food', day(-12), 'done'],
  ];
  await insertMany('commitments', commits.map((c) => ({
    care_plan_id: c[0], patient_id: demoPatient, owner_role: c[1], kind: c[2], title: c[3], due_date: c[4], status: c[5],
    completed_at: c[5] === 'done' ? ago(24 * 13) : null,
  })));
  // other patients: some overdue commitments so the admin loop analytics have signal
  for (const pid of otherPatients.slice(0, 6)) {
    const p = await insert('care_plans', {
      patient_id: pid, doctor_id: doctors[pid % doctors.length], plain_summary: 'Take your medicines as prescribed and return for a review.', created_at: ago(24 * 20),
    });
    await insert('commitments', { care_plan_id: p.id, patient_id: pid, owner_role: 'patient', kind: 'follow_up', title: 'Follow-up review visit', due_date: day(-(pid % 7) - 1), status: pid % 3 === 0 ? 'done' : 'open' });
    await insert('commitments', { care_plan_id: p.id, patient_id: pid, owner_role: 'patient', kind: 'test', title: 'Repeat blood test', due_date: day((pid % 5) - 1), status: 'open' });
  }

  // ---- Admissions + Discharge Flow -------------------------------------------
  async function admit({ patient, doctor, ward, bed, dx, insurer, policy, admittedHoursAgo, clearedHoursAgo, tasks = {}, status }) {
    const cleared = clearedHoursAgo != null;
    const adm = await insert('admissions', {
      patient_id: patient, hospital_id: hid[0], doctor_id: doctor, ward, bed, diagnosis: dx, insurance_provider: insurer, insurance_policy_no: policy,
      admitted_at: ago(admittedHoursAgo), status: status || (cleared ? 'cleared' : 'admitted'), cleared_at: cleared ? ago(clearedHoursAgo) : null,
    });
    const admissionId = adm.id;
    if (!cleared) return admissionId;

    await insert('discharge_events', { admission_id: admissionId, actor_id: doctor, message: 'Doctor marked the patient medically fit for discharge. Discharge clock started.', created_at: ago(clearedHoursAgo) });
    for (const [dept, title, sla] of DEPT_TASKS) {
      const selfPay = !insurer && dept === 'insurance';
      const t = selfPay ? { status: 'done', startedAgo: clearedHoursAgo, doneAgo: clearedHoursAgo } : (tasks[dept] || { status: 'pending' });
      const doneBy = t.doneAgo != null && !selfPay ? staffIds[DEPT_EMAIL[dept]] : null;
      const task = await insert('discharge_tasks', {
        admission_id: admissionId, department: dept, title, status: t.status, blocked_reason: t.reason || null, sla_minutes: sla,
        started_at: t.startedAgo != null ? ago(t.startedAgo) : null, completed_at: t.doneAgo != null ? ago(t.doneAgo) : null,
        completed_by: doneBy, last_nudged_at: t.nudgedAgo != null ? ago(t.nudgedAgo) : null,
      });
      if (selfPay) {
        await insert('discharge_events', { admission_id: admissionId, task_id: task.id, actor_id: null, message: 'Self-pay patient: insurance approval not required.', created_at: ago(clearedHoursAgo) });
      } else if (t.doneAgo != null) {
        await insert('discharge_events', { admission_id: admissionId, task_id: task.id, actor_id: doneBy, message: `${title} - completed.`, created_at: ago(t.doneAgo) });
      }
      if (t.status === 'blocked') {
        await insert('discharge_events', { admission_id: admissionId, task_id: task.id, actor_id: staffIds[DEPT_EMAIL[dept]] || null, message: `${title} - blocked: ${t.reason}`, created_at: ago(t.startedAgo || 1) });
      }
      if (t.nudgedAgo != null) {
        await insert('discharge_events', { admission_id: admissionId, task_id: task.id, actor_id: doctor, message: `${dept.charAt(0).toUpperCase() + dept.slice(1)} nudged.`, created_at: ago(t.nudgedAgo) });
      }
    }
    if (tasks.__allDone) {
      await insert('discharge_events', { admission_id: admissionId, actor_id: null, message: 'All departments have cleared the patient. Ready to go home.', created_at: ago(tasks.__allDone) });
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
  await insert('care_plans', {
    patient_id: demoPatient, doctor_id: demoDoctor, admission_id: heroAdm,
    plain_summary: 'You were admitted because your blood pressure spiked. It is now stable. Take your new tablets as per the pharmacy sheet, rest for three days, avoid salty food, and come for a review in one week.',
  });

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
    tasks: { documentation: { status: 'in_progress', startedAgo: 0.5 } },
  });
  await admit({
    patient: otherPatients[2], doctor: doctors[3], ward: 'General Ward', bed: 'G-09', dx: 'Acute gastroenteritis',
    insurer: 'Niva Bupa', policy: 'NB-77120', admittedHoursAgo: 30, clearedHoursAgo: 0.4, tasks: {},
  });
  // Still in treatment (not cleared yet)
  await admit({ patient: otherPatients[3], doctor: doctors[0], ward: 'ICU', bed: 'ICU-2', dx: 'Acute myocardial infarction', insurer: 'Star Health', policy: 'SH-8812', admittedHoursAgo: 20 });
  await admit({ patient: otherPatients[4], doctor: doctors[1], ward: 'General Ward', bed: 'G-02', dx: 'Dengue fever, monitoring', insurer: null, policy: null, admittedHoursAgo: 28 });

  // Historical discharged cases give the admin analytics real averages by department
  const dayMs = 24 * HOURS;
  for (let i = 0; i < 14; i++) {
    const clearedAt = new Date(Date.now() - (i + 1) * dayMs * 1.5);
    const patient = otherPatients[(i + 5) % otherPatients.length];
    const doctor = doctors[i % doctors.length];
    // Insurance is the usual bottleneck (the story the admin dashboard tells), billing second
    const mins = { documentation: 35 + (i * 7) % 40, billing: 70 + (i * 13) % 90, insurance: 110 + (i * 29) % 200, pharmacy: 25 + (i * 5) % 40, nursing: 15 + (i * 3) % 20 };
    const last = Math.max(...Object.values(mins));
    const adm = await insert('admissions', {
      patient_id: patient, hospital_id: hid[0], doctor_id: doctor, ward: 'General Ward', bed: `G-${10 + i}`,
      diagnosis: ['Appendicitis', 'Pneumonia', 'Dengue', 'Cellulitis', 'Kidney stones'][i % 5], insurance_provider: i % 3 === 0 ? null : 'Star Health',
      admitted_at: new Date(clearedAt.getTime() - 3 * dayMs), status: 'discharged', cleared_at: clearedAt, discharged_at: new Date(clearedAt.getTime() + last * 60000),
    });
    await insertMany('discharge_tasks', DEPT_TASKS.map(([dept, title, sla]) => ({
      admission_id: adm.id, department: dept, title, status: 'done', sla_minutes: sla,
      started_at: new Date(clearedAt.getTime() + 5 * 60000), completed_at: new Date(clearedAt.getTime() + mins[dept] * 60000),
    })));
  }

  // ---- TransferConnect --------------------------------------------------------
  const cardiology = specs['Cardiology'];
  const summaryFor = (name, text) => `${name}\n${text}`;
  // 1) Accepted request: two hospitals replied (the demo walk-through)
  const t1 = await insert('transfer_requests', {
    patient_id: otherPatients[3], admission_id: null, from_hospital_id: hid[0], requested_by: doctors[0], specialization_id: cardiology, needs_icu: 1,
    urgency: 'critical', reason: 'Needs primary angioplasty; cath lab at City Hospital is under maintenance',
    clinical_summary: summaryFor('52M, acute anterior STEMI, door-to-balloon window open',
      'BP 100/70, pulse 108, on aspirin + heparin. Allergies: none known. Chronic: type 2 diabetes. ECG attached in record. Needs cath lab + CCU bed.'),
    consent_given: 1, consent_note: 'Consent obtained from patient\'s son at bedside', status: 'accepted', accepted_hospital_id: hid[2],
    created_at: ago(0.7), accepted_at: ago(0.4),
  });
  const offers1 = [
    [2, 96, 'accepted', 'Cath lab ready, CCU bed 4 reserved. Send ambulance now.', 0.4, 'desk.sunrise@medibridge.demo'],
    [4, 40, 'declined', 'No cardiology cover tonight.', 0.5, 'desk.cedar@medibridge.demo'],
  ];
  await insertMany('transfer_offers', offers1.map(([hIdx, score, status, note, respAgo, by]) => ({
    request_id: t1.id, hospital_id: hid[hIdx], match_score: score, status, response_note: note, sent_at: ago(0.7), responded_at: ago(respAgo),
    summary_viewed_at: ago(0.6), responded_by: staffIds[by],
  })));

  // 2) Fresh request with no responses yet (a pending one for receiving desks to act on)
  const t2 = await insert('transfer_requests', {
    patient_id: otherPatients[4], from_hospital_id: hid[0], requested_by: doctors[1], specialization_id: specs['Neurology'], needs_icu: 0, urgency: 'urgent',
    reason: 'Needs neurosurgical evaluation after head injury; not available here',
    clinical_summary: summaryFor('34M, road-traffic injury, GCS 14', 'CT head: small subdural bleed. Vitals stable. No known allergies.'),
    consent_given: 1, consent_note: 'Consent from patient', status: 'open', created_at: ago(0.2),
  });
  await insertMany('transfer_offers', [[3, 92], [4, 48]].map(([hIdx, score]) => ({
    request_id: t2.id, hospital_id: hid[hIdx], match_score: score, status: 'pending', sent_at: ago(0.2),
  })));

  // 3) Completed one (history)
  const t3 = await insert('transfer_requests', {
    patient_id: otherPatients[5], from_hospital_id: hid[0], requested_by: doctors[2], specialization_id: specs['Pediatrics'], needs_icu: 0, urgency: 'routine',
    reason: 'Paediatric surgical opinion', clinical_summary: summaryFor('6F, recurrent abdominal pain', 'Ultrasound normal. Needs paediatric surgeon review.'),
    consent_given: 1, status: 'completed', accepted_hospital_id: hid[5], created_at: ago(60), accepted_at: ago(58.5),
  });
  await insert('transfer_offers', { request_id: t3.id, hospital_id: hid[5], match_score: 88, status: 'accepted', response_note: 'Accepted. Bed ready.', sent_at: ago(60), responded_at: ago(58.5) });

  // ---- audit trail entries so the audit log shows the new modules -------------
  const audit = [
    [doctors[0], 'transfer.requested', 'transfer_request', t1.id, 'Critical cardiac transfer requested (3 hospitals contacted)'],
    [staffIds['desk.sunrise@medibridge.demo'], 'transfer.accepted', 'transfer_request', t1.id, 'Sunrise Heart & Vascular accepted the transfer'],
    [demoDoctor, 'discharge.cleared', 'admission', heroAdm, 'Patient marked medically fit; discharge workflow started'],
    [staffIds['insurance@medibridge.demo'], 'discharge.task_blocked', 'admission', heroAdm, 'Insurance blocked: awaiting TPA pre-authorisation'],
  ];
  await insertMany('audit_logs', audit.map(([uid, action, type, id, details]) => ({ user_id: uid, action, entity_type: type, entity_id: id, details })));

  await mongoose.disconnect();
  console.log('v2 demo data seeded.');
  console.log('Staff logins (password Staff@123): billing@, insurance@, pharmacy@, nursing@, records@, transfer@ (home desk), desk@ (Lakeview), desk.sunrise@, desk.agnes@, desk.cedar@, desk.riverside@  - all @medibridge.demo');
}

main().catch((e) => { console.error('Seed v2 failed:', e); process.exit(1); });
