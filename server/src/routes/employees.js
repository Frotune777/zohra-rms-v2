const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middleware/auth');
const employeesController = require('../controllers/employees');

// Get all employees
router.get('/', verifyToken, employeesController.getEmployees);

// Create new employee (manager and owner only)
router.post('/', verifyToken, checkRole(['manager', 'owner']), employeesController.createEmployee);

// Update employee (manager and owner only)
router.put('/:id', verifyToken, checkRole(['manager', 'owner']), employeesController.updateEmployee);

// Delete employee (owner only)
router.delete('/:id', verifyToken, checkRole(['owner']), employeesController.deleteEmployee);

// Get Employee History
router.get('/:id/history', verifyToken, checkRole(['manager', 'owner']), employeesController.getEmployeeHistory);

module.exports = router;
