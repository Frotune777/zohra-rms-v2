const AttendanceService = require('./service');

exports.getAttendance = async (req, res) => {
    const { date } = req.query;
    try {
        const result = await AttendanceService.getAttendance(date);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveBulkAttendance = async (req, res) => {
    const { date, records } = req.body; // records: [{ employee_id, status }]
    try {
        await AttendanceService.saveBulkAttendance(date, records);
        res.json({ success: true, message: 'Attendance saved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
