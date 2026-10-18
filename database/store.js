// Data layer: Mongoose models for every collection plus small helpers.
//
// Design notes
// - One collection per entity, snake_case field names, and a numeric `id`
//   (auto-incremented through a `counters` collection) so URLs, JSON responses
//   and the frontend stay exactly as they were. Mongo's own `_id` is hidden.
// - DATE and TIME values (appointment_date, start_time ...) are stored as
//   'YYYY-MM-DD' / 'HH:MM:SS' strings, which sort and compare correctly.
//   Timestamps (created_at ...) are real Dates and are serialised as local
//   'YYYY-MM-DD HH:MM:SS' strings by the JSON replacer in server/app.js.
// - Yes/no flags are stored as 0/1 numbers to keep the API contract unchanged.
// - Relationships are by id. Joins are done by looking up the related
//   documents in one batched query (see byIds / withUsers).
const { mongoose } = require('./db');

const { Schema } = mongoose;

// Hide Mongo's _id on every read so API responses carry only our own fields.
mongoose.plugin((schema) => {
  schema.pre(['find', 'findOne', 'findOneAndUpdate'], function hideId() {
    const projection = this.projection();
    if (!projection || projection._id === undefined) this.select({ _id: 0 });
  });
});

// Optional field: always present in documents (null when empty), like a SQL NULL.
const opt = (type) => ({ type, default: null });
const req = (type) => ({ type, required: true });
const flag = (def = 0) => ({ type: Number, default: def });
const now = () => new Date();
const idField = { type: Number, required: true, unique: true };

const M = {};
function define(name, fields, { indexes = [], withId = true } = {}) {
  const schema = new Schema(withId ? { id: { ...idField }, ...fields } : fields, { versionKey: false, collection: name });
  for (const [spec, options] of indexes) schema.index(spec, options);
  M[name] = mongoose.model(name, schema);
  return M[name];
}

// ---------------------------------------------------------------- identity
define('users', {
  email: { ...req(String), unique: true, lowercase: true, trim: true },
  password_hash: req(String),
  role: { ...req(String), enum: ['patient', 'doctor', 'admin', 'staff'] },
  full_name: req(String),
  phone: opt(String),
  avatar_url: opt(String),
  is_active: flag(1),
  created_at: { type: Date, default: now },
  updated_at: { type: Date, default: now },
}, { indexes: [[{ role: 1 }, {}]] });

define('patients', {
  user_id: { ...req(Number), unique: true },
  date_of_birth: opt(String),
  gender: { type: String, default: 'prefer_not_to_say' },
  blood_group: opt(String),
  height_cm: opt(Number),
  weight_kg: opt(Number),
  address: opt(String),
  city: opt(String),
  emergency_contact_name: opt(String),
  emergency_contact_phone: opt(String),
  allergies: opt(String),
  chronic_conditions: opt(String),
}, { withId: false });

define('specializations', {
  name: { ...req(String), unique: true },
  description: opt(String),
  icon: opt(String),
});

define('doctors', {
  user_id: { ...req(Number), unique: true },
  specialization_id: req(Number),
  qualifications: opt(String),
  experience_years: { type: Number, default: 0 },
  consultation_fee: { type: Number, default: 0 },
  languages: { type: String, default: 'English' },
  bio: opt(String),
  clinic_name: opt(String),
  clinic_address: opt(String),
  city: opt(String),
  latitude: opt(Number),
  longitude: opt(Number),
  consultation_modes: { type: String, default: 'in_person,video' },
  rating_avg: { type: Number, default: 0 },
  rating_count: { type: Number, default: 0 },
  is_verified: flag(1),
}, { withId: false, indexes: [[{ specialization_id: 1 }, {}], [{ city: 1 }, {}]] });

define('doctor_availability', {
  doctor_id: req(Number),
  day_of_week: req(Number),
  start_time: req(String),
  end_time: req(String),
  slot_duration_mins: { type: Number, default: 30 },
  is_active: flag(1),
}, { indexes: [[{ doctor_id: 1, day_of_week: 1 }, {}]] });

