const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

module.exports = { signToken, COOKIE_OPTIONS };
