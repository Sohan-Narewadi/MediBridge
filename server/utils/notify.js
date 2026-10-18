// Shared helpers for writing in-app notifications and audit-trail entries.
const { insert, insertMany, find, findOne, byIds } = require('../../database/store');

async function notify(userId, type, title, message, relatedType = null, relatedId = null) {
  await insert('notifications', { user_id: userId, type, title, message, related_type: relatedType, related_id: relatedId });
}

// Notifies every staff member of a department (optionally limited to one hospital).
async function notifyDepartment(department, hospitalId, type, title, message, relatedType = null, relatedId = null) {
  const filter = { department };
  if (hospitalId) filter.hospital_id = hospitalId;
  const rows = await find('staff', filter, { select: 'user_id' });
  await insertMany('notifications', rows.map((r) => ({
    user_id: r.user_id, type, title, message, related_type: relatedType, related_id: relatedId,
  })));
  return rows.length;
}

async function audit(userId, action, entityType, entityId, details) {
  await insert('audit_logs', {
    user_id: userId || null, action, entity_type: entityType || null, entity_id: entityId || null,
    details: details ? String(details).slice(0, 255) : null,
  });
}

// Returns { user_id, hospital_id, department, hospital_name, is_home } for a staff user, or null.
async function getStaffProfile(userId) {
  const s = await findOne('staff', { user_id: userId });
  if (!s) return null;
  const h = await findOne('hospitals', { id: s.hospital_id });
  if (!h) return null;
  return { user_id: s.user_id, hospital_id: s.hospital_id, department: s.department, hospital_name: h.name, is_home: h.is_home };
}

module.exports = { notify, notifyDepartment, audit, getStaffProfile };
