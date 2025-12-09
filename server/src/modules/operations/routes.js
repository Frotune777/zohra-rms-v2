const express = require('express');
const router = express.Router();
const kdsController = require('./kds.controller');
const wastageController = require('./wastage.controller');
const { verifyToken, checkRole } = require('../../middleware/auth');

// KDS
router.get('/kds/tickets', verifyToken, kdsController.getTickets);
router.post('/kds/tickets', verifyToken, kdsController.createTicket); // POS calls this
router.put('/kds/tickets/:id', verifyToken, kdsController.updateTicketStatus);

// Wastage
router.get('/wastage', verifyToken, checkRole(['manager', 'owner']), wastageController.getWastageLogs);
router.post('/wastage', verifyToken, checkRole(['manager', 'owner']), wastageController.logWastage);

module.exports = router;
