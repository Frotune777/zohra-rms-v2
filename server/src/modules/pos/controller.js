const PosService = require('./service');

exports.getMenu = async (req, res) => {
    try {
        const result = await PosService.getMenu();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addMenuItem = async (req, res) => {
    const { name, price, category } = req.body;
    if (!name || !price || !category) {
        return res.status(400).json({ error: 'Name, price, and category are required' });
    }
    if (parseFloat(price) <= 0) {
        return res.status(400).json({ error: 'Price must be greater than 0' });
    }

    try {
        const result = await PosService.addMenuItem(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteMenuItem = async (req, res) => {
    const { id } = req.params;
    try {
        await PosService.deleteMenuItem(id);
        res.json({ success: true, message: 'Menu item deleted successfully' });
    } catch (err) {
        if (err.message === 'Menu item not found') {
            return res.status(404).json({ error: 'Menu item not found' });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.createOrder = async (req, res) => {
    try {
        // Pass userId from auth middleware
        const userId = req.user ? req.user.id : null;
        const result = await PosService.createOrder(req.body, userId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
