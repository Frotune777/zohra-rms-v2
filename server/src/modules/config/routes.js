const express = require('express');
const router = express.Router();
const configController = require('./controller');
const { verifyToken } = require('../../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// Get all categories with counts
router.get('/categories', configController.getAllCategories);

// Get options for a specific category
router.get('/:category', configController.getOptions);

// Add new option to a category
router.post('/:category', configController.addOption);

// Update an option
router.put('/:category/:id', configController.updateOption);

// Delete an option
router.delete('/:category/:id', configController.deleteOption);

// Toggle active status
router.patch('/:category/:id/toggle', configController.toggleActive);

// Reorder options within a category
router.post('/:category/reorder', configController.reorderOptions);

// Bulk import options
router.post('/:category/bulk-import', configController.bulkImport);

module.exports = router;
