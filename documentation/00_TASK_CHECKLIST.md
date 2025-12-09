# Vendor Payment & Ledger System + Advance Recovery Validation

## Phase 1: Advance Recovery Validation Enhancements
- [x] Add validation to prevent negative advance balances
- [x] Implement check for outstanding balance before repayment
- [x] Add database constraints for advance ledger
- [x] Update payroll controller to skip recovery when balance ≤ 0
- [x] Show current outstanding balance in payroll UI
- [x] Add repayment source tagging (Payroll, Manual, Cash, Retroactive)
- [x] Require notes for manual repayments
- [x] Add role-based access control for manual repayments

## Phase 2: Database Schema Design
- [x] Review existing `vendors` and `suppliers` tables
- [x] Create/update `vendor_categories` table
- [x] Review existing `vendor_ledger` table structure
- [x] Add payment mode and reference fields
- [x] Add expense category mapping to vendors
- [x] Create database migration script

## Phase 3: Backend API Development
- [x] Vendor CRUD operations (if not exists)
- [x] Vendor category management endpoints
- [x] Vendor ledger query endpoints (with filters)
- [x] Payment processing endpoint with validations
- [x] Outstanding balance calculation service
- [x] Partial payment support logic
- [x] Over-payment protection middleware
- [x] Integration with general ledger (journal entries)

## Phase 4: Ledger Calculation Logic
- [x] Running balance calculation
- [x] Outstanding amount per vendor
- [x] Category-wise aggregation
- [x] Date-range filtering
- [x] Payment history tracking

## Phase 5: Frontend UI Components
- [x] Vendor list page with outstanding balances
- [x] Payment entry modal/form
- [x] Payment mode selector (Cash, UPI, Bank, Cheque)
- [x] Vendor ledger table with filters
- [x] Outstanding balance widgets
- [x] Part payment indicator
- [x] Payment history view

## Phase 6: Validation & Business Rules
- [x] No overpayment validation
- [x] Prevent negative balance
- [x] Vendor existence check
- [x] Category existence check
- [x] Amount > 0 validation
- [x] Payment mode validation

## Phase 7: Daily Summary Integration
- [x] Update cash ledger on cash payment
- [x] Update UPI ledger on UPI payment
- [x] Update bank ledger on bank payment
- [x] Update vendor payable account
- [x] Sync with daily summary dashboard

## Phase 8: Testing & Verification
- [x] Test partial payments
- [x] Test overpayment protection
- [x] Test ledger balance accuracy
- [x] Test general ledger integration
- [x] Test daily summary updates
- [x] Verify advance recovery validation

## Optional (Future Enhancement)
- [ ] Invoice upload support
- [ ] GST fields integration
- [ ] Payment proof screenshot upload
- [ ] Automated payment reminders
- [ ] Vendor performance analytics
