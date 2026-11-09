const { DomainError, finite } = require("../../utils/domain");
async function buildDrafts(data, client) {
  const {
    month,
    year,
    employeeId,
    daysWorked,
    manualAdjustment,
    adjustmentReason,
    overtimeHours,
    overtimeAmount,
    extraDays,
    extraDayAmount,
  } = data;
  if (
    !Number.isInteger(Number(month)) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(Number(year))
  )
    throw new DomainError("Valid month and year required");

  // 1. Get employees (all or specific one)
  let query = "SELECT * FROM employees WHERE status = 'active'";
  let params = [];
  if (employeeId) {
    query += " AND id = $1";
    params.push(employeeId);
  }
  console.log(
    `[Payroll] Fetching employees: ${query} params=${JSON.stringify(params)}`,
  );
  const employees = await client.query(
    query + " ORDER BY id FOR UPDATE",
    params,
  );
  console.log(`[Payroll] Found ${employees.rows.length} employees`);

  const payrollData = [];

  for (const emp of employees.rows) {
    console.log(`[Payroll] Processing employee ${emp.id} (${emp.full_name})`);
    if (data.advanceDeduction !== undefined)
      finite(data.advanceDeduction, "Advance deduction");
    const daysInMonth = new Date(year, month, 0).getDate();

    // 2. Calculate Days Worked from Attendance
    let effectiveDays = 0;
    let paidLeaveDays = 0;
    let attendanceMissing = false;

    if (daysWorked !== undefined && employeeId) {
      effectiveDays = daysWorked;
    } else {
      console.log(`[Payroll] Querying attendance for emp ${emp.id}`);
      const attendanceRes = await client.query(
        `SELECT a.status, (lr.status='Approved' AND lr.leave_type='Paid') AS paid_leave FROM attendance a
                     LEFT JOIN leave_requests lr ON lr.id=a.leave_request_id AND lr.employee_id=a.employee_id
                     WHERE a.employee_id = $1 
                     AND EXTRACT(MONTH FROM a.date) = $2 
                     AND EXTRACT(YEAR FROM a.date) = $3`,
        [emp.id, month, year],
      );
      console.log(
        `[Payroll] Attendance records found: ${attendanceRes.rows.length}`,
      );

      let attendanceDays = 0;
      attendanceRes.rows.forEach((r) => {
        if (r.paid_leave) {
          attendanceDays += 1;
          paidLeaveDays += 1;
        } else if (r.status === "Present") attendanceDays += 1;
        else if (r.status === "Half-Day") attendanceDays += 0.5;
      });

      attendanceMissing = attendanceRes.rows.length === 0;
      effectiveDays = attendanceMissing ? daysInMonth : attendanceDays;

      if (
        daysWorked !== undefined &&
        employeeId &&
        parseInt(employeeId) === emp.id
      ) {
        effectiveDays = daysWorked;
      }
    }

    effectiveDays = finite(effectiveDays, "Days worked");
    if (effectiveDays > daysInMonth)
      throw new DomainError("Days worked exceed month length");
    // 3. Salary Components & Base Calculation
    console.log(`[Payroll] Querying salary structure for emp ${emp.id}`);
    const structureRes = await client.query(
      `SELECT sc.name, sc.type, ess.amount 
                 FROM employee_salary_structure ess
                 JOIN salary_components sc ON ess.component_id = sc.id
                 WHERE ess.employee_id = $1`,
      [emp.id],
    );

    let baseEarned = 0;
    let componentDeductions = 0;
    const proratedComponents = [];

    if (structureRes.rows.length > 0) {
      structureRes.rows.forEach((comp) => {
        const amount = parseFloat(comp.amount);
        const proratedAmount = Number(
          ((amount / daysInMonth) * effectiveDays).toFixed(2),
        );

        if (comp.type === "Earning") {
          baseEarned += proratedAmount;
        } else if (comp.type === "Deduction") {
          componentDeductions += proratedAmount;
        }

        proratedComponents.push({
          name: comp.name,
          type: comp.type,
          amount: proratedAmount,
        });
      });
    } else {
      const perDaySalary = parseFloat(emp.base_salary) / daysInMonth;
      baseEarned = Number((perDaySalary * effectiveDays).toFixed(2));

      proratedComponents.push({
        name: "Basic Salary",
        type: "Earning",
        amount: baseEarned,
      });
    }

    // 4. Overtime & Extra Days
    const otAmount = finite(overtimeAmount ?? 0, "Overtime amount");
    const exDayAmount = finite(extraDayAmount ?? 0, "Extra day amount");
    const manualAdj = finite(manualAdjustment ?? 0, "Manual adjustment", {
      min: -Infinity,
    });

    // 5. Get Outstanding Advance Balance
    console.log(`[Payroll] Querying advance/ledger for emp ${emp.id}`);
    const advanceBalanceRes = await client.query(
      `
                SELECT 
                    COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                    COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as outstanding_balance
                FROM advance_ledger 
                WHERE employee_id = $1
            `,
      [emp.id],
    );

    const outstandingBalance = parseFloat(
      advanceBalanceRes.rows[0].outstanding_balance || 0,
    );

    // Determine deduction amount (Advance)
    let advanceDeduction = 0;
    if (
      data.advanceDeduction !== undefined &&
      employeeId &&
      parseInt(employeeId) === emp.id
    ) {
      advanceDeduction =
        Math.round(finite(data.advanceDeduction, "Advance deduction") * 100) /
        100;
      if (advanceDeduction > outstandingBalance)
        throw new DomainError("Advance recovery exceeds outstanding balance");
    } else if (outstandingBalance > 0) {
      advanceDeduction = outstandingBalance;
    }

    // 6. Net Pay Calculation
    const grossPay = baseEarned + otAmount + exDayAmount + manualAdj;
    const netPay = Number(
      (grossPay - componentDeductions - advanceDeduction).toFixed(2),
    );

    // 7. Upsert Salary History
    console.log(`[Payroll] Checking existing history for emp ${emp.id}`);
    const existing = await client.query(
      "SELECT status FROM salary_history WHERE employee_id = $1 AND month = $2 AND year = $3 FOR UPDATE",
      [emp.id, month, year],
    );

    if (
      existing.rows.length > 0 &&
      ["Paid", "Approved"].includes(existing.rows[0].status)
    ) {
      console.log(`[Payroll] Skipping emp ${emp.id} - Already Paid`);
      continue;
    }

    console.log(`[Payroll] Upserting history for emp ${emp.id}`);
    const historyRes = await client.query(
      `INSERT INTO salary_history 
                 (employee_id, month, year, days_worked, calculated_salary, advance_deduction, net_pay, status, allowances, deductions, overtime_hours, overtime_amount, extra_days, extra_day_amount)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', $8, $9, $10, $11, $12, $13)
                 ON CONFLICT (employee_id, month, year) 
                 DO UPDATE SET 
                    days_worked = EXCLUDED.days_worked,
                    calculated_salary = EXCLUDED.calculated_salary,
                    advance_deduction = EXCLUDED.advance_deduction,
                    net_pay = EXCLUDED.net_pay,
                    allowances = EXCLUDED.allowances,
                    deductions = EXCLUDED.deductions,
                    overtime_hours = EXCLUDED.overtime_hours,
                    overtime_amount = EXCLUDED.overtime_amount,
                    extra_days = EXCLUDED.extra_days,
                    extra_day_amount = EXCLUDED.extra_day_amount
                 RETURNING id, *`,
      [
        emp.id,
        month,
        year,
        effectiveDays,
        grossPay,
        advanceDeduction,
        netPay,
        "{}",
        componentDeductions ? { total: componentDeductions } : "{}",
        overtimeHours || 0,
        otAmount,
        extraDays || 0,
        exDayAmount,
      ],
    );

    const historyId = historyRes.rows[0].id;
    await client.query(
      "UPDATE salary_history SET total_days_in_month=$2,manual_adjustment=$3,adjustment_reason=$4,paid_leave_days=$5,attendance_missing=$6 WHERE id=$1",
      [
        historyId,
        daysInMonth,
        manualAdj,
        adjustmentReason || null,
        paidLeaveDays,
        attendanceMissing,
      ],
    );
    Object.assign(historyRes.rows[0], {
      paid_leave_days: paidLeaveDays,
      attendance_missing: attendanceMissing,
    });

    // 8. Save Components Breakdown
    console.log(`[Payroll] Saving components for history ${historyId}`);
    await client.query(
      "DELETE FROM salary_history_components WHERE salary_history_id = $1",
      [historyId],
    );

    for (const comp of proratedComponents) {
      await client.query(
        `INSERT INTO salary_history_components (salary_history_id, component_name, amount, type)
                     VALUES ($1, $2, $3, $4)`,
        [historyId, comp.name, comp.amount, comp.type],
      );
    }

    if (otAmount > 0) {
      await client.query(
        `INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Overtime', $2, 'Earning')`,
        [historyId, otAmount],
      );
    }
    if (exDayAmount > 0) {
      await client.query(
        `INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Extra Days', $2, 'Earning')`,
        [historyId, exDayAmount],
      );
    }
    if (manualAdj !== 0) {
      const type = manualAdj > 0 ? "Earning" : "Deduction";
      await client.query(
        `INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Manual Adjustment', $2, $3)`,
        [historyId, Math.abs(manualAdj), type],
      );
    }
    if (advanceDeduction > 0) {
      await client.query(
        `INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Advance Recovery', $2, $3)`,
        [historyId, advanceDeduction, "Deduction"],
      );
    }

    const resultRow = historyRes.rows[0];
    resultRow.total_outstanding_advances = outstandingBalance;
    payrollData.push(resultRow);
  }

  return payrollData;
}
module.exports = { buildDrafts };
