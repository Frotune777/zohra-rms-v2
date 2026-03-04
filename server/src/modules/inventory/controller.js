const InventoryService = require('./service');

// --- Inventory Item Controllers ---

exports.getInventory = async (req, res) => {
    try {
        const items = await InventoryService.getAllItems();
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addInventory = async (req, res) => {
    const { name, stock_qty, unit, unit_cost } = req.body;
    if (!name || stock_qty === undefined || !unit || unit_cost === undefined) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const newItem = await InventoryService.addItem(req.body, req.user ? req.user.id : null);
        res.status(201).json(newItem);
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).json({ error: 'Item name already exists' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
};

exports.updateInventory = async (req, res) => {
    const { id } = req.params;
    const { name, stock_qty, unit, unit_cost } = req.body;
    if (!name || stock_qty === undefined || !unit || unit_cost === undefined) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const updatedItem = await InventoryService.updateItem(id, req.body, req.user ? req.user.id : null);
        res.json(updatedItem);
    } catch (err) {
        if (err.message === 'Item not found') {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.deleteInventory = async (req, res) => {
    const { id } = req.params;
    try {
        await InventoryService.deleteItem(id);
        res.json({ success: true, message: 'Item deleted successfully' });
    } catch (err) {
        if (err.message === 'Item not found') {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.status(500).json({ error: err.message });
    }
};

// --- Chicken/Supplier Controllers ---

exports.getDailyRates = async (req, res) => {
    const { date } = req.query;
    try {
        const result = await InventoryService.getDailyRates(date);
        res.json(result);
    } catch (err) {
        console.error('getDailyRates error:', err.message, err.stack);
        res.status(500).json({ error: err.message });
    }
};

exports.saveDailyRates = async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const result = await InventoryService.saveDailyRates(req.body, userId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getRateStatus = async (req, res) => {
    try {
        const result = await InventoryService.getRateStatus();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getAllRatesCalendar = async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    try {
        const result = await InventoryService.getAllRatesCalendar(startDate, endDate);
        console.log('Calendar Data:', JSON.stringify(result[0] || 'No Data'));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getSuppliers = async (req, res) => {
    try {
        const result = await InventoryService.getSuppliers();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createSupplier = async (req, res) => {
    try {
        const result = await InventoryService.createSupplier(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateSupplier = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await InventoryService.updateSupplier(id, req.body);
        res.json(result);
    } catch (err) {
        if (err.message === 'Supplier not found') {
            return res.status(404).json({ error: 'Supplier not found' });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.getMarkupRules = async (req, res) => {
    const { supplierId } = req.query;
    try {
        const result = await InventoryService.getMarkupRules(supplierId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveMarkupRule = async (req, res) => {
    try {
        const result = await InventoryService.saveMarkupRule(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateMarkupRule = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await InventoryService.updateMarkupRule(id, req.body);
        res.json(result);
    } catch (err) {
        console.error('updateMarkupRule error:', err.message, err.stack);
        if (err.message === 'Markup rule not found') {
            return res.status(404).json({ error: 'Markup rule not found' });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.deleteMarkupRule = async (req, res) => {
    const { id } = req.params;
    try {
        await InventoryService.deleteMarkupRule(id);
        res.json({ success: true, message: 'Markup rule deleted successfully' });
    } catch (err) {
        if (err.message === 'Markup rule not found') {
            return res.status(404).json({ error: 'Markup rule not found' });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.createBillEntry = async (req, res) => {
    try {
        const result = await InventoryService.createBillEntry(req.body, req.user ? req.user.id : null);
        res.json(result);
    } catch (err) {
        console.error('createBillEntry error:', err.message, err.stack);
        if (err.message === 'Daily rates not set for this date') {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.updateBillStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    try {
        const result = await InventoryService.updateBillStatus(id, status, req.user ? req.user.id : null);
        res.json(result);
    } catch (err) {
        if (err.message === 'Bill entry not found') {
            return res.status(404).json({ error: 'Bill entry not found' });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.getBillEntries = async (req, res) => {
    try {
        const result = await InventoryService.getBillEntries(req.query);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getBillSummary = async (req, res) => {
    try {
        const result = await InventoryService.getBillSummary(req.query);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getVendorLedger = async (req, res) => {
    const { supplierId } = req.query;
    try {
        const result = await InventoryService.getVendorLedger(supplierId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
