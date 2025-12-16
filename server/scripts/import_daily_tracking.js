const XLSX = require('xlsx');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const filePath = path.join(__dirname, '../Daily_Restaurant_Tracking.xlsx');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function importData() {
    const client = await pool.connect();
    try {
        console.log('Reading Excel file...');
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets['Daily Transactions'];
        const data = XLSX.utils.sheet_to_json(sheet);

        console.log(`Found ${data.length} records. Starting import...`);

        await client.query('BEGIN');

        // Cache categories
        const categoriesRes = await client.query('SELECT id, name FROM transaction_categories');
        const categories = {};
        categoriesRes.rows.forEach(c => categories[c.name.toLowerCase()] = c.id);

        let importedCount = 0;
        let skippedCount = 0;

        for (const row of data) {
            // Validate Row
            if (!row['Date'] || !row['Amount']) {
                skippedCount++;
                continue;
            }

            // Parse Date
            const excelDate = row['Date'];
            const jsDate = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
            const dateStr = jsDate.toISOString().split('T')[0];

            // Parse Amount
            const amount = parseFloat(row['Amount']) || 0;

            // Type & Category
            const categoryName = row['Category'] ? row['Category'].trim() : 'Uncategorized';
            const type = categoryName.toLowerCase() === 'sales' ? 'Sales' : 'Expense';

            // Resolve Category ID
            let categoryId = categories[categoryName.toLowerCase()];
            if (!categoryId && categoryName) {
                // Create new category
                const catType = type === 'Sales' ? 'Income' : 'Expense';
                const newCat = await client.query(
                    'INSERT INTO transaction_categories (name, type) VALUES ($1, $2) RETURNING id',
                    [categoryName, catType]
                );
                categoryId = newCat.rows[0].id;
                categories[categoryName.toLowerCase()] = categoryId;
                console.log(`Created new category: ${categoryName}`);
            }

            // Payment Date
            let paidDate = null;
            if (row['Payment Date']) {
                const pd = new Date(Math.round((row['Payment Date'] - 25569) * 86400 * 1000));
                if (!isNaN(pd.getTime())) {
                    paidDate = pd.toISOString().split('T')[0];
                }
            }

            // Normalize Status
            let status = row['Paid/Unpaid'] || 'Pending';
            if (status.toLowerCase() === 'unpaid') status = 'Pending';
            if (status.toLowerCase() === 'paid') status = 'Paid';
            // Ensure status is valid
            if (!['Paid', 'Pending', 'Cancelled'].includes(status)) {
                status = 'Pending'; // Default fallback
            }

            // Vendor/Description
            let description = row['Item/Description'] || '';
            const remarks = row['Remarks/Vendors'];
            if (remarks) {
                description += ` (Vendor/Remark: ${remarks})`;
            }

            // Insert Transaction
            await client.query(
                `INSERT INTO transactions 
                (date, type, amount, payment_method, status, description, category_id, paid_by, paid_date, mode)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    dateStr,
                    type,
                    amount,
                    row['Mode'] || 'Cash', // Default to Cash?
                    status,
                    description,
                    categoryId,
                    row['Paid By'],
                    paidDate,
                    row['Mode'] // Saving original mode just in case in 'mode' column
                ]
            );

            importedCount++;
            if (importedCount % 50 === 0) console.log(`Imported ${importedCount} records...`);
        }

        await client.query('COMMIT');
        console.log(`\nImport Complete!`);
        console.log(`Imported: ${importedCount}`);
        console.log(`Skipped: ${skippedCount}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Import Failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

importData();
