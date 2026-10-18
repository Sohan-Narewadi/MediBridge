const bcrypt = require('bcryptjs');
const { findOne, insert } = require('../../database/store');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signToken, COOKIE_OPTIONS } = require('../utils/jwt');

// Public self-registration is patient-only by design - doctor and admin
// accounts are provisioned by an admin, so they can be vetted first.
const register = asyncHandler(async (req, res) => {
  const { password, fullName, phone, dateOfBirth, gender } = req.body;
  const email = String(req.body.email).trim().toLowerCase();

  if (await findOne('users', { email }, { select: 'id' })) throw new ApiError(409, 'An account with that email already exists.');

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await insert('users', { email, password_hash: passwordHash, role: 'patient', full_name: fullName, phone: phone || null });
  await insert('patients', { user_id: created.id, date_of_birth: dateOfBirth || null, gender: gender || 'prefer_not_to_say' });

  const user = { id: created.id, role: 'patient', email, full_name: fullName };
  res.cookie('token', signToken(user), COOKIE_OPTIONS);
  res.status(201).json({ user: { id: user.id, role: user.role, email, fullName } });
});

const login = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const email = String(req.body.email).trim().toLowerCase();
  const user = await findOne('users', { email });
  if (!user || !user.is_active) throw new ApiError(401, 'Invalid email or password.');

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) throw new ApiError(401, 'Invalid email or password.');

  res.cookie('token', signToken(user), COOKIE_OPTIONS);
  res.json({ user: { id: user.id, role: user.role, email: user.email, fullName: user.full_name, avatarUrl: user.avatar_url } });
});

const logout = (req, res) => {
  res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: undefined });
  res.json({ message: 'Logged out.' });
};

const me = asyncHandler(async (req, res) => {
  const u = await findOne('users', { id: req.user.id }, { select: 'id email role full_name phone avatar_url' });
  if (!u) throw new ApiError(404, 'User not found.');
  res.json({ user: { id: u.id, email: u.email, role: u.role, fullName: u.full_name, phone: u.phone, avatarUrl: u.avatar_url } });
});

module.exports = { register, login, logout, me };
