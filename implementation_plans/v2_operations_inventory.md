# Implementation Plan - Operations & Inventory Intelligence (Phase 2)

**Version**: v1.0
**Date**: 2025-12-08
**Task**: KDS, Purchase Orders, Wastage Tracking

## Goal
Implement core operational features to digitize the kitchen workflow and streamline procurement.

## User Review Required
> [!IMPORTANT]
> **KDS Architecture**: We will use **WebSockets (Socket.io)** for real-time updates. This requires a running WebSocket server (can be part of the main Express app).
> **Database Changes**: New tables for `purchase_orders`, `wastage_logs`, and `kds_tickets`.

## Proposed Changes

### 1. Database Schema
#### [NEW] `purchase_orders`
-   `id`, `supplier_id`, `status` (Draft, Sent, Received), `total_amount`, `created_at`.
-   `purchase_order_items`: `po_id`, `inventory_item_id`, `qty_ordered`, `qty_received`, `unit_cost`.

#### [NEW] `wastage_logs`
-   `id`, `inventory_item_id`, `qty`, `reason` (Expired, Spilled, Cooked Error), `cost`, `reported_by`.

#### [NEW] `kds_tickets`
-   `id`, `order_id`, `status` (Pending, Preparing, Done), `station` (Grill, Fryer), `started_at`, `completed_at`.

### 2. Backend Modules
#### [NEW] `src/modules/operations/`
-   **KDS Controller**: Handle socket events and ticket status updates.
-   **Wastage Controller**: Log wastage and update inventory/finance (Credit Inventory, Debit Wastage Expense).

#### [MODIFY] `src/modules/inventory/`
-   **PO Controller**: Create POs, auto-generate from low stock, receive stock (updates inventory).

### 3. Real-time Infrastructure
-   Install `socket.io`.
-   Integrate Socket.io with `src/app.js` or `server.js`.

## Verification Plan

### Automated Tests
-   Test PO creation and status transition (Draft -> Received).
-   Test Wastage log reduces inventory and creates GL entry.

### Manual Verification
-   **KDS**: Open two browser windows. Create order in one (POS), verify it appears instantly in the other (KDS).
-   **Procurement**: Create a PO, "Receive" it, and verify Stock Qty increases.
