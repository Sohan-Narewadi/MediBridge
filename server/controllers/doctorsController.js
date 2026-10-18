const bcrypt = require('bcryptjs');
const { M, find, findOne, insert, insertMany, update, updateMany, remove, withUsers, contains } = require('../../database/store');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildAvailableSlots } = require('../utils/slots');

// GET /api/doctors - the doctor discovery / search endpoint.
// One aggregation: join each doctor to its user and specialization, filter,
// sort, then return the requested page together with the total count.
const list = asyncHandler(async (req, res) => {
  const { q, specialization, city, mode, minExperience, minRating, sort, page = 1, pageSize = 12 } = req.query;

  const match = { 'u.is_active': 1 };
  if (q) match.$or = [{ 'u.full_name': contains(q) }, { 's.name': contains(q) }];
  if (specialization) match['s.id'] = Number(specialization);
  if (city) match.city = contains(city);
  if (mode) match.consultation_modes = contains(mode);
  if (minExperience) match.experience_years = { $gte: Number(minExperience) };
  if (minRating) match.rating_avg = { $gte: Number(minRating) };

  const sortMap = {
    experience: { experience_years: -1 },
    fee_low: { consultation_fee: 1 },
    fee_high: { consultation_fee: -1 },
    rating: { rating_avg: -1 },
    name: { 'u.full_name': 1 },
  };
  const orderBy = { ...(sortMap[sort] || sortMap.rating), user_id: 1 };

  const limit = Math.min(Number(pageSize) || 12, 50);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [result] = await M.doctors.aggregate([
    { $lookup: { from: 'users', localField: 'user_id', foreignField: 'id', as: 'u' } },
    { $unwind: '$u' },
    { $lookup: { from: 'specializations', localField: 'specialization_id', foreignField: 'id', as: 's' } },
    { $unwind: '$s' },
    { $match: match },
    { $sort: orderBy },
    {
      $facet: {
        rows: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 0, id: '$u.id', full_name: '$u.full_name', avatar_url: '$u.avatar_url', specialization_id: 1, specialization: '$s.name',
              qualifications: 1, experience_years: 1, consultation_fee: 1, languages: 1, clinic_name: 1, city: 1,
              latitude: 1, longitude: 1, consultation_modes: 1, rating_avg: 1, rating_count: 1,
            },
          },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);

  res.json({ doctors: result.rows, total: result.total[0] ? result.total[0].n : 0, page: Number(page), pageSize: limit });
});

// GET /api/doctors/:id - full profile for the doctor detail page.
const getById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const user = await findOne('users', { id, is_active: 1 });
  const d = user && (await findOne('doctors', { user_id: id }));
  const spec = d && (await findOne('specializations', { id: d.specialization_id }));
  if (!d || !spec) throw new ApiError(404, 'Doctor not found.');

  const doctor = {
    id: user.id, full_name: user.full_name, email: user.email, avatar_url: user.avatar_url, phone: user.phone,
    specialization_id: d.specialization_id, specialization: spec.name, qualifications: d.qualifications,
    experience_years: d.experience_years, consultation_fee: d.consultation_fee, languages: d.languages, bio: d.bio,
    clinic_name: d.clinic_name, clinic_address: d.clinic_address, city: d.city, latitude: d.latitude, longitude: d.longitude,
    consultation_modes: d.consultation_modes, rating_avg: d.rating_avg, rating_count: d.rating_count,
  };

  const reviewRows = await find('reviews', { doctor_id: id }, { sort: { created_at: -1, id: -1 }, limit: 10 });
  await withUsers(reviewRows, { patient_id: 'patient_name' });
  const reviews = reviewRows.map((r) => ({ rating: r.rating, comment: r.comment, created_at: r.created_at, user_id: r.patient_id, patient_name: r.patient_name }));

  const availability = (await find('doctor_availability', { doctor_id: id, is_active: 1 }, { sort: { day_of_week: 1, start_time: 1 } }))
    .map((a) => ({ day_of_week: a.day_of_week, start_time: a.start_time, end_time: a.end_time }));

  res.json({ doctor, reviews, availability });
});

