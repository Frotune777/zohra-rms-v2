const express = require('express');
const router = express.Router();
const inventoryController = require('./controller');
const { verifyToken, requirePermission } = require('../../middleware/auth');
const { PERMISSIONS } = require('../../config/permissions');

// General Inventory
router.get('/', verifyToken, requirePermission(PERMISSIONS.INVENTORY_READ), inventoryController.getInventory);
router.post('/', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), inventoryController.addInventory);
router.put('/:id', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), inventoryController.updateInventory);
router.delete('/:id', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), inventoryController.deleteInventory);

// Daily Rates (Chicken Tracker)
router.get('/rates', verifyToken, requirePermission(PERMISSIONS.INVENTORY_READ), inventoryController.getDailyRates);
router.post('/rates', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), inventoryController.saveDailyRates);
router.get('/rates/status', verifyToken, requirePermission(PERMISSIONS.INVENTORY_READ), inventoryController.getRateStatus);
router.get('/rates/calendar', verifyToken, requirePermission(PERMISSIONS.INVENTORY_READ), inventoryController.getAllRatesCalendar);

// Suppliers
router.get('/suppliers', verifyToken, requirePermission(PERMISSIONS.INVENTORY_READ), inventoryController.getSuppliers);
router.post('/suppliers', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), inventoryController.createSupplier);
router.put('/suppliers/:id', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), inventoryController.updateSupplier);

// Markup Rules
router.get('/markups', verifyToken, requirePermission(PERMISSIONS.INVENTORY_READ), inventoryController.getMarkupRules);
router.post('/markups', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), inventoryController.saveMarkupRule);
router.put('/markups/:id', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), inventoryController.updateMarkupRule);
router.delete('/markups/:id', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), inventoryController.deleteMarkupRule);

// Bill Entries
router.get('/bills', verifyToken, requirePermission(PERMISSIONS.INVENTORY_READ), inventoryController.getBillEntries);
router.post('/bills', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), inventoryController.createBillEntry);
router.get('/bills/summary', verifyToken, requirePermission(PERMISSIONS.INVENTORY_READ), inventoryController.getBillSummary);

// Ledger
router.get('/ledger', verifyToken, requirePermission(PERMISSIONS.INVENTORY_READ), inventoryController.getVendorLedger);

// Purchase Orders
const poController = require('./po.controller');
router.get('/po', verifyToken, requirePermission(PERMISSIONS.INVENTORY_READ), poController.getPurchaseOrders);
router.post('/po', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), poController.createPurchaseOrder);
router.put('/po/:id/status', verifyToken, requirePermission(PERMISSIONS.INVENTORY_WRITE), poController.updatePOStatus);

module.exports = router;
