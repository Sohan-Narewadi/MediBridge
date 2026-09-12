const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/dashboardController');

const router = express.Router();
router.use(requireAuth);
router.get('/patient', requireRole('patient'), ctrl.patientSummary);
router.get('/doctor', requireRole('doctor'), ctrl.doctorSummary);

module.exports = router;
