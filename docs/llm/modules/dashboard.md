# Dashboard Module

## Responsibilities
- Coordinating data for the primary landing page and summary views.
- Providing real-time snapshots of operational health (Sales, Attendance, Stock levels).
- Aggregating pending tasks (Pending Advances, Pending Bills).

## Folder Structure
- `server/src/modules/dashboard/`
    - `controller.js`: Orchestrates summary queries to multiple tables.
    - `routes.js`: Defines the main dashboard API endpoints.

## DB Tables Used
- `orders`, `attendance`, `bill_entries`, `advance_requests`, `inventory_items`.

## Public Services & Methods
- **Controller Methods**:
    - `getDashboardSummary`: Returns a composite object containing today's stats and high-priority action items.

## Core Business Rules
- **Real-Time Focus**: Prioritizes 'Today's' data for operational decision making.
- **Action Oriented**: Highlights items requiring approval or attention.

## Accounting Impact
- No direct impact; provides visibility into financial indicators (e.g., Today's Revenue).

## Risks / Unclear Logic
- **Data Freshness**: Relies on frequent polling from the frontend.
- **Aggregation Load**: Frequent calls to summarize multiple tables can be expensive on a busy system.
