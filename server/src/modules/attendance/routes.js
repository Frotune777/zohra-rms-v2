const express = require('express');
const router = express.Router();
const attendanceController = require('./controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

router.get('/', verifyToken, checkRole(['manager', 'owner']), attendanceController.getAttendance);
router.post('/bulk', verifyToken, checkRole(['manager', 'owner']), attendanceController.saveBulkAttendance);

module.exports = router;
