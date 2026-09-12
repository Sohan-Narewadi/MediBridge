const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/medicationsController');

const router = express.Router();

router.use(requireAuth);
router.get('/', ctrl.list);
router.post('/', requireRole('patient'), ctrl.create);
router.put('/:id', requireRole('patient'), ctrl.update);
router.delete('/:id', requireRole('patient'), ctrl.remove);
router.post('/:id/log', requireRole('patient'), ctrl.logIntake);

module.exports = router;
