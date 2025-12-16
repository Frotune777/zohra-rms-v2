# API Reference - Al Zohra RMS v2

Complete API documentation for the Al Zohra Restaurant Management System backend.

**Base URL**: `http://localhost:5000/api`

**Authentication**: All protected endpoints require a JWT token in the `Authorization` header:
```
Authorization: Bearer <your-jwt-token>
```

---

## Table of Contents
- [Authentication](#authentication)
- [Finance](#finance)
- [Payroll](#payroll)
- [Inventory](#inventory)
- [POS](#pos)
- [Chicken Tracker](#chicken-tracker)
- [Reports](#reports)
- [Employees](#employees)
- [Vendors](#vendors)

---

## Authentication

### POST `/auth/login`
Login to the system.

**Request:**
```json
{
  "email": "owner@alzohra.com",
  "password": "owner123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Owner",
    "email": "owner@alzohra.com",
    "role": "owner"
  }
}
```

### GET `/auth/me`
Get current user information.

**Headers**: `Authorization: Bearer <token>`

**Response:**
```json
{
  "id": 1,
  "name": "Owner",
  "email": "owner@alzohra.com",
  "role": "owner"
}
```

---

## Finance

### GET `/finance/daily-summary/:date`
Get daily financial summary.

**Parameters:**
- `date` (string): Date in YYYY-MM-DD format

**Response:**
```json
{
  "date": "2024-12-16",
  "totalSales": 15000,
  "totalExpenses": 8000,
  "netCashFlow": 7000,
  "cashSales": 10000,
  "cardSales": 5000
}
```

### GET `/finance/tracker/transactions`
Get transactions for daily tracker.

**Query Parameters:**
- `date` (string): Date in YYYY-MM-DD format

**Response:**
```json
[
  {
    "id": 1,
    "date": "2024-12-16",
    "type": "Sales",
    "description": "Cash Closing",
    "amount": 10000,
    "payment_method": "Cash",
    "status": "Paid"
  }
]
```

### POST `/finance/tracker/transaction`
Create a new transaction.

**Request:**
```json
{
  "date": "2024-12-16",
  "type": "Sales",
  "description": "Cash Closing",
  "amount": 10000,
  "payment_method": "Cash",
  "mode": "Cash",
  "status": "Paid"
}
```

### GET `/finance/pnl/monthly`
Get monthly P&L statement.

**Query Parameters:**
- `month` (number): Month (1-12)
- `year` (number): Year

**Response:**
```json
{
  "month": 12,
  "year": 2024,
  "totalRevenue": 450000,
  "totalExpenses": 280000,
  "netProfit": 170000,
  "breakdown": {
    "sales": 450000,
    "expenses": {
      "salaries": 120000,
      "inventory": 100000,
      "utilities": 30000,
      "other": 30000
    }
  }
}
```

### GET `/finance/mappings`
Get expense auto-categorization mappings.

**Response:**
```json
[
  {
    "id": 1,
    "item_keyword": "Uber",
    "category_id": 5,
    "category_name": "Transportation"
  }
]
```

### POST `/finance/mappings`
Create expense mapping.

**Request:**
```json
{
  "item_keyword": "Uber",
  "category_id": 5
}
```

---

## Payroll

### GET `/payroll/monthly`
Get monthly payroll records.

**Query Parameters:**
- `month` (number): Month (1-12)
- `year` (number): Year

**Response:**
```json
[
  {
    "id": 1,
    "employee_id": 10,
    "employee_name": "John Doe",
    "month": 12,
    "year": 2024,
    "base_salary": 25000,
    "days_worked": 26,
    "net_pay": 24500,
    "status": "Approved"
  }
]
```

### POST `/payroll/run`
Calculate payroll for an employee.

**Request:**
```json
{
  "month": 12,
  "year": 2024,
  "employeeId": 10,
  "daysWorked": 26,
  "overtimeHours": 5,
  "overtimeAmount": 500,
  "manualAdjustment": 0,
  "advanceDeduction": 1000
}
```

### POST `/payroll/approve`
Approve a payroll entry.

**Request:**
```json
{
  "id": 1
}
```

### POST `/payroll/payout`
Mark payroll as paid.

**Request:**
```json
{
  "id": 1,
  "payment_mode": "Bank Transfer",
  "payment_date": "2024-12-16",
  "paid_by": "Manager"
}
```

---

## Inventory

### GET `/inventory`
Get all inventory items.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Chicken Breast",
    "category": "Meat",
    "quantity": 50,
    "unit": "kg",
    "unit_cost": 180,
    "total_value": 9000
  }
]
```

### POST `/inventory`
Add new inventory item.

**Request:**
```json
{
  "name": "Chicken Breast",
  "category": "Meat",
  "quantity": 50,
  "unit": "kg",
  "unit_cost": 180
}
```

### PUT `/inventory/:id`
Update inventory item.

**Request:**
```json
{
  "quantity": 60,
  "unit_cost": 185
}
```

---

## POS

### GET `/menu`
Get all menu items.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Chicken Biryani",
    "category": "Biryani",
    "price": 180,
    "available": true
  }
]
```

### POST `/orders`
Create a new order.

**Request:**
```json
{
  "items": [
    {
      "menu_item_id": 1,
      "quantity": 2,
      "price": 180
    }
  ],
  "total": 360,
  "payment_method": "Cash"
}
```

**Response:**
```json
{
  "id": 123,
  "order_number": "ORD-123",
  "total": 360,
  "status": "completed",
  "created_at": "2024-12-16T10:30:00Z"
}
```

---

## Chicken Tracker

### GET `/chicken/rates`
Get daily chicken rates.

**Query Parameters:**
- `date` (string): Date in YYYY-MM-DD format

**Response:**
```json
{
  "date": "2024-12-16",
  "tandoor_rate": 180,
  "boiler_rate": 160,
  "egg_rate": 6
}
```

### POST `/chicken/rates`
Set daily chicken rates.

**Request:**
```json
{
  "date": "2024-12-16",
  "tandoor_rate": 180,
  "boiler_rate": 160,
  "egg_rate": 6
}
```

### GET `/chicken/suppliers`
Get all chicken suppliers.

**Response:**
```json
[
  {
    "id": 1,
    "name": "ABC Poultry",
    "phone": "9876543210",
    "vendor_type": "Chicken",
    "markup_required": true
  }
]
```

### POST `/chicken/bills`
Create chicken bill entry.

**Request:**
```json
{
  "supplier_id": 1,
  "item_type": "Tandoor",
  "weight": 25,
  "base_rate": 180,
  "final_rate": 185,
  "total_cost": 4625,
  "date": "2024-12-16"
}
```

---

## Reports

### GET `/reports/dashboard/kpis`
Get dashboard KPIs.

**Query Parameters:**
- `startDate` (string): Start date
- `endDate` (string): End date

**Response:**
```json
{
  "totalRevenue": 450000,
  "totalExpenses": 280000,
  "netProfit": 170000,
  "orderCount": 1250,
  "avgOrderValue": 360
}
```

### GET `/reports/financial/overview`
Get financial overview report.

**Query Parameters:**
- `startDate`, `endDate`

**Response:**
```json
{
  "summary": {
    "total_revenue": 450000,
    "total_expenses": 280000,
    "net_profit": 170000
  },
  "revenueTrend": [...],
  "expenseTrend": [...]
}
```

### GET `/reports/hr/payroll-summary`
Get payroll summary report.

**Query Parameters:**
- `startDate`, `endDate`

**Response:**
```json
{
  "totalPayroll": 250000,
  "totalAdvances": 50000,
  "employeeCount": 10,
  "breakdown": [...]
}
```

---

## Employees

### GET `/employees-payroll`
Get all employees with payroll info.

**Response:**
```json
[
  {
    "id": 1,
    "name": "John Doe",
    "designation": "Chef",
    "salary": 25000,
    "status": "active",
    "advance_balance": 5000
  }
]
```

### POST `/employees`
Create new employee.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "designation": "Chef",
  "salary": 25000,
  "role": "staff"
}
```

### POST `/employees/payroll/advance`
Give advance to employee.

**Request:**
```json
{
  "employee_id": 1,
  "amount": 5000,
  "reason": "Medical emergency"
}
```

---

## Vendors

### GET `/vendors`
Get all vendors.

**Response:**
```json
[
  {
    "id": 1,
    "name": "ABC Suppliers",
    "vendor_type": "Grocery",
    "phone": "9876543210",
    "outstanding_balance": 15000
  }
]
```

### POST `/vendors/payments`
Process vendor payment.

**Request:**
```json
{
  "vendor_id": 1,
  "amount": 10000,
  "payment_mode": "Bank Transfer",
  "paid_by": "Manager",
  "notes": "Payment for invoice #123"
}
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error message description"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

**Last Updated**: December 16, 2025