// ------------------------------------------------------------ appointments
define('appointments', {
  patient_id: req(Number),
  doctor_id: req(Number),
  appointment_date: req(String),
  start_time: req(String),
  end_time: req(String),
  consultation_mode: { type: String, default: 'in_person' },
  status: { type: String, default: 'pending', enum: ['pending', 'confirmed', 'completed', 'cancelled'] },
  reason: opt(String),
  cancelled_by: opt(String),
  cancellation_reason: opt(String),
  created_at: { type: Date, default: now },
  updated_at: { type: Date, default: now },
}, {
  indexes: [
    // The database, not just application code, refuses a double-booked slot.
    [{ doctor_id: 1, appointment_date: 1, start_time: 1 }, { unique: true }],
    [{ patient_id: 1, appointment_date: 1 }, {}],
    [{ status: 1 }, {}],
  ],
});

define('medical_records', {
  appointment_id: opt(Number),
  patient_id: req(Number),
  doctor_id: req(Number),
  record_date: req(String),
  diagnosis: opt(String),
  consultation_summary: opt(String),
  vitals_bp: opt(String),
  vitals_pulse: opt(String),
  vitals_temp: opt(String),
  follow_up_date: opt(String),
  follow_up_notes: opt(String),
  document_url: opt(String),
  created_at: { type: Date, default: now },
}, { indexes: [[{ patient_id: 1, record_date: -1 }, {}], [{ doctor_id: 1 }, {}]] });

define('prescriptions', {
  medical_record_id: req(Number),
  medicine_name: req(String),
  dosage: req(String),
  frequency: req(String),
  duration_days: opt(Number),
  instructions: opt(String),
}, { indexes: [[{ medical_record_id: 1 }, {}]] });

define('medications', {
  patient_id: req(Number),
  prescription_id: opt(Number),
  medicine_name: req(String),
  dosage: req(String),
  frequency: req(String),
  start_date: req(String),
  end_date: opt(String),
  reminder_times: { type: String, default: '08:00' },
  instructions: opt(String),
  is_active: flag(1),
  created_at: { type: Date, default: now },
}, { indexes: [[{ patient_id: 1, is_active: 1 }, {}]] });

define('medication_logs', {
  medication_id: req(Number),
  log_date: req(String),
  status: { ...req(String), enum: ['taken', 'missed', 'skipped'] },
  logged_at: { type: Date, default: now },
}, { indexes: [[{ medication_id: 1, log_date: 1 }, { unique: true }]] });

define('notifications', {
  user_id: req(Number),
  type: req(String),
  title: req(String),
  message: req(String),
  is_read: flag(0),
  related_type: opt(String),
  related_id: opt(Number),
  created_at: { type: Date, default: now },
}, { indexes: [[{ user_id: 1, is_read: 1, created_at: -1 }, {}]] });

define('healthcare_resources', {
  category: req(String),
  title: req(String),
  summary: req(String),
  content: req(String),
  image_url: opt(String),
  read_mins: { type: Number, default: 3 },
  created_at: { type: Date, default: now },
}, { indexes: [[{ category: 1 }, {}]] });

define('reviews', {
  doctor_id: req(Number),
  patient_id: req(Number),
  appointment_id: { ...req(Number), unique: true },
  rating: { ...req(Number), min: 1, max: 5 },
  comment: opt(String),
  created_at: { type: Date, default: now },
});

define('reported_issues', {
  reporter_id: req(Number),
  category: req(String),
  subject: req(String),
  description: req(String),
  status: { type: String, default: 'open', enum: ['open', 'in_review', 'resolved', 'dismissed'] },
  admin_notes: opt(String),
  created_at: { type: Date, default: now },
  resolved_at: opt(Date),
});

define('audit_logs', {
  user_id: opt(Number),
  action: req(String),
  entity_type: opt(String),
  entity_id: opt(Number),
  details: opt(String),
  created_at: { type: Date, default: now },
}, { indexes: [[{ created_at: -1 }, {}], [{ entity_type: 1, entity_id: 1 }, {}]] });

// ---------------------------------------------------- hospitals + TransferConnect
define('hospitals', {
  name: req(String),
  city: req(String),
  address: opt(String),
  latitude: opt(Number),
  longitude: opt(Number),
  phone: opt(String),
  is_home: flag(0),
  created_at: { type: Date, default: now },
});

define('hospital_capabilities', {
  hospital_id: req(Number),
  specialization_id: req(Number),
  beds_available: { type: Number, default: 0 },
  icu_available: { type: Number, default: 0 },
  updated_at: { type: Date, default: now },
}, { indexes: [[{ hospital_id: 1, specialization_id: 1 }, { unique: true }]] });

