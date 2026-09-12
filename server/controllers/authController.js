const bcrypt = require('bcryptjs');
const pool = require('../../database/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signToken, COOKIE_OPTIONS } = require('../utils/jwt');

// Public self-registration is patient-only by design - doctor and admin
// accounts are provisioned by an admin, so they can be vetted first.
const register = asyncHandler(async (req, res) => {
  const { email, password, fullName, phone, dateOfBirth, gender } = req.body;

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) throw new ApiError(409, 'An account with that email already exists.');

  const passwordHash = await bcrypt.hash(password, 10);
  const [userResult] = await pool.query(
    `INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, 'patient', ?, ?)`,
    [email, passwordHash, fullName, phone || null]
  );
  await pool.query(
    `INSERT INTO patients (user_id, date_of_birth, gender) VALUES (?, ?, ?)`,
    [userResult.insertId, dateOfBirth || null, gender || 'prefer_not_to_say']
  );

  const user = { id: userResult.insertId, role: 'patient', email, full_name: fullName };
  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTIONS);
  res.status(201).json({ user: { id: user.id, role: user.role, email, fullName } });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user || !user.is_active) throw new ApiError(401, 'Invalid email or password.');

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) throw new ApiError(401, 'Invalid email or password.');

  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({ user: { id: user.id, role: user.role, email: user.email, fullName: user.full_name, avatarUrl: user.avatar_url } });
});

const logout = (req, res) => {
  res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: undefined });
  res.json({ message: 'Logged out.' });
};

const me = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, email, role, full_name, phone, avatar_url FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!rows.length) throw new ApiError(404, 'User not found.');
  res.json({ user: rows[0] });
});

module.exports = { register, login, logout, me };
