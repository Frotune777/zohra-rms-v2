const db = require('../../config/db');

class AttendanceService {
    async getAttendance(date) {
        const result = await db.query(
            `SELECT a.*, e.full_name, e.employee_code, e.department, e.role
             FROM employees e
             LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = $1
             WHERE e.status = 'active'
             ORDER BY e.full_name`,
            [date]
        );
        return result.rows;
    }

    async saveBulkAttendance(date, records) {
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            for (const record of records) {
                await client.query(
                    `INSERT INTO attendance (date, employee_id, status)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (date, employee_id) DO UPDATE
                     SET status = EXCLUDED.status`,
                    [date, record.employee_id, record.status]
                );
            }
            await client.query('COMMIT');
            return { success: true };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = new AttendanceService();
