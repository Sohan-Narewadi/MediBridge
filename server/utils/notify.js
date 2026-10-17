// Shared helpers for writing in-app notifications and audit-trail rows.
// `conn` may be the pool or a transaction connection.

async function notify(conn, userId, type, title, message, relatedType = null, relatedId = null) {
  await conn.query(
    `INSERT INTO notifications (user_id, type, title, message, related_type, related_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, title, message, relatedType, relatedId]
  );
}

// Notifies every staff member of a department (optionally limited to one hospital).
async function notifyDepartment(conn, department, hospitalId, type, title, message, relatedType = null, relatedId = null) {
  const params = [department];
  let sql = 'SELECT user_id FROM staff WHERE department = ?';
  if (hospitalId) { sql += ' AND hospital_id = ?'; params.push(hospitalId); }
  const [rows] = await conn.query(sql, params);
  for (const r of rows) await notify(conn, r.user_id, type, title, message, relatedType, relatedId);
  return rows.length;
}

async function audit(conn, userId, action, entityType, entityId, details) {
  await conn.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`,
    [userId || null, action, entityType || null, entityId || null, details ? String(details).slice(0, 255) : null]
  );
}

// Returns { user_id, hospital_id, department, hospital_name } for a staff user, or null.
async function getStaffProfile(conn, userId) {
  const [rows] = await conn.query(
    `SELECT s.user_id, s.hospital_id, s.department, h.name AS hospital_name, h.is_home
       FROM staff s JOIN hospitals h ON h.id = s.hospital_id WHERE s.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

module.exports = { notify, notifyDepartment, audit, getStaffProfile };