// GET /api/doctors/:id/slots?date=YYYY-MM-DD - real backend-computed slots.
const getSlots = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw new ApiError(400, 'A date query parameter is required.');
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) throw new ApiError(400, 'Invalid date.');

  const doctorId = Number(req.params.id);
  const availabilityRows = await find('doctor_availability', { doctor_id: doctorId, day_of_week: target.getDay(), is_active: 1 });
  const booked = await find('appointments', { doctor_id: doctorId, appointment_date: date, status: { $ne: 'cancelled' } }, { select: 'start_time' });

  const slots = buildAvailableSlots(availabilityRows, booked, target, new Date());
  res.json({ date, slots });
});

// ---- Admin-managed doctor profile CRUD ----

const create = asyncHandler(async (req, res) => {
  const { password, fullName, phone, specializationId, qualifications, experienceYears, consultationFee, languages, bio, clinicName, clinicAddress, city, latitude, longitude } = req.body;
  const email = String(req.body.email).trim().toLowerCase();

  if (await findOne('users', { email }, { select: 'id' })) throw new ApiError(409, 'An account with that email already exists.');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await insert('users', { email, password_hash: passwordHash, role: 'doctor', full_name: fullName, phone: phone || null });
  await insert('doctors', {
    user_id: user.id, specialization_id: Number(specializationId), qualifications: qualifications || null,
    experience_years: experienceYears || 0, consultation_fee: consultationFee || 0, languages: languages || 'English',
    bio: bio || null, clinic_name: clinicName || null, clinic_address: clinicAddress || null, city: city || null,
    latitude: latitude || null, longitude: longitude || null,
  });
  res.status(201).json({ id: user.id });
});

const updateDoctor = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === 'doctor' && Number(req.user.id) !== id) {
    throw new ApiError(403, 'You can only edit your own profile.');
  }
  const fields = ['qualifications', 'experience_years', 'consultation_fee', 'languages', 'bio', 'clinic_name', 'clinic_address', 'city', 'latitude', 'longitude', 'consultation_modes', 'specialization_id'];
  const camelMap = { specializationId: 'specialization_id', experienceYears: 'experience_years', consultationFee: 'consultation_fee', clinicName: 'clinic_name', clinicAddress: 'clinic_address', consultationModes: 'consultation_modes' };
  const set = {};
  for (const [key, value] of Object.entries(req.body)) {
    const field = camelMap[key] || key;
    if (fields.includes(field)) set[field] = value === '' ? null : value;
  }
  if (req.body.fullName) await update('users', { id }, { full_name: req.body.fullName, updated_at: new Date() });
  if (Object.keys(set).length) await update('doctors', { user_id: id }, set);
  res.json({ message: 'Profile updated.' });
});

const setAvailability = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === 'doctor' && Number(req.user.id) !== id) {
    throw new ApiError(403, 'You can only manage your own availability.');
  }
  const { blocks } = req.body; // [{ dayOfWeek, startTime, endTime, slotDurationMins }]
  if (!Array.isArray(blocks)) throw new ApiError(400, 'blocks must be an array.');

  await remove('doctor_availability', { doctor_id: id });
  await insertMany('doctor_availability', blocks.map((b) => ({
    doctor_id: id, day_of_week: b.dayOfWeek, start_time: b.startTime, end_time: b.endTime, slot_duration_mins: b.slotDurationMins || 30, is_active: 1,
  })));
  res.json({ message: 'Availability updated.' });
});

const deactivate = asyncHandler(async (req, res) => {
  await updateMany('users', { id: Number(req.params.id) }, { is_active: 0 });
  res.json({ message: 'Doctor deactivated.' });
});

module.exports = { list, getById, getSlots, create, update: updateDoctor, setAvailability, deactivate };
