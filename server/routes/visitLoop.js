const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/visitLoopController');

const router = express.Router();
router.use(requireAuth);

// Pre-visit intake (patient)
router.post(
  '/intake',
  requireRole('patient'),
  [
    body('appointmentId').isInt({ min: 1 }).withMessage('appointmentId is required.'),
    body('chiefComplaint').trim().isLength({ min: 3, max: 255 }).withMessage('Tell your doctor briefly why you are coming (3-255 characters).'),
    body('symptoms').optional().isArray({ max: 15 }).withMessage('symptoms must be a list.'),
    body('severity').optional({ nullable: true }).isInt({ min: 1, max: 5 }).withMessage('Severity must be between 1 and 5.'),
    body('symptomDuration').optional({ nullable: true }).isLength({ max: 60 }),
    body('medicationChanges').optional({ nullable: true }).isLength({ max: 255 }),
    body('newAllergies').optional({ nullable: true }).isLength({ max: 255 }),
    body('questionsForDoctor').optional({ nullable: true }).isLength({ max: 500 }),
  ],
  validate,
  ctrl.saveIntake
);
router.get('/intake-status', requireRole('patient', 'doctor'), ctrl.intakeStatus);
router.get('/intake/:appointmentId', [param('appointmentId').isInt()], validate, ctrl.getIntake);
router.get('/pending-intakes', requireRole('patient'), ctrl.pendingIntakes);

// Smart Brief (doctor)
router.get('/brief/:appointmentId', requireRole('doctor', 'admin'), [param('appointmentId').isInt()], validate, ctrl.getBrief);
router.get('/briefs/today', requireRole('doctor'), ctrl.briefsToday);

// Care plans + commitments
router.post(
  '/care-plans',
  requireRole('doctor'),
  [
    body('patientId').isInt({ min: 1 }).withMessage('patientId is required.'),
    body('plainSummary').trim().isLength({ min: 10 }).withMessage('Write at least a sentence for the patient.'),
    body('commitments').optional().isArray({ max: 20 }),
    body('commitments.*.dueDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Due dates must be valid dates.'),
  ],
  validate,
  ctrl.createCarePlan
);
router.get('/care-plans', requireRole('patient', 'doctor', 'admin'), ctrl.listCarePlans);
router.get('/commitments', requireRole('patient', 'doctor', 'admin'), ctrl.listCommitments);
router.patch(
  '/commitments/:id',
  requireRole('patient', 'doctor', 'admin'),
  [param('id').isInt(), body('status').isIn(['open', 'done', 'skipped']).withMessage('status must be open, done or skipped.')],
  validate,
  ctrl.updateCommitment
);

// Admin analytics: where loops are breaking
router.get('/analytics', requireRole('admin'), ctrl.analytics);

module.exports = router;
