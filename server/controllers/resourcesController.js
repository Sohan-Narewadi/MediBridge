const pool = require('../../database/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const { category, q } = req.query;
  const where = [];
  const params = [];
  if (category) { where.push('category = ?'); params.push(category); }
  if (q) { where.push('(title LIKE ? OR summary LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(`SELECT id, category, title, summary, image_url, read_mins, created_at FROM healthcare_resources ${whereClause} ORDER BY created_at DESC`, params);
  const [categories] = await pool.query(`SELECT category, COUNT(*) AS count FROM healthcare_resources GROUP BY category`);
  res.json({ resources: rows, categories });
});

const getById = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM healthcare_resources WHERE id = ?`, [req.params.id]);
  if (!rows.length) throw new ApiError(404, 'Resource not found.');
  res.json({ resource: rows[0] });
});

const create = asyncHandler(async (req, res) => {
  const { category, title, summary, content, imageUrl, readMins } = req.body;
  const [result] = await pool.query(
    `INSERT INTO healthcare_resources (category, title, summary, content, image_url, read_mins) VALUES (?, ?, ?, ?, ?, ?)`,
    [category, title, summary, content, imageUrl || null, readMins || 3]
  );
  res.status(201).json({ id: result.insertId });
});

const update = asyncHandler(async (req, res) => {
  const { category, title, summary, content, imageUrl, readMins } = req.body;
  await pool.query(
    `UPDATE healthcare_resources SET category = ?, title = ?, summary = ?, content = ?, image_url = ?, read_mins = ? WHERE id = ?`,
    [category, title, summary, content, imageUrl || null, readMins || 3, req.params.id]
  );
  res.json({ message: 'Resource updated.' });
});

const remove = asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM healthcare_resources WHERE id = ?', [req.params.id]);
  res.json({ message: 'Resource deleted.' });
});

module.exports = { list, getById, create, update, remove };
