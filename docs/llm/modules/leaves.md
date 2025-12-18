# Leaves Module

## Responsibilities
- Management of employee leave requests (Sick, Casual, Annual, etc.).
- Approval workflow coordinating with the Attendance module.
- Tracking leave history and reasons for audit.

## Folder Structure
- `server/src/modules/leaves/`
    - `controller.js`: Manages the request lifecycle and attendance auto-population.
    - `routes.js`: API endpoints for leave management.

## DB Tables Used
- `leave_requests`: Registry of all requests, durations, and statuses.
- `attendance`: Target for auto-population upon approval.
- `attendance_audit_log`: Logs for the auto-created attendance records.

## Public Services & Methods
- **Controller Methods**:
    - `createLeaveRequest`: Submits a 'Pending' request.
    - `approveLeave`: Transitions request to 'Approved' and triggers bulk attendance insertion for the date range.
    - `rejectLeave`: Transitions request to 'Rejected' with a reason.

## Core Business Rules
- **Sequential Purity**: Only 'Pending' requests can be Approved or Rejected.
- **Attendance Syncing**: Upon approval, the system iterates through every date in the leave range and inserts/updates an 'Absent' record in the `attendance` table.
- **Overlap Prevention**: Attendance auto-update uses `ON CONFLICT` to ensure the leave status takes precedence over previous manual entries.

## Accounting Impact
- No direct journal impact, but affects attendance data used in payroll proration.

## Risks / Unclear Logic
- **Date Range Complexity**: Large leave ranges (e.g., 30+ days) perform multiple SQL inserts in a loop within a single transaction, which could be optimized for performance.
- **Cancellation**: Deleting a leave request does not currently 'undo' the attendance records created during approval.
