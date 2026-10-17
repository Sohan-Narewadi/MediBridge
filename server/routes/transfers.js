const express = require('express');
const { body, param } = require('express-validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/transfersController');

const router = express.Router();

// Doctors, admins and transfer-desk staff only (loadDesk rejects other departments).
router.use(requireAuth, requireRole('doctor', 'admin', 'staff'), ctrl.loadDesk);

const URGENCY = ['routine', 'urgent', 'critical'];

router.get('/desk', ctrl.getDesk);
router.get('/hospitals', ctrl.listHospitals);
router.get('/candidates', ctrl.listCandidates);
router.get('/incoming', requireRole('staff'), ctrl.incoming);
router.get('/analytics', requireRole('admin'), ctrl.analytics);

router.post(
  '/match',
  [body('specializationId').isInt().withMessage('Choose the care the patient needs.'), body('needsIcu').optional().isBoolean()],
  validate,
  ctrl.match
);
router.post(
  '/preview-summary',
  [body('patientId').isInt().withMessage('Choose a patient.'), body('specializationId').isInt(), body('admissionId').optional({ nullable: true }).isInt()],
  validate,
  ctrl.previewSummary
);
router.post(
  '/',
  [
    body('patientId').isInt().withMessage('Choose a patient.'),
    body('admissionId').optional({ nullable: true }).isInt(),
    body('specializationId').isInt().withMessage('Choose the care the patient needs.'),
    body('needsIcu').optional().isBoolean(),
    body('urgency').isIn(URGENCY).withMessage('Urgency must be routine, urgent or critical.'),
    body('reason').trim().isLength({ min: 5, max: 255 }).withMessage('Give a short reason for the transfer.'),
    body('consentGiven').isBoolean().withMessage('Consent is required.'),
    body('consentNote').optional({ nullable: true }).trim().isLength({ max: 160 }),
    body('hospitalIds').isArray({ min: 1 }).withMessage('Select at least one hospital.'),
    body('hospitalIds.*').isInt(),
  ],
  validate,
  ctrl.create
);

router.get('/', ctrl.list);
router.get('/:id', [param('id').isInt()], validate, ctrl.getById);
router.post(
  '/offers/:id/respond',
  requireRole('staff'),
  [param('id').isInt(), body('decision').isIn(['accept', 'decline']), body('note').optional({ nullable: true }).trim().isLength({ max: 255 })],
  validate,
  ctrl.respond
);
router.post('/:id/complete', requireRole('doctor', 'admin', 'staff'), [param('id').isInt()], validate, ctrl.complete);
router.post('/:id/cancel', requireRole('doctor', 'admin', 'staff'), [param('id').isInt()], validate, ctrl.cancel);

module.exports = router;
