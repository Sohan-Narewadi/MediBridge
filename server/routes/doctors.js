const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/doctorsController');

const router = express.Router();

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.get('/:id/slots', ctrl.getSlots);

router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  [body('email').isEmail(), body('password').isLength({ min: 8 }), body('fullName').notEmpty(), body('specializationId').isInt()],
  validate,
  ctrl.create
);
router.put('/:id', requireAuth, requireRole('doctor', 'admin'), ctrl.update);
router.put('/:id/availability', requireAuth, requireRole('doctor', 'admin'), ctrl.setAvailability);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deactivate);

module.exports = router;
