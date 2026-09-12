const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/stats', ctrl.getStats);
router.get('/analytics', ctrl.getAnalytics);
router.get('/patients', ctrl.listPatients);
router.get('/doctors', ctrl.listDoctors);
router.patch('/doctors/:id/verify', ctrl.verifyDoctor);
router.patch('/users/:id/status', ctrl.setUserStatus);
router.get('/reports', ctrl.listReports);
router.patch('/reports/:id', ctrl.updateReport);
router.get('/audit-logs', ctrl.listAuditLogs);

module.exports = router;