define('staff', {
  user_id: { ...req(Number), unique: true },
  hospital_id: req(Number),
  department: { ...req(String), enum: ['billing', 'insurance', 'pharmacy', 'nursing', 'documentation', 'transfer_desk'] },
}, { withId: false });

define('transfer_requests', {
  patient_id: req(Number),
  admission_id: opt(Number),
  from_hospital_id: req(Number),
  requested_by: req(Number),
  specialization_id: req(Number),
  needs_icu: flag(0),
  urgency: { type: String, default: 'urgent', enum: ['routine', 'urgent', 'critical'] },
  reason: req(String),
  clinical_summary: req(String),
  consent_given: flag(0),
  consent_note: opt(String),
  status: { type: String, default: 'open', enum: ['open', 'accepted', 'completed', 'cancelled'] },
  accepted_hospital_id: opt(Number),
  created_at: { type: Date, default: now },
  accepted_at: opt(Date),
}, { indexes: [[{ status: 1 }, {}]] });

define('transfer_offers', {
  request_id: req(Number),
  hospital_id: req(Number),
  match_score: { type: Number, default: 0 },
  status: { type: String, default: 'pending', enum: ['pending', 'accepted', 'declined', 'withdrawn'] },
  responded_by: opt(Number),
  response_note: opt(String),
  sent_at: { type: Date, default: now },
  responded_at: opt(Date),
  summary_viewed_at: opt(Date),
}, { indexes: [[{ request_id: 1, hospital_id: 1 }, { unique: true }]] });

// ------------------------------------------------------------ discharge flow
define('admissions', {
  patient_id: req(Number),
  hospital_id: req(Number),
  doctor_id: req(Number),
  ward: opt(String),
  bed: opt(String),
  diagnosis: opt(String),
  insurance_provider: opt(String),
  insurance_policy_no: opt(String),
  admitted_at: req(Date),
  status: { type: String, default: 'admitted', enum: ['admitted', 'cleared', 'discharged', 'transferred'] },
  cleared_at: opt(Date),
  discharged_at: opt(Date),
}, { indexes: [[{ status: 1 }, {}], [{ patient_id: 1 }, {}]] });

define('discharge_tasks', {
  admission_id: req(Number),
  department: { ...req(String), enum: ['billing', 'insurance', 'pharmacy', 'nursing', 'documentation'] },
  title: req(String),
  status: { type: String, default: 'pending', enum: ['pending', 'in_progress', 'blocked', 'done'] },
  blocked_reason: opt(String),
  sla_minutes: { type: Number, default: 60 },
  started_at: opt(Date),
  completed_at: opt(Date),
  completed_by: opt(Number),
  last_nudged_at: opt(Date),
}, { indexes: [[{ admission_id: 1 }, {}], [{ department: 1, status: 1 }, {}]] });

define('discharge_events', {
  admission_id: req(Number),
  task_id: opt(Number),
  actor_id: opt(Number),
  message: req(String),
  created_at: { type: Date, default: now },
}, { indexes: [[{ admission_id: 1, created_at: 1 }, {}]] });

// ----------------------------------------------- Smart Brief + Visit Loop
define('intake_forms', {
  appointment_id: { ...req(Number), unique: true },
  patient_id: req(Number),
  chief_complaint: req(String),
  symptoms: opt(String),
  symptom_duration: opt(String),
  severity: opt(Number),
  medication_changes: opt(String),
  new_allergies: opt(String),
  questions_for_doctor: opt(String),
  created_at: { type: Date, default: now },
});

define('care_plans', {
  patient_id: req(Number),
  doctor_id: req(Number),
  medical_record_id: opt(Number),
  admission_id: opt(Number),
  plain_summary: req(String),
  created_at: { type: Date, default: now },
}, { indexes: [[{ patient_id: 1, created_at: -1 }, {}]] });

define('commitments', {
  care_plan_id: req(Number),
  patient_id: req(Number),
  owner_role: { type: String, default: 'patient', enum: ['patient', 'doctor', 'hospital'] },
  kind: { type: String, default: 'other', enum: ['follow_up', 'test', 'medication', 'lifestyle', 'other'] },
  title: req(String),
  due_date: opt(String),
  status: { type: String, default: 'open', enum: ['open', 'done', 'skipped'] },
  completed_at: opt(Date),
}, { indexes: [[{ patient_id: 1, status: 1 }, {}], [{ due_date: 1, status: 1 }, {}]] });

