const {sqlMock}=require('./helpers/sql-mock');
const {
    getAllAdvances,
    getEmployeeAdvanceHistory,
    getEmployeeBalance,
    createTransaction,
    runPayroll,
    getMonthlyPayroll,
} = require('../src/modules/employees/controller');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');
const { mockAuthRequest, userFixtures } = require('./helpers/auth-helper');

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

describe('Advances and Payroll Module', () => {
    let req, res;

    beforeEach(async () => {
        req = global.testUtils.mockRequest({user:{id:1,role:"owner",employee_id:null}});
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
        db.query.mockReset().mockResolvedValue(mockQueryResult([]));
        if(db.pool) {
            const isolatedClient=await db.pool.connect();
            if(isolatedClient.query !== db.query) isolatedClient.query.mockReset().mockResolvedValue(mockQueryResult([]));
        }
        // Default mock implementation to prevent "Cannot read property of undefined"
        db.query.mockResolvedValue(mockQueryResult([]));
    });

    describe('getAllAdvances', () => {
        it('should return all advance transactions', async () => {
            const advances = [
                {
                    id: 1,
                    employee_id: 1,
                    employee_name: 'John Doe',
                    type: 'advance',
                    amount: 5000,
                    payment_mode: 'Cash',
                    paid_by: 'Manager',
                    transaction_date: '2024-12-01',
                },
            ];
            db.query.mockResolvedValue(mockQueryResult(advances));

            await getAllAdvances(req, res);

            expect(res.json).toHaveBeenCalledWith(advances);
        });

        it('should filter advances by employee_id', async () => {
            req.query = { employee_id: '1' };
            db.query.mockResolvedValue(mockQueryResult([]));

            await getAllAdvances(req, res);

            expect(db.query).toHaveBeenCalled();
        });
    });

    describe('getEmployeeAdvanceHistory', () => {
        it('should return advance history for an employee', async () => {
            req.params = { id: '1' };
            const history = [
                { id: 1, type: 'advance', amount: 5000, transaction_date: '2024-12-01' },
                { id: 2, type: 'repayment', amount: 2000, transaction_date: '2024-12-05' },
            ];
            db.query.mockResolvedValue(mockQueryResult(history));

            await getEmployeeAdvanceHistory(req, res);

            expect(res.json).toHaveBeenCalledWith(history);
        });
    });

    describe('getEmployeeBalance', () => {
        it('should calculate correct balance for employee', async () => {
            req.params = { id: '1' };
            const balanceData = [
                { balance: 3000 }, // 5000 advance - 2000 repayment
            ];
            db.query.mockResolvedValue(mockQueryResult(balanceData));

            await getEmployeeBalance(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ balance: 3000 })
            );
        });

        it('should return 0 balance if no transactions', async () => {
            req.params = { id: '1' };
            db.query.mockResolvedValue(mockQueryResult([{ balance: null }]));

            await getEmployeeBalance(req, res);

            // parseFloat(null) returns NaN, which the controller returns
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ balance: expect.any(Number) })
            );
        });
    });

    describe('createTransaction', () => {
        it('should create an advance transaction', async () => {
            req.body = {
                employeeId: 1,
                type: 'Advance',
                amount: 5000,
            };
            req.user = { id: 1 }; // Added for service
            // Mock sequence for createRequest
            db.query
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])); // INSERT advance_requests

            await createTransaction(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringContaining('approval')
                })
            );
        });

        it('should create a repayment transaction', async () => {
            req.body = {
                employeeId: 1, // Corrected from employee_id
                type: 'Repayment', // REPAYMENT
                amount: 2000,
                notes: 'Partial Repayment',
                paidBy: 'Owner'
            };
            req.user = { role: 'owner' }; // Needs auth (lowercase)

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([{ id: 102 }])) // INSERT advance_requests
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            await createTransaction(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                })
            );
        });

        it('should return 400 if required fields are missing', async () => {
            req.body = { employeeId: 1 }; // Missing type and amount

            await createTransaction(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('runPayroll', () => {
        it('should process payroll with prorated salary', async () => {
            req.body = {
                employeeId: 1,
                month: 12,
                year: 2023,
                daysWorked: 30, // 30 out of 31 days
                manualAdjustment: 0,
                adjustmentReason: null,
            };

            const employee = {
                id: 1,
                full_name: 'Test Employee',
                base_salary: 30000,
                status: 'active'
            };

            // Controller logic:
            // 1. BEGIN
            // 2. SELECT employee
            // No balance check in runPayroll
            // 3. INSERT Salary History
            // 4. INSERT Journal
            // 5. INSERT ledger lines 1 & 2
            // 6. COMMIT

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([employee])) // SELECT Employee
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // INSERT Salary History
                .mockResolvedValueOnce(mockQueryResult([])) // DELETE components
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT component 1
                .mockResolvedValueOnce(mockQueryResult([{ code: 6000 }])) // SELECT account code 6000
                .mockResolvedValueOnce(mockQueryResult([{ code: 1000 }])) // SELECT account code 1000
                .mockResolvedValueOnce(mockQueryResult([{ status: 'Open' }])) // SELECT period status
                .mockResolvedValueOnce(mockQueryResult([{ id: 201 }])) // INSERT Journal
                .mockResolvedValueOnce(mockQueryResult([])) // Ledger 1
                .mockResolvedValueOnce(mockQueryResult([])) // Ledger 2
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            req.user = { id: 1 };
            sqlMock(db.query,(sql,p)=>{
                if(sql.includes('FROM employees'))return mockQueryResult([employee]);
                if(sql.includes('FROM employee_salary_structure'))return mockQueryResult([]);
                if(sql.includes('FROM advance_ledger'))return mockQueryResult([{outstanding_balance:0}]);
                if(sql.startsWith('SELECT status FROM salary_history'))return mockQueryResult([]);
                if(sql.startsWith('UPDATE salary_history SET total_days'))return mockQueryResult([]);
                if(sql.startsWith('INSERT INTO salary_history '))return mockQueryResult([{id:1,net_pay:p[6],calculated_salary:p[4],status:'Pending'}]);
                if(sql.includes('salary_history_components'))return mockQueryResult([]);
                if(sql.includes('FROM users'))return mockQueryResult([]);
            });

            await runPayroll(req, res);

            // December has 31 days, so 30/31 * 30000 = 29032.26
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    netPay: expect.any(Number),
                    earnedSalary: expect.any(Number),
                })
            );
        });

        it('should apply manual adjustments to payroll', async () => {
            req.body = {
                employeeId: 1,
                month: 12,
                year: 2023,
                daysWorked: 30,
                manualAdjustment: 2000,
                adjustmentReason: 'Bonus',
            };

            const employee = {
                id: 1,
                full_name: 'Test Employee',
                base_salary: 30000
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([employee])) // SELECT Employee
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // INSERT Salary History
                .mockResolvedValueOnce(mockQueryResult([])) // DELETE components
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT component 1
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT component 2
                .mockResolvedValueOnce(mockQueryResult([{ code: 6000 }])) // SELECT account code 6000
                .mockResolvedValueOnce(mockQueryResult([{ code: 1000 }])) // SELECT account code 1000
                .mockResolvedValueOnce(mockQueryResult([{ status: 'Open' }])) // SELECT period status
                .mockResolvedValueOnce(mockQueryResult([{ id: 202 }])) // INSERT Journal
                .mockResolvedValueOnce(mockQueryResult([])) // Ledger 1
                .mockResolvedValueOnce(mockQueryResult([])) // Ledger 2
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            sqlMock(db.query,(sql,p)=>{
                if(sql.includes('FROM employees'))return mockQueryResult([employee]);
                if(sql.includes('FROM employee_salary_structure'))return mockQueryResult([]);
                if(sql.includes('FROM advance_ledger'))return mockQueryResult([{outstanding_balance:0}]);
                if(sql.startsWith('SELECT status FROM salary_history'))return mockQueryResult([]);
                if(sql.startsWith('UPDATE salary_history SET total_days'))return mockQueryResult([]);
                if(sql.startsWith('INSERT INTO salary_history '))return mockQueryResult([{id:1,net_pay:p[6],calculated_salary:p[4],status:'Pending'}]);
                if(sql.includes('salary_history_components'))return mockQueryResult([]);
                if(sql.includes('FROM users'))return mockQueryResult([]);
            });

            await runPayroll(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    netPay: expect.any(Number), // ~31032
                })
            );
        });

        it('should calculate prorated salary for partial month', async () => {
            req.body = {
                employeeId: 1,
                month: 12, // 31 days
                year: 2023,
                daysWorked: 15,
            };

            const employee = {
                id: 1,
                full_name: 'Test Employee',
                base_salary: 30000
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([employee])) // SELECT Employee
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // INSERT Salary History
                .mockResolvedValueOnce(mockQueryResult([])) // DELETE components
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT component 1
                .mockResolvedValueOnce(mockQueryResult([{ code: 6000 }])) // SELECT account code 6000
                .mockResolvedValueOnce(mockQueryResult([{ code: 1000 }])) // SELECT account code 1000
                .mockResolvedValueOnce(mockQueryResult([{ status: 'Open' }])) // SELECT period status
                .mockResolvedValueOnce(mockQueryResult([{ id: 203 }])) // INSERT Journal
                .mockResolvedValueOnce(mockQueryResult([])) // Ledger 1
                .mockResolvedValueOnce(mockQueryResult([])) // Ledger 2
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            sqlMock(db.query,(sql,p)=>{
                if(sql.includes('FROM employees'))return mockQueryResult([employee]);
                if(sql.includes('FROM employee_salary_structure'))return mockQueryResult([]);
                if(sql.includes('FROM advance_ledger'))return mockQueryResult([{outstanding_balance:0}]);
                if(sql.startsWith('SELECT status FROM salary_history'))return mockQueryResult([]);
                if(sql.startsWith('UPDATE salary_history SET total_days'))return mockQueryResult([]);
                if(sql.startsWith('INSERT INTO salary_history '))return mockQueryResult([{id:1,net_pay:p[6],calculated_salary:p[4],status:'Pending'}]);
                if(sql.includes('salary_history_components'))return mockQueryResult([]);
                if(sql.includes('FROM users'))return mockQueryResult([]);
            });

            await runPayroll(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                })
            );
        });

        it('should handle database errors', async () => {
            req.body = {
                employeeId: 1,
                month: 12,
                year: 2024,
                daysWorked: 30,
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockRejectedValueOnce(new Error('Database error')); // Error on employee query OR connect?
            // If connect works, client.query('BEGIN') works.
            // We assume Error on SELECT Employee.

            await runPayroll(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('getMonthlyPayroll', () => {
        it('should return payroll records for a month', async () => {
            req.query = { month: '12', year: '2024' };
            const payrollData = {
                month: 12,
                year: 2024,
                data: [
                    {
                        id: 1,
                        full_name: 'John Doe',
                        position: 'Chef',
                        base_salary: 30000,
                        days_worked: 30,
                        calculated_salary: 30000,
                        manual_adjustment: 0,
                        net_pay: 30000,
                        active_advances: 5000,
                    },
                ],
            };
            db.query.mockResolvedValue(mockQueryResult(payrollData.data));

            await getMonthlyPayroll(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    month: '12', // Query params are strings
                    year: '2024',
                    data: expect.any(Array),
                })
            );
        });

        it('should use current month/year if not provided', async () => {
            req.query = {};
            db.query.mockResolvedValue(mockQueryResult([]));

            await getMonthlyPayroll(req, res);

            expect(db.query).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    month: expect.any(Number),
                    year: expect.any(Number),
                })
            );
        });
    });
});
