const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/careController');

const router = express.Router();
router.use(requireAuth, requireRole('patient'));
router.get('/score', ctrl.getScore);
router.get('/timeline', ctrl.getTimeline);
router.get('/adherence-trend', ctrl.getAdherenceTrend);

module.exports = router;
