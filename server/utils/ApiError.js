// A typed error that carries an HTTP status code, so controllers can throw
// meaningful errors that the central error handler turns into clean JSON.
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = ApiError;
