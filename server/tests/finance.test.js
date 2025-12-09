const {
    getPnL,
    getTransactions,
    addRevenue,
    addExpense,
    deleteTransaction,
    getDailySummary,
    recordPayment,
} = require('../src/modules/finance/controller');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');

jest.mock('../src/config/db');

describe('Finance Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
    });

    describe('getPnL', () => {
        it('should return P&L for a specific month', async () => {
            req.query = { month: '12', year: '2024' };

            db.query
                .mockResolvedValueOnce(mockQueryResult([{ total: 100000 }])) // Revenue
                .mockResolvedValueOnce(mockQueryResult([{ total: 30000 }])); // Expenses

            await getPnL(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    month: 12,
                    year: 2024,
                    revenue: expect.any(Number),
                    expenses: expect.any(Number),
                    profit: expect.any(Number),
                })
            );
        });

        it('should use current month/year if not provided', async () => {
            req.query = {};

            db.query
                .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]));

            await getPnL(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    month: expect.any(Number),
                    year: expect.any(Number),
                })
            );
        });
    });

    describe('getTransactions', () => {
        it('should return all transactions', async () => {
            const transactions = [
                {
                    id: 1,
                    description: 'Sale',
                    amount: 1000,
                    type: 'revenue',
                    transaction_date: '2024-12-08',
                },
            ];
            db.query.mockResolvedValue(mockQueryResult(transactions));

            await getTransactions(req, res);

            expect(res.json).toHaveBeenCalledWith(transactions);
        });

        it('should filter transactions by date range', async () => {
            req.query = {
                startDate: '2024-12-01',
                endDate: '2024-12-08',
            };
            db.query.mockResolvedValue(mockQueryResult([]));

            await getTransactions(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE'),
                expect.any(Array)
            );
        });
    });

    describe('addRevenue', () => {
        it('should add a revenue transaction', async () => {
            req.body = {
                amount: 5000,
                description: 'Product sale',
                category: 'Sales',
            };

            db.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // INSERT journal entry
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT ledger line 1
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT ledger line 2
                .mockResolvedValueOnce({}); // COMMIT

            await addRevenue(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should return 400 if amount is missing', async () => {
            req.body = { description: 'Test' };

            await addRevenue(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should handle database errors', async () => {
            req.body = { amount: 1000, description: 'Test' };

            db.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockRejectedValueOnce(new Error('Database error'));

            await addRevenue(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('addExpense', () => {
        it('should add an expense transaction', async () => {
            req.body = {
                amount: 2000,
                description: 'Utility bill',
                category: 'Utilities',
            };

            db.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // INSERT journal entry
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT ledger line 1
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT ledger line 2
                .mockResolvedValueOnce({}); // COMMIT

            await addExpense(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should return 400 if amount is missing', async () => {
            req.body = { description: 'Test' };

            await addExpense(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should validate amount is positive', async () => {
            req.body = { amount: -1000, description: 'Test' };

            await addExpense(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('deleteTransaction', () => {
        it('should delete a transaction', async () => {
            req.params = { id: '1' };

            db.query.mockResolvedValue(mockQueryResult([{ id: 1 }], 1));

            await deleteTransaction(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should return 404 if transaction not found', async () => {
            req.params = { id: '999' };
            db.query.mockResolvedValue(mockQueryResult([], 0));

            await deleteTransaction(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('getDailySummary', () => {
        it('should return daily summary for a specific date', async () => {
            req.query = { date: '2024-12-08' };

            db.query
                .mockResolvedValueOnce(mockQueryResult([{ total: 50000 }])) // Sales
                .mockResolvedValueOnce(mockQueryResult([{ total: 10000 }])) // Expenses
                .mockResolvedValueOnce(mockQueryResult([{ total: 15000 }])) // Vendor payments
                .mockResolvedValueOnce(mockQueryResult([{ total: 5000 }])); // Salary advances

            await getDailySummary(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    date: '2024-12-08',
                    sales: expect.any(Number),
                    expenses: expect.any(Number),
                    vendor_payments: expect.any(Number),
                    salary_advances: expect.any(Number),
                    net_cash_flow: expect.any(Number),
                })
            );
        });

        it('should return 400 if date is not provided', async () => {
            req.query = {};

            await getDailySummary(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Date is required' })
            );
        });
    });

    describe('recordPayment', () => {
        it('should record a vendor payment', async () => {
            req.body = {
                supplierId: 1,
                amount: 10000,
                paymentMode: 'Cash',
                details: 'Payment for chicken',
            };

            db.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // INSERT vendor_ledger
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // INSERT journal entry
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT ledger line 1
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT ledger line 2
                .mockResolvedValueOnce({}); // COMMIT

            await recordPayment(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should handle database errors', async () => {
            req.body = {
                supplierId: 1,
                amount: 10000,
                paymentMode: 'Cash',
            };

            db.query
                .mockResolvedValueOnce({})
                .mockRejectedValueOnce(new Error('Database error'));

            await recordPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
