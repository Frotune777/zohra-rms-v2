# Al Zohra RMS - API Documentation (Core Routes)

Base URL: `https://api.yourdomain.com/api`

## 1. Authentication (`/auth`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| POST | `/login` | User login | No |
| POST | `/register` | User registration (Owner only) | Yes |

## 2. Employees (`/employees`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| GET | `/` | Fetch all employees | Yes |
| POST | `/` | Register new employee | Yes |
| PUT | `/:id` | Update employee details | Yes |
| GET | `/:id/history` | Fetch employee change history | Yes |

## 3. Inventory & Chicken Tracking (`/inventory` & `/chicken`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| GET | `/rates` | Fetch daily rates | Yes |
| POST | `/rates` | Update daily rates | Yes |
| POST | `/bills` | Submit procurement bill | Yes |

## 4. Finance & Vendors (`/finance` & `/vendors`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| GET | `/today` | Fetch daily financial summary | Yes |
| GET | `/vendors/outstanding` | Fetch all vendor balances | Yes |
| POST | `/vendors/payments` | Process vendor payment | Yes |

## 5. Payroll (`/payroll`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| POST | `/run` | Process monthly payroll | Yes |
| GET | `/monthly` | Fetch payroll records | Yes |
