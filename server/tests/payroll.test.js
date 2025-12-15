const payrollController = require('../src/modules/payroll/controller');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');

jest.mock('../src/config/db', () => {
    const mockQuery = jest.fn();
    const mockRelease = jest.fn();
    const mockClient = {
        query: mockQuery,
        release: mockRelease,
    };
    return {
        query: mockQuery,
        pool: {
            connect: jest.fn().mockResolvedValue(mockClient),
        },
    };
});

describe('Payroll Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
    });

    describe('runPayroll', () => {
        it('should run payroll for an employee with manual days worked', async () => {
            req.body = {
                employeeId: 1,
                month: 12,
                year: 2024,
                daysWorked: 30,
                manualAdjustment: 0,
            };

            const mockEmployee = {
                id: 1,
                full_name: 'John Doe',
                base_salary: 30000,
                status: 'active',
            };

            const mockAdvanceBalance = { outstanding_balance: 5000 };
            const mockExisting = [];
            const mockPayroll = {
                id: 1,
                employee_id: 1,
                month: 12,
                year: 2024,
                days_worked: 30,
                calculated_salary: 29032.26,
                advance_deduction: 5000,
                net_pay: 24032.26,
                status: 'Pending',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([mockEmployee])) // Get employee
                .mockResolvedValueOnce(mockQueryResult([mockAdvanceBalance])) // Get advance balance
                .mockResolvedValueOnce(mockQueryResult(mockExisting)) // Check existing
                .mockResolvedValueOnce(mockQueryResult([mockPayroll])) // Insert/Update salary history
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            await payrollController.runPayroll(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.any(Array),
                })
            );
        });

        it('should calculate prorated salary based on days worked', async () => {
            req.body = {
                employeeId: 1,
                month: 12,
                year: 2024,
                daysWorked: 15, // Half month
            };

            const mockEmployee = {
                id: 1,
                full_name: 'John Doe',
                base_salary: 31000,
                status: 'active',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([mockEmployee])) // Get employee
                .mockResolvedValueOnce(mockQueryResult([{ outstanding_balance: 0 }])) // No advances
                .mockResolvedValueOnce(mockQueryResult([])) // No existing
                .mockResolvedValueOnce(mockQueryResult([{ net_pay: 15000 }])) // Insert
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            await payrollController.runPayroll(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                })
            );
        });

        it('should include overtime and extra day amounts', async () => {
            req.body = {
                employeeId: 1,
                month: 12,
                year: 2024,
                daysWorked: 30,
                overtimeHours: 10,
                overtimeAmount: 2000,
                extraDays: 2,
                extraDayAmount: 1000,
            };

            const mockEmployee = {
                id: 1,
                full_name: 'John Doe',
                base_salary: 30000,
                status: 'active',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([mockEmployee]))
                .mockResolvedValueOnce(mockQueryResult([{ outstanding_balance: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([]))
                .mockResolvedValueOnce(mockQueryResult([{ net_pay: 32032 }]))
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            await payrollController.runPayroll(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                })
            );
        });

        it('should skip employees with already paid status', async () => {
            req.body = {
                employeeId: 1,
                month: 12,
                year: 2024,
                daysWorked: 30,
            };

            const mockEmployee = {
                id: 1,
                full_name: 'John Doe',
                base_salary: 30000,
                status: 'active',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([mockEmployee]))
                .mockResolvedValueOnce(mockQueryResult([{ outstanding_balance: 0 }]))
                .mockResolvedValueOnce(mockQueryResult([{ status: 'Paid' }])) // Already paid
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            await payrollController.runPayroll(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: [],
                })
            );
        });

        it('should handle database errors and rollback', async () => {
            req.body = {
                employeeId: 1,
                month: 12,
                year: 2024,
                daysWorked: 30,
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockRejectedValueOnce(new Error('Database error')); // Error on employee query

            await payrollController.runPayroll(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
        });
    });

    describe('getMonthlyPayroll', () => {
        it('should return payroll records for a specific month', async () => {
            req.query = { month: '12', year: '2024' };

            const mockPayroll = [
                {
                    id: 1,
                    employee_id: 1,
                    full_name: 'John Doe',
                    position: 'Chef',
                    base_salary: 30000,
                    month: 12,
                    year: 2024,
                    days_worked: 30,
                    net_pay: 28000,
                    status: 'Pending',
                    total_outstanding_advances: 2000,
                },
            ];

            db.query.mockResolvedValue(mockQueryResult(mockPayroll));

            await payrollController.getMonthlyPayroll(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE sh.month = $1 AND sh.year = $2'),
                ['12', '2024']
            );
            expect(res.json).toHaveBeenCalledWith(mockPayroll);
        });

        it('should handle database errors', async () => {
            req.query = { month: '12', year: '2024' };

            db.query.mockRejectedValue(new Error('Query failed'));

            await payrollController.getMonthlyPayroll(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('approvePayroll', () => {
        it('should approve a pending payroll entry', async () => {
            req.body = { id: 1 };

            const mockApproved = {
                id: 1,
                employee_id: 1,
                status: 'Approved',
                net_pay: 28000,
            };

            db.query.mockResolvedValue(mockQueryResult([mockApproved]));

            await payrollController.approvePayroll(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining("SET status = 'Approved'"),
                [1]
            );
            expect(res.json).toHaveBeenCalledWith(mockApproved);
        });

        it('should handle database errors', async () => {
            req.body = { id: 1 };

            db.query.mockRejectedValue(new Error('Update failed'));

            await payrollController.approvePayroll(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('markPaid', () => {
        it('should mark payroll as paid and create journal entries', async () => {
            req.body = {
                id: 1,
                payment_mode: 'Bank Transfer',
                payment_date: '2024-12-15',
                paid_by: 'Manager',
            };

            const mockRecord = {
                id: 1,
                employee_id: 1,
                month: 12,
                year: 2024,
                net_pay: 28000,
                advance_deduction: 2000,
                status: 'Paid',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([mockRecord])) // Update salary history
                .mockResolvedValueOnce(mockQueryResult([])) // Get advances
                .mockResolvedValueOnce(mockQueryResult([{ balance: 2000 }])) // Get ledger balance
                .mockResolvedValueOnce(mockQueryResult([])) // Insert advance_ledger repayment
                .mockResolvedValueOnce(mockQueryResult([{ id: 100 }])) // Insert journal entry
                .mockResolvedValueOnce(mockQueryResult([])) // Debit ledger line
                .mockResolvedValueOnce(mockQueryResult([])) // Credit ledger line
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            await payrollController.markPaid(req, res);

            expect(res.json).toHaveBeenCalledWith(mockRecord);
        });

        it('should return error if record not found or not approved', async () => {
            req.body = {
                id: 999,
                payment_mode: 'Cash',
                paid_by: 'Manager',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([])); // Update returns empty

            await payrollController.markPaid(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Record not found or not Approved',
            });
        });

        it('should handle payroll without advance deductions', async () => {
            req.body = {
                id: 1,
                payment_mode: 'Cash',
                paid_by: 'Manager',
            };

            const mockRecord = {
                id: 1,
                employee_id: 1,
                net_pay: 30000,
                advance_deduction: 0, // No deductions
                status: 'Paid',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([mockRecord])) // Update
                .mockResolvedValueOnce(mockQueryResult([{ id: 100 }])) // Journal entry
                .mockResolvedValueOnce(mockQueryResult([])) // Debit
                .mockResolvedValueOnce(mockQueryResult([])) // Credit
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            await payrollController.markPaid(req, res);

            expect(res.json).toHaveBeenCalledWith(mockRecord);
        });

        it('should rollback on database error', async () => {
            req.body = {
                id: 1,
                payment_mode: 'Cash',
                paid_by: 'Manager',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockRejectedValueOnce(new Error('Database error'));

            await payrollController.markPaid(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
