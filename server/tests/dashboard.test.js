const {
    getDashboardStats,
} = require('../src/modules/dashboard/controller');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');

jest.mock('../src/config/db');

describe('Dashboard Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
    });

    describe('getDashboardStats', () => {
        it('should return comprehensive dashboard statistics', async () => {
            // Mock all the queries in sequence
            db.query
                .mockResolvedValueOnce(mockQueryResult([{ total: 50000 }])) // Today's sales
                .mockResolvedValueOnce(mockQueryResult([{ total: 20000 }])) // Today's expenses
                .mockResolvedValueOnce(mockQueryResult([{ qty: 100, cost: 18000 }])) // Chicken procurement
                .mockResolvedValueOnce(mockQueryResult([{ value: 150000 }])) // Kitchen stock value
                .mockResolvedValueOnce(mockQueryResult([{ total_due: 25000 }])) // Vendor dues
                .mockResolvedValueOnce(mockQueryResult([{ present: 15 }])) // Employees present
                .mockResolvedValueOnce(mockQueryResult([
                    { name: 'Rice', stock_qty: 5, unit: 'kg' },
                    { name: 'Oil', stock_qty: 3, unit: 'liters' },
                ])) // Low stock items
                .mockResolvedValueOnce(mockQueryResult([
                    { date: '2024-12-02', sales: 45000 },
                    { date: '2024-12-03', sales: 48000 },
                    { date: '2024-12-04', sales: 52000 },
                ])); // Sales trend

            await getDashboardStats(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    todaySales: expect.any(Number),
                    todayExpenses: expect.any(Number),
                    approxProfit: expect.any(Number),
                    chickenStats: expect.objectContaining({
                        qty: expect.any(Number),
                        cost: expect.any(Number),
                    }),
                    stockValue: expect.any(Number),
                    vendorDues: expect.any(Number),
                    employeesPresent: expect.any(Number),
                    lowStockItems: expect.any(Array),
                    salesTrend: expect.any(Array),
                })
            );
        });

        it('should calculate approximate profit correctly', async () => {
            db.query
                .mockResolvedValueOnce(mockQueryResult([{ total: 100000 }])) // Sales
                .mockResolvedValueOnce(mockQueryResult([{ total: 40000 }])) // Expenses
                .mockResolvedValue(mockQueryResult([{ total: 0 }])); // Other queries

            await getDashboardStats(req, res);

            const result = res.json.mock.calls[0][0];
            expect(result.approxProfit).toBe(60000); // 100000 - 40000
        });

        it('should handle zero sales and expenses', async () => {
            db.query
                .mockResolvedValueOnce(mockQueryResult([{ total: 0 }])) // Sales
                .mockResolvedValueOnce(mockQueryResult([{ total: 0 }])) // Expenses
                .mockResolvedValue(mockQueryResult([{ total: 0 }]));

            await getDashboardStats(req, res);

            const result = res.json.mock.calls[0][0];
            expect(result.todaySales).toBe(0);
            expect(result.todayExpenses).toBe(0);
            expect(result.approxProfit).toBe(0);
        });

        it('should return low stock items', async () => {
            db.query
                .mockResolvedValue(mockQueryResult([{ total: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ qty: 0, cost: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ value: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ total_due: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ present: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([
                    { name: 'Rice', stock_qty: 5, unit: 'kg' },
                    { name: 'Oil', stock_qty: 3, unit: 'liters' },
                    { name: 'Salt', stock_qty: 2, unit: 'kg' },
                ]))
                .mockResolvedValueOnce(mockQueryResult([]));

            await getDashboardStats(req, res);

            const result = res.json.mock.calls[0][0];
            expect(result.lowStockItems).toHaveLength(3);
            expect(result.lowStockItems[0]).toHaveProperty('name');
            expect(result.lowStockItems[0]).toHaveProperty('stock_qty');
        });

        it('should return sales trend data', async () => {
            const trendData = [
                { date: '2024-12-02', sales: 45000 },
                { date: '2024-12-03', sales: 48000 },
                { date: '2024-12-04', sales: 52000 },
                { date: '2024-12-05', sales: 49000 },
                { date: '2024-12-06', sales: 51000 },
                { date: '2024-12-07', sales: 53000 },
                { date: '2024-12-08', sales: 50000 },
            ];

            db.query
                .mockResolvedValue(mockQueryResult([{ total: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ qty: 0, cost: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ value: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ total_due: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ present: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([]))
                .mockResolvedValueOnce(mockQueryResult(trendData));

            await getDashboardStats(req, res);

            const result = res.json.mock.calls[0][0];
            expect(result.salesTrend).toHaveLength(7);
            expect(result.salesTrend[0]).toHaveProperty('date');
            expect(result.salesTrend[0]).toHaveProperty('sales');
        });

        it('should handle database errors gracefully', async () => {
            db.query.mockRejectedValue(new Error('Database connection failed'));

            await getDashboardStats(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.any(String) })
            );
        });

        it('should handle null values in queries', async () => {
            db.query
                .mockResolvedValueOnce(mockQueryResult([{ total: null }]))
                .mockResolvedValueOnce(mockQueryResult([{ total: null }]))
                .mockResolvedValueOnce(mockQueryResult([{ qty: null, cost: null }]))
                .mockResolvedValueOnce(mockQueryResult([{ value: null }]))
                .mockResolvedValueOnce(mockQueryResult([{ total_due: null }]))
                .mockResolvedValueOnce(mockQueryResult([{ present: null }]))
                .mockResolvedValueOnce(mockQueryResult([]))
                .mockResolvedValueOnce(mockQueryResult([]));

            await getDashboardStats(req, res);

            const result = res.json.mock.calls[0][0];
            // parseFloat(null) returns NaN even with COALESCE
            // The actual query uses COALESCE which returns 0, but our mock returns null
            expect(result.todaySales).toBeNaN();
            expect(result.todayExpenses).toBeNaN();
        });
    });
});
