const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/medicalRecordsController');

const router = express.Router();

router.use(requireAuth);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', requireRole('doctor'), ctrl.create);

module.exports = router;
