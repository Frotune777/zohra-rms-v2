# Al Zohra RMS - User Guide

This guide details how to use the Al Zohra Restaurant Management System features, explaining the underlying logic to ensure accurate data tracking.

## 1. Finance Module

### Daily Financial Tracker
**Goal**: Record every single financial transaction (Cash In, Cash Out, Expenses) in real-time.
-   **Sales Entry**: Enter sales descriptions and amounts. 
    -   *Logic*: "Total Sales" updates instantly. Cash vs Bank is split based on Payment Method.
    -   *Transfer to Manager*: Check this box to record cash moving from the Counter to the Manager (safe). This creates a `Bank_Cash` mode transaction, reducing Counter Cash but keeping the money within the company assets.
-   **Expense Entry**: Record daily expenses.
    -   *Logic*: Vendor selection is **mandatory** for expenses to ensure we track who we are paying.
    -   *Auto-Categorization**: If you type a known keyword (e.g., "Tomato"), the Category will auto-fill based on mapping rules.
-   **Cash Calculator**: Use the calculator icon to count physical cash denominations. Saving this creates a "Cash Closing" entry automatically.

### Manager Float
**Goal**: Track the "Manager's Safe" or "Petty Cash" held by the branch manager.
-   *Inflow*: Money comes here when you "Transfer to Manager" from default Sales or when you manually add "Float Injection".
-   *Outflow*: Expenses paid directly by the manager (not from the drawer).

### Expense Mapping (Admin)
**Goal**: Automate categorization to save time.
-   Go to **Finance -> Expense Mappings**.
-   Add rules like: Keyword "Uber" -> Category "Travel".
-   **Effect**: Next time you type "Uber" in Daily Tracker, "Travel" is selected automatically.

## 2. Operations Module

### Vendor Management
**Goal**: Single Source of Truth for all Suppliers.
-   **Suppliers**: All vendors (Chicken, Grocery, Maintenance) are managed here.
-   **Vendor Payments**: 
    -   *Logic*: When you record a payment here, the system **automatically** creates a transaction in the Daily Tracker as an "Expense" (Payment).
    -   *Result*: Your cash/bank balance decreases in the Finance view, and the Vendor's Outstanding Balance decreases in the Ledger.

### Chicken Biller
**Goal**: Manage daily chicken purchases and rates.
-   **Rates**: Enter daily rates (Tandoor, Boiler) from the sidebar.
-   **Bill Entry**: Record incoming chicken stock. This updates inventory and increases the Vendor's Outstanding Balance.

## 3. Reports Module

### Financial Reports
-   **Overview**: Revenue vs Expenses, Net Profit trends.
-   **Spending by Person**: Breaks down who is spending money (Manager vs Biller vs Others) based on the `paid_by` field.
-   **Balance Sheet**: A snapshot of Assets (Cash + Bank), Liabilities (Vendor Dues), and Equity.

### Operations Reports
-   **Vendor Ledger Summary**: Shows total bills vs total payments and current outstanding balance for each vendor.
-   **Chicken Analytics**: Trends in procurement rates and quantities.

## 4. Key Logic Concepts (Single Source of Truth)
-   **One Payment, Two Records**: When you pay a vendor $500:
    1.  Vendor Ledger: Balance reduces by $500.
    2.  Daily Tracker: A "Payment" transaction of $500 is created automatically.
    -   *Why?* To ensure your Financial Reports (Cash Flow) match your Vendor Reports (Liabilities).
-   **Vendor Validation**: You cannot save an expense without a vendor. This forces accurate liability tracking.
