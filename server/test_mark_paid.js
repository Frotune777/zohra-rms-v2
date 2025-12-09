require('dotenv').config();
const db = require('./src/config/db');

async function testMarkPaidLogic() {
    try {
        console.log('=== TESTING MARK PAID LOGIC ===\n');

        // Get a paid salary record with advance deduction
        const result = await db.query(`
            SELECT * FROM salary_history 
            WHERE status = 'Paid' AND advance_deduction > 0
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            console.log('No paid salary records with advance deductions found');
            process.exit();
        }

        const record = result.rows[0];
        console.log('Testing with record:');
        console.log(`  Employee ID: ${record.employee_id}`);
        console.log(`  Month/Year: ${record.month}/${record.year}`);
        console.log(`  Advance Deduction: ₹${record.advance_deduction}`);
        console.log(`  Status: ${record.status}`);
        console.log(`  Payment Date: ${record.payment_date}`);
        console.log('');

        // Check the condition
        console.log(`Checking: record.advance_deduction > 0`);
        console.log(`  record.advance_deduction = ${record.advance_deduction}`);
        console.log(`  Type: ${typeof record.advance_deduction}`);
        console.log(`  Condition result: ${record.advance_deduction > 0}`);
        console.log('');

        // Check if repayment exists for this employee
        const repaymentCheck = await db.query(`
            SELECT * FROM advance_ledger
            WHERE employee_id = $1 AND transaction_type = 'Repayment'
            AND notes LIKE '%${record.month}/${record.year}%'
        `, [record.employee_id]);

        console.log(`Repayment records for this payroll: ${repaymentCheck.rows.length}`);
        if (repaymentCheck.rows.length > 0) {
            console.log('  Repayment exists:', JSON.stringify(repaymentCheck.rows[0], null, 2));
        }

    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
    } finally {
        process.exit();
    }
}

testMarkPaidLogic();
