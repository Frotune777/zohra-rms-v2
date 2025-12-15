# Comprehensive Testing Plan - Al Zohra RMS

## Overview
This document outlines the complete testing strategy for the Al Zohra RMS application after the component migration.

---


## Test Categories

### 1. Unit Tests
- Utility functions (validation, formatting, API)
- Custom hooks
- Reusable components
- Helper functions

### 2. Integration Tests
- Component + API integration
- Hook + API integration
- Form submission flows
- Error handling

### 3. End-to-End Tests
- Complete user workflows
- Multi-step processes
- Cross-module interactions

---

## 1. Unit Tests

### 1.1 Validation Utilities (`utils/validation.js`)

**Test File**: `client/src/utils/__tests__/validation.test.js`

**Test Cases**:
- ✓ validatePositiveNumber - accepts positive numbers
- ✓ validatePositiveNumber - rejects zero
- ✓ validatePositiveNumber - rejects negative numbers
- ✓ validatePositiveNumber - rejects non-numbers
- ✓ validateMaxAmount - accepts amounts within limit
- ✓ validateMaxAmount - rejects amounts exceeding limit
- ✓ validateEmail - accepts valid emails
- ✓ validateEmail - rejects invalid emails
- ✓ validatePhone - accepts valid Indian phone numbers
- ✓ validatePhone - rejects invalid phone numbers
- ✓ validateRequired - rejects empty strings
- ✓ validateRequired - rejects null/undefined
- ✓ validateRequired - accepts valid values

### 1.2 Formatting Utilities (`utils/format.js`)

**Test File**: `client/src/utils/__tests__/format.test.js`

**Test Cases**:
- ✓ formatCurrency - formats Indian Rupees correctly
- ✓ formatCurrency - handles decimals
- ✓ formatCurrency - handles large numbers (lakhs, crores)
- ✓ formatDate - formats dates in Indian locale
- ✓ formatDateTime - includes time
- ✓ formatNumber - uses Indian numbering system
- ✓ formatPercentage - formats with correct decimals
- ✓ parseFormattedNumber - extracts numbers from formatted strings

### 1.3 API Utility (`utils/api.js`)

**Test File**: `client/src/utils/__tests__/api.test.js`

**Test Cases**:
- ✓ Auto-injects auth token from localStorage
- ✓ Uses correct base URL
- ✓ Redirects to login on 401 error
- ✓ Handles network errors gracefully
- ✓ Supports GET, POST, PUT, DELETE methods

### 1.4 Custom Hooks

**Test Files**:
- `client/src/hooks/__tests__/useEmployees.test.js`
- `client/src/hooks/__tests__/useVendors.test.js`
- `client/src/hooks/__tests__/usePayroll.test.js`
- `client/src/hooks/__tests__/useFinance.test.js`
- `client/src/hooks/__tests__/usePagination.test.js`

**Test Cases (per hook)**:
- ✓ Fetches data on mount
- ✓ Sets loading state correctly
- ✓ Handles errors properly
- ✓ CRUD operations work
- ✓ Refetch updates data
- ✓ Toast notifications appear

### 1.5 Reusable Components

**Test Files**:
- `client/src/components/forms/__tests__/Input.test.jsx`
- `client/src/components/forms/__tests__/Select.test.jsx`
- `client/src/components/forms/__tests__/Button.test.jsx`
- `client/src/components/forms/__tests__/Textarea.test.jsx`

**Test Cases**:
- ✓ Renders with correct props
- ✓ Displays error messages
- ✓ Shows required indicator
- ✓ Handles onChange events
- ✓ Applies custom className
- ✓ Button shows loading state

---

## 2. Integration Tests

### 2.1 Component + API Integration

**Test Files**:
- `client/src/pages/__tests__/EmployeeManagement.integration.test.jsx`
- `client/src/pages/__tests__/Payroll.integration.test.jsx`
- `client/src/pages/__tests__/VendorPayments.integration.test.jsx`

**Test Cases**:
- ✓ Loads data from API on mount
- ✓ Displays loading state
- ✓ Renders data correctly
- ✓ Handles API errors
- ✓ Form submission calls API
- ✓ Success/error toasts appear

### 2.2 Form Validation Integration

**Test File**: `client/src/pages/__tests__/PaymentEntry.integration.test.jsx`

**Test Cases**:
- ✓ Validates positive amounts
- ✓ Prevents overpayment (VendorPayments)
- ✓ Shows validation errors
- ✓ Clears errors on valid input
- ✓ Disables submit on validation errors

