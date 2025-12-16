# Al Zohra RMS v2 - Restaurant Management System

A comprehensive full-stack restaurant management system built with **React**, **Node.js**, and **PostgreSQL**. Al Zohra RMS provides complete solutions for POS operations, detailed financial tracking, employee management with payroll, and specialized inventory tracking for chicken stock.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://www.postgresql.org/)

---

## 🎯 Key Features

### 1. Point of Sale (POS)
- **Real-time Menu**: Categorized view of all items (Biryani, Curry, Bread, etc.)
- **Cart Management**: Add/remove items, adjust quantities, calculate totals
- **Order Processing**: Instant order creation and revenue recording
- **Payment Tracking**: Cash, Card, and UPI payment modes
- **Responsive Design**: Optimized for touchscreens and desktops

### 2. Chicken Tracker (Migrated & Enhanced)
- **Daily Rates**: Track daily market rates for Tandoor, Boiler, and Egg
- **Bill Entry**: Record vendor bills with automatic calculations
- **Vendor Management**: Manage suppliers and their specific markup rules
- **Variance Analysis**: Track expected vs. actual costs

### 3. HR & Payroll System
- **Employee Management**: Detailed profiles with salary, position, and contact info
- **Advance Ledger**: Double-entry ledger for salary advances with payment tracking
- **Monthly Payroll**: Automated salary calculation with manual adjustments
- **Auto-Deduction**: Automatically deducts active advances from net pay

### 4. Financial Management
- **Daily Tracker**: Comprehensive daily financial summary with cash denomination calculator
- **Vendor Payments**: Track and process vendor payments with reconciliation
- **Expense Mapping**: Auto-categorize expenses based on keywords
- **P&L Reports**: Generate monthly profit & loss statements
- **Ledger System**: Double-entry accounting for all financial transactions

### 5. Inventory & Menu
- **Inventory Tracking**: Real-time stock levels with automatic deduction
- **Recipe Management**: Link menu items to inventory ingredients
- **Wastage Logging**: Track and account for inventory wastage
- **Menu Management**: Add/Edit/Delete menu items with categories and prices

### 6. Comprehensive Reporting
- **Financial Reports**: Revenue, expenses, balance sheet, spending by person
- **HR Reports**: Payroll summaries, advances, attendance analytics
- **Operations Reports**: Chicken analytics, vendor performance
- **Inventory Reports**: Stock status, wastage analysis
- **Export Options**: CSV, JSON, and PDF export for all reports

---

## 🚀 Quick Start

### Prerequisites
- **Docker** and **Docker Compose** (recommended)
- **Node.js** 16+ (if running without Docker)
- **PostgreSQL** 15+ (if running without Docker)
- **Git**

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd zohra-rms-v2

# Start all services
docker-compose up -d --build

# Access the application
# Frontend: http://localhost:3002
# Backend API: http://localhost:5000
```

### Option 2: Manual Setup

```bash
# Clone the repository
git clone <repository-url>
cd zohra-rms-v2

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install

# Setup database (see Database Setup section)

# Start backend (from server directory)
npm run dev

# Start frontend (from client directory)
npm run dev
```

---

## 🔧 Configuration

### Database Connection

**Docker (default):**
```
Host: localhost
Port: 5432
Database: alzohra_db
Username: admin
Password: password
```

**Manual Setup:**
Create a `.env` file in the `server` directory:
```env
DATABASE_URL=postgresql://admin:password@localhost:5432/alzohra_db
PORT=5000
JWT_SECRET=your-secret-key-here
```

### Database Access

Use the included helper script:
```bash
# Show connection info
./db-access.sh info

# Open PostgreSQL shell
./db-access.sh shell

# List all tables
./db-access.sh tables

# Create backup
./db-access.sh backup
```

---

## 👥 Default Credentials

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

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Recharts** - Data visualization
- **React Hot Toast** - Notifications
- **Axios** - HTTP client (centralized API utility)

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL 15** - Relational database
- **JWT** - Authentication
- **bcryptjs** - Password hashing

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration

---

## 📂 Project Structure

```
zohra-rms-v2/
├── client/                 # React Frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── context/       # React context (Auth)
│   │   ├── utils/         # Utilities (API client)
│   │   └── App.jsx        # Main app component
│   └── package.json
├── server/                 # Node.js Backend
│   ├── src/
│   │   ├── modules/       # Feature modules
│   │   │   ├── auth/
│   │   │   ├── finance/
│   │   │   ├── payroll/
│   │   │   ├── inventory/
│   │   │   ├── pos/
│   │   │   ├── chicken/
│   │   │   └── reports/
│   │   ├── config/        # Configuration
│   │   └── app.js         # Express app
│   └── package.json
├── database/               # SQL Scripts
│   ├── schema.sql         # Database schema
│   └── seed.sql           # Initial data
├── documentation/          # Project documentation
├── docker-compose.yml     # Container orchestration
└── README.md              # This file
```

---

## 📚 Documentation

- **[User Guide](documentation/user_guide.md)** - How to use the system
- **[API Reference](documentation/API_REFERENCE.md)** - Backend API documentation
- **[Database Schema](documentation/DATABASE_SCHEMA.md)** - Database structure
- **[Project Logic](documentation/PROJECT_LOGIC.md)** - Business logic and workflows
- **[Development Guide](documentation/DEVELOPMENT.md)** - Developer setup and guidelines

---

## 🔄 Recent Updates

### v2.1.0 (December 2024)
- ✅ **Fixed all frontend axios errors** - Migrated 13 files to centralized API utility
- ✅ **UI improvements** - Optimized Vendor Payments modal spacing
- ✅ **Database access tools** - Added helper scripts for easy DB management
- ✅ **Enhanced documentation** - Comprehensive guides and API reference

### Previous Updates
- Implemented comprehensive reporting system
- Added expense auto-categorization
- Enhanced payroll with component breakdown
- Integrated chicken biller functionality
- Added audit trails and financial period management

---

## 🧪 Testing

```bash
# Run backend tests
cd server
npm test

# Run frontend tests
cd client
npm test

# Run E2E tests
npm run test:e2e
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

**Copyright © 2024 Al Zohra RMS. All Rights Reserved.**

This software is proprietary and confidential. Unauthorized copying, distribution, modification, or use of this software, via any medium, is strictly prohibited without explicit written permission from the copyright holder.

**This software is licensed for use exclusively by Al Zohra Restaurant and its authorized personnel.**

---

## 🆘 Support

For issues and questions:
- Create an issue in the GitHub repository
- Check the [documentation](documentation/) folder
- Review the [User Guide](documentation/user_guide.md)

---

**Version**: 2.1.0  
**Last Updated**: December 16, 2024  
**Status**: Production Ready ✅
