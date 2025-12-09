const express = require('express');
const router = express.Router();
const employeesController = require('./controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

// Employee Management (mounted at /api/employees)
router.get('/', verifyToken, employeesController.getEmployees);
router.post('/', verifyToken, checkRole(['manager', 'owner']), employeesController.createEmployee);
router.put('/:id', verifyToken, checkRole(['manager', 'owner']), employeesController.updateEmployee);
router.delete('/:id', verifyToken, checkRole(['owner']), employeesController.deleteEmployee);
router.get('/:id/history', verifyToken, checkRole(['manager', 'owner']), employeesController.getEmployeeHistory);

// Attendance (mounted at /api/employees/attendance)
router.get('/attendance', verifyToken, checkRole(['manager', 'owner']), employeesController.getAttendance);
router.post('/attendance/bulk', verifyToken, checkRole(['manager', 'owner']), employeesController.saveBulkAttendance);

// Payroll & Advances (mounted at /api/employees/payroll/...)
router.get('/payroll/advances', verifyToken, employeesController.getAllAdvances);
router.get('/payroll/advances/:id', verifyToken, employeesController.getEmployeeAdvanceHistory);
router.get('/payroll/advances/:id/balance', verifyToken, employeesController.getEmployeeBalance);
router.post('/payroll/advance', verifyToken, checkRole(['manager', 'owner']), employeesController.createTransaction);
router.post('/payroll/run', verifyToken, checkRole(['manager', 'owner']), employeesController.runPayroll);
router.get('/payroll/monthly', verifyToken, checkRole(['manager', 'owner']), employeesController.getMonthlyPayroll);

// Legacy endpoint
router.get('/employees-payroll', verifyToken, checkRole(['manager', 'owner']), employeesController.getEmployeesWithAdvances);

module.exports = router;
