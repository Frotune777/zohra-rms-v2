const db = require('../../config/db');

class AttendanceService {
    /**
     * Get Attendance for Date
     */
    async getAttendance(date) {
        const result = await db.query(
            `SELECT a.*, e.full_name 
             FROM employees e
             LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = $1
             WHERE e.status = 'active'
             ORDER BY e.full_name`,
            [date]
        );
        return result.rows;
    }

    /**
     * Save Bulk Attendance
     */
    async saveBulkAttendance(date, records, client) {
        for (const record of records) {
            await client.query(
                `INSERT INTO attendance (date, employee_id, status)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (date, employee_id) DO UPDATE
                 SET status = EXCLUDED.status`,
                [date, record.employee_id, record.status]
            );
        }
        return true;
    }
}

module.exports = new AttendanceService();
