const db = require('../../config/db');

class AttendanceService {
    async getAttendance(date) {
        const result = await db.query(
            `SELECT a.*, e.full_name, e.employee_code, e.position, e.role
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

    async getCalendar(startDate, endDate) {
        const result = await db.query(
            `WITH dates AS (
                SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS date
            )
            SELECT 
                d.date::text,
                COUNT(a.employee_id) as filled_records,
                (SELECT COUNT(*) FROM employees WHERE status = 'active') as total_employees
            FROM dates d
            LEFT JOIN attendance a ON d.date = a.date
            GROUP BY d.date
            ORDER BY d.date`,
            [startDate, endDate]
        );

        return result.rows.map(row => {
            const filled = parseInt(row.filled_records);
            const total = parseInt(row.total_employees);
            let status = 'missing';
            if (filled > 0) status = filled >= total ? 'complete' : 'partial';

            return {
                date: row.date,
                filled_records: filled,
                total_employees: total,
                status
            };
        });
    }

    async getLastMarkedDates() {
        const result = await db.query(
            `SELECT DISTINCT ON (employee_id) 
                employee_id, 
                date as last_date
             FROM attendance
             ORDER BY employee_id, date DESC`
        );
        return result.rows;
    }
}

module.exports = new AttendanceService();
