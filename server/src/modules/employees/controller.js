const db = require('../../config/db');
const EmployeeService = require('./EmployeeService');
const AdvanceService = require('./AdvanceService');
const AttendanceService = require('./AttendanceService');

// --- Employee Management ---

exports.getEmployees = async (req, res) => {
    try {
        let employees = await EmployeeService.getAllEmployees();
        if (req.user.role === 'staff') {
            employees = employees.map(emp => ({ ...emp, base_salary: null }));
        }
        res.json(employees);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createEmployee = async (req, res) => {
    const { full_name, position, base_salary } = req.body;
    if (!full_name || !position || !base_salary) {
        return res.status(400).json({ error: 'Full name, position, and salary are required' });
    }
    try {
        const employee = await EmployeeService.createEmployee(req.body);
        res.status(201).json(employee);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateEmployee = async (req, res) => {
    const { id } = req.params;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const updated = await EmployeeService.updateEmployee(id, req.body, req.user.email, client);
        await client.query('COMMIT');
        res.json(updated);
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.message === 'Employee not found') return res.status(404).json({ error: err.message });
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

exports.deleteEmployee = async (req, res) => {
    try {
        await EmployeeService.deleteEmployee(req.params.id);
        res.json({ success: true, message: 'Employee deleted' });
    } catch (err) {
        if (err.message === 'Employee not found') return res.status(404).json({ error: err.message });
        res.status(500).json({ error: err.message });
    }
};

exports.getEmployeeHistory = async (req, res) => {
    try {
        const history = await EmployeeService.getEmployeeHistory(req.params.id);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Attendance ---

exports.getAttendance = async (req, res) => {
    try {
        const result = await AttendanceService.getAttendance(req.query.date);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveBulkAttendance = async (req, res) => {
    const { date, records } = req.body;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await AttendanceService.saveBulkAttendance(date, records, client);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Attendance saved' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// --- Advances ---

exports.getAllAdvances = async (req, res) => {
    try {
        const advances = await AdvanceService.getAllAdvances();
        res.json(advances);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEmployeeAdvanceHistory = async (req, res) => {
    try {
        const history = await AdvanceService.getAllAdvances(req.params.id); // Reusing getAllAdvances for simplicity if filtering is handled
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEmployeeBalance = async (req, res) => {
    try {
        const balance = await AdvanceService.getEmployeeBalance(req.params.id);
        res.json({ balance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createTransaction = async (req, res) => {
    const { employeeId, type, amount } = req.body;
    if (!employeeId || !type || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Invalid transaction details' });
    }
    try {
        const request = await AdvanceService.createRequest(req.body, req.user.id);
        res.json({ success: true, message: 'Request submitted for approval', request });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getAdvanceRequests = async (req, res) => {
    try {
        const requests = await AdvanceService.getRequests();
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.approveAdvance = async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await AdvanceService.approveRequest(req.params.id, req.user.id, client);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Approved successfully', ...result });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

exports.rejectAdvance = async (req, res) => {
    try {
        await AdvanceService.rejectRequest(req.params.id, req.user.id, req.body.reason);
        res.json({ success: true, message: 'Request rejected' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.runPayroll = async (req, res) => {
    const PayrollService = require('./PayrollService');
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await PayrollService.runPayroll(req.body, client);
        await client.query('COMMIT');
        res.json(result);
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
};

exports.getMonthlyPayroll = async (req, res) => {
    const { month, year } = req.query;
    try {
        const currentDate = new Date();
        const qMonth = month || currentDate.getMonth() + 1;
        const qYear = year || currentDate.getFullYear();
        const data = await EmployeeService.getMonthlyPayrollData(qMonth, qYear);
        res.json({ month: qMonth, year: qYear, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEmployeesWithAdvances = async (req, res) => {
    try {
        const result = await EmployeeService.getEmployeesWithAdvances();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
