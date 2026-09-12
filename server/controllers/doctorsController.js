const bcrypt = require('bcryptjs');
const pool = require('../../database/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildAvailableSlots } = require('../utils/slots');

// GET /api/doctors - the doctor discovery / search endpoint.
const list = asyncHandler(async (req, res) => {
  const { q, specialization, city, mode, minExperience, minRating, sort, page = 1, pageSize = 12 } = req.query;

  const where = ["u.is_active = 1"];
  const params = [];

  if (q) {
    where.push('(u.full_name LIKE ? OR s.name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (specialization) {
    where.push('s.id = ?');
    params.push(specialization);
  }
  if (city) {
    where.push('d.city LIKE ?');
    params.push(`%${city}%`);
  }
  if (mode) {
    where.push('d.consultation_modes LIKE ?');
    params.push(`%${mode}%`);
  }
  if (minExperience) {
    where.push('d.experience_years >= ?');
    params.push(Number(minExperience));
  }
  if (minRating) {
    where.push('d.rating_avg >= ?');
    params.push(Number(minRating));
  }

  const sortMap = {
    experience: 'd.experience_years DESC',
    fee_low: 'd.consultation_fee ASC',
    fee_high: 'd.consultation_fee DESC',
    rating: 'd.rating_avg DESC',
    name: 'u.full_name ASC',
  };
  const orderBy = sortMap[sort] || 'd.rating_avg DESC';

  const limit = Math.min(Number(pageSize) || 12, 50);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM doctors d
     JOIN users u ON u.id = d.user_id
     JOIN specializations s ON s.id = d.specialization_id
     WHERE ${where.join(' AND ')}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.avatar_url, d.specialization_id, s.name AS specialization,
            d.qualifications, d.experience_years, d.consultation_fee, d.languages, d.clinic_name,
            d.city, d.latitude, d.longitude, d.consultation_modes, d.rating_avg, d.rating_count
     FROM doctors d
     JOIN users u ON u.id = d.user_id
     JOIN specializations s ON s.id = d.specialization_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({ doctors: rows, total: countRows[0].total, page: Number(page), pageSize: limit });
});

// GET /api/doctors/:id - full profile for the doctor detail page.
const getById = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.avatar_url, u.phone, d.specialization_id, s.name AS specialization,
            d.qualifications, d.experience_years, d.consultation_fee, d.languages, d.bio, d.clinic_name,
            d.clinic_address, d.city, d.latitude, d.longitude, d.consultation_modes, d.rating_avg, d.rating_count
     FROM doctors d
     JOIN users u ON u.id = d.user_id
     JOIN specializations s ON s.id = d.specialization_id
     WHERE u.id = ? AND u.is_active = 1`,
    [req.params.id]
  );
  if (!rows.length) throw new ApiError(404, 'Doctor not found.');

  const [reviews] = await pool.query(
    `SELECT r.rating, r.comment, r.created_at, p.user_id, u.full_name AS patient_name
     FROM reviews r JOIN patients p ON p.user_id = r.patient_id JOIN users u ON u.id = p.user_id
     WHERE r.doctor_id = ? ORDER BY r.created_at DESC LIMIT 10`,
    [req.params.id]
  );

  const [availability] = await pool.query(
    `SELECT day_of_week, start_time, end_time FROM doctor_availability WHERE doctor_id = ? AND is_active = 1 ORDER BY day_of_week`,
    [req.params.id]
  );

  res.json({ doctor: rows[0], reviews, availability });
});

// GET /api/doctors/:id/slots?date=YYYY-MM-DD - real backend-computed slots.
const getSlots = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new ApiError(400, 'A date query parameter is required.');
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) throw new ApiError(400, 'Invalid date.');

  const dayOfWeek = target.getDay();
  const [availabilityRows] = await pool.query(
    `SELECT start_time, end_time, slot_duration_mins FROM doctor_availability
     WHERE doctor_id = ? AND day_of_week = ? AND is_active = 1`,
    [req.params.id, dayOfWeek]
  );
  const [booked] = await pool.query(
    `SELECT start_time FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status != 'cancelled'`,
    [req.params.id, date]
  );

  const slots = buildAvailableSlots(availabilityRows, booked, target, new Date());
  res.json({ date, slots });
});

// ---- Admin-managed doctor profile CRUD ----

const create = asyncHandler(async (req, res) => {
  const { email, password, fullName, phone, specializationId, qualifications, experienceYears, consultationFee, languages, bio, clinicName, clinicAddress, city, latitude, longitude } = req.body;

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) throw new ApiError(409, 'An account with that email already exists.');

  const passwordHash = await bcrypt.hash(password, 10);
  const [userResult] = await pool.query(
    `INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, 'doctor', ?, ?)`,
    [email, passwordHash, fullName, phone || null]
  );
  await pool.query(
    `INSERT INTO doctors (user_id, specialization_id, qualifications, experience_years, consultation_fee,
        languages, bio, clinic_name, clinic_address, city, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userResult.insertId, specializationId, qualifications, experienceYears || 0, consultationFee || 0, languages || 'English', bio || null, clinicName || null, clinicAddress || null, city || null, latitude || null, longitude || null]
  );
  res.status(201).json({ id: userResult.insertId });
});

const update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (req.user.role === 'doctor' && Number(req.user.id) !== Number(id)) {
    throw new ApiError(403, 'You can only edit your own profile.');
  }
  const fields = ['qualifications', 'experience_years', 'consultation_fee', 'languages', 'bio', 'clinic_name', 'clinic_address', 'city', 'latitude', 'longitude', 'consultation_modes', 'specialization_id'];
  const camelMap = { specializationId: 'specialization_id', experienceYears: 'experience_years', consultationFee: 'consultation_fee', clinicName: 'clinic_name', clinicAddress: 'clinic_address', consultationModes: 'consultation_modes' };
  const updates = [];
  const params = [];
  for (const [key, value] of Object.entries(req.body)) {
    const column = camelMap[key] || key;
    if (fields.includes(column)) {
      updates.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (req.body.fullName) {
    await pool.query('UPDATE users SET full_name = ? WHERE id = ?', [req.body.fullName, id]);
  }
  if (updates.length) {
    await pool.query(`UPDATE doctors SET ${updates.join(', ')} WHERE user_id = ?`, [...params, id]);
  }
  res.json({ message: 'Profile updated.' });
});

const setAvailability = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (req.user.role === 'doctor' && Number(req.user.id) !== Number(id)) {
    throw new ApiError(403, 'You can only manage your own availability.');
  }
  const { blocks } = req.body; // [{ dayOfWeek, startTime, endTime, slotDurationMins }]
  if (!Array.isArray(blocks)) throw new ApiError(400, 'blocks must be an array.');

  await pool.query('DELETE FROM doctor_availability WHERE doctor_id = ?', [id]);
  for (const b of blocks) {
    await pool.query(
      `INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [id, b.dayOfWeek, b.startTime, b.endTime, b.slotDurationMins || 30]
    );
  }
  res.json({ message: 'Availability updated.' });
});

const deactivate = asyncHandler(async (req, res) => {
  await pool.query('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.json({ message: 'Doctor deactivated.' });
});

module.exports = { list, getById, getSlots, create, update, setAvailability, deactivate };
