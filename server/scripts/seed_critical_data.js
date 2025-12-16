const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const seedData = async () => {
    try {
        console.log('Seeding critical dummy data...');

        // 1. Bank Accounts
        // Check if chart of accounts for bank exists, if not create one
        await pool.query(`
            INSERT INTO chart_of_accounts (code, name, type)
            VALUES (1001, 'HDFC Bank - Primary', 'Asset')
            ON CONFLICT (code) DO NOTHING;
        `);

        await pool.query(`
            INSERT INTO bank_accounts (name, account_number, bank_name, account_code, current_balance)
            VALUES 
            ('HDFC Main', '50100234567890', 'HDFC Bank', 1001, 150000.00),
            ('Petty Cash Box', 'N/A', 'Internal', 1000, 5000.00)
            ON CONFLICT DO NOTHING;
        `);

        // 2. Tax Rates
        await pool.query(`
            INSERT INTO chart_of_accounts (code, name, type)
            VALUES (2500, 'GST Payable', 'Liability')
            ON CONFLICT (code) DO NOTHING;
        `);

        await pool.query(`
            INSERT INTO tax_rates (name, rate_percentage, account_code)
            VALUES 
            ('GST 5%', 0.05, 2500),
            ('GST 18%', 0.18, 2500)
            ON CONFLICT DO NOTHING;
        `);

        // 3. Customers
        await pool.query(`
            INSERT INTO customers (name, phone, email, address, loyalty_points)
            VALUES 
            ('Rahul Sharma', '9876500001', 'rahul@example.com', '123, mg road, bangalore', 50),
            ('Priya Verma', '9876500002', 'priya@example.com', '456, indiranagar, bangalore', 120)
            ON CONFLICT (phone) DO NOTHING;
        `);

        // 4. Salary Components
        await pool.query(`
            INSERT INTO salary_components (name, type, is_taxable)
            VALUES 
            ('Basic Salary', 'Earning', true),
            ('HRA', 'Earning', true),
            ('Transport Allowance', 'Earning', false),
            ('PF Contribution', 'Deduction', false),
            ('Professional Tax', 'Deduction', false)
            ON CONFLICT DO NOTHING;
        `);

        // 5. Link Components to Employees (Sample)
        const empRes = await pool.query('SELECT id FROM employees LIMIT 1');
        if (empRes.rows.length > 0) {
            const empId = empRes.rows[0].id;
            const compRes = await pool.query('SELECT id FROM salary_components WHERE name = \'Basic Salary\'');
            if (compRes.rows.length > 0) {
                const compId = compRes.rows[0].id;
                await pool.query(`
                    INSERT INTO employee_salary_structure (employee_id, component_id, amount)
                    VALUES ($1, $2, 25000)
                    ON CONFLICT (employee_id, component_id) DO UPDATE SET amount = EXCLUDED.amount;
                `, [empId, compId]);
            }
        }

        // 6. Shifts
        await pool.query(`
            INSERT INTO shifts (name, start_time, end_time)
            VALUES 
            ('Morning Shift', '09:00:00', '17:00:00'),
            ('Evening Shift', '16:00:00', '00:00:00')
            ON CONFLICT DO NOTHING;
        `);

        console.log('Seeding completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding data:', err);
        process.exit(1);
    }
};

seedData();
