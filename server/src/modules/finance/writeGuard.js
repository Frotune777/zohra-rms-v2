const { DomainError } = require('../../utils/domain');
async function assertWritable(client, date, accountCodes = []) {
    const parsed = new Date(date);
    if (!Number.isFinite(parsed.getTime())) throw new DomainError('Invalid transaction date');
    const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : parsed.toISOString().slice(0, 10);
    // Serialize closure and posting for a day, including writers with no existing balance row.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['finance-day:' + day]);
    const period = await client.query(
        "SELECT id FROM financial_periods WHERE $1::date BETWEEN start_date AND end_date AND status IN ('Locked','Closed')", [day]);
    if (period.rowCount) throw new DomainError('Financial period is locked');
    const closed = await client.query(
        "SELECT id FROM daily_balances WHERE date = $1 AND status = 'Closed' AND account_code = ANY($2::int[])", [day, accountCodes]);
    if (closed.rowCount) throw new DomainError('This financial day is closed', 409);
    return day;
}
module.exports = { assertWritable };
