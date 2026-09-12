const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/prescriptionsController');

const router = express.Router();
router.use(requireAuth, requireRole('patient', 'doctor'));
router.get('/', ctrl.list);

module.exports = router;
