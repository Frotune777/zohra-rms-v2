const express = require('express');
const router = express.Router();
const aiController = require('./controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

router.get('/forecast/:itemId', verifyToken, checkRole(['manager', 'owner']), aiController.getDemandForecast);
router.get('/suggested-orders', verifyToken, checkRole(['manager', 'owner']), aiController.getSuggestedPOs);

module.exports = router;
