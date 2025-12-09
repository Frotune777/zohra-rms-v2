# Issue Tracker

**Project:** Al Zohra RMS v2.0  
**Date:** December 9, 2025  
**Status:** Active Testing

---

## 🐛 Open Issues

### Issue #001: Employee Page - Register Button Not Accessible

**Severity:** Medium  
**Module:** Employee Management  
**Test Case:** TS-001, TC 1.1  
**Status:** Open  
**Priority:** P2

#### Description
The "Register New Employee" button on the Employee Management page is not accessible because it appears to be outside the viewport. Users cannot scroll to reach the button, making it impossible to create new employees through the UI.

#### Steps to Reproduce
1. Login as Manager (manager@alzohra.com)
2. Navigate to Employees page
3. Try to find "Register New Employee" button
4. Button is not visible in viewport
5. Attempt to scroll - scrolling doesn't work or doesn't reach the button

#### Expected Behavior
- "Register New Employee" button should be visible in the viewport
- OR the page should be scrollable to reach the button
- Button should be clickable when found

#### Actual Behavior
- Button exists in DOM (index 28) but is not accessible
- Main content area does not scroll properly
- Cannot create new employees via UI

#### Screenshots
- ![Employee Page](file:///home/fortune/.gemini/antigravity/brain/56452315-e0da-4331-842f-2cd8ba840765/employees_page_1765276184468.png)
- ![After Pixel Click Attempt](file:///home/fortune/.gemini/antigravity/brain/56452315-e0da-4331-842f-2cd8ba840765/register_modal_after_pixel_click_1765276220469.png)

#### Impact
- **User Impact:** Cannot create new employees through UI
- **Workaround:** Employees can be created via direct database insert or API call
- **Affected Users:** Managers and Owners

#### Proposed Fix
1. Review EmployeeManagement.jsx layout and CSS
2. Ensure button is within scrollable container
3. OR move button to a more accessible location (e.g., top of page)
4. Add responsive design considerations

#### Fix Details
[To be filled when fix is implemented]

#### Verification
[To be filled after fix verification]

---

### Issue #002: Employee Row Click - No Edit/History Options

**Severity:** Medium  
**Module:** Employee Management  
**Test Case:** TS-001, TC 1.2, TC 1.3  
**Status:** Open  
**Priority:** P2

#### Description
Clicking on an employee row in the Employee Management table does not expand the row or show edit/history options. The DOM does not show individual "Edit" or "History" buttons per employee row.

#### Steps to Reproduce
1. Navigate to Employees page
2. Click on an employee row (e.g., "Arjun Kumar")
3. No action occurs
4. No edit or history options appear

#### Expected Behavior
- Clicking employee row should expand to show details
- OR show Edit/History buttons
- User should be able to access employee editing and history

#### Actual Behavior
- Clicking row has no effect
- No edit or history buttons visible
- Cannot update employee details or view history via UI

#### Screenshots
- ![Employee Row Click](file:///home/fortune/.gemini/antigravity/brain/56452315-e0da-4331-842f-2cd8ba840765/arjun_kumar_details_1765276248348.png)

#### Impact
- **User Impact:** Cannot edit employees or view history through UI
- **Workaround:** Direct database updates or API calls
- **Affected Users:** Managers and Owners

#### Proposed Fix
1. Add onClick handler to employee rows
2. Implement expandable row or modal for editing
3. Add Edit/History buttons to each row
4. Ensure proper event handling

---

## ✅ Verified Features

### Feature #001: Payroll Outstanding Balance Column

**Module:** Payroll  
**Test Case:** TS-003, TC 3.5  
**Status:** ✅ Verified  
**Date:** December 9, 2025

#### Description
The "Outstanding" column is successfully implemented in the Payroll page employee table, displaying between "Gross" and "Adv. Ded." columns.

#### Verification Details
- Column header is visible and properly labeled
- Column is positioned correctly in the table
- Implementation matches requirements

#### Screenshots
- ![Payroll Outstanding Column](file:///home/fortune/.gemini/antigravity/brain/56452315-e0da-4331-842f-2cd8ba840765/payroll_page_outstanding_column_1765276307941.png)

#### Notes
- Full color-coding verification (red for positive, gray for zero) requires payroll calculation to be run
- Column structure is correct and ready for data display

---

### Feature #002: Vendor Payment Modal UI

**Module:** Vendor Payments  
**Test Case:** TS-004, TC 4.1  
**Status:** ✅ Verified (Partial)  
**Date:** December 9, 2025

#### Description
The vendor payment modal opens correctly with proper structure including vendor dropdown and payment form fields.

#### Verification Details
- Modal opens when "Process Payment" button is clicked
- Vendor dropdown is present and functional
- Form fields are properly structured
- UI layout is correct

#### Screenshots
- ![Vendor Payment Modal](file:///home/fortune/.gemini/antigravity/brain/56452315-e0da-4331-842f-2cd8ba840765/vendor_payment_modal_empty_1765276384434.png)

#### Notes
- Full vendor details panel verification requires test data (vendor with outstanding balance)
- Modal structure and basic functionality confirmed
- Enhanced details panel implementation exists but needs data to verify display

---

## 📊 Issue Statistics

### By Severity
- **Critical:** 0
- **High:** 0
- **Medium:** 2
- **Low:** 0

### By Status
- **Open:** 2
- **In Progress:** 0
- **Fixed:** 0
- **Closed:** 0

### By Module
- **Employee Management:** 2
- **Payroll:** 0
- **Vendor Payments:** 0
- **Other:** 0

---

## 📝 Testing Notes

### Test Environment
- **Frontend:** http://localhost:3001
- **Backend:** http://localhost:5000
- **Browser:** Chrome (latest)
- **Test Date:** December 9, 2025

### Test Coverage
- **Tests Executed:** 5
- **Tests Passed:** 2
- **Tests Failed:** 0
- **Tests Blocked:** 2
- **Issues Found:** 2

### Next Steps
1. Fix Issue #001 (Employee Register Button)
2. Fix Issue #002 (Employee Row Click)
3. Create test data for comprehensive testing
4. Continue with remaining test scenarios
5. Verify fixes and retest

---

**Last Updated:** December 9, 2025  
**Next Review:** After fixes are implemented
