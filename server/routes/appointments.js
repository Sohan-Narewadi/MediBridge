const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/appointmentsController');

const router = express.Router();

router.use(requireAuth);

router.get('/', ctrl.list);
router.get('/my-patients', requireRole('doctor'), ctrl.listMyPatients);
router.get('/:id', ctrl.getById);
router.post('/', requireRole('patient', 'doctor', 'admin'), ctrl.create);
router.patch('/:id/status', requireRole('patient', 'doctor', 'admin'), ctrl.updateStatus);
router.patch('/:id/reschedule', requireRole('patient', 'doctor', 'admin'), ctrl.reschedule);

module.exports = router;
