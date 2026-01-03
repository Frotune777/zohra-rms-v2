const express = require('express');
const router = express.Router();
const financeController = require('./controller');
const { verifyToken, requirePermission } = require('../../middleware/auth');
const { PERMISSIONS } = require('../../config/permissions');

router.get('/pnl', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getPnL);
router.get('/pnl/yearly', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getYearlyPnL);
router.get('/transactions', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getTransactions);
router.post('/revenue', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.addRevenue);
router.post('/expense', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.addExpense);
router.delete('/transaction/:id', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.deleteTransaction);
router.get('/daily-summary', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getDailySummary);
router.post('/payment', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.recordPayment);
router.get('/reports/spending-by-person', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getSpendingByPerson);

// Daily Tracker Routes
router.get('/daily-summary/:date', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getDailyTrackerSummary);
router.post('/tracker/transaction', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.addTrackerTransaction);
router.get('/tracker/transactions', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getTrackerTransactions);
router.put('/tracker/transaction/:id', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.updateTrackerTransaction);
router.delete('/tracker/transaction/:id', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.deleteTrackerTransaction);
router.get('/tracker/categories', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getCategories);

// Reconciliation Routes
router.get('/reconciliation', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getReconciliation);
router.post('/reconciliation/:date', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.updateReconciliation);
router.get('/reconciliation/float', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getManagerFloat);

// Expense Mappings
router.get('/mappings', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getExpenseMappings);
router.post('/mappings', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.addExpenseMapping);
router.put('/mappings/:id', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.updateExpenseMapping);
router.delete('/mappings/:id', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.deleteExpenseMapping);
router.post('/mappings/:id/apply', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.applyMappingHistory);

// ==========================================
// NEW ENDPOINTS - Accounting System Refactor
// ==========================================

// Daily Closure Endpoints
router.get('/daily-balance/:date', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getDailyBalance);
router.post('/daily-balance/close', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.closeDailyBalance);
router.post('/daily-balance/reopen', verifyToken, requirePermission(PERMISSIONS.ADMIN), financeController.reopenDailyBalance); // Owner only
router.post('/transfer/safe-to-user', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.transferSafeToUser);
router.post('/transfer/user-to-safe', verifyToken, requirePermission(PERMISSIONS.FINANCE_WRITE), financeController.transferUserToSafe);


// Payment Modes Configuration
router.get('/payment-modes', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getPaymentModes);

// Journal Entry Queries
router.get('/journal/:id', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getJournalEntry);
router.get('/account-balance/:code', verifyToken, requirePermission(PERMISSIONS.FINANCE_READ), financeController.getAccountBalance);

module.exports = router;

