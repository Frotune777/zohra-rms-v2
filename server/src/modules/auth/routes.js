const express = require('express');
const router = express.Router();
const authController = require('./controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

router.post('/login', authController.login);
router.post('/register', verifyToken, checkRole(['owner', 'manager']), authController.register);
router.get('/me', verifyToken, authController.getCurrentUser);
router.get('/users', verifyToken, authController.getUsers);

module.exports = router;
