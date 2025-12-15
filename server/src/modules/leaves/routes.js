const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { verifyToken, requirePermission } = require('../../middleware/auth');
const { PERMISSIONS } = require('../../config/permissions');

// Get all leave requests with filters
router.get('/', verifyToken, controller.getLeaveRequests);

// Get leave requests for a specific employee
router.get('/employee/:id', verifyToken, controller.getEmployeeLeaves);

// Get leaves for a specific date (for attendance integration)
router.get('/date/:date', verifyToken, controller.getLeavesByDate);

// Create a new leave request
router.post('/', verifyToken, controller.createLeaveRequest);

// Approve a leave request (requires HR/Manager permission)
router.put('/:id/approve', verifyToken, requirePermission(PERMISSIONS.HR_WRITE), controller.approveLeave);

// Reject a leave request (requires HR/Manager permission)
router.put('/:id/reject', verifyToken, requirePermission(PERMISSIONS.HR_WRITE), controller.rejectLeave);

// Delete a leave request
router.delete('/:id', verifyToken, controller.deleteLeaveRequest);

module.exports = router;
