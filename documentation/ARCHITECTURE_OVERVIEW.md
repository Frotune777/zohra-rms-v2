# System Architecture Overview

> [!NOTE]
> This document uses **Mermaid** for diagrams.
> - **In VS Code:** Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on Mac) to open the Markdown Preview, which renders the graphs.
> - **In GitHub:** The diagrams will render automatically.
> - **Online:** You can copy the code blocks into the [Mermaid Live Editor](https://mermaid.live).

## 1. Page Navigation Map (Sitemap)

This diagram shows how the application pages are connected and structured within the dashboard.

```mermaid
graph TD
    Login[Login Page] -->|Authenticate| Dashboard[Master Dashboard]
    
    subgraph "Dashboard Layout"
        Dashboard
        POS[Point of Sale]
        
        subgraph "HR & Payroll"
            Employees[Employee Management]
            Attendance[Bulk Attendance]
            Payroll[Payroll Processing]
            Advances[Advance Ledger]
        end
        
        subgraph "Inventory Module"
            Inventory[Stock Management]
            ChickenBills[Chicken Bill Entry]
            DailyRates[Daily Rates]
            VendorManager[Vendor Management]
        end
        
        subgraph "Financials"
            Finance[General Ledger]
            VendorPayments[Vendor Payments]
            DailySummary[Daily Summary]
            DailyTracker[Daily Tracker]
        end
        
        subgraph "Analytics"
            Reports[Reports Dashboard]
            AIDashboard[AI Insights]
        end
    end

    %% Navigation Links
    Dashboard --> POS
    Dashboard --> Employees
    Employees --> Attendance
    Employees --> Payroll
    Employees --> Advances
    
    Dashboard --> Inventory
    Inventory --> ChickenBills
    Inventory --> DailyRates
    Inventory --> VendorManager
    
    Dashboard --> Finance
    Finance --> VendorPayments
    Finance --> DailySummary
    Finance --> DailyTracker
    
    Dashboard --> Reports
    Dashboard --> AIDashboard
```

## 2. Entity Relationship Diagram (ERD)

This diagram illustrates how data is structured and related in the database.

```mermaid
erDiagram
    users {
        int id PK
        string email
        string role "owner|manager|staff"
    }

    employees ||--o{ attendance : "logs daily"
    employees ||--o{ salary_advances : "requests"
    employees ||--o{ salary_history : "receives monthly"
    employees {
        int id PK
        string full_name
        string role
        decimal base_salary
    }

    attendance {
        int id PK
        date date
        string status
    }

    salary_advances {
        int id PK
        decimal amount
        boolean is_recovered
    }

    menu_items ||--|{ recipe_ingredients : "consists of"
    inventory_items ||--|{ recipe_ingredients : "used in"
    
    menu_items {
        int id PK
        string name
        decimal price
        string category
    }

    inventory_items {
        int id PK
        string name
        decimal stock_qty
    }

    suppliers ||--o{ bill_entries : "supplies"
    suppliers ||--o{ markup_rules : "has specific"
    suppliers ||--o{ vendor_ledger : "financials"
    
    suppliers {
        int id PK
        string name
        string vendor_type
    }

    bill_entries {
        int id PK
        date date
        decimal variance
    }

    journal_entries ||--|{ ledger_lines : "contains"
    
    journal_entries {
        uuid id PK
        date transaction_date
        string description
    }

    ledger_lines {
        uuid id PK
        int account_code
        decimal debit
        decimal credit
    }
```

## 3. Data Flow & Page Connections

-   **POS System**:
    -   Reads from `menu_items`.
    -   Creates `journal_entries` (Revenue) and `ledger_lines`.
    -   Updates `inventory_items` via `recipe_ingredients`.

-   **HR & Payroll**:
    -   **Employees Page**: Manages `employees`.
    -   **Attendance Page**: Writes to `attendance`.
    -   **Advances Page**: Writes to `salary_advances` and `journal_entries`.
    -   **Payroll Page**: Reads `attendance` & `salary_advances`, creates `salary_history` and `journal_entries` (Expense).

-   **Chicken Tracker (Inventory)**:
    -   **Daily Rates Page**: Writes to `daily_rates`.
    -   **Bill Entry Page**: Reads `suppliers` & `markup_rules`, writes to `bill_entries` and `vendor_ledger`.

-   **Finance Module**:
    -   **General Ledger**: Aggregates `journal_entries` & `ledger_lines`.
    -   **Vendor Payments**: Updates `vendor_ledger` and creates `journal_entries`.
