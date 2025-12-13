const express = require('express');
const router = express.Router();
const posController = require('./controller');
const { verifyToken, requirePermission } = require('../../middleware/auth');
const { PERMISSIONS } = require('../../config/permissions');

router.get('/menu', verifyToken, requirePermission(PERMISSIONS.POS_ACCESS), posController.getMenu);
router.post('/menu', verifyToken, requirePermission(PERMISSIONS.POS_MANAGE_MENU), posController.addMenuItem);
router.delete('/menu/:id', verifyToken, requirePermission(PERMISSIONS.POS_MANAGE_MENU), posController.deleteMenuItem);
router.post('/orders', verifyToken, requirePermission(PERMISSIONS.POS_ACCESS), posController.createOrder);

module.exports = router;
