class DomainError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
function finite(value, name, { min = 0, positive = false } = {}) {
    const number = typeof value === 'number' ? value : Number(value);
    if (value === null || value === '' || value === undefined || !Number.isFinite(number) || number < min || (positive && number <= 0)) {
        throw new DomainError(`${name} must be a finite ${positive ? 'positive' : 'non-negative'} number`);
    }
    return number;
}
function statusFor(err) {
    if (err.status) return err.status;
    if (err.code === '23503') return 409;
    if (['23505', '23514', '22P02', '22003', '22007', '22008'].includes(err.code)) return 400;
    if (/period.*locked|locked.*period/i.test(err.message)) return 400;
    return 500;
}
module.exports = { DomainError, finite, statusFor };
