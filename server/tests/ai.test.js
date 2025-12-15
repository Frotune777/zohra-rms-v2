const aiController = require('../src/modules/ai/controller');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');

jest.mock('../src/config/db', () => {
    const mockQuery = jest.fn();
    return {
        query: mockQuery,
    };
});

describe('AI Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
    });

    describe('getDemandForecast', () => {
        it('should return demand forecast for an item', async () => {
            req.params = { itemId: '10' };

            const mockTickets = [
                {
                    items: [{ id: 1, qty: 2 }],
                    completed_at: new Date('2024-12-10T10:00:00Z'),
                },
                {
                    items: [{ id: 1, qty: 3 }],
                    completed_at: new Date('2024-12-11T10:00:00Z'),
                },
            ];

            const mockRecipes = [
                {
                    menu_item_id: 1,
                    inventory_item_id: 10,
                    quantity_required: 0.5,
                },
            ];

            db.query
                .mockResolvedValueOnce(mockQueryResult(mockTickets)) // Get tickets
                .mockResolvedValueOnce(mockQueryResult(mockRecipes)); // Get recipes

            await aiController.getDemandForecast(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    itemId: '10',
                    dailyUsage: expect.any(Object),
                    forecast: expect.any(Number),
                    unit: 'units',
                })
            );
        });

        it('should handle items with no historical data', async () => {
            req.params = { itemId: '999' };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // No tickets
                .mockResolvedValueOnce(mockQueryResult([])); // No recipes

            await aiController.getDemandForecast(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    itemId: '999',
                    forecast: 0,
                })
            );
        });

        it('should handle database errors', async () => {
            req.params = { itemId: '10' };

            db.query.mockRejectedValue(new Error('Database connection failed'));

            await aiController.getDemandForecast(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Database connection failed',
            });
        });
    });

    describe('getSuggestedPOs', () => {
        it('should return suggested purchase orders for low stock items', async () => {
            const mockItems = [
                {
                    id: 10,
                    name: 'Tomatoes',
                    stock_qty: 5,
                    unit: 'kg',
                },
                {
                    id: 11,
                    name: 'Onions',
                    stock_qty: 50,
                    unit: 'kg',
                },
            ];

            const mockRecipes = [
                {
                    menu_item_id: 1,
                    inventory_item_id: 10,
                    quantity_required: 0.2,
                },
            ];

            const mockTickets = [
                {
                    items: [{ id: 1, qty: 10 }],
                },
                {
                    items: [{ id: 1, qty: 15 }],
                },
            ];

            db.query
                .mockResolvedValueOnce(mockQueryResult(mockItems)) // Get inventory items
                .mockResolvedValueOnce(mockQueryResult(mockRecipes)) // Get recipes
                .mockResolvedValueOnce(mockQueryResult(mockTickets)); // Get tickets

            await aiController.getSuggestedPOs(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.any(Array));
            const suggestions = res.json.mock.calls[0][0];

            // Tomatoes should be in suggestions (low stock)
            expect(suggestions.some(s => s.inventory_item_id === 10)).toBe(true);
        });

        it('should return empty array if all items are well-stocked', async () => {
            const mockItems = [
                {
                    id: 10,
                    name: 'Tomatoes',
                    stock_qty: 1000,
                    unit: 'kg',
                },
            ];

            const mockRecipes = [
                {
                    menu_item_id: 1,
                    inventory_item_id: 10,
                    quantity_required: 0.2,
                },
            ];

            const mockTickets = [
                {
                    items: [{ id: 1, qty: 2 }],
                },
            ];

            db.query
                .mockResolvedValueOnce(mockQueryResult(mockItems))
                .mockResolvedValueOnce(mockQueryResult(mockRecipes))
                .mockResolvedValueOnce(mockQueryResult(mockTickets));

            await aiController.getSuggestedPOs(req, res);

            expect(res.json).toHaveBeenCalledWith([]);
        });

        it('should calculate reorder points correctly', async () => {
            const mockItems = [
                {
                    id: 10,
                    name: 'Tomatoes',
                    stock_qty: 1,
                    unit: 'kg',
                },
            ];

            const mockRecipes = [
                {
                    menu_item_id: 1,
                    inventory_item_id: 10,
                    quantity_required: 1,
                },
            ];

            const mockTickets = [
                {
                    items: [{ id: 1, qty: 7 }], // 7 units over 7 days = 1 per day
                },
            ];

            db.query
                .mockResolvedValueOnce(mockQueryResult(mockItems))
                .mockResolvedValueOnce(mockQueryResult(mockRecipes))
                .mockResolvedValueOnce(mockQueryResult(mockTickets));

            await aiController.getSuggestedPOs(req, res);

            const suggestions = res.json.mock.calls[0][0];
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0]).toMatchObject({
                inventory_item_id: 10,
                name: 'Tomatoes',
                avg_daily_usage: expect.any(Number),
                reorder_point: expect.any(Number),
                suggested_order_qty: expect.any(Number),
            });
        });

        it('should handle database errors', async () => {
            db.query.mockRejectedValue(new Error('Query failed'));

            await aiController.getSuggestedPOs(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Query failed' });
        });

        it('should handle items with no usage data', async () => {
            const mockItems = [
                {
                    id: 10,
                    name: 'New Item',
                    stock_qty: 0,
                    unit: 'kg',
                },
            ];

            db.query
                .mockResolvedValueOnce(mockQueryResult(mockItems))
                .mockResolvedValueOnce(mockQueryResult([]))
                .mockResolvedValueOnce(mockQueryResult([]));

            await aiController.getSuggestedPOs(req, res);

            const suggestions = res.json.mock.calls[0][0];
            // Item with 0 stock and 0 usage should still trigger reorder
            expect(suggestions.some(s => s.inventory_item_id === 10)).toBe(true);
        });
    });
});