// ----------------------------------------------------------------- ids
// Auto-increment ids, one counter per collection. $inc is atomic, so two
// simultaneous inserts can never receive the same id.
async function nextIds(name, n = 1) {
  const counters = mongoose.connection.collection('counters');
  const res = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: n } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = res && res.seq !== undefined ? res.seq : res.value.seq;
  return Array.from({ length: n }, (_, i) => seq - n + 1 + i);
}
const nextId = async (name) => (await nextIds(name, 1))[0];

// ------------------------------------------------------------ query helpers
const plain = (doc) => {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
};

async function insert(name, fields) {
  const id = M[name].schema.path('id') ? await nextId(name) : undefined;
  const doc = await M[name].create(id === undefined ? fields : { id, ...fields });
  return plain(doc);
}

async function insertMany(name, list) {
  if (!list.length) return [];
  const hasId = !!M[name].schema.path('id');
  const ids = hasId ? await nextIds(name, list.length) : [];
  const docs = await M[name].insertMany(list.map((f, i) => (hasId ? { id: ids[i], ...f } : f)));
  return docs.map(plain);
}

const find = (name, filter = {}, { sort, limit, skip, select } = {}) => {
  let q = M[name].find(filter);
  if (select) q = q.select(`${select} -_id`);
  if (sort) q = q.sort(sort);
  if (skip) q = q.skip(skip);
  if (limit) q = q.limit(limit);
  return q.lean();
};
const findOne = (name, filter = {}, { sort, select } = {}) => {
  let q = M[name].findOne(filter);
  if (select) q = q.select(`${select} -_id`);
  if (sort) q = q.sort(sort);
  return q.lean();
};
const count = (name, filter = {}) => M[name].countDocuments(filter);
const exists = async (name, filter) => !!(await M[name].exists(filter));
const update = (name, filter, set) => M[name].updateOne(filter, { $set: set });
const updateMany = (name, filter, set) => M[name].updateMany(filter, { $set: set });
const remove = (name, filter) => M[name].deleteMany(filter);

// Map of key -> document for a batch of ids (the "join" primitive).
async function byIds(name, ids, key = 'id', select) {
  const unique = [...new Set(ids.filter((v) => v !== null && v !== undefined))];
  if (!unique.length) return new Map();
  const rows = await find(name, { [key]: { $in: unique } }, { select });
  return new Map(rows.map((r) => [r[key], r]));
}

// Adds user names to rows: withUsers(rows, { patient_id: 'patient_name' }).
async function withUsers(rows, spec) {
  const ids = [];
  for (const key of Object.keys(spec)) for (const r of rows) ids.push(r[key]);
  const users = await byIds('users', ids, 'id', 'id full_name role');
  for (const r of rows) {
    for (const [key, out] of Object.entries(spec)) {
      const u = users.get(r[key]);
      r[out] = u ? u.full_name : null;
    }
  }
  return rows;
}

// ------------------------------------------------------------ date helpers
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDateTime = (d) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const todayStr = () => fmtDate(new Date());
// 'YYYY-MM-DD' shifted by n days (n may be negative), computed in local time.
const shiftDate = (dateStr, n) => {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return fmtDate(new Date(y, m - 1, d + n));
};
const dayOffset = (n) => shiftDate(todayStr(), n);
// Whole days from date a to date b ('YYYY-MM-DD' strings), like SQL DATEDIFF(b, a).
const daysBetween = (a, b) => {
  const [y1, m1, d1] = String(a).slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = String(b).slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
// Whole minutes from a to b, truncated toward zero like SQL TIMESTAMPDIFF(MINUTE).
const minutesBetween = (a, b = new Date()) => Math.trunc((new Date(b) - new Date(a)) / 60000);
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);

// Case-insensitive "contains" filter value for user-typed search text.
const contains = (text) => new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const isDuplicateKey = (err) => !!err && (err.code === 11000 || err.code === 'ER_DUP_ENTRY');

module.exports = {
  mongoose, M, nextId, nextIds, plain, insert, insertMany, find, findOne, count, exists, update, updateMany, remove,
  byIds, withUsers, pad, fmtDate, fmtDateTime, todayStr, shiftDate, dayOffset, daysBetween, minutesBetween, hoursAgo,
  contains, isDuplicateKey,
};
