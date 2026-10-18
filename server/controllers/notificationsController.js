const { find, count, update, updateMany } = require('../../database/store');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const [notifications, unread] = await Promise.all([
    find('notifications', { user_id: req.user.id }, { sort: { created_at: -1, id: -1 }, limit: 50 }),
    count('notifications', { user_id: req.user.id, is_read: 0 }),
  ]);
  res.json({ notifications, unread });
});

const markRead = asyncHandler(async (req, res) => {
  await update('notifications', { id: Number(req.params.id), user_id: req.user.id }, { is_read: 1 });
  res.json({ message: 'Marked as read.' });
});

const markAllRead = asyncHandler(async (req, res) => {
  await updateMany('notifications', { user_id: req.user.id }, { is_read: 1 });
  res.json({ message: 'All notifications marked as read.' });
});

module.exports = { list, markRead, markAllRead };
