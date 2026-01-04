
import { Pool, PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://admin:password@localhost:5433/alzohra_db';

export class DbUtils {
    private pool: Pool;

    constructor() {
        console.log('DB Connection String:', connectionString);
        this.pool = new Pool({
            connectionString,
        });
    }

    async close() {
        await this.pool.end();
    }

    async query(text: string, params?: any[]) {
        return this.pool.query(text, params);
    }

    // --- Financial Assertions ---

    /**
     * Verifies that the sum of debits equals the sum of credits for a given transaction or journal entry.
     * If journalId is provided, checks that specific journal.
     */
    async verifyJournalBalance(journalId?: string) {
        let sql = `
      SELECT 
        SUM(debit) as total_debit, 
        SUM(credit) as total_credit 
      FROM ledger_lines
    `;
        const params: any[] = [];

        if (journalId) {
            sql += ` WHERE journal_entry_id = $1`;
            params.push(journalId);
        }

        const res = await this.query(sql, params);
        const { total_debit, total_credit } = res.rows[0];

        const diff = Math.abs(Number(total_debit || 0) - Number(total_credit || 0));
        if (diff > 0.01) {
            throw new Error(`Journal imbalance! Debit: ${total_debit}, Credit: ${total_credit}, Diff: ${diff} (JournalID: ${journalId || 'ALL'})`);
        }
    }

    async getVendorBalance(vendorId: string): Promise<number> {
        // Get account code
        const res = await this.query('SELECT ledger_account_code FROM suppliers WHERE id = $1', [vendorId]);
        if (res.rows.length === 0) throw new Error(`Vendor ${vendorId} not found`);
        const code = res.rows[0].ledger_account_code;

        if (!code) return 0; // Or throw if robust

        // Calculate balance (Credit - Debit for Liabilities/Vendors)
        const balRes = await this.query(`
        SELECT SUM(credit - debit) as balance 
        FROM ledger_lines 
        WHERE account_code = $1
    `, [code]);

        return Number(balRes.rows[0].balance || 0);
    }

    async isPeriodLocked(date: string): Promise<boolean> {
        // Assuming daily_balances tracks closure status
        const res = await this.query("SELECT status FROM daily_balances WHERE date = $1", [date]);
        if (res.rows.length === 0) return false;
        return res.rows[0].status === 'closed'; // Verify actual status string
    }

    // --- Data Setup / Teardown ---

    async cleanData() {
        // Truncate relevant tables to ensure clean state - be careful with foreign keys
        // This order is important to avoid FK constraint violations
        const tables = [
            'ledger_lines',
            'journal_entries',
            'transactions',
            'salary_history',
            'salary_advances',
            'employees',
            'suppliers',
            'inventory_items',
            'daily_balances',
            'daily_rates'
        ];

        // Disable triggers if necessary, or just CASCADE
        for (const table of tables) {
            try {
                await this.query(`TRUNCATE TABLE ${table} CASCADE`);
            } catch (e) {
                console.warn(`Failed to truncate ${table}: ${e}`);
            }
        }

        // Re-seed essential data if needed (e.g., admin user) - assumes separate seed script or helper
    }

    async createTestUser(role: 'owner' | 'manager' | 'staff') {
        // Implementation depends on auth schema
        // This is a placeholder for creating a valid JWT-able user
        const username = `test_${role}_${Date.now()}`;
        const password = 'password123';
        // Hash password if needed via DB function or simple text if app supports it for dev
        // Assuming naive insert for now, adjust to actual schema
        // You might need bcrypt here if the DB expects hashed passwords

        return { username, password };
    }
}

export const db = new DbUtils();
