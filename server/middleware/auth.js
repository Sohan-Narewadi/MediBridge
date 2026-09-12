const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

// Reads the JWT from the httpOnly cookie (or Authorization header as a
// fallback for tooling like curl/Postman) and attaches { id, role, email }
// to req.user. Does not hit the database - that's intentional, so every
// protected request stays cheap; handlers that need fresh data query it.
function requireAuth(req, res, next) {
  const cookieToken = req.cookies && req.cookies.token;
  const headerToken = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = cookieToken || headerToken;

  if (!token) return next(new ApiError(401, 'Authentication required.'));

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    next(new ApiError(401, 'Invalid or expired session. Please log in again.'));
  }
}

// Usage: requireRole('doctor'), requireRole('doctor', 'admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required.'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action.'));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
