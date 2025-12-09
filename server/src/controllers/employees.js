const db = require('../config/db');

// Get all employees
exports.getEmployees = async (req, res) => {
    try {
        let query = 'SELECT id, employee_code, full_name, first_name, last_name, position, department, age, gender, phone_number, role, base_salary, status, payout_method, bank_account_no, ifsc_code FROM employees ORDER BY full_name';

        const result = await db.query(query);

        // Filter based on role if needed
        let employees = result.rows;
        if (req.user.role === 'staff') {
            // Staff can see all employees but not salaries
            employees = employees.map(emp => ({
                ...emp,
                base_salary: null
            }));
        }

        res.json(employees);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Create new employee (manager and owner only)
exports.createEmployee = async (req, res) => {
    try {
        const { full_name, first_name, last_name, position, department, age, gender, phone_number, base_salary, status, role, govt_id_type, govt_id_number } = req.body;

        if (!full_name || !position || !base_salary || !department) {
            return res.status(400).json({ error: 'Full name, position, department, and salary are required' });
        }

        // Generate Employee Code (Simple logic: EMP + Random 4 digits)
        // In production, use a sequence or max ID + 1
        const empCode = 'EMP' + Math.floor(1000 + Math.random() * 9000);

        const result = await db.query(
            'INSERT INTO employees (employee_code, full_name, first_name, last_name, position, department, age, gender, phone_number, base_salary, status, role, govt_id_type, govt_id_number, payout_method, bank_account_no, ifsc_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *',
            [empCode, full_name, first_name, last_name, position, department, age || null, gender || null, phone_number || null, base_salary, status || 'active', role || 'staff', govt_id_type || null, govt_id_number || null, req.body.payout_method || 'Cash', req.body.bank_account_no || null, req.body.ifsc_code || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Update employee (manager and owner only)
exports.updateEmployee = async (req, res) => {
    const client = await db.query('BEGIN');
    try {
        const { id } = req.params;
        const { full_name, first_name, last_name, position, department, age, gender, phone_number, base_salary, status, role, govt_id_type, govt_id_number } = req.body;
        const changedBy = req.user.email; // Assuming user email is in token

        // 1. Get current employee data for history comparison
        const currentRes = await db.query('SELECT * FROM employees WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Employee not found' });
        }
        const current = currentRes.rows[0];

        // 2. Update Employee
        const result = await db.query(
            'UPDATE employees SET full_name = COALESCE($1, full_name), first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name), position = COALESCE($4, position), department = COALESCE($5, department), age = COALESCE($6, age), gender = COALESCE($7, gender), phone_number = COALESCE($8, phone_number), base_salary = COALESCE($9, base_salary), status = COALESCE($10, status), role = COALESCE($11, role), govt_id_type = COALESCE($12, govt_id_type), govt_id_number = COALESCE($13, govt_id_number), payout_method = COALESCE($14, payout_method), bank_account_no = COALESCE($15, bank_account_no), ifsc_code = COALESCE($16, ifsc_code) WHERE id = $17 RETURNING *',
            [full_name || null, first_name || null, last_name || null, position || null, department || null, age || null, gender || null, phone_number || null, base_salary || null, status || null, role || null, govt_id_type || null, govt_id_number || null, req.body.payout_method || null, req.body.bank_account_no || null, req.body.ifsc_code || null, id]
        );
        const updated = result.rows[0];

        // 3. Log History for critical fields
        const fieldsToCheck = ['base_salary', 'position', 'role', 'status'];
        for (const field of fieldsToCheck) {
            if (req.body[field] !== undefined && req.body[field] != current[field]) {
                await db.query(
                    'INSERT INTO employee_history (employee_id, field_changed, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4, $5)',
                    [id, field, current[field], req.body[field], changedBy]
                );
            }
        }

        await db.query('COMMIT');
        res.json(updated);
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
};

// Delete employee (owner only)
exports.deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query('DELETE FROM employees WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        res.json({ success: true, message: 'Employee deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get Employee History
exports.getEmployeeHistory = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            'SELECT * FROM employee_history WHERE employee_id = $1 ORDER BY changed_at DESC',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
