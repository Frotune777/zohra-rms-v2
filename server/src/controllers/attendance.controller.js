const db = require('../config/db');

exports.getAttendance = async (req, res) => {
    const { date } = req.query;
    try {
        const result = await db.query(
            `SELECT a.*, e.full_name, e.employee_code, e.department, e.role
             FROM employees e
             LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = $1
             WHERE e.status = 'active'
             ORDER BY e.full_name`,
            [date]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveBulkAttendance = async (req, res) => {
    const { date, records } = req.body; // records: [{ employee_id, status }]

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
        res.json({ success: true, message: 'Attendance saved' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
