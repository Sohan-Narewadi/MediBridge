const pool = require('../../database/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/users/me/profile - merges the users row with the role-specific
// profile table so the frontend gets one flat object.
const getMyProfile = asyncHandler(async (req, res) => {
  const [userRows] = await pool.query(
    'SELECT id, email, full_name, phone, avatar_url, role, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!userRows.length) throw new ApiError(404, 'User not found.');
  const user = userRows[0];

  if (user.role === 'patient') {
    const [rows] = await pool.query('SELECT * FROM patients WHERE user_id = ?', [req.user.id]);
    return res.json({ profile: { ...user, ...rows[0] } });
  }
  if (user.role === 'doctor') {
    const [rows] = await pool.query(
      `SELECT d.*, s.name AS specialization FROM doctors d JOIN specializations s ON s.id = d.specialization_id WHERE d.user_id = ?`,
      [req.user.id]
    );
    return res.json({ profile: { ...user, ...rows[0] } });
  }
  res.json({ profile: user });
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const { fullName, phone, ...rest } = req.body;
  if (fullName || phone) {
    await pool.query('UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone) WHERE id = ?', [fullName || null, phone || null, req.user.id]);
  }

  if (req.user.role === 'patient') {
    const allowed = ['date_of_birth', 'gender', 'blood_group', 'height_cm', 'weight_kg', 'address', 'city', 'emergency_contact_name', 'emergency_contact_phone', 'allergies', 'chronic_conditions'];
    const camelMap = { dateOfBirth: 'date_of_birth', bloodGroup: 'blood_group', heightCm: 'height_cm', weightKg: 'weight_kg', emergencyContactName: 'emergency_contact_name', emergencyContactPhone: 'emergency_contact_phone', chronicConditions: 'chronic_conditions' };
    const sets = []; const params = [];
    for (const [key, value] of Object.entries(rest)) {
      const col = camelMap[key] || key;
      if (allowed.includes(col)) { sets.push(`${col} = ?`); params.push(value); }
    }
    if (sets.length) await pool.query(`UPDATE patients SET ${sets.join(', ')} WHERE user_id = ?`, [...params, req.user.id]);
  }

  res.json({ message: 'Profile updated.' });
});

module.exports = { getMyProfile, updateMyProfile };
