const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/usersController');

const router = express.Router();
router.use(requireAuth);
router.get('/me/profile', ctrl.getMyProfile);
router.put('/me/profile', ctrl.updateMyProfile);

module.exports = router;
