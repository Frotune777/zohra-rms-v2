const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

// All routes require authentication and manager/owner role
router.use(verifyToken);
router.use(checkRole(['manager', 'owner']));

router.post('/run', controller.runPayroll);
router.get('/monthly', controller.getMonthlyPayroll);
router.post('/approve', controller.approvePayroll);
router.post('/payout', controller.markPaid);

// Owner-only routes for revert/delete
router.delete('/:id', checkRole(['owner']), controller.deletePayroll);
router.post('/revert/:id', checkRole(['owner']), controller.revertPayroll);

module.exports = router;
