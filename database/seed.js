// Populates the medibridge database with realistic, fully fictional demo
// data: doctors, patients, appointments, medical records, prescriptions,
// medications + adherence logs, reviews, notifications and resources.
//
// Usage: npm run db:seed   (schema must already exist - run db:create first)
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// --- small seeded PRNG so re-running the seed gives the same demo data ---
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260101);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickWeighted = (pairs) => {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = rand() * total;
  for (const [value, weight] of pairs) {
    if (r < weight) return value;
    r -= weight;
  }
  return pairs[0][0];
};
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const fmtDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

const TODAY = new Date(); // driven by the system clock
TODAY.setHours(0, 0, 0, 0);

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medibridge',
    multipleStatements: true,
  });

  console.log('Connected to database. Clearing existing data ...');
  await conn.query(`
    SET FOREIGN_KEY_CHECKS = 0;
    TRUNCATE TABLE audit_logs;
    TRUNCATE TABLE reported_issues;
    TRUNCATE TABLE notifications;
    TRUNCATE TABLE reviews;
    TRUNCATE TABLE medication_logs;
    TRUNCATE TABLE medications;
    TRUNCATE TABLE prescriptions;
    TRUNCATE TABLE medical_records;
    TRUNCATE TABLE appointments;
    TRUNCATE TABLE doctor_availability;
    TRUNCATE TABLE doctors;
    TRUNCATE TABLE patients;
    TRUNCATE TABLE healthcare_resources;
    TRUNCATE TABLE specializations;
    TRUNCATE TABLE users;
    SET FOREIGN_KEY_CHECKS = 1;
  `);

  // -------------------------------------------------------------------
  // Specializations
  // -------------------------------------------------------------------
  const specializations = [
    ['Cardiology', 'Heart and cardiovascular system', 'heart-pulse'],
    ['Dermatology', 'Skin, hair and nail conditions', 'sparkles'],
    ['Pediatrics', 'Infant, child and adolescent care', 'baby'],
    ['Orthopedics', 'Bones, joints and muscles', 'bone'],
    ['Neurology', 'Brain and nervous system', 'brain'],
    ['Psychiatry', 'Mental health and behavioral wellness', 'head-side-heart'],
    ['General Medicine', 'Primary and preventive care', 'stethoscope'],
    ['Gynecology', "Women's reproductive health", 'venus'],
    ['ENT', 'Ear, nose and throat', 'ear'],
    ['Ophthalmology', 'Eye care and vision', 'eye'],
    ['Dentistry', 'Oral and dental health', 'tooth'],
    ['Endocrinology', 'Hormones, diabetes and metabolism', 'droplet'],
    ['Gastroenterology', 'Digestive system', 'pills'],
    ['Pulmonology', 'Lungs and respiratory system', 'lungs'],
    ['Urology', 'Urinary tract and male reproductive health', 'kidney'],
  ];
  const specId = {};
  for (const [name, description, icon] of specializations) {
    const [res] = await conn.query(
      'INSERT INTO specializations (name, description, icon) VALUES (?, ?, ?)',
      [name, description, icon]
    );
    specId[name] = res.insertId;
  }
  console.log(`Inserted ${specializations.length} specializations.`);

  // -------------------------------------------------------------------
  // Password hashes (same hash reused per role to keep seeding fast)
  // -------------------------------------------------------------------
  const patientHash = await bcrypt.hash('Patient@123', 10);
  const doctorHash = await bcrypt.hash('Doctor@123', 10);
  const adminHash = await bcrypt.hash('Admin@123', 10);

  // -------------------------------------------------------------------
  // Doctors - 24 across 15 specializations, clustered around Bengaluru
  // -------------------------------------------------------------------
  const doctorDefs = [
    ['Ananya Iyer', 'Cardiology', 'MBBS, MD (Cardiology), DM', 14, 900, 'English, Hindi, Kannada', 'Indiranagar', 12.9716, 77.6412, 'doctor@medibridge.demo'],
    ['Rohan Mehta', 'Cardiology', 'MBBS, MD, DNB (Cardiology)', 9, 800, 'English, Hindi', 'Koramangala', 12.9352, 77.6245],
    ['Priya Nair', 'Dermatology', 'MBBS, MD (Dermatology)', 11, 650, 'English, Malayalam, Hindi', 'Jayanagar', 12.9308, 77.5838],
    ['Karan Malhotra', 'Dermatology', 'MBBS, DVD', 6, 550, 'English, Hindi, Punjabi', 'HSR Layout', 12.9116, 77.6388],
    ['Fatima Sheikh', 'Pediatrics', 'MBBS, MD (Pediatrics)', 13, 600, 'English, Hindi, Urdu', 'Whitefield', 12.9698, 77.7500],
    ['Arjun Deshpande', 'Pediatrics', 'MBBS, DCH', 8, 550, 'English, Marathi, Hindi', 'Malleswaram', 13.0027, 77.5706],
    ['Neha Kapoor', 'Orthopedics', 'MBBS, MS (Ortho)', 12, 750, 'English, Hindi', 'Basavanagudi', 12.9422, 77.5739],
    ['Vikram Rao', 'Orthopedics', 'MBBS, MS, Fellowship Sports Medicine', 16, 850, 'English, Telugu, Kannada', 'Banashankari', 12.9255, 77.5468],
    ['Ishaan Verma', 'Neurology', 'MBBS, MD, DM (Neurology)', 15, 1100, 'English, Hindi', 'Indiranagar', 12.9719, 77.6411],
    ['Meera Pillai', 'Neurology', 'MBBS, DM (Neurology)', 10, 950, 'English, Tamil, Malayalam', 'Richmond Town', 12.9635, 77.6004],
    ['Siddharth Joshi', 'Psychiatry', 'MBBS, MD (Psychiatry)', 9, 700, 'English, Hindi, Marathi', 'Koramangala', 12.9345, 77.6258],
    ['Tara Bhatt', 'Psychiatry', 'MBBS, DPM', 7, 650, 'English, Gujarati, Hindi', 'Indiranagar', 12.9732, 77.6401],
    ['Aditya Kulkarni', 'General Medicine', 'MBBS, MD (General Medicine)', 10, 500, 'English, Hindi, Marathi', 'Jayanagar', 12.9279, 77.5838],
    ['Divya Menon', 'General Medicine', 'MBBS, DNB (General Medicine)', 6, 450, 'English, Malayalam, Tamil', 'HSR Layout', 12.9121, 77.6446],
    ['Sneha Reddy', 'Gynecology', 'MBBS, MS (OBG)', 13, 800, 'English, Telugu, Hindi', 'Jayanagar', 12.9345, 77.5830],
    ['Kavita Srinivasan', 'Gynecology', 'MBBS, MD (OBG)', 17, 900, 'English, Tamil, Kannada', 'Malleswaram', 13.0050, 77.5680],
    ['Rajesh Gowda', 'ENT', 'MBBS, MS (ENT)', 12, 600, 'English, Kannada, Hindi', 'Basavanagudi', 12.9430, 77.5750],
    ['Pooja Agarwal', 'Ophthalmology', 'MBBS, MS (Ophthalmology)', 8, 550, 'English, Hindi', 'Whitefield', 12.9702, 77.7489],
    ['Varun Bose', 'Dentistry', 'BDS, MDS (Oral Surgery)', 7, 500, 'English, Bengali, Hindi', 'Koramangala', 12.9358, 77.6230],
    ['Shruti Pandey', 'Endocrinology', 'MBBS, DM (Endocrinology)', 11, 950, 'English, Hindi', 'Richmond Town', 12.9641, 77.6012],
    ['Nikhil Saxena', 'Gastroenterology', 'MBBS, DM (Gastroenterology)', 14, 1000, 'English, Hindi', 'Indiranagar', 12.9725, 77.6420],
    ['Ritu Chandran', 'Pulmonology', 'MBBS, MD (Pulmonology)', 9, 700, 'English, Tamil, Malayalam', 'Banashankari', 12.9248, 77.5475],
    ['Abhishek Thakur', 'Urology', 'MBBS, MCh (Urology)', 15, 1050, 'English, Hindi', 'HSR Layout', 12.9128, 77.6401],
    ['Lakshmi Narayan', 'General Medicine', 'MBBS, MD (General Medicine)', 5, 450, 'English, Kannada, Tamil', 'Jayanagar', 12.9290, 77.5845],
  ];

  const doctorBios = [
    'Focused on evidence-based, patient-first care with clear explanations at every step.',
    'Believes in preventive care and building long-term relationships with patients and their families.',
    'Combines clinical expertise with a calm, reassuring approach, especially for anxious first-time patients.',
    'Active in community health outreach and regularly runs free screening camps.',
    'Passionate about patient education and making complex medical information easy to understand.',
  ];

  const doctors = []; // {userId, name, specialization, fee, ...}
  for (const d of doctorDefs) {
    const [name, spec, qual, exp, fee, langs, area, lat, lng, demoEmail] = d;
    const email = demoEmail || `${name.toLowerCase().replace(/\s+/g, '.')}@medibridge.demo`;
    const [userRes] = await conn.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone, is_active)
       VALUES (?, ?, 'doctor', ?, ?, 1)`,
      [email, doctorHash, `Dr. ${name}`, `+91 98${randInt(10000000, 99999999)}`]
    );
    const userId = userRes.insertId;
    await conn.query(
      `INSERT INTO doctors (user_id, specialization_id, qualifications, experience_years, consultation_fee,
          languages, bio, clinic_name, clinic_address, city, latitude, longitude, consultation_modes,
          rating_avg, rating_count, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Bengaluru', ?, ?, ?, 0, 0, 1)`,
      [
        userId, specId[spec], qual, exp, fee, langs, pick(doctorBios),
        `${area} ${pick(['Health Clinic', 'Family Care Centre', 'Medical Centre', 'Wellness Clinic'])}`,
        `${randInt(1, 200)} ${area} Main Road, Bengaluru`,
        lat, lng,
        pick(['in_person,video', 'in_person', 'in_person,video']),
      ]
    );
    doctors.push({ userId, name: `Dr. ${name}`, specialization: spec, fee, email, isDemo: !!demoEmail });
  }
  console.log(`Inserted ${doctors.length} doctors.`);
  const demoDoctor = doctors.find((d) => d.isDemo);

  // -------------------------------------------------------------------
  // Doctor availability: Mon-Fri two blocks, alternating Saturday half-day
  // -------------------------------------------------------------------
  for (const doc of doctors) {
    const blocks = [
      [1, '09:00:00', '13:00:00'],
      [2, '09:00:00', '13:00:00'],
      [3, '09:00:00', '13:00:00'],
      [4, '09:00:00', '13:00:00'],
      [5, '09:00:00', '13:00:00'],
      [1, '15:00:00', '18:00:00'],
      [2, '15:00:00', '18:00:00'],
      [3, '15:00:00', '18:00:00'],
      [4, '15:00:00', '18:00:00'],
      [5, '15:00:00', '18:00:00'],
    ];
    if (rand() > 0.4) blocks.push([6, '10:00:00', '13:00:00']);
    for (const [dow, start, end] of blocks) {
      await conn.query(
        `INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active)
         VALUES (?, ?, ?, ?, 30, 1)`,
        [doc.userId, dow, start, end]
      );
    }
  }
  console.log('Inserted doctor availability templates.');

  // -------------------------------------------------------------------
  // Patients - 15, including the demo account
  // -------------------------------------------------------------------
  const patientDefs = [
    ['Aarav Sharma', '1992-03-14', 'male', 'O+', 'Koramangala', ['Dust'], [], 'patient@medibridge.demo'],
    ['Riya Kapoor', '1988-07-22', 'female', 'A+', 'Indiranagar', [], ['Hypertension']],
    ['Vihaan Patel', '1995-11-02', 'male', 'B+', 'Jayanagar', ['Penicillin'], []],
    ['Ishita Rao', '2001-01-18', 'female', 'AB+', 'HSR Layout', [], []],
    ['Kabir Khan', '1979-05-09', 'male', 'O-', 'Malleswaram', [], ['Type 2 Diabetes', 'Hypertension']],
    ['Ananya Das', '1999-09-30', 'female', 'A-', 'Whitefield', ['Pollen'], ['Asthma']],
    ['Yash Verma', '1985-12-11', 'male', 'B-', 'Basavanagudi', [], []],
    ['Saanvi Iyer', '1993-04-25', 'female', 'O+', 'Richmond Town', [], []],
    ['Dhruv Malhotra', '1975-02-08', 'male', 'AB-', 'Banashankari', ['Sulfa drugs'], ['Chronic Back Pain']],
    ['Anika Gupta', '2003-06-17', 'female', 'A+', 'Koramangala', [], []],
    ['Rohan Chatterjee', '1990-10-05', 'male', 'O+', 'Jayanagar', [], []],
    ['Myra Joshi', '1997-08-19', 'female', 'B+', 'Indiranagar', ['Latex'], []],
    ['Arnav Pillai', '1983-01-27', 'male', 'A-', 'HSR Layout', [], ['High Cholesterol']],
    ['Tanvi Reddy', '1991-03-03', 'female', 'O-', 'Whitefield', [], []],
    ['Sai Krishnan', '1968-06-21', 'male', 'AB+', 'Malleswaram', [], ['Hypertension', 'Arthritis']],
  ];
  const patients = [];
  for (const p of patientDefs) {
    const [name, dob, gender, blood, city, allergies, conditions, demoEmail] = p;
    const email = demoEmail || `${name.toLowerCase().replace(/\s+/g, '.')}@mailbox.demo`;
    const [userRes] = await conn.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone, is_active)
       VALUES (?, ?, 'patient', ?, ?, 1)`,
      [email, patientHash, name, `+91 99${randInt(10000000, 99999999)}`]
    );
    const userId = userRes.insertId;
    await conn.query(
      `INSERT INTO patients (user_id, date_of_birth, gender, blood_group, height_cm, weight_kg, address, city,
          emergency_contact_name, emergency_contact_phone, allergies, chronic_conditions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, dob, gender, blood,
        (150 + randInt(0, 40)).toFixed(1), (50 + randInt(0, 35)).toFixed(1),
        `${randInt(1, 150)} ${city} Cross, Bengaluru`, city,
        pick(['Ravi Sharma', 'Sunita Rao', 'Manoj Kapoor', 'Leela Menon']), `+91 97${randInt(10000000, 99999999)}`,
        allergies.join(', ') || null, conditions.join(', ') || null,
      ]
    );
    patients.push({ userId, name, email, isDemo: !!demoEmail, conditions });
  }
  console.log(`Inserted ${patients.length} patients.`);
  const demoPatient = patients.find((p) => p.isDemo);

  // -------------------------------------------------------------------
  // Admin account
  // -------------------------------------------------------------------
  await conn.query(
    `INSERT INTO users (email, password_hash, role, full_name, phone, is_active)
     VALUES ('admin@medibridge.demo', ?, 'admin', 'Platform Admin', '+91 9000000000', 1)`,
    [adminHash]
  );
  console.log('Inserted admin account.');

  // -------------------------------------------------------------------
  // Appointments + medical records + prescriptions
  // -------------------------------------------------------------------
  const reasons = [
    'Routine checkup', 'Follow-up consultation', 'Persistent headache', 'Fever and body ache',
    'Skin rash', 'Joint pain', 'Annual health screening', 'Chest discomfort', 'Anxiety and stress',
    'Digestive discomfort', 'Eye irritation', 'Vaccination', 'Back pain', 'General consultation',
  ];
  const diagnosesBySpec = {
    Cardiology: ['Mild hypertension', 'Stable angina', 'Routine cardiac risk assessment', 'Arrhythmia - monitoring advised'],
    Dermatology: ['Contact dermatitis', 'Acne vulgaris', 'Fungal skin infection', 'Eczema flare-up'],
    Pediatrics: ['Viral fever', 'Common cold', 'Scheduled immunization', 'Mild ear infection'],
    Orthopedics: ['Lower back strain', 'Knee osteoarthritis (early)', 'Mild tendinitis', 'Post-sprain recovery'],
    Neurology: ['Tension-type headache', 'Migraine - episodic', 'Mild vertigo', 'Nerve compression - monitoring'],
    Psychiatry: ['Generalized anxiety', 'Mild depressive episode', 'Stress-related insomnia', 'Adjustment disorder'],
    'General Medicine': ['Viral upper respiratory infection', 'Seasonal flu', 'Mild gastritis', 'Routine wellness check'],
    Gynecology: ['Routine gynecological checkup', 'Hormonal imbalance - evaluation', 'Prenatal checkup'],
    ENT: ['Sinusitis', 'Throat infection', 'Mild hearing assessment'],
    Ophthalmology: ['Refractive error', 'Dry eye syndrome', 'Routine vision screening'],
    Dentistry: ['Dental caries', 'Gum sensitivity', 'Routine dental cleaning'],
    Endocrinology: ['Type 2 Diabetes - review', 'Thyroid function - monitoring', 'Vitamin D deficiency'],
    Gastroenterology: ['Acid reflux', 'Irritable bowel syndrome', 'Mild gastritis'],
    Pulmonology: ['Mild asthma - review', 'Seasonal allergic bronchitis', 'Routine lung function check'],
    Urology: ['Urinary tract infection', 'Routine urological screening'],
  };
  const medicinePool = [
    ['Paracetamol 500mg', '1 tablet', 'Twice a day', 5, 'Take after food'],
    ['Amoxicillin 500mg', '1 capsule', 'Thrice a day', 7, 'Complete full course'],
    ['Cetirizine 10mg', '1 tablet', 'Once a day at night', 5, 'May cause drowsiness'],
    ['Atorvastatin 10mg', '1 tablet', 'Once a day at night', 30, 'Take at the same time daily'],
    ['Metformin 500mg', '1 tablet', 'Twice a day', 30, 'Take with meals'],
    ['Amlodipine 5mg', '1 tablet', 'Once a day morning', 30, 'Monitor blood pressure regularly'],
    ['Omeprazole 20mg', '1 capsule', 'Once a day before breakfast', 14, 'Take on an empty stomach'],
    ['Ibuprofen 400mg', '1 tablet', 'As needed for pain', 5, 'Do not exceed 3 tablets a day'],
    ['Vitamin D3 60000 IU', '1 sachet', 'Once a week', 8, 'Take with milk'],
    ['Salbutamol Inhaler', '2 puffs', 'As needed for breathlessness', 30, 'Rinse mouth after use'],
    ['Sertraline 50mg', '1 tablet', 'Once a day morning', 30, 'Do not stop abruptly'],
    ['Levothyroxine 50mcg', '1 tablet', 'Once a day, empty stomach', 30, 'Wait 30 mins before eating'],
  ];
  const reviewComments = [
    'Very attentive and explained everything clearly.',
    'Short wait time and a thorough consultation.',
    'Helped me understand my condition without rushing.',
    'Professional and reassuring throughout.',
    'Would recommend to friends and family.',
    'Good follow-up and easy to reach for questions.',
  ];

  let appointmentCount = 0;
  let recordCount = 0;
  let prescriptionCount = 0;
  const createdMedications = []; // collect for medication_logs pass

  async function createAppointment({ patient, doctor, date, startTime, endTime, status, reason, mode }) {
    const [res] = await conn.query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, start_time, end_time,
          consultation_mode, status, reason, cancelled_by, cancellation_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patient.userId, doctor.userId, fmtDate(date), startTime, endTime, mode, status, reason,
        status === 'cancelled' ? pick(['patient', 'doctor']) : null,
        status === 'cancelled' ? pick(['Schedule conflict', 'Feeling better, no longer needed', 'Doctor unavailable']) : null,
      ]
    );
    appointmentCount++;
    return res.insertId;
  }

  async function createRecordWithPrescriptions(appointmentId, patient, doctor, date) {
    const diagnosisOptions = diagnosesBySpec[doctor.specialization] || diagnosesBySpec['General Medicine'];
    const diagnosis = pick(diagnosisOptions);
    const hasFollowUp = rand() > 0.5;
    const [res] = await conn.query(
      `INSERT INTO medical_records (appointment_id, patient_id, doctor_id, record_date, diagnosis,
          consultation_summary, vitals_bp, vitals_pulse, vitals_temp, follow_up_date, follow_up_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        appointmentId, patient.userId, doctor.userId, fmtDate(date), diagnosis,
        `Patient presented with symptoms consistent with ${diagnosis.toLowerCase()}. Advised rest, hydration and the prescribed medication. Discussed lifestyle measures relevant to long-term management.`,
        `${110 + randInt(-10, 15)}/${70 + randInt(-8, 10)}`, `${68 + randInt(-6, 14)} bpm`, `${(36.4 + rand() * 1.2).toFixed(1)} C`,
        hasFollowUp ? fmtDate(addDays(date, randInt(14, 45))) : null,
        hasFollowUp ? 'Review response to treatment and adjust plan if needed.' : null,
      ]
    );
    recordCount++;
    const recordId = res.insertId;

    const numMeds = randInt(1, 3);
    const chosen = new Set();
    for (let i = 0; i < numMeds; i++) {
      const med = pick(medicinePool);
      if (chosen.has(med[0])) continue;
      chosen.add(med[0]);
      const [mres] = await conn.query(
        `INSERT INTO prescriptions (medical_record_id, medicine_name, dosage, frequency, duration_days, instructions)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [recordId, ...med]
      );
      prescriptionCount++;
      // Turn roughly two-thirds of prescriptions into tracked medications for the patient
      if (rand() > 0.33) {
        const startDate = date;
        const endDate = addDays(date, med[3]);
        const reminderTimes = med[1].includes('night') || med[2].includes('night') ? '21:00' : pick(['08:00', '08:00,20:00', '09:00,14:00,21:00']);
        const [medRes] = await conn.query(
          `INSERT INTO medications (patient_id, prescription_id, medicine_name, dosage, frequency, start_date,
              end_date, reminder_times, instructions, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            patient.userId, mres.insertId, med[0], med[1], med[2], fmtDate(startDate), fmtDate(endDate),
            reminderTimes, med[4], endDate >= TODAY ? 1 : 0,
          ]
        );
        createdMedications.push({ id: medRes.insertId, patientId: patient.userId, startDate, endDate });
      }
    }
  }

  // Deterministic "hero" history for the demo patient + demo doctor so the
  // dashboards look meaningful on first login, before the random bulk data.
  if (demoPatient && demoDoctor) {
    // Upcoming confirmed appointment (next week) with the demo doctor
    const upcoming = addDays(TODAY, 6);
    await createAppointment({
      patient: demoPatient, doctor: demoDoctor, date: upcoming, startTime: '10:00:00', endTime: '10:30:00',
      status: 'confirmed', reason: 'Follow-up consultation', mode: 'in_person',
    });
    // A pending request for tomorrow with a different doctor
    const otherDoc = doctors[3];
    await createAppointment({
      patient: demoPatient, doctor: otherDoc, date: addDays(TODAY, 1), startTime: '16:00:00', endTime: '16:30:00',
      status: 'pending', reason: 'Skin rash', mode: 'video',
    });
    // Past completed visits with medical records + prescriptions
    for (const offset of [-10, -28, -52]) {
      const date = addDays(TODAY, offset);
      const apptId = await createAppointment({
        patient: demoPatient, doctor: demoDoctor, date, startTime: '11:00:00', endTime: '11:30:00',
        status: 'completed', reason: pick(reasons), mode: 'in_person',
      });
      await createRecordWithPrescriptions(apptId, demoPatient, demoDoctor, date);
    }
    // A cancelled visit
    await createAppointment({
      patient: demoPatient, doctor: doctors[6], date: addDays(TODAY, -5), startTime: '09:30:00', endTime: '10:00:00',
      status: 'cancelled', reason: 'Joint pain', mode: 'in_person',
    });
  }

  // Bulk realistic history across all patients/doctors: ~60 days back, ~14 ahead
  for (let offset = -60; offset <= 14; offset++) {
    const date = addDays(TODAY, offset);
    const dow = date.getDay();
    if (dow === 0) continue; // clinics closed Sunday
    const apptsToday = randInt(1, 4);
    for (let i = 0; i < apptsToday; i++) {
      const doctor = pick(doctors);
      const patient = pick(patients);
      const hour = randInt(9, 17);
      if (hour === 13 || hour === 14) continue; // lunch break window
      const startMinuteOfDay = hour * 60 + pick([0, 30]);
      const endMinuteOfDay = startMinuteOfDay + 30;
      const toTime = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
      const startTime = toTime(startMinuteOfDay);
      const endTime = toTime(endMinuteOfDay);

      let status;
      if (offset < 0) status = pickWeighted([['completed', 80], ['cancelled', 20]]);
      else if (offset === 0) status = pickWeighted([['confirmed', 60], ['pending', 40]]);
      else status = pickWeighted([['confirmed', 55], ['pending', 45]]);

      let apptId;
      try {
        apptId = await createAppointment({
          patient, doctor, date, startTime, endTime, status, reason: pick(reasons),
          mode: pick(['in_person', 'in_person', 'video']),
        });
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') continue; // slot collision, skip
        throw err;
      }

      if (status === 'completed' && rand() > 0.25) {
        await createRecordWithPrescriptions(apptId, patient, doctor, date);
        if (rand() > 0.4) {
          await conn.query(
            `INSERT IGNORE INTO reviews (doctor_id, patient_id, appointment_id, rating, comment)
             VALUES (?, ?, ?, ?, ?)`,
            [doctor.userId, patient.userId, apptId, pickWeighted([[5, 55], [4, 30], [3, 10], [2, 5]]), pick(reviewComments)]
          );
        }
      }
    }
  }
  console.log(`Inserted ${appointmentCount} appointments, ${recordCount} medical records, ${prescriptionCount} prescriptions.`);

  // Recompute doctor rating_avg / rating_count from the reviews table
  await conn.query(`
    UPDATE doctors d
    LEFT JOIN (
      SELECT doctor_id, ROUND(AVG(rating), 2) AS avg_rating, COUNT(*) AS cnt
      FROM reviews GROUP BY doctor_id
    ) r ON r.doctor_id = d.user_id
    SET d.rating_avg = COALESCE(r.avg_rating, 0), d.rating_count = COALESCE(r.cnt, 0)
  `);

  // -------------------------------------------------------------------
  // A couple of standalone self-added medications for the demo patient,
  // independent of any prescription (shows the "self-added" flow).
  // -------------------------------------------------------------------
  if (demoPatient) {
    const selfMeds = [
      ['Vitamin D3 60000 IU', '1 sachet', 'Once a week', addDays(TODAY, -21), addDays(TODAY, 35), '09:00', 'Take with milk'],
      ['Multivitamin', '1 tablet', 'Once a day', addDays(TODAY, -4), addDays(TODAY, 56), '08:00', 'Take after breakfast'],
    ];
    for (const [name, dosage, freq, start, end, time, instr] of selfMeds) {
      const [res] = await conn.query(
        `INSERT INTO medications (patient_id, prescription_id, medicine_name, dosage, frequency, start_date,
            end_date, reminder_times, instructions, is_active)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [demoPatient.userId, name, dosage, freq, fmtDate(start), fmtDate(end), time, instr]
      );
      createdMedications.push({ id: res.insertId, patientId: demoPatient.userId, startDate: start, endDate: end });
    }
  }

  // -------------------------------------------------------------------
  // Medication adherence logs - feeds the Care Score
  // -------------------------------------------------------------------
  let logCount = 0;
  for (const med of createdMedications) {
    let day = new Date(Math.max(med.startDate.getTime(), addDays(TODAY, -45).getTime()));
    const last = new Date(Math.min(med.endDate.getTime(), TODAY.getTime()));
    while (day <= last) {
      const status = pickWeighted([['taken', 78], ['skipped', 12], ['missed', 10]]);
      try {
        await conn.query(
          `INSERT IGNORE INTO medication_logs (medication_id, log_date, status) VALUES (?, ?, ?)`,
          [med.id, fmtDate(day), status]
        );
        logCount++;
      } catch (e) { /* ignore duplicates */ }
      day = addDays(day, 1);
    }
  }
  console.log(`Inserted ${logCount} medication adherence log entries.`);

  // -------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------
  let notifCount = 0;
  async function notify(userId, type, title, message, relatedType, relatedId, daysAgo) {
    await conn.query(
      `INSERT INTO notifications (user_id, type, title, message, is_read, related_type, related_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [userId, type, title, message, rand() > 0.5 ? 1 : 0, relatedType, relatedId, daysAgo]
    );
    notifCount++;
  }
  for (const patient of patients) {
    await notify(patient.userId, 'appointment', 'Appointment confirmed', 'Your upcoming appointment has been confirmed by the doctor.', 'appointment', null, randInt(0, 5));
    await notify(patient.userId, 'reminder', 'Medication reminder', 'It\'s time to take your scheduled medication.', 'medication', null, randInt(0, 2));
    await notify(patient.userId, 'record', 'New medical record added', 'Your doctor has added notes from your recent visit.', 'medical_record', null, randInt(1, 20));
    await notify(patient.userId, 'tip', 'Health tip', 'Remember to stay hydrated and get at least 7 hours of sleep tonight.', 'resource', null, randInt(0, 10));
  }
  for (const doctor of doctors) {
    await notify(doctor.userId, 'appointment', 'New appointment request', 'A patient has requested a new appointment slot.', 'appointment', null, randInt(0, 5));
    await notify(doctor.userId, 'cancellation', 'Appointment cancelled', 'A patient has cancelled their upcoming appointment.', 'appointment', null, randInt(0, 10));
  }
  console.log(`Inserted ${notifCount} notifications.`);

  // -------------------------------------------------------------------
  // Healthcare resources (educational content - not diagnostic)
  // -------------------------------------------------------------------
  const resources = [
    ['Preventive Healthcare', 'Why Annual Checkups Matter', 'Regular screenings catch issues early, when they are most treatable.', 'Annual checkups help track blood pressure, cholesterol, blood sugar and weight trends over time. Many conditions such as hypertension and early diabetes have no symptoms in their early stages. Discuss a screening schedule suited to your age and family history with a qualified healthcare professional.', 4],
    ['Preventive Healthcare', 'Vaccination Basics for Adults', 'A quick overview of vaccines adults often overlook.', 'Vaccination is not just for children. Adults may need boosters such as tetanus, influenza (seasonal), and others depending on age, travel and health conditions. Speak with your doctor about a vaccination schedule appropriate for you.', 3],
    ['Nutrition', 'Building a Balanced Plate', 'Simple principles for balanced, sustainable meals.', 'A balanced plate generally includes vegetables, whole grains, lean protein and healthy fats. Portion control and consistent meal timing matter as much as food choice. This is general guidance only - consult a nutritionist for a plan tailored to medical conditions.', 5],
    ['Nutrition', 'Hydration and Daily Water Needs', 'How to tell if you are drinking enough water.', 'Needs vary by activity level, climate and health status. Mild dehydration can cause fatigue and headaches. Pale yellow urine is generally a reasonable indicator of adequate hydration for most healthy adults.', 3],
    ['Mental Wellness', 'Managing Everyday Stress', 'Practical, low-effort techniques to manage daily stress.', 'Simple techniques such as paced breathing, short walks, and structured breaks can reduce everyday stress. Persistent anxiety or low mood that affects daily life is best discussed with a mental health professional.', 4],
    ['Mental Wellness', 'Sleep Hygiene Fundamentals', 'Habits that support consistent, restorative sleep.', 'Consistent sleep and wake times, reduced screen time before bed, and a cool dark room all support better sleep quality. Chronic insomnia warrants a conversation with a doctor.', 4],
    ['First Aid Basics', 'Treating Minor Cuts and Burns', 'What to do - and avoid - for everyday minor injuries.', 'Clean minor cuts with running water, apply a sterile dressing and watch for signs of infection. For burns, cool running water for several minutes is recommended; avoid ice directly on skin. Seek medical care for deep wounds, large burns or signs of infection.', 4],
    ['First Aid Basics', 'Recognizing When to Seek Emergency Care', 'Warning signs that should not be self-managed.', 'Severe chest pain, difficulty breathing, sudden weakness on one side of the body, uncontrolled bleeding, or loss of consciousness are emergencies. Call local emergency services immediately rather than waiting for an appointment.', 3],
    ['Healthy Lifestyle', 'Building a Sustainable Exercise Routine', 'Starting small and staying consistent beats intensity.', 'Most guidance suggests at least 150 minutes of moderate activity weekly, built gradually. Consistency matters more than intensity, especially when starting out. Check with a doctor before starting a new routine if you have existing health conditions.', 4],
    ['Healthy Lifestyle', 'Reducing Screen Time Without the Guilt', 'Realistic strategies, not all-or-nothing rules.', 'Setting specific screen-free windows, like during meals or the hour before bed, tends to be more sustainable than strict daily limits.', 3],
    ['Common Health Information', 'Understanding Blood Pressure Numbers', 'What systolic and diastolic numbers actually mean.', 'Blood pressure is reported as systolic over diastolic pressure. Elevated readings on multiple occasions should be discussed with a doctor rather than self-diagnosed from a single reading.', 3],
    ['Common Health Information', 'Seasonal Allergies vs. Common Cold', 'Key differences to help you respond appropriately.', 'Allergies often come with itchy eyes and a clear runny nose that persists for weeks, while colds typically resolve within 7-10 days and may include fever. This is general information, not a diagnosis.', 3],
    ['Emergency Guidance', 'What to Keep in a Home First-Aid Kit', 'A simple, practical checklist for any household.', 'A basic kit typically includes adhesive bandages, antiseptic wipes, gauze, adhesive tape, a digital thermometer, and any personal emergency medication. Review and restock every 6 months.', 3],
    ['Emergency Guidance', 'Creating a Family Emergency Contact Plan', 'Simple steps so everyone knows who to call and where to go.', 'Keep a written list of emergency contacts, known allergies and chronic conditions for each family member in an accessible place, and share it with caregivers.', 3],
  ];
  for (const [category, title, summary, content, readMins] of resources) {
    await conn.query(
      `INSERT INTO healthcare_resources (category, title, summary, content, read_mins) VALUES (?, ?, ?, ?, ?)`,
      [category, title, summary, content, readMins]
    );
  }
  console.log(`Inserted ${resources.length} healthcare resources.`);

  // -------------------------------------------------------------------
  // Reported issues (admin moderation demo data)
  // -------------------------------------------------------------------
  const reportDefs = [
    ['technical', 'Unable to reschedule appointment', 'The reschedule button did not respond on the appointments page.', 'open'],
    ['doctor_conduct', 'Long wait beyond scheduled slot', 'Appointment started nearly 40 minutes after the scheduled time.', 'in_review'],
    ['content', 'Outdated information in resource article', 'The vaccination article references an outdated schedule.', 'resolved'],
    ['billing', 'Consultation fee mismatch', 'Fee charged differed from the amount shown at booking.', 'open'],
    ['technical', 'Notification not received', 'Did not receive a reminder notification for a confirmed appointment.', 'dismissed'],
  ];
  for (const [category, subject, description, status] of reportDefs) {
    const reporter = pick(patients);
    await conn.query(
      `INSERT INTO reported_issues (reporter_id, category, subject, description, status, admin_notes, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        reporter.userId, category, subject, description, status,
        status === 'resolved' ? 'Reviewed and corrected.' : status === 'dismissed' ? 'Could not reproduce the issue.' : null,
        status === 'resolved' ? fmtDate(addDays(TODAY, -2)) : null,
      ]
    );
  }
  console.log(`Inserted ${reportDefs.length} reported issues.`);

  // -------------------------------------------------------------------
  // Audit log sample entries
  // -------------------------------------------------------------------
  const auditActions = [
    'USER_REGISTERED', 'APPOINTMENT_BOOKED', 'APPOINTMENT_CANCELLED', 'DOCTOR_VERIFIED',
    'PRESCRIPTION_ADDED', 'MEDICAL_RECORD_ADDED', 'ISSUE_REPORTED', 'ISSUE_RESOLVED',
  ];
  for (let i = 0; i < 20; i++) {
    const actor = pick([...patients, ...doctors]);
    await conn.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [actor.userId, pick(auditActions), 'system', randInt(1, 100), 'Automated seed activity log entry.', randInt(0, 40)]
    );
  }
  console.log('Inserted 20 audit log entries.');

  await conn.end();

  console.log('\nSeed complete.\n');
  console.log('Demo credentials:');
  console.log('  Patient : patient@medibridge.demo / Patient@123');
  console.log(`  Doctor  : doctor@medibridge.demo / Doctor@123  (${demoDoctor ? demoDoctor.name : ''})`);
  console.log('  Admin   : admin@medibridge.demo / Admin@123');
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
