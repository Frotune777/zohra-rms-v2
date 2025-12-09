# Al Zohra RMS v2 - Restaurant Management System

A comprehensive full-stack restaurant management system built with **React**, **Node.js**, and **PostgreSQL**. Al Zohra RMS provides complete solutions for POS operations, detailed financial tracking, employee management with payroll, and specialized inventory tracking for chicken stock.

## 🎯 Key Features

### 1. Point of Sale (POS)
- **Real-time Menu**: Categorized view of all items (Biryani, Curry, Bread, etc.).
- **Cart Management**: Add/remove items, adjust quantities, calculate totals.
- **Order Processing**: Instant order creation and revenue recording.
- **Responsive Design**: Optimized for touchscreens and desktops.

### 2. Chicken Tracker (Migrated & Enhanced)
- **Daily Rates**: Track daily market rates for Tandoor, Boiler, and Egg.
- **Bill Entry**: Record vendor bills with automatic calculations based on weight/quantity and daily rates.
- **Vendor Management**: Manage suppliers and their specific markup rules.
- **Variance Analysis**: Track expected vs. actual costs.

### 3. HR & Payroll System
- **Employee Management**: 
    - Detailed profiles (Salary, Position, Contact).
    - **Govt ID Tracking**: Capture ID Type (Aadhar, PAN) and Number.
    - **Role vs Designation**: Clear separation between System Access (Role) and Job Title (Designation).
    - **History Tracking**: Logs changes to salary, role, and status over time.
- **Advance Ledger**: 
    - Double-entry ledger for salary advances.
    - Track "Advance Given" and "Repayment" transactions.
    - **Detailed Tracking**: Record **Payment Mode** (Cash/UPI) and **Paid By** (Manager Name).
    - **Reporting**: View cumulative totals by Payer and Payment Mode.
    - View running balances for each employee.
- **Monthly Payroll**: 
    - Calculate salary based on days worked.
    - **Manual Adjustments**: Add bonuses or deductions with reasons.
    - **Auto-Deduction**: Automatically deducts active advances from net pay.
    - Generates financial ledger entries for salary expenses.

### 4. Financial Management
- **Daily Summary**: Aggregate view of Sales, Expenses, Vendor Payments, and **Salary Advances**.
- **Payment Tracking**: Record vendor payments and other expenses.
- **Payment Modes**: Track transactions via Cash, UPI, and Card.
- **Profit & Loss**: Generate monthly P&L statements.
- **Ledger System**: Double-entry accounting for all financial transactions.

### 5. Inventory & Menu
- **Inventory**: Track stock levels, unit costs, and total value.
- **Menu Management**: Add/Edit/Delete menu items with categories and prices.

---

## 🔄 Unit Workflows

### 🛒 POS Workflow
1.  **Open POS**: Navigate to the Dashboard -> POS.
2.  **Select Items**: Tap on menu items to add them to the cart.
3.  **Adjust Cart**: Use `+` / `-` to change quantities or `Trash` icon to remove.
4.  **Checkout**: Click **"Place Order"**.
5.  **Result**: Order is saved, revenue is recorded, and inventory is updated (if linked).

### 🐔 Chicken Tracker Workflow
1.  **Set Daily Rates**: 
    - Go to **Chicken Tracker** -> **Daily Rates**.
    - Enter today's rate for Tandoor, Boiler, and Egg.
    - Click **Save Rates**.
2.  **Enter Bill**:
    - Go to **Chicken Tracker** -> **Bill Entry**.
    - Select **Vendor** and **Item Type**.
    - Enter **Weight/Quantity**.
    - System auto-calculates **Final Rate** (Base Rate + Vendor Markup) and **Total Cost**.
    - Click **Save Bill**.

### 👥 HR & Payroll Workflow
1.  **Register Employee**:
    - Go to **Employees**.
    - Click **"Register New Employee"**.
    - Fill details (Name, Salary, Position) and **Save**.
