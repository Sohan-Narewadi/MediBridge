const { M, find, findOne, insert, update, remove, contains } = require('../../database/store');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const { category, q } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (q) filter.$or = [{ title: contains(q) }, { summary: contains(q) }];

  const [resources, grouped] = await Promise.all([
    find('healthcare_resources', filter, { sort: { created_at: -1, id: -1 }, select: 'id category title summary image_url read_mins created_at' }),
    M.healthcare_resources.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  res.json({ resources, categories: grouped.map((g) => ({ category: g._id, count: g.count })) });
});

const getById = asyncHandler(async (req, res) => {
  const resource = await findOne('healthcare_resources', { id: Number(req.params.id) });
  if (!resource) throw new ApiError(404, 'Resource not found.');
  res.json({ resource });
});

const create = asyncHandler(async (req, res) => {
  const { category, title, summary, content, imageUrl, readMins } = req.body;
  const created = await insert('healthcare_resources', { category, title, summary, content, image_url: imageUrl || null, read_mins: readMins || 3 });
  res.status(201).json({ id: created.id });
});

const updateResource = asyncHandler(async (req, res) => {
  const { category, title, summary, content, imageUrl, readMins } = req.body;
  await update('healthcare_resources', { id: Number(req.params.id) }, { category, title, summary, content, image_url: imageUrl || null, read_mins: readMins || 3 });
  res.json({ message: 'Resource updated.' });
});

const removeResource = asyncHandler(async (req, res) => {
  await remove('healthcare_resources', { id: Number(req.params.id) });
  res.json({ message: 'Resource deleted.' });
});

module.exports = { list, getById, create, update: updateResource, remove: removeResource };
