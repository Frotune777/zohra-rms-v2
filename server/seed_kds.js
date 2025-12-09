const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://admin:password@localhost:5432/alzohra_db"
});

const seedKDS = async () => {
    try {
        console.log('Seeding KDS Tickets...');

        // 1. Get Menu Items
        const menuRes = await pool.query("SELECT id, price FROM menu_items");
        const menuItems = menuRes.rows;

        if (menuItems.length === 0) {
            console.log('No menu items found. Please add menu items first.');
            process.exit(1);
        }

        // 2. Generate 30 days of data
        const today = new Date();

        for (let i = 30; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);

            // Random number of orders per day (10-50)
            const numOrders = Math.floor(Math.random() * 40) + 10;

            for (let j = 0; j < numOrders; j++) {
                // Random items in order (1-5)
                const numItems = Math.floor(Math.random() * 5) + 1;
                const orderItems = [];

                for (let k = 0; k < numItems; k++) {
                    const item = menuItems[Math.floor(Math.random() * menuItems.length)];
                    orderItems.push({
                        id: item.id,
                        qty: Math.floor(Math.random() * 3) + 1,
                        price: item.price
                    });
                }

                // Insert Ticket
                await pool.query(
                    "INSERT INTO kds_tickets (items, status, station, started_at, completed_at, created_at) VALUES ($1, 'Done', 'Kitchen', $2, $2, $2)",
                    [JSON.stringify(orderItems), date]
                );
            }
        }

        console.log('Seeding complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding:', err);
        process.exit(1);
    }
};

seedKDS();
