const { M, find, insert, update, remove, count } = require('../../database/store');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const [specs, perSpec] = await Promise.all([
    find('specializations', {}, { sort: { name: 1 } }),
    M.doctors.aggregate([{ $group: { _id: '$specialization_id', n: { $sum: 1 } } }]),
  ]);
  const counts = new Map(perSpec.map((r) => [r._id, r.n]));
  res.json({
    specializations: specs.map((s) => ({ id: s.id, name: s.name, description: s.description, icon: s.icon, doctor_count: counts.get(s.id) || 0 })),
  });
});

const create = asyncHandler(async (req, res) => {
  const { name, description, icon } = req.body;
  const created = await insert('specializations', { name, description: description || null, icon: icon || null });
  res.status(201).json({ id: created.id });
});

const updateSpec = asyncHandler(async (req, res) => {
  const { name, description, icon } = req.body;
  await update('specializations', { id: Number(req.params.id) }, { name, description: description || null, icon: icon || null });
  res.json({ message: 'Specialization updated.' });
});

const removeSpec = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if ((await count('doctors', { specialization_id: id })) > 0) throw new ApiError(409, 'Cannot delete a specialization that is still assigned to doctors.');
  await remove('specializations', { id });
  res.json({ message: 'Specialization deleted.' });
});

module.exports = { list, create, update: updateSpec, remove: removeSpec };
