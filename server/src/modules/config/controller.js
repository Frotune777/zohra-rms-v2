const ConfigService = require('./service');

// Get all options for a category
exports.getOptions = async (req, res) => {
    const { category } = req.params;
    try {
        const options = await ConfigService.getOptions(category);
        res.json(options);
    } catch (err) {
        console.error('getOptions error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Get all categories
exports.getAllCategories = async (req, res) => {
    try {
        const categories = await ConfigService.getAllCategories();
        res.json(categories);
    } catch (err) {
        console.error('getAllCategories error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Add new option
exports.addOption = async (req, res) => {
    const { category } = req.params;
    try {
        const userId = req.user?.id || null;
        const option = await ConfigService.addOption({ ...req.body, category }, userId);
        res.status(201).json(option);
    } catch (err) {
        console.error('addOption error:', err);
        if (err.code === '23505') { // Unique constraint violation
            return res.status(409).json({ error: 'Option with this value already exists' });
        }
        res.status(500).json({ error: err.message });
    }
};

// Update option
exports.updateOption = async (req, res) => {
    const { id } = req.params;
    try {
        const userId = req.user?.id || null;
        const option = await ConfigService.updateOption(id, req.body, userId);
        res.json(option);
    } catch (err) {
        console.error('updateOption error:', err);
        if (err.message === 'Configuration option not found') {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
};

// Delete option
exports.deleteOption = async (req, res) => {
    const { id } = req.params;
    try {
        const option = await ConfigService.deleteOption(id);
        res.json({ message: 'Option deleted successfully', option });
    } catch (err) {
        console.error('deleteOption error:', err);
        if (err.message === 'Configuration option not found') {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
};

// Toggle active status
exports.toggleActive = async (req, res) => {
    const { id } = req.params;
    try {
        const option = await ConfigService.toggleActive(id);
        res.json(option);
    } catch (err) {
        console.error('toggleActive error:', err);
        if (err.message === 'Configuration option not found') {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
};

// Reorder options
exports.reorderOptions = async (req, res) => {
    const { category } = req.params;
    const { orderedIds } = req.body;
    try {
        const result = await ConfigService.reorderOptions(category, orderedIds);
        res.json(result);
    } catch (err) {
        console.error('reorderOptions error:', err);
        res.status(500).json({ error: err.message });
    }
};

// Bulk import
exports.bulkImport = async (req, res) => {
    const { category } = req.params;
    const { options } = req.body;
    try {
        const userId = req.user?.id || null;
        const results = await ConfigService.bulkImport(category, options, userId);
        res.json({ message: 'Options imported successfully', count: results.length, options: results });
    } catch (err) {
        console.error('bulkImport error:', err);
        res.status(500).json({ error: err.message });
    }
};
