const db = require('../../config/db');

class EmployeeService {
    /**
     * Get all employees
     */
    async getAllEmployees() {
        const result = await db.query('SELECT * FROM employees ORDER BY full_name');
        return result.rows;
    }

    /**
     * Create Employee
     */
    async createEmployee(data) {
        const { full_name, first_name, last_name, position, age, gender, phone_number, base_salary, status, role, govt_id_type, govt_id_number } = data;

        // Generate Employee Code
        const maxIdRes = await db.query('SELECT MAX(id) as max_id FROM employees');
        const nextId = (parseInt(maxIdRes.rows[0].max_id) || 0) + 1;
        const employee_code = `EMP${String(nextId).padStart(3, '0')}`;

        const result = await db.query(
            `INSERT INTO employees 
            (full_name, first_name, last_name, position, age, gender, phone_number, base_salary, status, role, employee_code, govt_id_type, govt_id_number) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
            RETURNING *`,
            [full_name, first_name, last_name, position, age || null, gender || null, phone_number || null, base_salary, status || 'active', role || 'staff', employee_code, govt_id_type || null, govt_id_number || null]
        );

        return result.rows[0];
    }

    /**
     * Update Employee and Log History
     */
    async updateEmployee(id, data, changedBy, client) {
        const { full_name, first_name, last_name, position, age, gender, phone_number, base_salary, status, role, govt_id_type, govt_id_number } = data;

        const currentRes = await client.query('SELECT * FROM employees WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) throw new Error('Employee not found');
        const current = currentRes.rows[0];

        const result = await client.query(
            `UPDATE employees SET 
            full_name = COALESCE($1, full_name), 
            first_name = COALESCE($2, first_name), 
            last_name = COALESCE($3, last_name), 
            position = COALESCE($4, position), 
            age = COALESCE($5, age), 
            gender = COALESCE($6, gender), 
            phone_number = COALESCE($7, phone_number), 
            base_salary = COALESCE($8, base_salary), 
            status = COALESCE($9, status),
            role = COALESCE($10, role),
            govt_id_type = COALESCE($11, govt_id_type),
            govt_id_number = COALESCE($12, govt_id_number)
            WHERE id = $13 RETURNING *`,
            [full_name || null, first_name || null, last_name || null, position || null, age || null, gender || null, phone_number || null, base_salary || null, status || null, role || null, govt_id_type || null, govt_id_number || null, id]
        );
        const updated = result.rows[0];

        const fieldsToCheck = ['base_salary', 'position', 'role', 'status'];
        for (const field of fieldsToCheck) {
            if (data[field] !== undefined && data[field] != current[field]) {
                await client.query(
                    'INSERT INTO employee_history (employee_id, field_changed, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4, $5)',
                    [id, field, current[field], data[field], changedBy]
                );
            }
        }

        return updated;
    }

    /**
     * Delete Employee
     */
    async deleteEmployee(id) {
        const result = await db.query('DELETE FROM employees WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) throw new Error('Employee not found');
        return true;
    }

    /**
     * Get Employee History
     */
    async getEmployeeHistory(id) {
        const result = await db.query(
            'SELECT * FROM employee_history WHERE employee_id = $1 ORDER BY changed_at DESC',
            [id]
        );
        return result.rows;
    }

    /**
     * Get Monthly Payroll Data
     */
    async getMonthlyPayrollData(month, year) {
        const dataQuery = `
            SELECT e.id, e.full_name, e.position, e.base_salary,
                   COALESCE(sh.days_worked, 0) as days_worked,
                   COALESCE(sh.calculated_salary, e.base_salary) as calculated_salary,
                   COALESCE(sh.manual_adjustment, 0) as manual_adjustment,
                   sh.adjustment_reason,
                   COALESCE(sh.net_pay, e.base_salary) as net_pay
            FROM employees e
            LEFT JOIN salary_history sh ON e.id = sh.employee_id AND sh.month = $1 AND sh.year = $2
            WHERE e.status = 'active'
            ORDER BY e.full_name
        `;
        const result = await db.query(dataQuery, [month, year]);
        return result.rows;
    }

    /**
     * Get Employees with active advance balances
     */
    async getEmployeesWithAdvances() {
        const query = `
            SELECT e.*, 
            (COALESCE(SUM(CASE WHEN al.transaction_type = 'Advance' THEN al.amount ELSE 0 END), 0) - 
             COALESCE(SUM(CASE WHEN al.transaction_type = 'Repayment' THEN al.amount ELSE 0 END), 0)) as active_advances
            FROM employees e
            LEFT JOIN advance_ledger al ON e.id = al.employee_id
            GROUP BY e.id
            ORDER BY e.full_name
        `;
        const result = await db.query(query);
        return result.rows;
    }
}

module.exports = new EmployeeService();