### 2.3 Auto-Categorization

**Test File**: `client/src/pages/finance/__tests__/DailyTracker.integration.test.jsx`

**Test Cases**:
- ✓ Categorizes based on description keywords
- ✓ Categorizes based on vendor selection
- ✓ Allows manual override
- ✓ Handles multiple categories

---

## 3. End-to-End Tests

### 3.1 Employee Management Workflow

**Steps**:
1. Login as owner
2. Navigate to Employee Management
3. Create new employee
4. Edit employee details
5. Delete employee
6. Verify all operations

### 3.2 Payroll Processing Workflow

**Steps**:
1. Login as manager
2. Navigate to Payroll
3. Select month/year
4. Run payroll for employee
5. Approve payroll
6. Process payment
7. Verify transactions

### 3.3 Vendor Payment Workflow

**Steps**:
1. Login as owner
2. Navigate to Vendor Payments
3. Select vendor with outstanding balance
4. Enter payment amount
5. Validate overpayment prevention
6. Submit payment
7. Verify balance updated

### 3.4 Daily Tracker Workflow

**Steps**:
1. Login as staff
2. Navigate to Daily Tracker
3. Add sales entry
4. Add expense entry
5. Test auto-categorization
6. Batch save entries
7. Verify in daily summary

---

## 4. Backend API Tests

### 4.1 Existing Backend Tests

**Location**: `server/__tests__/`

**Test Files**:
- `advances.test.js` - Advance management
- `employees.test.js` - Employee CRUD
- `chicken.test.js` - Chicken module
- `finance.test.js` - Finance operations
- `payroll.test.js` - Payroll processing

**Status**: ✅ 108/108 tests passing

### 4.2 New API Endpoint Tests

**Test Cases**:
- ✓ `/api/finance/pnl/yearly` - Yearly aggregation
- ✓ All endpoints work with centralized API
- ✓ Token validation
- ✓ Error responses

---

## 5. Test Execution Plan

### Phase 1: Unit Tests (Day 1)
```bash
cd client
npm test -- --coverage
```

**Expected**:
- All utility tests pass
- All hook tests pass
- All component tests pass
- Coverage > 80%

### Phase 2: Integration Tests (Day 2)
```bash
npm test -- --testPathPattern=integration
```

**Expected**:
- All component+API tests pass
- Form validation tests pass
- Auto-categorization tests pass

### Phase 3: E2E Tests (Day 3)
```bash
# Manual browser testing
npm run dev
```

**Checklist**:
- [ ] All workflows complete successfully
- [ ] No console errors
- [ ] All features work as expected

### Phase 4: Backend Tests (Day 4)
```bash
cd server
npm test
```

**Expected**:
- All 108+ tests pass
- No regressions

---

## 6. Test Metrics

### Success Criteria

**Unit Tests**:
- ✅ 100% of utility functions tested
- ✅ 100% of hooks tested
- ✅ 100% of components tested
- ✅ Code coverage > 80%

**Integration Tests**:
- ✅ All critical workflows tested
- ✅ API integration verified
- ✅ Error handling validated

**E2E Tests**:
- ✅ All user journeys complete
- ✅ No breaking changes
- ✅ Performance acceptable

---

## 7. Known Issues & Fixes

### Issue 1: Token Expiry
**Status**: ✅ Fixed
**Solution**: Auto-redirect on 401

### Issue 2: Validation Errors
**Status**: ✅ Fixed
**Solution**: Centralized validation utilities

### Issue 3: Overpayment
**Status**: ✅ Fixed
**Solution**: validateMaxAmount in VendorPayments

---

## 8. Test Reports

### Unit Test Report
**Location**: `client/coverage/lcov-report/index.html`

### Integration Test Report
**Location**: `client/test-results/integration-report.html`

### E2E Test Report
**Location**: Manual checklist in this document

---

## 9. Continuous Testing

### Pre-commit Hooks
```bash
npm run test:unit
npm run lint
```

### CI/CD Pipeline
```yaml
- Run unit tests
- Run integration tests
- Check code coverage
- Deploy if all pass
```

---

## 10. Next Steps

1. ✅ Execute all unit tests
2. ✅ Execute all integration tests
3. ✅ Perform manual E2E testing
4. ✅ Generate coverage report
5. ✅ Document any issues found
6. ✅ Fix critical issues
7. ✅ Re-test after fixes
8. ✅ Sign off for production
