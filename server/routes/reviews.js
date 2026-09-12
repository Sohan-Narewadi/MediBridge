const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/reviewsController');

const router = express.Router();

router.get('/doctor/:doctorId', ctrl.listForDoctor);
router.post('/', requireAuth, requireRole('patient'), ctrl.create);

module.exports = router;
