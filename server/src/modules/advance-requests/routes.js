const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { verifyToken, requirePermission } = require('../../middleware/auth');
const { PERMISSIONS } = require('../../config/permissions');

router.get('/', verifyToken, controller.getAdvanceRequests);
router.post('/', verifyToken, controller.createAdvanceRequest);
router.put('/:id/approve', verifyToken, requirePermission(PERMISSIONS.HR_WRITE), controller.approveAdvanceRequest);
router.put('/:id/reject', verifyToken, requirePermission(PERMISSIONS.HR_WRITE), controller.rejectAdvanceRequest);
router.get('/:id/repayment-schedule', verifyToken, controller.getRepaymentSchedule);

module.exports = router;
