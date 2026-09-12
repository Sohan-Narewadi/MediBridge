const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/resourcesController');

const router = express.Router();

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', requireAuth, requireRole('admin'), ctrl.create);
router.put('/:id', requireAuth, requireRole('admin'), ctrl.update);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.remove);

module.exports = router;
