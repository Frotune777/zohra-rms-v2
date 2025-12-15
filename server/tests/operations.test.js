const kdsController = require('../src/modules/operations/kds.controller');
const wastageController = require('../src/modules/operations/wastage.controller');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');

// Mock socket.io
jest.mock('../src/socket', () => ({
    getIo: jest.fn(() => ({
        to: jest.fn(() => ({
            emit: jest.fn(),
        })),
    })),
}));

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

describe('Operations Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
    });

    describe('KDS - Kitchen Display System', () => {
        describe('getTickets', () => {
            it('should return all active KDS tickets', async () => {
                const mockTickets = [
                    {
                        id: 1,
                        order_id: 101,
                        items: JSON.stringify([{ name: 'Burger', qty: 2 }]),
                        station: 'Kitchen',
                        status: 'Pending',
                        created_at: '2024-12-15T10:00:00Z',
                    },
                    {
                        id: 2,
                        order_id: 102,
                        items: JSON.stringify([{ name: 'Pizza', qty: 1 }]),
                        station: 'Kitchen',
                        status: 'Preparing',
                        created_at: '2024-12-15T10:05:00Z',
                    },
                ];

                db.query.mockResolvedValue(mockQueryResult(mockTickets));

                await kdsController.getTickets(req, res);

                expect(db.query).toHaveBeenCalledWith(
                    expect.stringContaining("WHERE status != 'Done'")
                );
                expect(res.json).toHaveBeenCalledWith(mockTickets);
            });

            it('should handle database errors', async () => {
                const errorMessage = 'Database connection failed';
                db.query.mockRejectedValue(new Error(errorMessage));

                await kdsController.getTickets(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
                expect(res.json).toHaveBeenCalledWith({ error: errorMessage });
            });
        });

        describe('createTicket', () => {
            it('should create a new KDS ticket', async () => {
                const mockTicket = {
                    id: 1,
                    order_id: 101,
                    items: JSON.stringify([{ name: 'Burger', qty: 2 }]),
                    station: 'Kitchen',
                    status: 'Pending',
                };

                req.body = {
                    orderId: 101,
                    items: [{ name: 'Burger', qty: 2 }],
                    station: 'Kitchen',
                };

                db.query.mockResolvedValue(mockQueryResult([mockTicket]));

                await kdsController.createTicket(req, res);

                expect(db.query).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT INTO kds_tickets'),
                    expect.arrayContaining([101, expect.any(String), 'Kitchen'])
                );
                expect(res.json).toHaveBeenCalledWith(mockTicket);
            });

            it('should use default station if not provided', async () => {
                const mockTicket = {
                    id: 1,
                    order_id: 101,
                    items: JSON.stringify([{ name: 'Burger', qty: 2 }]),
                    station: 'Kitchen',
                    status: 'Pending',
                };

                req.body = {
                    orderId: 101,
                    items: [{ name: 'Burger', qty: 2 }],
                };

                db.query.mockResolvedValue(mockQueryResult([mockTicket]));

                await kdsController.createTicket(req, res);

                expect(db.query).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.arrayContaining([101, expect.any(String), 'Kitchen'])
                );
            });

            it('should handle database errors', async () => {
                req.body = {
                    orderId: 101,
                    items: [{ name: 'Burger', qty: 2 }],
                };

                db.query.mockRejectedValue(new Error('Insert failed'));

                await kdsController.createTicket(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
            });
        });

        describe('updateTicketStatus', () => {
            it('should update ticket status to Preparing', async () => {
                const mockTicket = {
                    id: 1,
                    order_id: 101,
                    status: 'Preparing',
                    started_at: '2024-12-15T10:10:00Z',
                };

                req.params = { id: '1' };
                req.body = { status: 'Preparing' };

                db.query.mockResolvedValue(mockQueryResult([mockTicket]));

                await kdsController.updateTicketStatus(req, res);

                expect(db.query).toHaveBeenCalledWith(
                    expect.stringContaining('started_at = NOW()'),
                    expect.arrayContaining(['Preparing', '1'])
                );
                expect(res.json).toHaveBeenCalledWith(mockTicket);
            });

            it('should update ticket status to Done', async () => {
                const mockTicket = {
                    id: 1,
                    order_id: 101,
                    status: 'Done',
                    completed_at: '2024-12-15T10:20:00Z',
                };

                req.params = { id: '1' };
                req.body = { status: 'Done' };

                db.query.mockResolvedValue(mockQueryResult([mockTicket]));

                await kdsController.updateTicketStatus(req, res);

                expect(db.query).toHaveBeenCalledWith(
                    expect.stringContaining('completed_at = NOW()'),
                    expect.arrayContaining(['Done', '1'])
                );
                expect(res.json).toHaveBeenCalledWith(mockTicket);
            });

            it('should return 404 if ticket not found', async () => {
                req.params = { id: '999' };
                req.body = { status: 'Done' };

                db.query.mockResolvedValue(mockQueryResult([]));

                await kdsController.updateTicketStatus(req, res);

                expect(res.status).toHaveBeenCalledWith(404);
                expect(res.json).toHaveBeenCalledWith({ error: 'Ticket not found' });
            });
        });
    });

    describe('Wastage Management', () => {
        describe('getWastageLogs', () => {
            it('should return wastage logs with item details', async () => {
                const mockLogs = [
                    {
                        id: 1,
                        inventory_item_id: 10,
                        qty: 5,
                        reason: 'Expired',
                        cost: 500,
                        reported_by: 'manager@test.com',
                        item_name: 'Tomatoes',
                        unit: 'kg',
                        created_at: '2024-12-15T10:00:00Z',
                    },
                    {
                        id: 2,
                        inventory_item_id: 11,
                        qty: 2,
                        reason: 'Damaged',
                        cost: 200,
                        reported_by: 'staff@test.com',
                        item_name: 'Onions',
                        unit: 'kg',
                        created_at: '2024-12-15T11:00:00Z',
                    },
                ];

                db.query.mockResolvedValue(mockQueryResult(mockLogs));

                await wastageController.getWastageLogs(req, res);

                expect(db.query).toHaveBeenCalledWith(
                    expect.stringContaining('JOIN inventory_items')
                );
                expect(res.json).toHaveBeenCalledWith(mockLogs);
            });

            it('should handle database errors', async () => {
                db.query.mockRejectedValue(new Error('Query failed'));

                await wastageController.getWastageLogs(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
            });
        });

        describe('logWastage', () => {
            it('should log wastage and update inventory', async () => {
                req.body = {
                    inventory_item_id: 10,
                    qty: 5,
                    reason: 'Expired',
                };
                req.user = { email: 'manager@test.com' };

                const mockItem = {
                    unit_cost: 100,
                    stock_qty: 50,
                };

                const mockWastageLog = {
                    id: 1,
                    inventory_item_id: 10,
                    qty: 5,
                    reason: 'Expired',
                    cost: 500,
                    reported_by: 'manager@test.com',
                };

                db.query
                    .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                    .mockResolvedValueOnce(mockQueryResult([mockItem])) // Get item
                    .mockResolvedValueOnce(mockQueryResult([mockWastageLog])) // Insert wastage log
                    .mockResolvedValueOnce(mockQueryResult([])) // Update inventory
                    .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // Insert journal entry
                    .mockResolvedValueOnce(mockQueryResult([])) // Debit ledger line
                    .mockResolvedValueOnce(mockQueryResult([])) // Credit ledger line
                    .mockResolvedValueOnce(mockQueryResult([])); // COMMIT

                await wastageController.logWastage(req, res);

                expect(res.json).toHaveBeenCalledWith(mockWastageLog);
            });

            it('should return error if item not found', async () => {
                req.body = {
                    inventory_item_id: 999,
                    qty: 5,
                    reason: 'Expired',
                };
                req.user = { email: 'manager@test.com' };

                db.query
                    .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                    .mockResolvedValueOnce(mockQueryResult([])); // Get item - not found

                await wastageController.logWastage(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
                expect(res.json).toHaveBeenCalledWith({ error: 'Item not found' });
            });

            it('should rollback on database error', async () => {
                req.body = {
                    inventory_item_id: 10,
                    qty: 5,
                    reason: 'Expired',
                };
                req.user = { email: 'manager@test.com' };

                db.query
                    .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                    .mockRejectedValueOnce(new Error('Database error')); // Error on get item

                await wastageController.logWastage(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
            });
        });
    });
});
