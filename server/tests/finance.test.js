const {sqlMock}=require('./helpers/sql-mock');
const {
    getPnL,
    getTransactions,
    addRevenue,
    addExpense,
    deleteTransaction,
    getDailySummary,
    recordPayment,
    getYearlyPnL,
    getDailyBalance,
    closeDailyBalance,
    reopenDailyBalance,
    getPaymentModes
} = require('../src/modules/finance/controller');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');

jest.mock('../src/config/db');

// Helper to mock JournalService.createJournalEntry sequence on a client
const mockJournalEntrySequence = (client) => {
    client.query
        .mockResolvedValueOnce(mockQueryResult([{ code: 1000, name: 'Test' }])) // Account 1 check
        .mockResolvedValueOnce(mockQueryResult([{ code: 4000, name: 'Test' }])) // Account 2 check
        .mockResolvedValueOnce(mockQueryResult([{ status: 'Open' }])) // Period check
        .mockResolvedValueOnce(mockQueryResult([{ id: 101 }])) // Header insert
        .mockResolvedValueOnce({}) // Line 1
        .mockResolvedValueOnce({}); // Line 2
};

describe('Finance Module', () => {
    let req, res;

    beforeEach(async () => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
        db.query.mockReset().mockResolvedValue(mockQueryResult([]));
        if(db.pool) {
            const isolatedClient=await db.pool.connect();
            if(isolatedClient.query !== db.query) isolatedClient.query.mockReset().mockResolvedValue(mockQueryResult([]));
        }
    });

    describe('getYearlyPnL', () => {
        it('should return yearly P&L data', async () => {
            req.query = { year: '2024' };
            const mockData = [
                { month: 1, revenue: 1000, expenses: 500 },
                { month: 2, revenue: 2000, expenses: 800 }
            ];
            db.query.mockResolvedValue(mockQueryResult(mockData));

            await getYearlyPnL(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        month: 1,
                        revenue: 1000,
                        expenses: 500,
                        profit: 500
                    }),
                    expect.objectContaining({
                        month: 2,
                        revenue: 2000,
                        expenses: 800,
                        profit: 1200
                    }),
                    expect.objectContaining({
                        month: 3,
                        revenue: 0,
                        expenses: 0,
                        profit: 0
                    })
                ])
            );
        });
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
                payment_mode: 'cash',
            };

            // PaymentModeService uses db.query
            db.query.mockResolvedValueOnce(mockQueryResult([{ account_code: 1000 }]));

            db._mockClient.query.mockResolvedValueOnce({}); // BEGIN
            mockJournalEntrySequence(db._mockClient);
            db._mockClient.query.mockResolvedValueOnce({}); // COMMIT

            sqlMock(db._mockClient.query,()=>undefined);

            await addRevenue(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should return 400 if amount is missing', async () => {
            req.body = { description: 'Test' };

            await addRevenue(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.stringContaining('Amount is required')
            }));
        });

        it('should handle database errors', async () => {
            req.body = { amount: 1000, description: 'Test' };

            db._mockClient.query
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
                category_id: 1,
                payment_mode: 'cash'
            };

            // Non-transaction queries
            db.query
                .mockResolvedValueOnce(mockQueryResult([{ is_closed: false }])) // ClosureService.isDayClosed
                .mockResolvedValueOnce(mockQueryResult([{ account_code: 1000 }])); // PaymentModeService.getAccountCode

            db._mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([{ account_code: 6300, name: 'Utilities' }])) // Category account

            mockJournalEntrySequence(db._mockClient);

            db._mockClient.query
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT transactions (backward compat)
                .mockResolvedValueOnce({}); // COMMIT

            sqlMock(db._mockClient.query,(sql)=>{
                if(sql.includes('FROM transaction_categories'))return mockQueryResult([{account_code:6300,name:'Utilities'}]);
                if(sql.startsWith('INSERT INTO transactions'))return mockQueryResult([]);
            });

            await addExpense(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should return 400 if amount is missing', async () => {
            req.body = { description: 'Test' };

            await addExpense(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.stringContaining('Amount is required')
            }));
        });
    });

    describe('deleteTransaction', () => {
        it('rejects generic deletion of a source-linked journal',async()=>{
            req.params={id:'source'};db.query.mockResolvedValue(mockQueryResult([{id:'source',reference_type:'SalaryPayment'}]));
            await deleteTransaction(req,res);expect(res.status).toHaveBeenCalledWith(409);
            expect(db._mockClient.query).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM ledger_lines'),expect.anything());
        });
    });

    // ... getDailySummary (reads via FinancialCalculator, usually db.query) ...

    describe('recordPayment', () => {
        it('should record a vendor payment', async () => {
            req.body = {
                supplierId: 1,
                amount: 10000,
                paymentMode: 'Cash',
                details: 'Payment for chicken',
            };

            req.user={id:1,full_name:'Owner'};
            sqlMock(db._mockClient.query,(sql,p)=>{
                if(sql.includes('FROM suppliers'))return mockQueryResult([{id:1,name:'Supplier',ledger_account_code:2000}]);
                if(sql.includes('FROM vendor_outstanding'))return mockQueryResult([{outstanding_balance:10000}]);
                if(sql.startsWith('INSERT INTO vendor_payments'))return mockQueryResult([{id:1,amount:p[1]}]);
                if(sql.startsWith('INSERT INTO vendor_ledger')||sql.startsWith('UPDATE vendor_payments'))return mockQueryResult([]);
            });

            await recordPayment(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });
    });

    describe('Account Closure & Balance', () => {
        it('should get daily balance summary', async () => {
            req.params = { date: '2024-12-18' };
            db.query.mockResolvedValue(mockQueryResult([
                {
                    opening_balance: 5000,
                    net_transactions: 1000,
                    closing_balance: 6000,
                    status: 'Open'
                }
            ]));

            sqlMock(db.query,(sql)=>{
                if(sql.startsWith('UPDATE daily_balances'))return mockQueryResult([]);
                if(sql.includes('SUM(ll.debit)'))return mockQueryResult([{total_debit:1000,total_credit:0}]);
                if(sql.includes('FROM ledger_lines l JOIN journal_entries j'))return mockQueryResult([{amount:0}]);
                if(sql.includes('FROM daily_balances'))return mockQueryResult([{id:1,account_code:1000,opening_balance:5000,actual_closing_balance:null,closing_balance:6000,status:'Open'}]);
            });

            await getDailyBalance(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                closing_balance: 6000
            }));
        });

        it('should close daily balance', async () => {
            req.body = {
                date: '2024-12-18',
                type: 'Counter',
                actualClosingBalance: 5950
            };
            req.user = { id: 1 };

            db._mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([{ id: 1, closing_balance: 6000, status: 'Open' }])); // Get record

            mockJournalEntrySequence(db._mockClient);

            db._mockClient.query
                .mockResolvedValueOnce({}) // Update status
                .mockResolvedValueOnce({}) // Upsert next day
                .mockResolvedValueOnce({}); // COMMIT

            sqlMock(db._mockClient.query,(sql)=>{
                if(sql.includes('account_code = ANY'))return mockQueryResult([]);
                if(sql.includes('SUM(ll.debit)'))return mockQueryResult([{total_debit:1000,total_credit:0}]);
                if(sql.includes('FROM ledger_lines l JOIN journal_entries j'))return mockQueryResult([{amount:0}]);
                if(sql.startsWith('SELECT') && sql.includes('FROM daily_balances'))return mockQueryResult([{id:1,account_code:1000,opening_balance:5000,closing_balance:6000,status:'Open'}]);
                if(sql.startsWith('UPDATE daily_balances') || sql.startsWith('INSERT INTO daily_balances'))return mockQueryResult([]);
            });

            await closeDailyBalance(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                variance: -50
            }));
        });
    });

    describe('Configuration', () => {
        it('should get all payment modes', async () => {
            const mockModes = [{ id: 1, name: 'cash', display_name: 'Cash' }];
            db.query.mockResolvedValue(mockQueryResult(mockModes));

            await getPaymentModes(req, res);

            expect(res.json).toHaveBeenCalledWith(mockModes);
        });
    });
});
