const express = require('express');
const router = express.Router();
const paymentsController = require('./payments.controller');
const ledgerService = require('./ledger.service');
const { verifyToken } = require('../../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// Payment routes
router.post('/payments', paymentsController.processPayment);
router.get('/payments', paymentsController.getPayments);
router.get('/:id/outstanding', paymentsController.getOutstanding);
router.get('/:id/ledger', paymentsController.getVendorLedger);
router.get('/:id/details', paymentsController.getVendorDetails);

// Ledger calculation routes
router.get('/:id/running-balance', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await ledgerService.calculateRunningBalance(req.params.id, startDate, endDate);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/reports/category-aggregation', async (req, res) => {
    try {
        const { categoryId, startDate, endDate } = req.query;
        const result = await ledgerService.getCategoryAggregation(categoryId, startDate, endDate);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/reports/payment-history', async (req, res) => {
    try {
        const { vendorId, startDate, endDate, paymentMode } = req.query;
        const result = await ledgerService.getPaymentHistory(vendorId, startDate, endDate, paymentMode);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/reports/date-range', async (req, res) => {
    try {
        const { startDate, endDate, categoryId } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }
        const result = await ledgerService.getDateRangeReport(startDate, endDate, categoryId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/reports/aging', async (req, res) => {
    try {
        const result = await ledgerService.getAgingReport();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Vendor list with outstanding
router.get('/outstanding', paymentsController.getVendorsWithOutstanding);

// Categories
router.get('/categories', paymentsController.getCategories);

module.exports = router;
