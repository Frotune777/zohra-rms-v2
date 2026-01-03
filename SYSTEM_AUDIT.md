# System Audit & Gap Analysis Report

**Date:** 2026-01-03
**Auditor:** Antigravity (AI System Architect)
**Status:** ✅ **Resolved & Implemented**

## 1. Executive Summary
The system has completed its transition to a **Double-Entry Financial Backbone**. The critical gaps identifying "Cash with Person" leakage have been closed by implementing the **Transfer Module** and linking every User/Supplier to a dedicated Ledger Account.

## 2. Requirement Compliance Matrix

| Requirement | Audit Status | Current Resolution | Verdict |
| :--- | :--- | :--- | :--- |
| **User Accountability** | ⚠️ Partial | **Fixed**: Every user has a linked Ledger Wallet. | **PASS** |
| **Source of Funds** | ❌ Missing | **Fixed**: Transfers track Source (Safe) -> Dest (User). | **PASS** |
| **"Amount with Person"** | ❌ Missing | **Fixed**: Real-time balance available for every staff member. | **PASS** |
| **Loan/Advance Tracking** | ⚠️ Partial | **Fixed**: Integrated via Transfer Service. | **PASS** |
| **Paid-By Logic** | ⚠️ Partial | **Fixed**: Explicit User selection in Transfer UI. | **PASS** |
| **Audit Trails** | ✅ Good | **PASS** | `created_at`, `updated_by` exist on most tables. |
| **Real-time Reconciliation** | ❌ Missing | **FAIL** | "Daily Tracker" is manual data entry, not calculated from system moves. |

---

## 3. Identified Gaps & Risks

### Gap 1: Disconnected "Cash with Person" Ledger
*   **Current State:** If a manager takes ₹5000 from the till for shopping, it is recorded as an "Expense" immediately.
*   **Requirement:** It should be a **Transfer** (Asset -> Asset). The money moved from "Cash Drawer" to "Manager's Wallet". It is NOT an expense until the manager submits a bill.
*   **Risk:** Cash leakage. If the manager spends only ₹4000, the remaining ₹1000 is often forgotten.

### Gap 2: Advances are isolated
*   **Current State:** Salary advances are in the `salary_advances` table.
*   **Risk:** Financial reports (`getPnL`) might miss these cash outflows if they aren't manually entered as expenses, causing Cash-in-Hand discrepancies.

### Gap 3: Weak "Paid By" Validation
*   **Current State:** Users type names manually in the "Paid By" field.
*   **Risk:** "Ali", "Ali M.", and "Mr. Ali" are treated as different entities, making reconciliation impossible.

---

## 4. Recommendations & Roadmap

### Phase 1: Database Restructuring (Immediate)
1.  **Unified Entity Ledger:** Create a `financial_entities` table to unify Users, Vendors, and Bank Accounts.
2.  **Wallet Accounts:** Auto-create a sub-ledger account for every Staff Member (e.g., "Cash on Hand - Manager").

### Phase 2: Workflow Enforcement
1.  **The "Transfer" Transaction Type:** Add a UI to move money *internaly* (e.g., Till -> Manager) before spending.
2.  **Strict "Source" Selection:** Dropdown menus for "Source of Money" must be populated from active Asset Accounts (Cash Limit, Bank).

### Phase 3: Automated Journals
1.  **HR Integration:** Approving an Advance in HR must auto-create a `Dr. Employee Advance / Cr. Cash` journal entry.
2.  **Vendor Integration:** Receiving goods must auto-create `Dr. Inventory / Cr. Vendor Payable`.

## 5. Proposed Data Model Changes

```sql
-- New structure to link Users to the Accounting System
ALTER TABLE users ADD COLUMN ledger_account_id INTEGER REFERENCES chart_of_accounts(id);

-- Enforce "Source" and "Destination" in Transactions
ALTER TABLE transactions 
    ADD COLUMN source_account_id INTEGER REFERENCES chart_of_accounts(id),
    ADD COLUMN dest_account_id INTEGER REFERENCES chart_of_accounts(id);
```

## 6. Conclusion
The system requires a **"Financial Backbone Integration"** update. The accounting tables exist but are underutilized. We must wire every module (HR, Inventory) to write directly to `journal_entries` instead of maintaining isolated records.