2.  **Give Advance**:
    - Go to **Advances**.
    - Click **"New Transaction"**.
    - Select **Employee**, Type (**Advance**), and **Amount**.
    - Click **Save**.
3.  **Run Payroll**:
    - Go to **Payroll**.
    - Select **Month/Year**.
    - Find Employee and click **"Process"**.
    - Enter **Days Worked** and any **Manual Adjustments** (e.g., +500 Bonus).
    - Review **Net Pay** (Base Salary + Adjustments - Active Advances).
    - Click **Confirm & Process**.

### 💰 Finance Workflow
1.  **Record Expense/Payment**:
    - Go to **Finance** -> **Payments**.
    - Select **Category** (Vendor Payment, Utility, etc.).
    - Enter **Amount**, **Payment Mode**, and **Description**.
    - Click **Record Payment**.
2.  **View Daily Summary**:
    - Go to **Finance** -> **Daily Summary**.
    - View aggregated **Total Sales**, **Total Expenses**, and **Net Cash Flow** for the day.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Axios, React Router.
- **Backend**: Node.js, Express.js.
- **Database**: PostgreSQL 15.
- **Authentication**: JWT (JSON Web Tokens), bcryptjs.
- **Containerization**: Docker, Docker Compose.

---

## 🚀 Quick Start

### First Time Setup (Automated)

```bash
# Clone the repository
git clone <repository-url>
cd zohra-rms-v2

# Run automated setup (checks dependencies, installs packages, sets up database)
./setup.sh

# Start the application
./start.sh
```

That's it! The setup script will automatically:
- ✅ Verify system requirements (Node.js 16+, Docker, Docker Compose)
- ✅ Create environment configuration files
- ✅ Install all dependencies
- ✅ Setup PostgreSQL database
- ✅ Run database migrations
- ✅ Verify everything is working

### Access the Application

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:5000
- **Database**: localhost:5432

📖 **For detailed setup instructions and troubleshooting**, see [SETUP.md](SETUP.md)tup Instructions

### Prerequisites
- Docker & Docker Compose
- Git

1.  **Clone Repository**:
    ```bash
    git clone <repo-url>
    cd al-zohra-rms-v2
    ```
2.  **Start Services**:
    ```bash
    docker-compose up -d --build
    ```
3.  **Access Application**:
    - **Frontend**: `http://localhost:3000`
    - **Backend**: `http://localhost:5000`
    - **Database**: `localhost:5432`

### Default Credentials
| Role | Email | Password |
|------|-------|----------|
| **Owner** | `owner@alzohra.com` | `owner123` |
| **Manager** | `manager@alzohra.com` | `manager123` |
| **Staff** | `staff@alzohra.com` | `staff123` |

---

## 🔐 Role-Based Access Control

| Feature | Staff | Manager | Owner |
|:--------|:-----:|:-------:|:-----:|
| POS | ✅ | ✅ | ✅ |
| View Employees | ✅ | ✅ | ✅ |
| Manage Employees | ❌ | ✅ | ✅ |
| Payroll & Advances | ❌ | ✅ | ✅ |
| Finance & Reports | ❌ | ✅ | ✅ |
| Chicken Tracker | ❌ | ✅ | ✅ |
| Manage Menu | ❌ | ✅ | ✅ |
| Delete Items | ❌ | ❌ | ✅ |

---



## 📂 Project Structure

```
al-zohra-rms-v2/
├── client/                 # React Frontend
│   ├── src/
│   │   ├── pages/         # Application Pages (POS, Payroll, etc.)
│   │   ├── components/    # Reusable UI Components
│   │   ├── context/       # Auth Context
│   │   └── ...
├── server/                 # Node.js Backend
│   ├── src/
│   │   ├── controllers/   # Business Logic
│   │   ├── routes/        # API Endpoints
│   │   └── ...
├── database/               # SQL Scripts
│   └── init.sql           # Schema & Seed Data
└── docker-compose.yml     # Container Orchestration
```

---

**Version**: 2.0.0  
**Last Updated**: December 8, 2025  
**Status**: Production Ready
