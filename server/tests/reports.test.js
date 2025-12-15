const reportsController = require('../src/modules/reports/controller');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');

jest.mock('../src/config/db', () => {
    const mockQuery = jest.fn();
    return {
        query: mockQuery,
    };
});

describe('Reports Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
    });

    describe('Financial Reports', () => {
        describe('getFinancialOverview', () => {
            it('should return financial overview with revenue, expenses, and profit', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31' };

                const mockSummary = {
                    total_revenue: 100000,
                    total_expenses: 60000,
                    net_profit: 40000,
                };

                db.query
                    .mockResolvedValueOnce(mockQueryResult([mockSummary])) // Summary
                    .mockResolvedValueOnce(mockQueryResult([])) // Revenue trend
                    .mockResolvedValueOnce(mockQueryResult([])); // Expense trend

                await reportsController.getFinancialOverview(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        summary: mockSummary,
                        revenueTrend: expect.any(Array),
                        expenseTrend: expect.any(Array),
                    })
                );
            });

            it('should handle database errors', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31' };

                db.query.mockRejectedValue(new Error('Query failed'));

                await reportsController.getFinancialOverview(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
            });
        });

        describe('getExpenseBreakdown', () => {
            it('should return expense breakdown by category', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31' };

                const mockBreakdown = [
                    { category: 'Salaries', amount: 30000, transaction_count: 5 },
                    { category: 'Rent', amount: 20000, transaction_count: 1 },
                ];

                db.query.mockResolvedValue(mockQueryResult(mockBreakdown));

                await reportsController.getExpenseBreakdown(req, res);

                expect(res.json).toHaveBeenCalledWith(mockBreakdown);
            });
        });

        describe('getRevenueTrends', () => {
            it('should return revenue trends grouped by day', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31', groupBy: 'day' };

                const mockTrends = [
                    { period: '2024-12-01', revenue: 5000, transaction_count: 10 },
                    { period: '2024-12-02', revenue: 6000, transaction_count: 12 },
                ];

                db.query.mockResolvedValue(mockQueryResult(mockTrends));

                await reportsController.getRevenueTrends(req, res);

                expect(res.json).toHaveBeenCalledWith(mockTrends);
            });
        });

        describe('getBalanceSheet', () => {
            it('should return balance sheet with assets, liabilities, and equity', async () => {
                req.query = { date: '2024-12-31' };

                const mockRetainedEarnings = { net_profit: 50000 };
                const mockBalances = [
                    { code: 1000, name: 'Cash', type: 'Asset', total_debit: 100000, total_credit: 50000 },
                    { code: 2000, name: 'Accounts Payable', type: 'Liability', total_debit: 10000, total_credit: 30000 },
                ];

                db.query
                    .mockResolvedValueOnce(mockQueryResult([mockRetainedEarnings]))
                    .mockResolvedValueOnce(mockQueryResult(mockBalances));

                await reportsController.getBalanceSheet(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        assets: expect.any(Array),
                        liabilities: expect.any(Array),
                        equity: expect.any(Array),
                        summary: expect.any(Object),
                    })
                );
            });
        });
    });

    describe('HR & Payroll Reports', () => {
        describe('getPayrollSummary', () => {
            it('should return payroll summary for a specific month', async () => {
                req.query = { month: '12', year: '2024' };

                const mockSummary = {
                    employee_count: 10,
                    total_gross_salary: 300000,
                    total_advance_deductions: 20000,
                    total_net_pay: 280000,
                    avg_days_worked: 28,
                };

                db.query
                    .mockResolvedValueOnce(mockQueryResult([mockSummary]))
                    .mockResolvedValueOnce(mockQueryResult([]));

                await reportsController.getPayrollSummary(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        summary: mockSummary,
                        monthlyTrend: expect.any(Array),
                    })
                );
            });
        });

        describe('getAdvanceTracking', () => {
            it('should return advance tracking with employee details', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31' };

                const mockAdvances = [
                    {
                        employee_id: 1,
                        full_name: 'John Doe',
                        total_advances: 10000,
                        total_recovered: 5000,
                        outstanding_balance: 5000,
                    },
                ];

                const mockSummary = {
                    total_advances_given: 10000,
                    total_recovered: 5000,
                    employees_with_advances: 1,
                };

                db.query
                    .mockResolvedValueOnce(mockQueryResult(mockAdvances))
                    .mockResolvedValueOnce(mockQueryResult([mockSummary]));

                await reportsController.getAdvanceTracking(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        summary: mockSummary,
                        advances: mockAdvances,
                    })
                );
            });
        });

        describe('getAttendanceAnalytics', () => {
            it('should return attendance analytics with stats and trends', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31' };

                const mockStats = {
                    total_records: 300,
                    present_count: 270,
                    absent_count: 20,
                    half_day_count: 10,
                    attendance_rate: 90,
                };

                db.query
                    .mockResolvedValueOnce(mockQueryResult([mockStats]))
                    .mockResolvedValueOnce(mockQueryResult([]))
                    .mockResolvedValueOnce(mockQueryResult([]));

                await reportsController.getAttendanceAnalytics(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        stats: mockStats,
                        employeeStats: expect.any(Array),
                        trend: expect.any(Array),
                    })
                );
            });
        });
    });

    describe('Operations Reports', () => {
        describe('getChickenAnalytics', () => {
            it('should return chicken analytics with rates and bill summary', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31' };

                const mockRates = [
                    { date: '2024-12-01', tandoor_rate: 180, boiler_rate: 160, egg_rate: 6 },
                ];

                const mockBillSummary = {
                    total_bills: 50,
                    approved_bills: 45,
                    pending_bills: 5,
                    total_amount: 100000,
                    total_variance: 500,
                };

                db.query
                    .mockResolvedValueOnce(mockQueryResult(mockRates))
                    .mockResolvedValueOnce(mockQueryResult([mockBillSummary]))
                    .mockResolvedValueOnce(mockQueryResult([]));

                await reportsController.getChickenAnalytics(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        rates: mockRates,
                        billSummary: mockBillSummary,
                        itemSummary: expect.any(Array),
                    })
                );
            });
        });

        describe('getVendorPerformance', () => {
            it('should return vendor performance metrics', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31' };

                const mockVendors = [
                    {
                        id: 1,
                        name: 'ABC Suppliers',
                        total_bills: 20,
                        total_amount: 50000,
                        avg_variance: 100,
                    },
                ];

                db.query
                    .mockResolvedValueOnce(mockQueryResult(mockVendors))
                    .mockResolvedValueOnce(mockQueryResult([]));

                await reportsController.getVendorPerformance(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        vendorPerformance: mockVendors,
                        vendorLedger: expect.any(Array),
                    })
                );
            });
        });
    });

    describe('Inventory Reports', () => {
        describe('getStockStatus', () => {
            it('should return current stock status with summary', async () => {
                const mockStock = [
                    {
                        id: 1,
                        name: 'Tomatoes',
                        stock_qty: 50,
                        unit_cost: 100,
                        stock_value: 5000,
                        stock_level: 'high',
                    },
                ];

                const mockSummary = {
                    total_items: 10,
                    total_value: 50000,
                    low_stock_count: 2,
                    out_of_stock_count: 0,
                };

                db.query
                    .mockResolvedValueOnce(mockQueryResult(mockStock))
                    .mockResolvedValueOnce(mockQueryResult([mockSummary]));

                await reportsController.getStockStatus(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        summary: mockSummary,
                        items: mockStock,
                    })
                );
            });
        });

        describe('getWastageReport', () => {
            it('should return wastage report with summary and trends', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31' };

                const mockSummary = {
                    total_incidents: 10,
                    total_cost: 5000,
                    total_qty: 50,
                };

                db.query
                    .mockResolvedValueOnce(mockQueryResult([mockSummary]))
                    .mockResolvedValueOnce(mockQueryResult([]))
                    .mockResolvedValueOnce(mockQueryResult([]));

                await reportsController.getWastageReport(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        summary: mockSummary,
                        itemWastage: expect.any(Array),
                        trend: expect.any(Array),
                    })
                );
            });
        });
    });

    describe('Dashboard KPIs', () => {
        describe('getDashboardKPIs', () => {
            it('should return comprehensive dashboard KPIs', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31' };

                const mockFinancial = {
                    total_revenue: 100000,
                    total_expenses: 60000,
                    net_profit: 40000,
                };

                const mockHR = {
                    total_employees: 10,
                    total_salary_base: 300000,
                };

                const mockAdvances = {
                    outstanding_advances: 20000,
                };

                const mockInventory = {
                    total_items: 50,
                    inventory_value: 100000,
                    low_stock_items: 5,
                };

                const mockOperations = {
                    total_bills: 100,
                    pending_bills: 10,
                    total_variance: 1000,
                };

                db.query
                    .mockResolvedValueOnce(mockQueryResult([mockFinancial]))
                    .mockResolvedValueOnce(mockQueryResult([mockHR]))
                    .mockResolvedValueOnce(mockQueryResult([mockAdvances]))
                    .mockResolvedValueOnce(mockQueryResult([mockInventory]))
                    .mockResolvedValueOnce(mockQueryResult([mockOperations]));

                await reportsController.getDashboardKPIs(req, res);

                expect(res.json).toHaveBeenCalledWith(
                    expect.objectContaining({
                        financial: mockFinancial,
                        hr: mockHR,
                        advances: mockAdvances,
                        inventory: mockInventory,
                        operations: mockOperations,
                    })
                );
            });

            it('should handle database errors', async () => {
                req.query = { startDate: '2024-12-01', endDate: '2024-12-31' };

                db.query.mockRejectedValue(new Error('Database error'));

                await reportsController.getDashboardKPIs(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
            });
        });
    });
});
