const express = require('express');
const router = express.Router();
const controller = require('./controller');

// ==================== FINANCIAL REPORTS ====================
router.get('/financial/overview', controller.getFinancialOverview);
router.get('/financial/expense-breakdown', controller.getExpenseBreakdown);
router.get('/financial/revenue-trends', controller.getRevenueTrends);
router.get('/financial/balance-sheet', controller.getBalanceSheet);

// ==================== HR & PAYROLL REPORTS ====================
router.get('/hr/payroll-summary', controller.getPayrollSummary);
router.get('/hr/advances', controller.getAdvanceTracking);
router.get('/hr/attendance', controller.getAttendanceAnalytics);

// ==================== OPERATIONS REPORTS ====================
router.get('/operations/chicken-analytics', controller.getChickenAnalytics);
router.get('/operations/vendor-performance', controller.getVendorPerformance);

// ==================== INVENTORY REPORTS ====================
router.get('/inventory/stock-status', controller.getStockStatus);
router.get('/inventory/wastage', controller.getWastageReport);

// ==================== DASHBOARD KPIs ====================
router.get('/dashboard/kpis', controller.getDashboardKPIs);

module.exports = router;
