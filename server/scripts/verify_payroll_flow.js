require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');
const PayrollController = require('../src/modules/payroll/controller');

// Mock Express Req/Res
const mockReq = (body) => ({ body });
const mockRes = () => {
    const res = {};
    res.json = (data) => { res.data = data; return res; };
    res.status = (code) => { res.statusCode = code; return res; };
    return res;
};

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://admin:password@localhost:5432/alzohra_db',
});

async function verifyPayroll() {
    const client = await pool.connect();
    try {
        console.log('Starting Payroll Verification...');

        // 1. Create Test Employee
        const empRes = await client.query(`
            INSERT INTO employees (full_name, base_salary, status) 
            VALUES ('Payroll Test User', 50000, 'active') 
            RETURNING id
        `);
        const empId = empRes.rows[0].id;
        console.log(`Created Test Employee: ${empId}`);

        // 2. Create Components if not exist (Master setup)
        // Assume seed ran. Fetch IDs.
        const basicRes = await client.query("SELECT id FROM salary_components WHERE name = 'Basic Salary'");
        const hraRes = await client.query("SELECT id FROM salary_components WHERE name = 'HRA'");

        let basicId, hraId;
        if (basicRes.rows.length === 0) {
            const newBasic = await client.query("INSERT INTO salary_components (name, type) VALUES ('Basic Salary', 'Earning') RETURNING id");
            basicId = newBasic.rows[0].id;
        } else basicId = basicRes.rows[0].id;

        if (hraRes.rows.length === 0) {
            const newHra = await client.query("INSERT INTO salary_components (name, type) VALUES ('HRA', 'Earning') RETURNING id");
            hraId = newHra.rows[0].id;
        } else hraId = hraRes.rows[0].id;

        // 3. Assign Structure
        // 30k Basic, 10k HRA. Total 40k. Base Salary 50k (so 10k undefined or fallback? OR structure overrides base?)
        // Logic says: If structure exists, use it.
        await client.query(`INSERT INTO employee_salary_structure (employee_id, component_id, amount) VALUES ($1, $2, 30000)`, [empId, basicId]);
        await client.query(`INSERT INTO employee_salary_structure (employee_id, component_id, amount) VALUES ($1, $2, 10000)`, [empId, hraId]);

        // 4. Run Payroll
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();

        const req = mockReq({
            month, year, employeeId: empId,
            daysWorked: 15, // Half month
            // deduction etc
        });
        const res = mockRes();

        console.log(`Running Payroll for ${month}/${year}...`);
        await PayrollController.runPayroll(req, res);

        if (res.data && res.data.success) {
            console.log('Payroll Run Success:', res.data.data[0]);
            const historyId = res.data.data[0].id;

            // 5. Verify Components
            const compCheck = await client.query('SELECT * FROM salary_history_components WHERE salary_history_id = $1', [historyId]);
            console.log('Components Found:', compCheck.rows);

            // Verify Amounts
            // 15 days worked out of e.g. 31.
            // Basic: 30000 / 31 * 15 ~= 14516
            // HRA: 10000 / 31 * 15 ~= 4838
            // Total should be around 19354.

            const basicComp = compCheck.rows.find(c => c.component_name === 'Basic Salary');
            if (basicComp && parseFloat(basicComp.amount) > 0) {
                console.log(`✅ Basic Salary Pro-rated: ${basicComp.amount}`);
            } else {
                console.error('❌ Basic Salary missing or zero');
            }
        } else {
            console.error('Payroll Run Failed:', res.data || res.statusCode);
        }

        // Cleanup
        await client.query('DELETE FROM employees WHERE id = $1', [empId]); // Cascade deletes structure/history

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        client.release();
        pool.end();
        process.exit(0);
    }
}

verifyPayroll();
