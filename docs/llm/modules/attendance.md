# Attendance Module

## Responsibilities
- Recording and tracking daily attendance for all active employees.
- Providing a consolidated view of attendance history (Calendar view).
- Integration with the Leaves module to auto-mark absences for approved leaves.
- Providing data for the Payroll module to calculate effective work days.

## Folder Structure
- `server/src/modules/attendance/`
    - `service.js`: Core logic for fetching and saving daily/bulk attendance and calculating calendar stats.
    - `controller.js`: API handlers for attendance operations.
    - `routes.js`: Defines API endpoints.

## DB Tables Used
- `employees`: To resolve active employee lists.
- `attendance`: The primary log of status per employee per date.
- `attendance_audit_log`: Detailed record of changes for accountability.

## Public Services & Methods
- **AttendanceService**:
    - `getAttendance(date)`: Returns attendance status for all active employees on a specific date.
    - `saveBulkAttendance(date, records)`: Atomic update of multiple attendance records.
    - `getCalendar(startDate, endDate)`: Provides summary stats (complete/partial/missing) for a date range.

## Core Business Rules
- **Active Only**: Attendance is only tracked for employees with 'active' status.
- **Conflict Handling**: Uses `ON CONFLICT (date, employee_id)` to ensure idempotency when saving records.
- **Leave Integration**: Status is automatically set to 'Absent' with appropriate notes when a leave request is approved.

## Accounting Impact
- No direct journal impact.
- Indirectly impacts the `Payroll` module by determining the `earnedSalary` via work day counts.

## Risks / Unclear Logic
- **Manual Overrides**: Attendance can be manually changed even for dates with approved leaves, which may cause discrepancy if not audited.
