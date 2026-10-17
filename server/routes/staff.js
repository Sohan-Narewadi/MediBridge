const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/staffController');

const router = express.Router();
router.use(requireAuth, requireRole('staff'));
router.get('/me', ctrl.me);

module.exports = router;
