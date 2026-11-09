const LedgerLine = require('./LedgerLine');

/**
 * JournalEntry Domain Entity
 * 
 * Enforces the primary rule of double-entry accounting: Balance.
 * - Must have a date and description.
 * - Must have at least two lines.
 * - Total Debits MUST equal Total Credits.
 */
class JournalEntry {
    constructor({ date, description, reference_id, reference_type, lines = [] }) {
        if (!date) throw new Error('Journal entry date is required');
        if (!description) throw new Error('Journal entry description is required');

        this.date = date instanceof Date ? date : new Date(date);
        if (!Number.isFinite(this.date.getTime())) throw new Error('Invalid journal entry date');
        this.description = description;
        this.reference_id = reference_id || null;
        this.reference_type = reference_type || null;

        this.lines = lines.map(line =>
            line instanceof LedgerLine ? line : new LedgerLine(line)
        );

        this.validate();
    }

    validate() {
        if (this.lines.length < 2) {
            throw new Error('Journal entry must have at least 2 lines');
        }
        if (new Set(this.lines.map(line => Number(line.account_code))).size < 2) {
            throw new Error('Journal entry requires at least two distinct accounts');
        }

        const totalDebit = this.lines.reduce((sum, line) => sum + line.debit, 0);
        const totalCredit = this.lines.reduce((sum, line) => sum + line.credit, 0);

        // Handle floating point precision
        if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
            throw new Error(
                `Unbalanced Journal Entry: Total Debits (${totalDebit.toFixed(2)}) ` +
                `does not equal Total Credits (${totalCredit.toFixed(2)})`
            );
        }
    }

    get totalAmount() {
        return this.lines.reduce((sum, line) => sum + line.debit, 0);
    }
}

module.exports = JournalEntry;
