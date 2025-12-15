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
        _mockClient: mockClient, // Expose for tests if needed, but better to use helpers
    };
});

describe('Employee Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();

        // Reset default mock implementation
        db.query.mockResolvedValue(mockQueryResult([]));
    });

    describe('getEmployees', () => {
        it('should return all employees', async () => {
            req.user = { role: 'owner' };
            db.query.mockResolvedValue(mockQueryResult(fixtures.employees));

            await getEmployees(req, res);

            expect(db.query).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(fixtures.employees);
        });

        it('should hide salary for staff role', async () => {
            req.user = { role: 'staff' };
            db.query.mockResolvedValue(mockQueryResult(fixtures.employees));

            await getEmployees(req, res);

            // Verify the first call argument to json
            const result = res.json.mock.calls[0][0];
            // The controller modifies the objects in place or maps them
            // Fixtures are objects, if controller modifies them, it might affect fixture if not copied.
            // Ideally controller copies.
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

            // Mock SELECT MAX(id), INSERT
            // No transaction in createEmployee
            db.query
                .mockResolvedValueOnce(mockQueryResult([{ max_id: 2 }])) // SELECT MAX(id)
                .mockResolvedValueOnce(mockQueryResult([{
                    id: 3,
                    ...newEmployee,
                    employee_code: 'EMP003',
                    status: 'active',
                }])); // INSERT

            await createEmployee(req, res);

            expect(db.query).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ full_name: 'New Employee' })
            );
        });

        it('should return 400 if required fields are missing', async () => {
            req.body = { full_name: 'Incomplete' }; // Missing position and salary

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

            // Force error on INSERT or MAX ID
            db.query
                .mockRejectedValueOnce(new Error('Insert failed'));

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
            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([fixtures.employees[0]])) // SELECT current
                .mockResolvedValueOnce(mockQueryResult([updatedEmployee])) // UPDATE
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT history
                .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

            await updateEmployee(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ full_name: 'Updated Name' })
            );
        });

        it('should return 404 if employee not found', async () => {
            req.params = { id: '999' };
            req.body = { full_name: 'Test' };
            req.user = { email: 'manager@test.com' };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([], 0)) // SELECT - not found
                .mockResolvedValueOnce(mockQueryResult([])); // ROLLBACK

            await updateEmployee(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('deleteEmployee', () => {
        it('should hard delete an employee', async () => {
            req.params = { id: '1' };

            // Mock DELETE (no transaction)
            db.query
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }], 1)); // DELETE

            await deleteEmployee(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE'),
                expect.any(Array)
            );
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should return 404 if employee not found', async () => {
            req.params = { id: '999' };

            // Mock DELETE (no transaction)
            db.query
                .mockResolvedValueOnce(mockQueryResult([], 0)); // DELETE (rowCount 0)

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
