const express = require('express');
const router = express.Router();
const inventoryController = require('./controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

// General Inventory
router.get('/', verifyToken, inventoryController.getInventory);
router.post('/', verifyToken, checkRole(['manager', 'owner']), inventoryController.addInventory);
router.put('/:id', verifyToken, checkRole(['manager', 'owner']), inventoryController.updateInventory);
router.delete('/:id', verifyToken, checkRole(['owner']), inventoryController.deleteInventory);

// Daily Rates (Chicken Tracker)
router.get('/rates', verifyToken, inventoryController.getDailyRates);
router.post('/rates', verifyToken, checkRole(['manager', 'owner']), inventoryController.saveDailyRates);
router.get('/rates/status', verifyToken, inventoryController.getRateStatus);

// Suppliers
router.get('/suppliers', verifyToken, inventoryController.getSuppliers);
router.post('/suppliers', verifyToken, checkRole(['manager', 'owner']), inventoryController.createSupplier);

// Markup Rules
router.get('/markups', verifyToken, inventoryController.getMarkupRules);
router.post('/markups', verifyToken, checkRole(['manager', 'owner']), inventoryController.saveMarkupRule);
router.put('/markups/:id', verifyToken, checkRole(['manager', 'owner']), inventoryController.updateMarkupRule);
router.delete('/markups/:id', verifyToken, checkRole(['manager', 'owner']), inventoryController.deleteMarkupRule);

// Bill Entries
router.get('/bills', verifyToken, inventoryController.getBillEntries);
router.post('/bills', verifyToken, checkRole(['manager', 'owner']), inventoryController.createBillEntry);
router.get('/bills/summary', verifyToken, inventoryController.getBillSummary);

// Ledger
router.get('/ledger', verifyToken, inventoryController.getVendorLedger);

// Purchase Orders
const poController = require('./po.controller');
router.get('/po', verifyToken, checkRole(['manager', 'owner']), poController.getPurchaseOrders);
router.post('/po', verifyToken, checkRole(['manager', 'owner']), poController.createPurchaseOrder);
router.put('/po/:id/status', verifyToken, checkRole(['manager', 'owner']), poController.updatePOStatus);

module.exports = router;
