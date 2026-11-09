import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardLayout from './layouts/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';
import ApiErrorNotice from './components/ApiErrorNotice';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import POS from './pages/POS';
import {KitchenDisplay,RecipeManagement,PurchaseOrders,StockWorkflow} from './pages/operations/Workflows';
import OrderPayments from './pages/operations/OrderPayments';
import EmployeeBalances from './pages/operations/EmployeeBalances';
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
import ChickenDashboard from './pages/chicken/ChickenDashboard';
import BulkAttendance from './pages/BulkAttendance';
import PaymentEntry from './pages/finance/PaymentEntry';
import DailySummary from './pages/finance/DailySummary';
import DailyTracker from './pages/finance/DailyTracker';
import ManagerFloat from './pages/finance/ManagerFloat';
import ExpenseMapping from './pages/finance/ExpenseMapping';
import MoneyTransfer from './pages/finance/MoneyTransfer';
import ReportsDashboard from './pages/reports/ReportsDashboard';
import FinancialReports from './pages/reports/FinancialReports';
import HRReports from './pages/reports/HRReports';
import OperationsReports from './pages/reports/OperationsReports';
import InventoryReports from './pages/reports/InventoryReports';

import AIDashboard from './pages/AIDashboard';
import MasterDashboard from './pages/MasterDashboard';
import DevelopmentStatus from './pages/DevelopmentStatus';
import LeaveManagement from './pages/LeaveManagement';
import AdvanceApprovals from './pages/AdvanceApprovals';
import ConfigManager from './pages/config/ConfigManager';
import ApprovalsDashboard from './pages/ApprovalsDashboard';


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
                <Route path="kitchen" element={<KitchenDisplay />} />
                <Route path="orders" element={<OrderPayments />} />
                <Route path="recipes" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><RecipeManagement /></ProtectedRoute>} />
                <Route path="purchase-orders" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><PurchaseOrders /></ProtectedRoute>} />
                <Route path="wastage" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><StockWorkflow wastage /></ProtectedRoute>} />
                <Route path="stock-adjustments" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><StockWorkflow /></ProtectedRoute>} />
                <Route path="employee-balances" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><EmployeeBalances /></ProtectedRoute>} />
                <Route path="/dashboard" element={<MasterDashboard />} />
                <Route path="employees" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><EmployeeManagement /></ProtectedRoute>} />
                <Route path="menu" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><MenuManagement /></ProtectedRoute>} />
                <Route path="payroll" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><Payroll /></ProtectedRoute>} />
                <Route path="advances" element={<Advances />} />
                <Route path="vendor-payments" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><VendorPayments /></ProtectedRoute>} />
                <Route path="inventory" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><Inventory /></ProtectedRoute>} />
                <Route path="finance" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><Finance /></ProtectedRoute>} />
                <Route path="finance/payments" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><PaymentEntry /></ProtectedRoute>} />
                <Route path="finance/summary" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><DailySummary /></ProtectedRoute>} />
                <Route path="finance/daily-tracker" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><DailyTracker /></ProtectedRoute>} />
                <Route path="finance/float" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><ManagerFloat /></ProtectedRoute>} />
                <Route path="finance/mappings" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><ExpenseMapping /></ProtectedRoute>} />
                <Route path="finance/transfer" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><MoneyTransfer /></ProtectedRoute>} />
                <Route path="attendance/bulk" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><BulkAttendance /></ProtectedRoute>} />
                <Route path="attendance/leaves" element={<LeaveManagement />} />
                <Route path="advances/approvals" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><AdvanceApprovals /></ProtectedRoute>} />
                <Route path="ai-dashboard" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><AIDashboard /></ProtectedRoute>} />

                {/* Chicken Tracker Routes */}
                <Route path="chicken" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><ChickenDashboard /></ProtectedRoute>} />
                <Route path="chicken/rates" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><DailyRates /></ProtectedRoute>} />
                <Route path="chicken/bills" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><BillEntry /></ProtectedRoute>} />
                <Route path="chicken/vendors" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><VendorManager /></ProtectedRoute>} />

                {/* Reports Routes */}
                <Route path="reports" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><ReportsDashboard /></ProtectedRoute>} />
                <Route path="reports/financial" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><FinancialReports /></ProtectedRoute>} />
                <Route path="reports/hr" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><HRReports /></ProtectedRoute>} />
                <Route path="reports/operations" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><OperationsReports /></ProtectedRoute>} />
                <Route path="reports/inventory" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><InventoryReports /></ProtectedRoute>} />

                {/* Configuration Management */}
                <Route path="config" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><ConfigManager /></ProtectedRoute>} />

                {/* Approvals Dashboard */}
                <Route path="approvals" element={<ProtectedRoute requiredRoles={["owner", "manager"]}><ApprovalsDashboard /></ProtectedRoute>} />

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
        <ApiErrorNotice />
        <Toaster position="top-right" />
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
