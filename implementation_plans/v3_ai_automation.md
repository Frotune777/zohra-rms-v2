# Implementation Plan - AI & Automation (Phase 3)

**Version**: v1.0
**Date**: 2025-12-08
**Task**: Demand Forecasting, Smart Procurement

## Goal
Implement intelligent features to predict inventory needs and automate procurement, reducing wastage and stockouts.

## User Review Required
> [!NOTE]
> **Data Source**: We will use `kds_tickets` (JSONB data) to calculate historical item usage. Since this table is new, the forecast will initially be based on limited data. We can create a seeding script to generate dummy history for demonstration.
> **Algorithm**: We will use a **Weighted Moving Average** for the initial forecasting model. It is robust and suitable for retail/food data.

## Proposed Changes

### 1. Backend Modules
#### [NEW] `src/modules/ai/`
-   **Forecasting Controller**:
    -   `getDemandForecast(itemId)`: Analyzes past usage from `kds_tickets` -> `recipe_ingredients`.
    -   `predictStockout(itemId)`: Estimates when an item will run out based on current stock and usage rate.
-   **Smart Procurement Controller**:
    -   `getSuggestedPOs()`: Generates a list of items to order based on (Forecast > Stock + Incoming).

### 2. Database Changes
-   No new tables required. We will query existing `kds_tickets`, `inventory_items`, and `recipe_ingredients`.

### 3. API Endpoints
-   `GET /api/ai/forecast/:itemId`: Get usage trend and predicted demand.
-   `GET /api/ai/stockout-prediction`: List items at risk of running out in next 7 days.
-   `GET /api/ai/suggested-orders`: Get auto-generated PO suggestions.

## Verification Plan

### Automated Tests
-   **Unit Test**: Feed mock sales data to the forecasting function and verify the output.

### Manual Verification
-   **Seeding**: Run a script to generate 30 days of fake KDS tickets.
-   **API Check**: Call `/api/ai/suggested-orders` and verify it recommends items with low stock/high usage.
