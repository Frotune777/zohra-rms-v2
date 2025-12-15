const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Basic Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// We will mount modules here later
const authRoutes = require('./modules/auth/routes');
app.use('/api/auth', authRoutes);

const inventoryRoutes = require('./modules/inventory/routes');
const financeRoutes = require('./modules/finance/routes');
const employeeRoutes = require('./modules/employees/routes');
const posRoutes = require('./modules/pos/routes');
const operationsRoutes = require('./modules/operations/routes');
const dashboardRoutes = require('./modules/dashboard/routes'); // Added dashboardRoutes require
const aiRoutes = require('./modules/ai/routes');
const reportsRoutes = require('./modules/reports/routes');
const payrollRoutes = require('./modules/payroll/routes');
const vendorRoutes = require('./modules/vendors/routes');


app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
// Note: Chicken routes were previously at /api/chicken, now merged into /api/inventory
// We need to support old endpoints or update frontend. 
// For now, let's alias /api/chicken to /api/inventory for backward compatibility
app.use('/api/chicken', inventoryRoutes);

app.use('/api/finance', financeRoutes);
app.use('/api/employees', employeeRoutes); // Changed mount path for employeeRoutes
app.use('/api', posRoutes); // POS routes might be mounted at root /api or /api/orders inside
app.use('/api', operationsRoutes);
app.use('/api/dashboard', dashboardRoutes); // Mounted dashboard routes
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/payroll', payrollRoutes);

const attendanceRoutes = require('./modules/attendance/routes');
const leavesRoutes = require('./modules/leaves/routes');
const advanceRequestsRoutes = require('./modules/advance-requests/routes');
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leavesRoutes);
app.use('/api/advance-requests', advanceRequestsRoutes);
app.use('/api/vendors', vendorRoutes);


// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: {
            message: err.message || 'Internal Server Error',
            code: err.code
        }
    });
});

module.exports = app;
