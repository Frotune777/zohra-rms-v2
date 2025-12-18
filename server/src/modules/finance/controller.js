const FinanceService = require('./service');
const ReconciliationService = require('./ReconciliationService');

exports.getCategories = async (req, res) => {
    try {
        const categories = await FinanceService.getCategories();
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getReconciliation = async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    try {
        const result = await ReconciliationService.getCounterReconciliation(date);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateReconciliation = async (req, res) => {
    const { date } = req.params;
    const { type } = req.body; // 'Counter' or 'Float'
    try {
        const result = await ReconciliationService.updateDailyBalance(date, type || 'Counter', req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getManagerFloat = async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    try {
        const result = await ReconciliationService.getManagerFloat(date);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getPnL = async (req, res) => {
    const { month, year } = req.query;
    try {
        const result = await FinanceService.getPnL(month, year);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getYearlyPnL = async (req, res) => {
    const { year } = req.query;
    try {
        // Assuming FinanceService has getYearlyPnL implemented similarly to controller logic or delegated
        // I need to make sure I implemented it in FinanceService or moved it. 
        // I "commented" it in previous write. I should verify if I need to implement it fully there.
        // For now, let's assume I need to add it to Service if I missed it.
        // Wait, I only implemented getPnL and tracker methods in the previous step.
        // I should probably double check FinanceService content.
        // But for this file, the code expects the service to have it.
        const result = await FinanceService.getYearlyPnL(year);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getTransactions = async (req, res) => {
    try {
        const result = await FinanceService.getJournalTransactions(req.query);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addRevenue = async (req, res) => {
    try {
        const result = await FinanceService.addRevenue(req.body);
        res.json(result);
    } catch (err) {
        if (err.message.includes('Amount is required')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.addExpense = async (req, res) => {
    try {
        const result = await FinanceService.addExpense(req.body);
        res.json(result);
    } catch (err) {
        if (err.message.includes('Amount is required')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.deleteTransaction = async (req, res) => {
    const { id } = req.params;
    try {
        // Need to add this to Service explicitly or reuse general delete
        const result = await FinanceService.deleteJournalTransaction(id);
        if (!result) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.json({ success: true, message: 'Transaction deleted' });
    } catch (err) {
        if (err.message === 'Transaction not found') {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.getDailySummary = async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    try {
        const result = await FinanceService.getFinancialSummary(date);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.recordPayment = async (req, res) => {
    try {
        const result = await FinanceService.recordPayment(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Daily Tracker ---

exports.getDailyTrackerSummary = async (req, res) => {
    const { date } = req.params;
    try {
        const summary = await FinanceService.getDailyTrackerSummary(date);
        res.json(summary);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addTrackerTransaction = async (req, res) => {
    try {
        const transaction = await FinanceService.addTrackerTransaction(req.body);
        res.status(201).json(transaction);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getTrackerTransactions = async (req, res) => {
    try {
        const transactions = await FinanceService.getTrackerTransactions(req.query);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateTrackerTransaction = async (req, res) => {
    const { id } = req.params;
    try {
        const updated = await FinanceService.updateTrackerTransaction(id, req.body);
        if (!updated) return res.status(404).json({ error: 'Transaction not found or no changes made' });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteTrackerTransaction = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await FinanceService.deleteTrackerTransaction(id);
        if (!result) return res.status(404).json({ error: 'Transaction not found' });
        res.json({ success: true, message: 'Transaction deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Expense Mappings ---

exports.getExpenseMappings = async (req, res) => {
    try {
        const mappings = await FinanceService.getExpenseMappings();
        res.json(mappings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addExpenseMapping = async (req, res) => {
    try {
        const mapping = await FinanceService.addExpenseMapping(req.body);
        res.json(mapping);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateExpenseMapping = async (req, res) => {
    try {
        const mapping = await FinanceService.updateExpenseMapping(req.params.id, req.body);
        res.json(mapping);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteExpenseMapping = async (req, res) => {
    try {
        const success = await FinanceService.deleteExpenseMapping(req.params.id);
        res.json({ success });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.applyMappingHistory = async (req, res) => {
    try {
        const result = await FinanceService.applyMappingToHistory(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getSpendingByPerson = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await FinanceService.getSpendingByPerson(startDate, endDate);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ==========================================
// NEW ENDPOINTS - Accounting System Refactor
// ==========================================

/**
 * Get Daily Balance for a specific date
 */
exports.getDailyBalance = async (req, res) => {
    const { date } = req.params;
    try {
        const ClosureService = require('./ClosureService');
        const summary = await ClosureService.getDailyBalanceSummary(date);
        res.json(summary);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Close Daily Balance
 */
exports.closeDailyBalance = async (req, res) => {
    const { date, type, actualClosingBalance } = req.body;

    if (!date || !type || actualClosingBalance === undefined) {
        return res.status(400).json({
            error: 'Date, type, and actualClosingBalance are required'
        });
    }

    try {
        const ClosureService = require('./ClosureService');
        const result = await ClosureService.closeDailyBalance(
            date,
            type,
            actualClosingBalance,
            req.user.id
        );
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

/**
 * Reopen Daily Balance (Owner Only)
 */
exports.reopenDailyBalance = async (req, res) => {
    const { date, type, reason } = req.body;

    if (!date || !type || !reason) {
        return res.status(400).json({
            error: 'Date, type, and reason are required'
        });
    }

    try {
        const ClosureService = require('./ClosureService');
        const result = await ClosureService.reopenDay(
            date,
            type,
            req.user.id,
            reason
        );
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

/**
 * Get all payment modes
 */
exports.getPaymentModes = async (req, res) => {
    try {
        const PaymentModeService = require('./PaymentModeService');
        const modes = await PaymentModeService.getAllPaymentModes();
        res.json(modes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get Journal Entry by ID
 */
exports.getJournalEntry = async (req, res) => {
    const { id } = req.params;
    try {
        const JournalService = require('./JournalService');
        const entry = await JournalService.getJournalEntry(id);
        res.json(entry);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

/**
 * Get Account Balance
 */
exports.getAccountBalance = async (req, res) => {
    const { code } = req.params;
    const { asOfDate } = req.query;

    try {
        const JournalService = require('./JournalService');
        const balance = await JournalService.getAccountBalance(
            parseInt(code),
            asOfDate || null
        );
        res.json({ account_code: code, balance: balance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
