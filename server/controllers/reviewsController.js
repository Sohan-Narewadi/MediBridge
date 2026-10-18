const { M, find, findOne, insert, update, withUsers, isDuplicateKey } = require('../../database/store');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const { appointmentId, rating, comment } = req.body;
  if (!appointmentId || !rating) throw new ApiError(400, 'appointmentId and rating are required.');
  if (rating < 1 || rating > 5) throw new ApiError(400, 'rating must be between 1 and 5.');

  const appt = await findOne('appointments', { id: Number(appointmentId) });
  if (!appt) throw new ApiError(404, 'Appointment not found.');
  if (appt.patient_id !== req.user.id) throw new ApiError(403, 'Not your appointment.');
  if (appt.status !== 'completed') throw new ApiError(400, 'You can only review a completed appointment.');

  try {
    // The unique index on appointment_id enforces one review per visit.
    await insert('reviews', { doctor_id: appt.doctor_id, patient_id: appt.patient_id, appointment_id: appt.id, rating, comment: comment || null });
  } catch (err) {
    if (isDuplicateKey(err)) throw new ApiError(409, 'You already reviewed this appointment.');
    throw err;
  }

  // Keep the doctor's cached rating in step with the reviews collection.
  const [agg] = await M.reviews.aggregate([
    { $match: { doctor_id: appt.doctor_id } },
    { $group: { _id: null, avg: { $avg: '$rating' }, cnt: { $sum: 1 } } },
  ]);
  if (agg) await update('doctors', { user_id: appt.doctor_id }, { rating_avg: Math.round(agg.avg * 100) / 100, rating_count: agg.cnt });
  res.status(201).json({ message: 'Thanks for your feedback.' });
});

const listForDoctor = asyncHandler(async (req, res) => {
  const rows = await find('reviews', { doctor_id: Number(req.params.doctorId) }, { sort: { created_at: -1, id: -1 } });
  await withUsers(rows, { patient_id: 'patient_name' });
  res.json({ reviews: rows.map((r) => ({ rating: r.rating, comment: r.comment, created_at: r.created_at, patient_name: r.patient_name })) });
});

module.exports = { create, listForDoctor };
