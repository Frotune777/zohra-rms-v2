const express = require('express');
const router = express.Router();
const dashboardController = require('./controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

router.get('/stats', verifyToken, dashboardController.getDashboardStats);

module.exports = router;
