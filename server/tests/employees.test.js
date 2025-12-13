const {
    getEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getEmployeeHistory,
} = require('../src/modules/employees/controller');
const db = require('../src/config/db');
const { fixtures, mockQueryResult } = require('./helpers/db-mock');
const { mockAuthRequest } = require('./helpers/auth-helper');

// Mock the database
jest.mock('../src/config/db');

describe('Employee Module', () => {
    let req, res, mockClient;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();

        // Smart Mock Handler
        const smartMock = jest.fn((sql, params) => {
            const normalizedSql = sql.toLowerCase();

            // max id
            if (normalizedSql.includes('select max(id)')) {
                return mockQueryResult([{ max_id: 2 }]);
            }
            // insert employee
            if (normalizedSql.includes('insert into employees')) {
                // Return the inserted data (roughly)
                return mockQueryResult([{
                    id: 3,
                    full_name: params[0] || 'New Employee',
                    // ... other fields as needed for test expectations
                }]);
            }
            // select * from employees where id
            if (normalizedSql.includes('from employees where id')) {
                const id = params[0];
                if (id == '999') return mockQueryResult([], 0); // Not found
                return mockQueryResult([{ id: 1, full_name: 'Existing', base_salary: 30000, role: 'staff', status: 'active' }]);
            }
            // select * from employees
            if (normalizedSql.includes('from employees order by')) {
                return mockQueryResult([
                    { id: 1, full_name: 'A', role: 'staff', base_salary: 20000 },
                    { id: 2, full_name: 'B', role: 'owner', base_salary: 50000 }
                ]);
            }
            // update employees
            if (normalizedSql.includes('update employees set')) {
                return mockQueryResult([{ id: 1, full_name: 'Updated Name', status: 'active' }]);
            }
            // employee history
            if (normalizedSql.includes('employee_history')) {
                return mockQueryResult([]);
            }
            // delete employee
            if (normalizedSql.includes('delete from employees')) {
                if (params[0] == '999') return mockQueryResult([], 0);
                return mockQueryResult([{ id: params[0] }], 1);
            }

            // Default safe return
            return mockQueryResult([]);
        });

        // Apply to both db.query and client.query
        mockClient = { ...db._mockClient, query: smartMock };
        db.pool.connect.mockResolvedValue(mockClient);
        db.query.mockImplementation(smartMock);
    });

    describe('getEmployees', () => {
        it('should return all employees', async () => {
            req.user = { role: 'owner' }; // Add user context
            db.query.mockResolvedValue(mockQueryResult(fixtures.employees));

            await getEmployees(req, res);

            expect(db.query).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(fixtures.employees);
        });

        it('should hide salary for staff role', async () => {
            req.user = { role: 'staff' };
            db.query.mockResolvedValue(mockQueryResult(fixtures.employees));

            await getEmployees(req, res);

            const result = res.json.mock.calls[0][0];
            expect(result[0].base_salary).toBeNull();
        });

        it('should handle database errors', async () => {
            req.user = { role: 'owner' };
            db.query.mockRejectedValue(new Error('Database error'));

            await getEmployees(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Database error' })
            );
        });
    });

    describe('createEmployee', () => {
        it('should create a new employee with valid data', async () => {
            const newEmployee = {
                full_name: 'New Employee',
                position: 'Cook',
                base_salary: 15000,
            };

            req.body = newEmployee;

            // Mock MAX(id) query and INSERT query
            // Assuming createEmployee uses transaction? Let's check. 
            // If it uses transaction (pool.connect), use mockClient. If direct, use db.query.
            // The ERROR trace showed 'release' error for createTransaction (in advances), but for createEmployee?
            // If createEmployee uses transaction:
            db._mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([{ max_id: 2 }]))
                .mockResolvedValueOnce(mockQueryResult([{
                    id: 3,
                    ...newEmployee,
                    employee_code: 'EMP003',
                    status: 'active',
                }]))
                .mockResolvedValueOnce({}); // COMMIT

            await createEmployee(req, res);

            expect(db.query).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ full_name: 'New Employee' })
            );
        });

        it('should return 400 if required fields are missing', async () => {
            req.body = { full_name: 'Incomplete' }; // Missing position and salary

            // Smart Mock handles it (though it shouldn't be called if validation fails first)

            await createEmployee(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.any(String) })
            );
        });

        it('should handle database errors during creation', async () => {
            req.body = {
                full_name: 'Test',
                position: 'Cook',
                base_salary: 15000,
            };
            db._mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockRejectedValue(new Error('Insert failed'));

            await createEmployee(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('updateEmployee', () => {
        it('should update employee details', async () => {
            req.params = { id: '1' };
            req.body = {
                full_name: 'Updated Name',
                base_salary: 35000,
            };
            req.user = { email: 'manager@test.com' };

            const updatedEmployee = { ...fixtures.employees[0], full_name: 'Updated Name', base_salary: 35000 };

            // Mock BEGIN, SELECT, UPDATE, INSERT history, COMMIT
            db._mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([fixtures.employees[0]])) // SELECT current
                .mockResolvedValueOnce(mockQueryResult([updatedEmployee])) // UPDATE
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT history
                .mockResolvedValueOnce({}); // COMMIT

            await updateEmployee(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ full_name: 'Updated Name' })
            );
        });

        it('should return 404 if employee not found', async () => {
            req.params = { id: '999' };
            req.body = { full_name: 'Test' };
            req.user = { email: 'manager@test.com' };

            db._mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([])) // SELECT - not found
                .mockResolvedValueOnce({}); // ROLLBACK

            await updateEmployee(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('deleteEmployee', () => {
        it('should hard delete an employee', async () => {
            req.params = { id: '1' };

            // Smart Mock handles DELETE success for id 1

            await deleteEmployee(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE'),
                expect.arrayContaining(['1'])
            );
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should return 404 if employee not found', async () => {
            req.params = { id: '999' };

            // Smart Mock handles DELETE fail for id 999

            await deleteEmployee(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('getEmployeeHistory', () => {
        it('should return employee change history', async () => {
            req.params = { id: '1' };
            const history = [
                {
                    id: 1,
                    employee_id: 1,
                    field_changed: 'salary',
                    old_value: '25000',
                    new_value: '30000',
                    changed_at: '2024-12-01',
                    changed_by: 'Manager',
                },
            ];
            db.query.mockResolvedValue(mockQueryResult(history));

            await getEmployeeHistory(req, res);

            expect(res.json).toHaveBeenCalledWith(history);
        });

        it('should return empty array if no history exists', async () => {
            req.params = { id: '1' };
            db.query.mockResolvedValue(mockQueryResult([]));

            await getEmployeeHistory(req, res);

            expect(res.json).toHaveBeenCalledWith([]);
        });
    });
});
