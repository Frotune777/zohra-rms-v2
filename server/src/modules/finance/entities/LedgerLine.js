/**
 * LedgerLine Domain Entity
 * 
 * Enforces accounting rules for a single line of a journal entry.
 * - Must have an account code.
 * - Must have either debit or credit, but not both.
 * - Values must be non-negative.
 */
class LedgerLine {
    constructor({ account_code, debit = 0, credit = 0 }) {
        if (!account_code) {
            throw new Error('Account code is required for a ledger line');
        }

        const d = parseFloat(debit || 0);
        const c = parseFloat(credit || 0);

        if (d < 0 || c < 0) {
            throw new Error('Debit and credit values must be non-negative');
        }

        if (d > 0 && c > 0) {
            throw new Error(`Ledger line for account ${account_code} cannot have both debit and credit values`);
        }

        if (d === 0 && c === 0) {
            throw new Error(`Ledger line for account ${account_code} must have either a debit or credit value`);
        }

        this.account_code = account_code;
        this.debit = d;
        this.credit = c;
    }

    get amount() {
        return this.debit > 0 ? this.debit : -this.credit;
    }
}

module.exports = LedgerLine;
