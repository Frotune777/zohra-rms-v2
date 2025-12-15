import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiCoffee, FiDollarSign, FiUsers, FiLogOut, FiUser, FiGift, FiMenu, FiTrendingUp, FiHome, FiBarChart2, FiActivity, FiGrid } from 'react-icons/fi';

const SidebarItem = ({ icon: Icon, label, to, active }) => (
  <Link to={to} className={`flex items-center gap-3 p-3 rounded-lg transition-all ${active ? 'bg-zohra-blue text-white font-bold' : 'hover:bg-white/5 text-gray-400'}`}>
    <Icon className="text-xl" />
    <span>{label}</span>
  </Link>
);

export default ({ children }) => {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout, userRole } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const canAccessPayroll = userRole === 'manager' || userRole === 'owner';

  return (
    <div className="flex h-full w-full">
      <aside className="w-64 glass-panel m-2 flex flex-col p-6 rounded-xl overflow-y-auto">
        <h1 className="text-2xl font-bold text-zohra-blue mb-2 text-center">Al Zohra</h1>
        <p className="text-xs text-gray-400 text-center mb-8 capitalize">{userRole} • {user?.full_name}</p>
        <nav className="space-y-2 flex-1">
          <SidebarItem to="/dashboard" icon={FiHome} label="Master Dashboard" active={loc.pathname === '/dashboard'} />
          <SidebarItem to="/" icon={FiCoffee} label="POS" active={loc.pathname === '/'} />
          <SidebarItem to="/employees" icon={FiUsers} label="Employees" active={loc.pathname === '/employees'} />
          <SidebarItem to="/menu" icon={FiMenu} label="Menu" active={loc.pathname === '/menu'} />
          {canAccessPayroll && (
            <SidebarItem to="/payroll" icon={FiUser} label="Payroll" active={loc.pathname === '/payroll'} />
          )}
          <SidebarItem to="/advances" icon={FiGift} label="Advances" active={loc.pathname === '/advances'} />
          {canAccessPayroll && (
            <SidebarItem to="/advances/approvals" icon={FiGift} label="Advance Approvals" active={loc.pathname === '/advances/approvals'} />
          )}
          <SidebarItem to="/attendance/bulk" icon={FiUsers} label="Bulk Attendance" active={loc.pathname === '/attendance/bulk'} />
          <SidebarItem to="/attendance/leaves" icon={FiUsers} label="Leave Management" active={loc.pathname === '/attendance/leaves'} />

          <div className="my-2 border-t border-white/10 pt-2">
            <p className="text-xs text-gray-500 px-3 mb-1 uppercase font-bold">Inventory & Procurement</p>
            <SidebarItem to="/inventory" icon={FiDollarSign} label="Inventory Stock" active={loc.pathname === '/inventory'} />
            <SidebarItem to="/chicken/bills" icon={FiCoffee} label="Chicken Bill Entry" active={loc.pathname === '/chicken/bills'} />
            <SidebarItem to="/chicken/rates" icon={FiDollarSign} label="Daily Rates" active={loc.pathname === '/chicken/rates'} />
            <SidebarItem to="/chicken/vendors" icon={FiUsers} label="Vendors" active={loc.pathname === '/chicken/vendors'} />
            <SidebarItem to="/vendor-payments" icon={FiDollarSign} label="Vendor Payments" active={loc.pathname === '/vendor-payments'} />
          </div>

          <div className="my-2 border-t border-white/10 pt-2">
            <p className="text-xs text-gray-500 px-3 mb-1 uppercase font-bold">Financials</p>
            <SidebarItem to="/finance" icon={FiDollarSign} label="General Ledger" active={loc.pathname === '/finance'} />
            <SidebarItem to="/finance/summary" icon={FiDollarSign} label="Daily Summary" active={loc.pathname === '/finance/summary'} />
            <SidebarItem to="/finance/daily-tracker" icon={FiGrid} label="Daily Tracker" active={loc.pathname === '/finance/daily-tracker'} />
          </div>

          <div className="my-2 border-t border-white/10 pt-2">
            <p className="text-xs text-gray-500 px-3 mb-1 uppercase font-bold">Analytics</p>
            <SidebarItem to="/reports" icon={FiBarChart2} label="Reports" active={loc.pathname.startsWith('/reports')} />
            <SidebarItem to="/ai-dashboard" icon={FiTrendingUp} label="AI Insights" active={loc.pathname === '/ai-dashboard'} />
            <SidebarItem to="/development-status" icon={FiActivity} label="Dev Status" active={loc.pathname === '/development-status'} />
          </div>
        </nav>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full p-3 mt-auto rounded-lg hover:bg-red-500/20 transition text-gray-400 hover:text-red-400"
        >
          <FiLogOut />
          <span>Logout</span>
        </button>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
};