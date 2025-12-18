# AI Module

## Responsibilities
- Providing intelligent insights and natural language interaction over system data.
- Automating routine analytical tasks or identifying patterns in wastage/sales.

## Folder Structure
- `server/src/modules/ai/`
    - `controller.js`: Interface for AI processing.
    - `routes.js`: AI-related endpoints.

## DB Tables Used
- Primarily reads from various history and log tables for analysis.

## Public Services & Methods
- **Controller Methods**:
    - `analyzeTrends`: AI-driven analysis of operational data.
    - `chatWithData`: Natural language interface for querying RMS data.

## Core Business Rules
- **Non-Destructive**: AI operations are strictly read-only within the RMS domain.
- **Privacy**: Does not process sensitive user/employee PII unless required for a specific analytical task.

## Accounting Impact
- None.

## Risks / Unclear Logic
- **Hallucination**: AI-generated summaries must be verified against the official reports in the `Reports` module.
