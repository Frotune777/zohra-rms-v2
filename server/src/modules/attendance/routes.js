const express = require('express');
const router = express.Router();
const attendanceController = require('./controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

router.get('/', verifyToken, checkRole(['manager', 'owner']), attendanceController.getAttendance);
router.get('/last-dates', verifyToken, checkRole(['manager', 'owner']), attendanceController.getLastMarkedDates);
router.get('/calendar', verifyToken, checkRole(['manager', 'owner']), attendanceController.getCalendar);
router.post('/bulk', verifyToken, checkRole(['manager', 'owner']), attendanceController.saveBulkAttendance);

module.exports = router;
