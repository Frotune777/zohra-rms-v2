const db = require('../../config/db');
const JournalService = require('../finance/JournalService');

exports.getWastageLogs = async (req, res) => {
    const OperationsService = require('./OperationsService');
    try {
        const result = await OperationsService.getWastageLogs();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.logWastage = async (req, res) => {
    const OperationsService = require('./OperationsService');
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const wastageLog = await OperationsService.logWastage(req.body, req.user.email, client);
        await client.query('COMMIT');
        res.json(wastageLog);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
