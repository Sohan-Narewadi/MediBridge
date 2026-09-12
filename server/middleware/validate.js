const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

// Drop this after a chain of express-validator checks to turn their errors
// into a consistent 400 response instead of handling it per-route.
module.exports = function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ApiError(400, 'Validation failed.', errors.array().map((e) => ({ field: e.path, message: e.msg }))));
  }
  next();
};
