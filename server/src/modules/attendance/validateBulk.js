const { DomainError } = require('../../utils/domain');
async function validateBulk(client, date, records) {
    if (!date || !Array.isArray(records)) throw new DomainError('Date and records required');
    if (records.some(r => !['Present','Absent','Half-Day'].includes(r.status))) throw new DomainError('Invalid attendance status');
    for (const record of [...records].sort((a,b)=>a.employee_id-b.employee_id)) {
        const employee = (await client.query('SELECT id,status FROM employees WHERE id=$1 FOR UPDATE',[record.employee_id])).rows[0];
        if (!employee || employee.status !== 'active') throw new DomainError('Active employee required');
        const attendance = (await client.query('SELECT is_locked,leave_request_id FROM attendance WHERE employee_id=$1 AND date=$2 FOR UPDATE',[record.employee_id,date])).rows[0];
        if (attendance?.is_locked || attendance?.leave_request_id) throw new DomainError('Attendance is locked or belongs to approved leave',409);
    }
}
module.exports = validateBulk;
