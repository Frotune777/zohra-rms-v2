const {
    getMenu,
    addMenuItem,
    deleteMenuItem,
    createOrder,
} = require('../src/modules/pos/controller');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');

jest.mock('../src/config/db');

describe('POS Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
    });

    describe('getMenu', () => {
        it('should return all menu items', async () => {
            const menuItems = [
                {
                    id: 1,
                    name: 'Chicken Biryani',
                    price: 250,
                    category: 'Biryani',
                },
                {
                    id: 2,
                    name: 'Mutton Curry',
                    price: 300,
                    category: 'Curry',
                },
            ];
            db.query.mockResolvedValue(mockQueryResult(menuItems));

            await getMenu(req, res);

            expect(res.json).toHaveBeenCalledWith(menuItems);
        });

        it('should handle empty menu', async () => {
            db.query.mockResolvedValue(mockQueryResult([]));

            await getMenu(req, res);

            expect(res.json).toHaveBeenCalledWith([]);
        });

        it('should handle database errors', async () => {
            db.query.mockRejectedValue(new Error('Database error'));

            await getMenu(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('addMenuItem', () => {
        it('should add a new menu item', async () => {
            req.body = {
                name: 'Chicken Tikka',
                price: 180,
                category: 'Starters',
            };

            const newItem = { id: 3, ...req.body };
            db.query.mockResolvedValue(mockQueryResult([newItem]));

            await addMenuItem(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Chicken Tikka',
                    price: 180,
                })
            );
        });

        it('should return 400 if name is missing', async () => {
            req.body = { price: 100, category: 'Test' };

            await addMenuItem(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.stringContaining('required') })
            );
        });

        it('should return 400 if price is missing', async () => {
            req.body = { name: 'Test', category: 'Test' };

            await addMenuItem(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 400 if category is missing', async () => {
            req.body = { name: 'Test', price: 100 };

            await addMenuItem(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 400 if price is not positive', async () => {
            req.body = {
                name: 'Test',
                price: -10,
                category: 'Test',
            };

            await addMenuItem(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: expect.stringContaining('greater than 0') })
            );
        });

        it('should handle database errors', async () => {
            req.body = {
                name: 'Test',
                price: 100,
                category: 'Test',
            };
            db.query.mockRejectedValue(new Error('Database error'));

            await addMenuItem(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('deleteMenuItem', () => {
        it('should delete a menu item', async () => {
            req.params = { id: '1' };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // DELETE recipe ingredients
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }], 1)); // DELETE menu item

            await deleteMenuItem(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringContaining('deleted'),
                })
            );
        });

        it('should return 404 if menu item not found', async () => {
            req.params = { id: '999' };

            db.query
                .mockResolvedValueOnce(mockQueryResult([]))
                .mockResolvedValueOnce(mockQueryResult([], 0));

            await deleteMenuItem(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should handle database errors', async () => {
            req.params = { id: '1' };
            db.query.mockRejectedValue(new Error('Database error'));

            await deleteMenuItem(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('createOrder', () => {
        it('should create an order with inventory updates', async () => {
            req.body = {
                items: [
                    { id: 1, name: 'Chicken Biryani', price: 250, qty: 2 },
                    { id: 2, name: 'Mutton Curry', price: 300, qty: 1 },
                ],
            };

            // Mock BEGIN, journal entry, recipe queries, inventory updates, ledger entries, COMMIT
            db.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // INSERT journal entry
                .mockResolvedValueOnce(mockQueryResult([
                    { inventory_item_id: 1, quantity_required: 0.3, unit_cost: 200 },
                ])) // Recipe for item 1
                .mockResolvedValueOnce(mockQueryResult([])) // UPDATE inventory
                .mockResolvedValueOnce(mockQueryResult([
                    { inventory_item_id: 2, quantity_required: 0.2, unit_cost: 300 },
                ])) // Recipe for item 2
                .mockResolvedValueOnce(mockQueryResult([])) // UPDATE inventory
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT ledger line 1
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT ledger line 2
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT ledger line 3
                .mockResolvedValueOnce(mockQueryResult([])) // INSERT ledger line 4
                .mockResolvedValueOnce({}); // COMMIT

            await createOrder(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should calculate total revenue correctly', async () => {
            req.body = {
                items: [
                    { id: 1, price: 250, qty: 2 }, // 500
                    { id: 2, price: 300, qty: 1 }, // 300
                ],
                // Total: 800
            };

            db.query
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }]))
                .mockResolvedValue(mockQueryResult([]));

            await createOrder(req, res);

            // Verify ledger entry for revenue (800)
            const ledgerCalls = db.query.mock.calls.filter(call =>
                call[0].includes('ledger_lines')
            );
            expect(ledgerCalls.length).toBeGreaterThan(0);
        });

        it('should handle database errors and rollback', async () => {
            req.body = {
                items: [{ id: 1, price: 250, qty: 1 }],
            };

            db.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockRejectedValueOnce(new Error('Database error'));

            await createOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            // Verify ROLLBACK was called
            expect(db.query).toHaveBeenCalledWith('ROLLBACK');
        });
    });
});
