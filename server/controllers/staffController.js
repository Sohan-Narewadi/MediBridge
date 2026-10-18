const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getStaffProfile } = require('../utils/notify');

// GET /api/staff/me - which hospital and department this staff login belongs to.
const me = asyncHandler(async (req, res) => {
  const staff = await getStaffProfile(req.user.id);
  if (!staff) throw new ApiError(404, 'No staff profile found for this account.');
  res.json({ staff: { ...staff, is_home: !!staff.is_home } });
});

module.exports = { me };
