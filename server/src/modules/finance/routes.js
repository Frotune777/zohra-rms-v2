const express = require('express');
const router = express.Router();
const financeController = require('./controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

router.get('/pnl', verifyToken, checkRole(['manager', 'owner']), financeController.getPnL);
router.get('/transactions', verifyToken, checkRole(['manager', 'owner']), financeController.getTransactions);
router.post('/revenue', verifyToken, checkRole(['manager', 'owner']), financeController.addRevenue);
router.post('/expense', verifyToken, checkRole(['manager', 'owner']), financeController.addExpense);
router.delete('/transaction/:id', verifyToken, checkRole(['owner']), financeController.deleteTransaction);
router.get('/daily-summary', verifyToken, checkRole(['manager', 'owner']), financeController.getDailySummary);
router.post('/payment', verifyToken, checkRole(['manager', 'owner']), financeController.recordPayment);

module.exports = router;
