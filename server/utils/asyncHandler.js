// Wraps an async route handler so rejected promises reach Express's error
// handler instead of crashing the process or hanging the request.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
};
