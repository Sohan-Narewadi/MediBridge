const ApiError = require('../utils/ApiError');

// Central error handler. Never leaks stack traces or raw DB errors to the
// client - those are logged server-side only.
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That slot or record already exists.' });
  }

  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again shortly.' });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'The requested resource was not found.' });
}

module.exports = { errorHandler, notFoundHandler };
