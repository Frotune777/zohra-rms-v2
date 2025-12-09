const express = require('express');
const router = express.Router();
const chickenController = require('../controllers/chicken.controller');
const { verifyToken, checkRole } = require('../middleware/auth');

// Daily Rates
router.get('/rates', verifyToken, chickenController.getDailyRates);
router.post('/rates', verifyToken, checkRole(['manager', 'owner']), chickenController.saveDailyRates);

// Suppliers
router.get('/suppliers', verifyToken, chickenController.getSuppliers);
router.post('/suppliers', verifyToken, checkRole(['manager', 'owner']), chickenController.createSupplier);

// Markup Rules
router.get('/markups', verifyToken, chickenController.getMarkupRules);
router.post('/markups', verifyToken, checkRole(['manager', 'owner']), chickenController.saveMarkupRule);

// Bill Entries
router.get('/bills', verifyToken, chickenController.getBillEntries);
router.post('/bills', verifyToken, checkRole(['manager', 'owner']), chickenController.createBillEntry);

// Ledger
router.get('/ledger', verifyToken, chickenController.getVendorLedger);

module.exports = router;
