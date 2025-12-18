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

            db._mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([])) // DELETE recipe ingredients
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }], 1)) // DELETE menu item
                .mockResolvedValueOnce({ rows: [] }); // COMMIT

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

            db._mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([])) // DELETE recipe
                .mockResolvedValueOnce(mockQueryResult([], 0)) // DELETE item
                .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

            await deleteMenuItem(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should handle database errors', async () => {
            req.params = { id: '1' };

            db._mockClient.query
                .mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockRejectedValue(new Error('Database error'));

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
                customerName: 'John',
                paymentMethod: 'CASH',
            };

            // Mock BEGIN, INSERT pos_transactions, Loop Items...
            // Logic in PosService:
            // 1. BEGIN
            // 2. INSERT pos_transactions
            // 3. For each item:
            //    - INSERT pos_transaction_items
            //    - SELECT recipe ingredients
            //    - For each ingredient: 
            //      - adjustStock (UPDATE inventory, INSERT stock_movement)
            // 4. INSERT journal_entries (Revenue)
            // 5. INSERT ledger_lines (Revenue Debit/Credit)
            // 6. IF COGS > 0: INSERT ledger_lines (COGS Debit/Credit)
            // 7. COMMIT

            // This is complex to mock sequentially.
            // Simplified: we just need to ensure the chain doesn't break.
            // But we need to respond to specific queries like recipe lookup.

            // Or simpler: Mock specific responses and let others return default { rows: [] }.
            // But jest manual mock returns rows: [] by default if not instructed.
            // Wait, manual mock `query` is just `jest.fn()`. It returns undefined unless mocked.
            // My tests usually set `mockResolvedValue`.
            // If I set `mockResolvedValue` on `query`, it returns that for ALL calls unless `Once` is used.

            // Best strategy: Use `mockResolvedValue` for default success (empty rows), 
            // and `mockResolvedValueOnce` for specific queries IF order matters.
            // But order matters a lot here.

            // Let's try to match the sequence roughly:
            const q = db._mockClient.query;

            q.mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([{ id: 100 }])) // INSERT pos_transactions
                // Item 1
                .mockResolvedValueOnce({ rows: [] }) // INSERT pos_transaction_items
                .mockResolvedValueOnce(mockQueryResult([{ inventory_item_id: 1, quantity_required: 0.1, unit_cost: 50 }, { inventory_item_id: 99, quantity_required: 0, unit_cost: 0 }])) // SELECT recipe (mocking 2 ingredients for test or just 1)
                // Ing 1 Adjustment:
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // UPDATE inventory
                .mockResolvedValueOnce({ rows: [] }) // INSERT stock_movement
                // Ing 2 Adjustment (dummy):
                .mockResolvedValueOnce(mockQueryResult([{ id: 99 }]))
                .mockResolvedValueOnce({ rows: [] })
                // Item 2
                .mockResolvedValueOnce({ rows: [] }) // INSERT pos_transaction_items
                .mockResolvedValueOnce(mockQueryResult([])) // SELECT recipe (no ingredients)
                // Journal
                .mockResolvedValueOnce(mockQueryResult([{ id: 500 }])) // INSERT journal_entries
                .mockResolvedValueOnce({ rows: [] }) // Ledger 1
                .mockResolvedValueOnce({ rows: [] }) // Ledger 2
                .mockResolvedValueOnce({ rows: [] }) // Ledger 3 (COGS)
                .mockResolvedValueOnce({ rows: [] }) // Ledger 4 (COGS)
                .mockResolvedValueOnce({ rows: [] }); // COMMIT

            await createOrder(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('should calculate total revenue correctly', async () => {
            req.body = {
                items: [
                    { id: 1, name: 'Item', price: 250, qty: 2 },
                ],
            };

            const q = db._mockClient.query;
            q.mockResolvedValue({ rows: [], rowCount: 1 }); // Default
            q.mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([{ id: 1 }])) // Trans ID
                // ... subsequent calls return default (empty array) which usually works for inserts
                // BUT recipe lookup needs to return array, or empty array. Empty array is fine (no stock deduction).
                // Recipe lookup is SELECT.
                .mockResolvedValueOnce({ rows: [] }) // INSERT item
                .mockResolvedValueOnce(mockQueryResult([])); // SELECT recipe (empty)

            await createOrder(req, res);

            // We can check if orders insert had correct total
            expect(q).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO orders'),
                expect.arrayContaining([500]) // 250 * 2
            );
        });

        it('should handle database errors and rollback', async () => {
            req.body = {
                items: [{ id: 1, price: 250, qty: 1 }],
            };

            db._mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockRejectedValueOnce(new Error('Database error'));

            await createOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(db._mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        });
    });
});
