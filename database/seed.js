// Populates the medibridge database with realistic, fully fictional demo
// data: doctors, patients, appointments, medical records, prescriptions,
// medications + adherence logs, reviews, notifications and resources.
//
// Usage: npm run db:seed   (MongoDB must be running; this wipes and refills the medibridge database)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDb } = require('./db');
const { mongoose, M, insert, update } = require('./store');

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
// Local calendar date, so 'today' in the seed is today for the people using the demo.
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d, n) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

const TODAY = new Date(); // driven by the system clock
TODAY.setHours(0, 0, 0, 0);

async function main() {
  await connectDb();
  console.log('Connected to MongoDB. Clearing existing data ...');
  // Start from an empty database: every collection and the id counters.
  await mongoose.connection.dropDatabase();
  for (const model of Object.values(M)) await model.createCollection().catch(() => {});
  for (const model of Object.values(M)) await model.syncIndexes();

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
    const created = await insert('specializations', { name, description, icon });
    specId[name] = created.id;
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
    const user = await insert('users', {
      email, password_hash: doctorHash, role: 'doctor', full_name: `Dr. ${name}`, phone: `+91 98${randInt(10000000, 99999999)}`, is_active: 1,
    });
    const userId = user.id;
    const bio = pick(doctorBios);
    const clinicName = `${area} ${pick(['Health Clinic', 'Family Care Centre', 'Medical Centre', 'Wellness Clinic'])}`;
    const clinicAddress = `${randInt(1, 200)} ${area} Main Road, Bengaluru`;
    const modes = pick(['in_person,video', 'in_person', 'in_person,video']);
    await insert('doctors', {
      user_id: userId, specialization_id: specId[spec], qualifications: qual, experience_years: exp, consultation_fee: fee, languages: langs,
      bio, clinic_name: clinicName, clinic_address: clinicAddress, city: 'Bengaluru', latitude: lat, longitude: lng, consultation_modes: modes,
      rating_avg: 0, rating_count: 0, is_verified: 1,
    });
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
      await insert('doctor_availability', { doctor_id: doc.userId, day_of_week: dow, start_time: start, end_time: end, slot_duration_mins: 30, is_active: 1 });
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
    const user = await insert('users', {
      email, password_hash: patientHash, role: 'patient', full_name: name, phone: `+91 99${randInt(10000000, 99999999)}`, is_active: 1,
    });
    const userId = user.id;
    const height = 150 + randInt(0, 40);
    const weight = 50 + randInt(0, 35);
    const addressNo = randInt(1, 150);
    const contactName = pick(['Ravi Sharma', 'Sunita Rao', 'Manoj Kapoor', 'Leela Menon']);
    const contactPhone = `+91 97${randInt(10000000, 99999999)}`;
    await insert('patients', {
      user_id: userId, date_of_birth: dob, gender, blood_group: blood, height_cm: height, weight_kg: weight,
      address: `${addressNo} ${city} Cross, Bengaluru`, city, emergency_contact_name: contactName, emergency_contact_phone: contactPhone,
      allergies: allergies.join(', ') || null, chronic_conditions: conditions.join(', ') || null,
    });
    patients.push({ userId, name, email, isDemo: !!demoEmail, conditions });
  }
  console.log(`Inserted ${patients.length} patients.`);
  const demoPatient = patients.find((p) => p.isDemo);

  // -------------------------------------------------------------------
  // Admin account
  // -------------------------------------------------------------------
  await insert('users', {
    email: 'admin@medibridge.demo', password_hash: adminHash, role: 'admin', full_name: 'Platform Admin', phone: '+91 9000000000', is_active: 1,
  });
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
    const cancelledBy = status === 'cancelled' ? pick(['patient', 'doctor']) : null;
    const cancelReason = status === 'cancelled' ? pick(['Schedule conflict', 'Feeling better, no longer needed', 'Doctor unavailable']) : null;
    const created = await insert('appointments', {
      patient_id: patient.userId, doctor_id: doctor.userId, appointment_date: fmtDate(date), start_time: startTime, end_time: endTime,
      consultation_mode: mode, status, reason, cancelled_by: cancelledBy, cancellation_reason: cancelReason,
    });
    appointmentCount++;
    return created.id;
  }

  async function createRecordWithPrescriptions(appointmentId, patient, doctor, date) {
    const diagnosisOptions = diagnosesBySpec[doctor.specialization] || diagnosesBySpec['General Medicine'];
    const diagnosis = pick(diagnosisOptions);
    const hasFollowUp = rand() > 0.5;
    const summary = `Patient presented with symptoms consistent with ${diagnosis.toLowerCase()}. Advised rest, hydration and the prescribed medication. Discussed lifestyle measures relevant to long-term management.`;
    const bp = `${110 + randInt(-10, 15)}/${70 + randInt(-8, 10)}`;
    const pulse = `${68 + randInt(-6, 14)} bpm`;
    const temp = `${(36.4 + rand() * 1.2).toFixed(1)} C`;
    const followUp = hasFollowUp ? fmtDate(addDays(date, randInt(14, 45))) : null;
    const record = await insert('medical_records', {
      appointment_id: appointmentId, patient_id: patient.userId, doctor_id: doctor.userId, record_date: fmtDate(date), diagnosis,
      consultation_summary: summary, vitals_bp: bp, vitals_pulse: pulse, vitals_temp: temp, follow_up_date: followUp,
      follow_up_notes: hasFollowUp ? 'Review response to treatment and adjust plan if needed.' : null,
    });
    recordCount++;
    const recordId = record.id;

    const numMeds = randInt(1, 3);
    const chosen = new Set();
    for (let i = 0; i < numMeds; i++) {
      const med = pick(medicinePool);
      if (chosen.has(med[0])) continue;
      chosen.add(med[0]);
      const rx = await insert('prescriptions', {
        medical_record_id: recordId, medicine_name: med[0], dosage: med[1], frequency: med[2], duration_days: med[3], instructions: med[4],
      });
      prescriptionCount++;
      // Turn roughly two-thirds of prescriptions into tracked medications for the patient
      if (rand() > 0.33) {
        const startDate = date;
        const endDate = addDays(date, med[3]);
        const reminderTimes = med[1].includes('night') || med[2].includes('night') ? '21:00' : pick(['08:00', '08:00,20:00', '09:00,14:00,21:00']);
        const tracked = await insert('medications', {
          patient_id: patient.userId, prescription_id: rx.id, medicine_name: med[0], dosage: med[1], frequency: med[2],
          start_date: fmtDate(startDate), end_date: fmtDate(endDate), reminder_times: reminderTimes, instructions: med[4],
          is_active: endDate >= TODAY ? 1 : 0,
        });
        createdMedications.push({ id: tracked.id, patientId: patient.userId, startDate, endDate });
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
        if (err.code === 11000) continue; // slot collision, skip
        throw err;
      }

      if (status === 'completed' && rand() > 0.25) {
        await createRecordWithPrescriptions(apptId, patient, doctor, date);
        if (rand() > 0.4) {
          const rating = pickWeighted([[5, 55], [4, 30], [3, 10], [2, 5]]);
          const comment = pick(reviewComments);
          await insert('reviews', { doctor_id: doctor.userId, patient_id: patient.userId, appointment_id: apptId, rating, comment })
            .catch((e) => { if (e.code !== 11000) throw e; });
        }
      }
    }
  }
  console.log(`Inserted ${appointmentCount} appointments, ${recordCount} medical records, ${prescriptionCount} prescriptions.`);

  // Recompute doctor rating_avg / rating_count from the reviews collection
  const ratings = await M.reviews.aggregate([{ $group: { _id: '$doctor_id', avg: { $avg: '$rating' }, cnt: { $sum: 1 } } }]);
  for (const r of ratings) await update('doctors', { user_id: r._id }, { rating_avg: Math.round(r.avg * 100) / 100, rating_count: r.cnt });

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
      const created = await insert('medications', {
        patient_id: demoPatient.userId, prescription_id: null, medicine_name: name, dosage, frequency: freq,
        start_date: fmtDate(start), end_date: fmtDate(end), reminder_times: time, instructions: instr, is_active: 1,
      });
      createdMedications.push({ id: created.id, patientId: demoPatient.userId, startDate: start, endDate: end });
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
        await insert('medication_logs', { medication_id: med.id, log_date: fmtDate(day), status });
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
    await insert('notifications', {
      user_id: userId, type, title, message, is_read: rand() > 0.5 ? 1 : 0, related_type: relatedType, related_id: relatedId,
      created_at: new Date(Date.now() - daysAgo * 86400000),
    });
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
    await insert('healthcare_resources', { category, title, summary, content, read_mins: readMins });
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
    await insert('reported_issues', {
      reporter_id: reporter.userId, category, subject, description, status,
      admin_notes: status === 'resolved' ? 'Reviewed and corrected.' : status === 'dismissed' ? 'Could not reproduce the issue.' : null,
      resolved_at: status === 'resolved' ? addDays(TODAY, -2) : null,
    });
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
    const action = pick(auditActions);
    const entityId = randInt(1, 100);
    const daysAgo = randInt(0, 40);
    await insert('audit_logs', {
      user_id: actor.userId, action, entity_type: 'system', entity_id: entityId, details: 'Automated seed activity log entry.',
      created_at: new Date(Date.now() - daysAgo * 86400000),
    });
  }
  console.log('Inserted 20 audit log entries.');

  await mongoose.disconnect();

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
