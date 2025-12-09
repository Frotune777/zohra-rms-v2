const XLSX = require('xlsx');
const path = require('path');
const db = require('./src/config/db');

// Helper function to convert Excel date serial number to JavaScript Date
function excelDateToJSDate(serial) {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);

    const year = date_info.getUTCFullYear();
    const month = String(date_info.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date_info.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

async function importChickenData() {
    try {
        console.log('Starting import process...\n');

        // Read the Excel file
        const filePath = path.join(__dirname, '..', 'Chicken Rate & Bill Tracker.xlsx');
        const workbook = XLSX.readFile(filePath);

        // 1. Check/Create Golden Chicken vendor
        console.log('Checking for Golden Chicken vendor...');
        let vendorResult = await db.query(
            'SELECT id FROM suppliers WHERE name = $1',
            ['Golden Chicken']
        );

        let vendorId;
        if (vendorResult.rows.length === 0) {
            console.log('Creating Golden Chicken vendor...');
            const insertResult = await db.query(
                `INSERT INTO suppliers (name, vendor_type, markup_required) 
                 VALUES ($1, $2, $3) RETURNING id`,
                ['Golden Chicken', 'Chicken Supplier', true]
            );
            vendorId = insertResult.rows[0].id;
            console.log(`✓ Created vendor with ID: ${vendorId}\n`);
        } else {
            vendorId = vendorResult.rows[0].id;
            console.log(`✓ Found existing vendor with ID: ${vendorId}\n`);
        }

        // 2. Import Daily Rates from "Raw Data" sheet
        console.log('Importing daily rates from Raw Data sheet...');
        const rawDataSheet = workbook.Sheets['Raw Data'];
        const rawData = XLSX.utils.sheet_to_json(rawDataSheet, { header: 1 });

        let ratesImported = 0;
        let ratesSkipped = 0;

        // Start from row 7 (index 6) where actual data begins
        for (let i = 7; i < rawData.length; i++) {
            const row = rawData[i];

            // Skip empty rows
            if (!row || row.length < 6) continue;

            const dateSerial = row[3]; // Column D (index 3)
            const tandoorRate = row[4]; // Column E (index 4)
            const boilerRate = row[5]; // Column F (index 5)
            const eggRate = row[6]; // Column G (index 6)

            // Skip if no date
            if (!dateSerial || typeof dateSerial !== 'number') continue;

            const date = excelDateToJSDate(dateSerial);

            // Check if rate already exists for this date
            const existing = await db.query(
                'SELECT date FROM daily_rates WHERE date = $1',
                [date]
            );

            if (existing.rows.length > 0) {
                ratesSkipped++;
                continue;
            }

            // Insert daily rate
            await db.query(
                `INSERT INTO daily_rates (date, tandoor_rate, boiler_rate, egg_rate)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (date) DO UPDATE SET
                 tandoor_rate = $2, boiler_rate = $3, egg_rate = $4`,
                [date, tandoorRate || 0, boilerRate || 0, eggRate || 0]
            );

            ratesImported++;
        }

        console.log(`✓ Imported ${ratesImported} daily rates`);
        console.log(`  Skipped ${ratesSkipped} existing rates\n`);

        // 3. Import Bill Entries from "Bill" sheet
        console.log('Importing bill entries from Bill sheet...');
        const billSheet = workbook.Sheets['Bill'];
        const billData = XLSX.utils.sheet_to_json(billSheet, { header: 1 });

        let billsImported = 0;
        let billsSkipped = 0;

        // Find the header row (row with "Date", "Tandoori", etc.)
        let headerRowIndex = -1;
        for (let i = 0; i < billData.length; i++) {
            if (billData[i][0] === 'Date' && billData[i][1] === 'Tandoori') {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            console.log('Could not find header row in Bill sheet');
            return;
        }

        // Process bill entries starting from the row after header
        for (let i = headerRowIndex + 1; i < billData.length; i++) {
            const row = billData[i];

            // Skip empty rows
            if (!row || row.length < 10) continue;

            const dateSerial = row[0]; // Date column

            // Skip if no date or invalid date
            if (!dateSerial || typeof dateSerial !== 'number') continue;

            const date = excelDateToJSDate(dateSerial);

            // Get rates from columns (these are the effective rates)
            const tandooriRate = row[1] || 0;
            const splLegRate = row[2] || 0;
            const bonelessRate = row[3] || 0;
            const fullLegRate = row[4] || 0;
            const wingsRate = row[5] || 0;
            const dressingTandooriRate = row[6] || 0;
            const boilerRate = row[7] || 0;
            const eggRate = row[8] || 0;

            // Get weights from the weight section (columns 25-32)
            const dressingTandoorWeight = row[25] || 0;
            const tandooriWeight = row[26] || 0;
            const splLegWeight = row[27] || 0;
            const bonelessWeight = row[28] || 0;
            const fullLegWeight = row[29] || 0;
            const wingsWeight = row[30] || 0;
            const boilerWeight = row[31] || 0;
            const eggWeight = row[32] || 0;

            // Create bill entries for each item type that has weight
            const items = [
                { name: 'Dressing Tandoori', rate: dressingTandooriRate, weight: dressingTandoorWeight },
                { name: 'Tandoori', rate: tandooriRate, weight: tandooriWeight },
                { name: 'Spl Leg', rate: splLegRate, weight: splLegWeight },
                { name: 'Boneless', rate: bonelessRate, weight: bonelessWeight },
                { name: 'Full Leg', rate: fullLegRate, weight: fullLegWeight },
                { name: 'Wings', rate: wingsRate, weight: wingsWeight },
                { name: 'Boiler', rate: boilerRate, weight: boilerWeight },
                { name: 'Egg', rate: eggRate, weight: eggWeight }
            ];

            for (const item of items) {
                if (item.weight > 0) {
                    // Check if bill entry already exists
                    const existing = await db.query(
                        'SELECT id FROM bill_entries WHERE date = $1 AND supplier_id = $2 AND item_name = $3',
                        [date, vendorId, item.name]
                    );

                    if (existing.rows.length > 0) {
                        billsSkipped++;
                        continue;
                    }

                    // For now, use vendor_rate = expected_rate (we don't have separate vendor rates in the sheet)
                    const vendorRate = item.rate;
                    const expectedRate = item.rate;
                    const variance = 0;

                    await db.query(
                        `INSERT INTO bill_entries (date, supplier_id, item_name, qty, vendor_rate, expected_rate, variance, status)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [date, vendorId, item.name, item.weight, vendorRate, expectedRate, variance, 'Approved']
                    );

                    billsImported++;
                }
            }
        }

        console.log(`✓ Imported ${billsImported} bill entries`);
        console.log(`  Skipped ${billsSkipped} existing entries\n`);

        console.log('Import completed successfully!');
        console.log(`\nSummary:`);
        console.log(`- Vendor: Golden Chicken (ID: ${vendorId})`);
        console.log(`- Daily Rates: ${ratesImported} imported, ${ratesSkipped} skipped`);
        console.log(`- Bill Entries: ${billsImported} imported, ${billsSkipped} skipped`);

        process.exit(0);
    } catch (error) {
        console.error('Error during import:', error);
        process.exit(1);
    }
}

importChickenData();
