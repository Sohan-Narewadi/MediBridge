const { findOne, update } = require('../../database/store');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/users/me/profile - merges the users document with the role-specific
// profile so the frontend gets one flat object.
const getMyProfile = asyncHandler(async (req, res) => {
  const user = await findOne('users', { id: req.user.id }, { select: 'id email full_name phone avatar_url role created_at' });
  if (!user) throw new ApiError(404, 'User not found.');

  if (user.role === 'patient') {
    const patient = await findOne('patients', { user_id: req.user.id });
    return res.json({ profile: { ...user, ...patient } });
  }
  if (user.role === 'doctor') {
    const doctor = await findOne('doctors', { user_id: req.user.id });
    const spec = doctor ? await findOne('specializations', { id: doctor.specialization_id }) : null;
    return res.json({ profile: { ...user, ...doctor, specialization: spec ? spec.name : null } });
  }
  if (user.role === 'staff') {
    const staff = await findOne('staff', { user_id: req.user.id });
    const hospital = staff ? await findOne('hospitals', { id: staff.hospital_id }) : null;
    return res.json({
      profile: { ...user, ...(staff ? { department: staff.department, hospital_id: staff.hospital_id, hospital_name: hospital ? hospital.name : null } : {}) },
    });
  }
  res.json({ profile: user });
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const { fullName, phone, ...rest } = req.body;
  const userSet = {};
  if (fullName) userSet.full_name = fullName;
  if (phone) userSet.phone = phone;
  if (Object.keys(userSet).length) await update('users', { id: req.user.id }, { ...userSet, updated_at: new Date() });

  if (req.user.role === 'patient') {
    const allowed = ['date_of_birth', 'gender', 'blood_group', 'height_cm', 'weight_kg', 'address', 'city', 'emergency_contact_name', 'emergency_contact_phone', 'allergies', 'chronic_conditions'];
    const camelMap = { dateOfBirth: 'date_of_birth', bloodGroup: 'blood_group', heightCm: 'height_cm', weightKg: 'weight_kg', emergencyContactName: 'emergency_contact_name', emergencyContactPhone: 'emergency_contact_phone', chronicConditions: 'chronic_conditions' };
    const set = {};
    for (const [key, value] of Object.entries(rest)) {
      const field = camelMap[key] || key;
      if (allowed.includes(field)) set[field] = value === '' ? null : value;
    }
    if (Object.keys(set).length) await update('patients', { user_id: req.user.id }, set);
  }

  res.json({ message: 'Profile updated.' });
});

module.exports = { getMyProfile, updateMyProfile };
