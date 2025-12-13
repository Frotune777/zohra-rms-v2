import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardLayout from './layouts/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import POS from './pages/POS';
import Payroll from './pages/Payroll';
import Advances from './pages/Advances';
import VendorPayments from './pages/VendorPayments';
import Inventory from './pages/Inventory';
import Finance from './pages/Finance';
import EmployeeManagement from './pages/EmployeeManagement';
import MenuManagement from './pages/MenuManagement';
import DailyRates from './pages/chicken/DailyRates';
import BillEntry from './pages/chicken/BillEntry';
import VendorManager from './pages/chicken/VendorManager';
import BulkAttendance from './pages/BulkAttendance';
import PaymentEntry from './pages/finance/PaymentEntry';
import DailySummary from './pages/finance/DailySummary';
import DailyTracker from './pages/finance/DailyTracker';
import ManagerFloat from './pages/finance/ManagerFloat';
import ExpenseMapping from './pages/finance/ExpenseMapping';
import ReportsDashboard from './pages/reports/ReportsDashboard';
import FinancialReports from './pages/reports/FinancialReports';
import HRReports from './pages/reports/HRReports';
import OperationsReports from './pages/reports/OperationsReports';
import InventoryReports from './pages/reports/InventoryReports';

import AIDashboard from './pages/AIDashboard';
import MasterDashboard from './pages/MasterDashboard';
import DevelopmentStatus from './pages/DevelopmentStatus';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Routes>
                <Route path="/" element={<POS />} />
                <Route path="/dashboard" element={<MasterDashboard />} />
                <Route path="employees" element={<EmployeeManagement />} />
                <Route path="menu" element={<MenuManagement />} />
                <Route path="payroll" element={<Payroll />} />
                <Route path="advances" element={<Advances />} />
                <Route path="vendor-payments" element={<VendorPayments />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="finance" element={<Finance />} />
                <Route path="finance/payments" element={<PaymentEntry />} />
                <Route path="finance/summary" element={<DailySummary />} />
                <Route path="finance/daily-tracker" element={<DailyTracker />} />
                <Route path="finance/float" element={<ManagerFloat />} />
                <Route path="finance/mappings" element={<ExpenseMapping />} />
                <Route path="attendance/bulk" element={<BulkAttendance />} />
                <Route path="ai-dashboard" element={<AIDashboard />} />

                {/* Chicken Tracker Routes */}
                <Route path="chicken/rates" element={<DailyRates />} />
                <Route path="chicken/bills" element={<BillEntry />} />
                <Route path="chicken/vendors" element={<VendorManager />} />

                {/* Reports Routes */}
                <Route path="reports" element={<ReportsDashboard />} />
                <Route path="reports/financial" element={<FinancialReports />} />
                <Route path="reports/hr" element={<HRReports />} />
                <Route path="reports/operations" element={<OperationsReports />} />
                <Route path="reports/inventory" element={<InventoryReports />} />

                <Route path="development-status" element={<DevelopmentStatus />} />
              </Routes>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}