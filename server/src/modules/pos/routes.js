const express = require('express');
const router = express.Router();
const posController = require('./controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

router.get('/menu', verifyToken, posController.getMenu);
router.post('/menu', verifyToken, checkRole(['manager', 'owner']), posController.addMenuItem);
router.delete('/menu/:id', verifyToken, checkRole(['owner']), posController.deleteMenuItem);
router.post('/orders', verifyToken, posController.createOrder);

module.exports = router;
