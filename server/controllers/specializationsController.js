const pool = require('../../database/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.description, s.icon, COUNT(d.user_id) AS doctor_count
     FROM specializations s
     LEFT JOIN doctors d ON d.specialization_id = s.id
     GROUP BY s.id ORDER BY s.name`
  );
  res.json({ specializations: rows });
});

const create = asyncHandler(async (req, res) => {
  const { name, description, icon } = req.body;
  const [result] = await pool.query('INSERT INTO specializations (name, description, icon) VALUES (?, ?, ?)', [name, description || null, icon || null]);
  res.status(201).json({ id: result.insertId });
});

const update = asyncHandler(async (req, res) => {
  const { name, description, icon } = req.body;
  await pool.query('UPDATE specializations SET name = ?, description = ?, icon = ? WHERE id = ?', [name, description || null, icon || null, req.params.id]);
  res.json({ message: 'Specialization updated.' });
});

const remove = asyncHandler(async (req, res) => {
  const [inUse] = await pool.query('SELECT COUNT(*) AS c FROM doctors WHERE specialization_id = ?', [req.params.id]);
  if (inUse[0].c > 0) throw new ApiError(409, 'Cannot delete a specialization that is still assigned to doctors.');
  await pool.query('DELETE FROM specializations WHERE id = ?', [req.params.id]);
  res.json({ message: 'Specialization deleted.' });
});

module.exports = { list, create, update, remove };
