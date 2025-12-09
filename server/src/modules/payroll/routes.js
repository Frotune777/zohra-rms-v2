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

module.exports = router;
