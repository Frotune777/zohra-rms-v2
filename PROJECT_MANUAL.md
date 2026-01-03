# Al Zohra RMS - Project Documentation & Workflow Manual

## 1. Project Overview
**Al Zohra RMS (Restaurant Management System)** is a comprehensive, full-stack web application designed to digitize and streamline the operations of a restaurant business. It unifies *Human Resources, Payroll, Inventory Procurement, Finance, and Analytics* into a single platform.

### **Core Technology Stack**
*   **Frontend:** React (Vite), Tailwind CSS
*   **Backend:** Node.js, Express
*   **Database:** PostgreSQL
*   **Infrastructure:** Docker, Docker Compose

## ⚡ System Access

| Component | URL | Remarks |
| :--- | :--- | :--- |
| **Frontend UI** | [http://localhost:3003](http://localhost:3003) | **Primary Access Point** |
| **Backend API** | [http://localhost:5001](http://localhost:5001) | API Documentation Endpoint |
| **Database** | `localhost:5433` | Postgres Port |

> [!TIP]
> **Default Login Credentials:**
> *   **Owner:** `owner@alzohra.com` / `owner123`
> *   **Manager:** `manager@alzohra.com` / `manager123`
> *   **Staff:** `staff@alzohra.com` / `staff123`

---

## 2. Module Breakdown & Real-World Use Cases

### **A. HR & Payroll Management**
**Purpose:** To manage the entire lifecycle of restaurant staff, from onboarding to daily attendance and monthly salary processing.

#### **1. Employee Directory (`/employees`)**
*   **Use Case:** The HR manager adds new waiters, chefs, and cleaners here. It stores personal details, joining dates, and base salaries.
*   **Automation:** When a user is added, a **Financial Wallet** (Asset Account) is automatically created for them to handle cash advances and transfers.
*   **Workflow:**
    1.  Manager clicks "Add Employee".
    2.  Enters details (Name, Role, Base Salary).
    3.  Employee appears in the active list.

#### **2. Attendance Tracking (`/attendance/bulk`)**
*   **Use Case:** Daily marking of who is present, absent, or on half-day. This directly impacts payroll calculations.
*   **Workflow:**
    1.  At the start/end of a shift, the manager opens "Bulk Attendance".
    2.  Selects the date (defaults to today).
    3.  Toggles Present/Absent/Half-Day for each staff member.
    4.  Clicks "Save Attendance".

#### **3. Advance Requests & Approvals (`/advances`, `/advances/approvals`)**
*   **Use Case:** Staff often ask for salary advances. This module tracks these requests to ensure they are deducted from the monthly salary.
*   **Workflow:**
    1.  **Request:** Manager/User logs an advance request for an employee (Amount, Reason).
    2.  **Approval:** (In `/approvals`) The Owner approves or rejects the request.
    3.  **Impact:** Approved advances are auto-deducted during payroll generation.

#### **4. Payroll Processing (`/payroll`)**
*   **Use Case:** The most critical monthly activity. It calculates the final payout by: `(Base Salary / Days)` * `Attendance` - `Advances` + `Bonuses`.
*   **Workflow:**
    1.  Select Month/Year.
    2.  System auto-calculates salary based on attendance records and approved advances.
    3.  Manager reviews the "Net Payable" amount.
    4.  Click "Lock & Process" to finalize.
    5.  Print Pay Slips for staff.

---

### **B. Inventory & Procurement (Chicken Module)**
**Purpose:** To manage the fluctuating daily costs of raw materials (specifically Chicken) and track supplier payments.

#### **1. Chicken Dashboard (`/chicken`)**
*   **Use Case:** A high-level view of today's market rates, total successful bills pending, and recent purchasing trends.

#### **2. Procurement Manager (`/chicken/vendors`)** *[Refactored]*
*   **Use Case:** The central hub for configuring the "Rules of Engagement" with suppliers.
*   **Workflow:**
    *   **Daily Rates:** Every morning, the manager enters the market rate for Tandoor/Boiler chicken and Eggs.
    *   **Suppliers:** Add contact details for vendors (e.g., "Ali Chicken Center").
    *   **Markup Rules:** Define logic like "Ali Chicken charges Market Rate + ₹5". The system uses this to auto-calculate bill amounts.

#### **3. Bill Entry (`/chicken/bills`)**
*   **Use Case:** logging the actual receipt of goods.
*   **Workflow:**
    1.  Select Supplier and Date.
    2.  Enter Quantity (kg/units).
    3.  System **auto-calculates** the Total Cost based on: `(Daily Market Rate + Supplier Markup Rule) * Quantity`.
    4.  Save Bill.

#### **4. Vendor Payments (`/vendor-payments`)**
*   **Use Case:** Tracking how much money is owed to suppliers vs. what has been paid.
*   **Workflow:**
    1.  View "Outstanding Balance" for a vendor.
    2.  Record a "Payment Out" (Cash/Bank transfer).
    3.  The balance decreases.

---

### **C. Finance Module (Double-Entry Backbone)**
**Purpose:** A strictly accountable financial ledger that links every user, vendor, and asset. Unlike simple expense tracking, this system uses "Wallets" to prevent cash leakage.

#### **1. Money Transfer (`/finance/transfer`) [NEW]**
*   **Use Case:** Moving money internally without treating it as an "Expense" (which vanishes from the books).
*   **Workflow:**
    1.  **Issuing Cash:** Manager needs ₹5000 for market shopping.
    2.  Select "Safe -> User".
    3.  System checks "Main Safe" balance and transfers ₹5000 to "Wallet - Manager Name".
    4.  **Result:** The business still *owns* that ₹5000; it's just held by the Manager.
    5.  **Return:** Manager returns remaining ₹1000 via "User -> Safe".

#### **2. Ledger (`/finance`)**
*   **Use Case:** Viewing the immutable transaction history.
*   **Integration:** Every time a new Employee or Vendor is registered, a dedicated **Ledger Account** is auto-created for them.

#### **3. Daily Tracker (`/finance/daily-tracker`)**
*   **Use Case:** Legacy quick-view for daily cash movement. **Note:** Managers are encouraged to use the Transfer system for true accountability.

---

### **D. Analytics & AI**
#### **1. Reports (`/reports`)**
*   **Use Case:** Downloading PDF/Excel statements for monthly audits.

#### **2. AI Insights (`/ai-dashboard`)**
*   **Use Case:** Shows predictive trends (e.g., "Chicken prices likely to rise next week") using historical data.

---

## 3. General Workflow Summary
1.  **Morning:** HR marks attendance; Procurement sets Daily Market Rates.
2.  **During Day:** Inventory bills are logged as goods arrive. Advance requests are engaged.
3.  **End of Day:** Cash tracker is updated.
4.  **Month End:** Payroll is generated; Vendor payments are settled; Financial reports are reviewed.
