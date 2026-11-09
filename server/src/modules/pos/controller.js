const PosService = require('./service');
const { statusFor } = require('../../utils/domain');

exports.getTables = async (req, res) => {
    try { res.json(await PosService.getTables()); }
    catch (err) { res.status(statusFor(err)).json({ error: err.message }); }
};

exports.getMenu = async (req, res) => {
    try {
        const result = await PosService.getMenu();
        res.json(result);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
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
        res.status(statusFor(err)).json({ error: err.message });
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
        res.status(statusFor(err)).json({ error: err.message });
    }
};

exports.createOrder = async (req, res) => {
    try {
        // Pass userId from auth middleware
        const userId = req.user ? req.user.id : null;
        const result = await PosService.createOrder(req.body, userId, req.headers['idempotency-key']);
        res.json(result);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};

exports.updateMenuItem = async (req,res) => {
    try { res.json(await PosService.updateMenuItem(req.params.id,req.body)); }
    catch (err) { res.status(statusFor(err)).json({error:err.message}); }
};

exports.listOrders=async(req,res)=>{try{res.json(await PosService.listOrders());}catch(e){res.status(statusFor(e)).json({error:e.message});}};
exports.settleOrder=async(req,res)=>{try{res.json(await PosService.settleOrder(req.params.id,req.body,req.user.id,req.headers['idempotency-key']));}catch(e){res.status(statusFor(e)).json({error:e.message});}};
