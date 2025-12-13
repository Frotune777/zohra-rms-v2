const ReconciliationService = require('../src/modules/finance/ReconciliationService');
const TransactionService = require('../src/modules/finance/TransactionService');
const db = require('../src/config/db');

// Mock dependencies
jest.mock('../src/config/db');
// We need to mock TransactionService methods that ReconciliationService calls
jest.mock('../src/modules/finance/TransactionService');

describe('ReconciliationService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getCounterReconciliation', () => {
        it('should calculate theoretical closing balance correctly', async () => {
            const date = '2023-10-27';

            // Mock getDailyBalance (Opening)
            // It calls db.query for select
            const mockBalance = {
                opening_balance: 1000.00,
                actual_closing_balance: null,
                status: 'Open'
            };

            // Mock the internal query in getDailyBalance
            db.query.mockResolvedValueOnce({ rows: [mockBalance] });

            // Mock TransactionService calls
            TransactionService.getSalesByMethod.mockResolvedValue(5000); // Inflow
            TransactionService.getExpensesByMethod.mockResolvedValue(2000); // Outflow

            // Mock Transfer Out query
            // The service calls db.query again for transfer out
            db.query.mockResolvedValueOnce({ rows: [{ total: 500 }] }); // Transfer Out

            const result = await ReconciliationService.getCounterReconciliation(date);

            // Calculation: 1000 + 5000 - 2000 - 500 = 3500
            expect(result.theoretical_closing).toBe(3500);
            expect(result.cash_inflow).toBe(5000);
            expect(result.cash_outflow).toBe(2000);
            expect(result.transfer_out).toBe(500);
        });

        it('should handle missing data gracefully', async () => {
            const date = '2023-10-27';

            // Mock getDailyBalance (New Entry)
            db.query.mockResolvedValueOnce({ rows: [] }); // Check exists -> Empty
            db.query.mockResolvedValueOnce({ rows: [{ actual_closing_balance: 500 }] }); // Get prev -> 500
            db.query.mockResolvedValueOnce({ rows: [{ opening_balance: 500 }] }); // Insert -> Return new

            TransactionService.getSalesByMethod.mockResolvedValue(0);
            TransactionService.getExpensesByMethod.mockResolvedValue(0);

            // Mock Transfer Out
            db.query.mockResolvedValueOnce({ rows: [{ total: 0 }] });

            const result = await ReconciliationService.getCounterReconciliation(date);

            expect(result.opening_balance).toBe(500);
            expect(result.theoretical_closing).toBe(500); // 500 + 0 - 0 - 0
        });
    });

    describe('getManagerFloat', () => {
        it('should calculate manager float correctly', async () => {
            const date = '2023-10-27';

            // Mock getDailyBalance (Opening Float)
            const mockBalance = { opening_balance: 2000.00 };
            db.query.mockResolvedValueOnce({ rows: [mockBalance] });

            // Mock Replenishment Query
            db.query.mockResolvedValueOnce({ rows: [{ total: 1000 }] });

            // Mock Float Expenses Query
            db.query.mockResolvedValueOnce({ rows: [{ total: 300 }] });

            const result = await ReconciliationService.getManagerFloat(date);

            // Calculation: 2000 + 1000 - 300 = 2700
            expect(result.current_float).toBe(2700);
            expect(result.replenishment).toBe(1000);
            expect(result.float_expenses).toBe(300);
        });
    });
});
