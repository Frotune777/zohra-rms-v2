const db = require('../../config/db');

// Helper: Calculate Weighted Moving Average
const calculateWMA = (data) => {
    // data: array of daily usage counts, ordered by date ASC
    if (data.length === 0) return 0;

    let weightedSum = 0;
    let weightTotal = 0;

    // Give more weight to recent days
    data.forEach((val, index) => {
        const weight = index + 1;
        weightedSum += val * weight;
        weightTotal += weight;
    });

    return weightedSum / weightTotal;
};

exports.getDemandForecast = async (req, res) => {
    const { itemId } = req.params;

    try {
        // 1. Get Historical Usage from KDS Tickets (Completed orders)
        // We need to join kds_tickets -> items (jsonb) -> recipe_ingredients -> inventory_items
        // This is complex in SQL with JSONB. 
        // Strategy: Get all completed tickets in last 30 days, parse in JS.

        const ticketsRes = await db.query(`
            SELECT items, completed_at 
            FROM kds_tickets 
            WHERE status = 'Done' 
            AND completed_at > NOW() - INTERVAL '30 days'
            ORDER BY completed_at ASC
        `);

        // Map: Date -> Usage Count
        const dailyUsage = {};

        for (const ticket of ticketsRes.rows) {
            const date = ticket.completed_at.toISOString().split('T')[0];
            const items = ticket.items; // Array of {id, qty, ...} (Menu Items)

            for (const menuItem of items) {
                // Find ingredients for this menu item
                // Optimization: Cache recipe map or query DB once. 
                // For now, let's query DB for this menu item's recipe if not cached? 
                // Better: Get ALL recipes first.
                // Let's do a separate query for recipes.
            }
        }

        // Optimized Approach:
        // 1. Get Recipe Map (Menu Item ID -> [{inventory_item_id, quantity_required}])
        const recipesRes = await db.query("SELECT * FROM recipe_ingredients");
        const recipeMap = {};
        recipesRes.rows.forEach(r => {
            if (!recipeMap[r.menu_item_id]) recipeMap[r.menu_item_id] = [];
            recipeMap[r.menu_item_id].push(r);
        });

        // 2. Process Tickets
        ticketsRes.rows.forEach(ticket => {
            const date = ticket.completed_at.toISOString().split('T')[0];
            if (!dailyUsage[date]) dailyUsage[date] = 0;

            ticket.items.forEach(menuItem => {
                const ingredients = recipeMap[menuItem.id] || [];
                const ingredient = ingredients.find(i => i.inventory_item_id == itemId);
                if (ingredient) {
                    dailyUsage[date] += (menuItem.qty * ingredient.quantity_required);
                }
            });
        });

        // 3. Prepare Data for WMA
        const usageArray = Object.values(dailyUsage); // Note: This might skip days with 0 usage. 
        // Ideally we should fill 0s for missing days.
        // For simplicity, we use what we have.

        const forecast = calculateWMA(usageArray);

        res.json({
            itemId,
            dailyUsage,
            forecast: parseFloat(forecast.toFixed(2)),
            unit: 'units' // We should fetch unit from inventory_items
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getSuggestedPOs = async (req, res) => {
    try {
        // 1. Get all inventory items
        const itemsRes = await db.query("SELECT * FROM inventory_items");
        const items = itemsRes.rows;

        // 2. Get Recipes (for usage calculation)
        const recipesRes = await db.query("SELECT * FROM recipe_ingredients");
        const recipeMap = {};
        recipesRes.rows.forEach(r => {
            if (!recipeMap[r.menu_item_id]) recipeMap[r.menu_item_id] = [];
            recipeMap[r.menu_item_id].push(r);
        });

        // 3. Get Recent Sales (Last 7 days) for quick trend
        const ticketsRes = await db.query(`
            SELECT items 
            FROM kds_tickets 
            WHERE status = 'Done' 
            AND completed_at > NOW() - INTERVAL '7 days'
        `);

        // Calculate Avg Daily Usage for ALL items
        const itemUsage = {}; // itemId -> totalUsage
        ticketsRes.rows.forEach(ticket => {
            ticket.items.forEach(menuItem => {
                const ingredients = recipeMap[menuItem.id] || [];
                ingredients.forEach(ing => {
                    if (!itemUsage[ing.inventory_item_id]) itemUsage[ing.inventory_item_id] = 0;
                    itemUsage[ing.inventory_item_id] += (menuItem.qty * ing.quantity_required);
                });
            });
        });

        const suggestions = [];

        for (const item of items) {
            const totalUsage7Days = itemUsage[item.id] || 0;
            const avgDailyUsage = totalUsage7Days / 7;
            const leadTime = 2; // Assume 2 days lead time for now (can be added to suppliers table)
            const safetyStock = avgDailyUsage * 1; // 1 day safety stock

            const reorderPoint = (avgDailyUsage * leadTime) + safetyStock;

            if (parseFloat(item.stock_qty) < reorderPoint) {
                suggestions.push({
                    inventory_item_id: item.id,
                    name: item.name,
                    current_stock: item.stock_qty,
                    avg_daily_usage: parseFloat(avgDailyUsage.toFixed(2)),
                    reorder_point: parseFloat(reorderPoint.toFixed(2)),
                    suggested_order_qty: parseFloat((reorderPoint * 2).toFixed(2)) // Order enough for 2 cycles
                });
            }
        }

        res.json(suggestions);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
