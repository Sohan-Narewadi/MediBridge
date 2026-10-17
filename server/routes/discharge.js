const express = require('express');
const { body, param, query } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/dischargeController');

const router = express.Router();
router.use(requireAuth);

const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid id.'), validate];

// Department staff
router.get('/queue', requireRole('staff'), ctrl.queue);
router.patch(
  '/tasks/:id',
  requireRole('staff', 'admin'),
  param('id').isInt({ min: 1 }),
  body('status').isIn(['in_progress', 'blocked', 'done']).withMessage('Status must be in_progress, blocked or done.'),
  body('blockedReason').optional({ nullable: true }).isString().isLength({ max: 255 }),
  validate,
  ctrl.updateTask
);
router.post('/tasks/:id/nudge', requireRole('doctor', 'admin', 'staff'), idParam, ctrl.nudgeTask);

// Doctor / admin
router.get(
  '/admissions',
  requireRole('doctor', 'admin'),
  query('status').optional().isIn(['admitted', 'cleared', 'discharged', 'transferred']),
  validate,
  ctrl.listAdmissions
);
router.get('/admissions/:id', requireRole('doctor', 'admin', 'patient', 'staff'), idParam, ctrl.getAdmission);
router.post('/admissions/:id/clear', requireRole('doctor'), idParam, ctrl.clearAdmission);
router.post('/admissions/:id/discharge', requireRole('doctor', 'admin'), idParam, ctrl.completeDischarge);

// Patient
router.get('/my-stay', requireRole('patient'), ctrl.myStay);

// Admin
router.get('/board', requireRole('admin'), ctrl.board);
router.get('/analytics', requireRole('admin'), ctrl.analytics);

module.exports = router;
