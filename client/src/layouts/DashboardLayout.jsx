import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiCoffee, FiDollarSign, FiUsers, FiLogOut, FiUser, FiGift, FiMenu, FiTrendingUp, FiHome, FiBarChart2, FiActivity, FiGrid, FiX } from 'react-icons/fi';

const SidebarItem = ({ icon: Icon, label, to, active, onClick }) => (
  <Link
    to={to}
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${active ? 'bg-zohra-blue text-white font-semibold' : 'hover:bg-white/5 text-gray-400'
      }`}
  >
    <Icon className="text-lg flex-shrink-0" />
    <span className="truncate">{label}</span>
  </Link>
);

export default ({ children }) => {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout, userRole } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const canAccessPayroll = userRole === 'manager' || userRole === 'owner';

  return (
    <div className="flex h-full w-full">
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 glass-panel px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 hover:bg-white/10 rounded-lg transition"
          aria-label="Open menu"
        >
          <FiMenu className="text-xl text-white" />
        </button>
        <h1 className="text-lg font-bold text-zohra-blue">Al Zohra RMS</h1>
        <div className="w-10" /> {/* Spacer for centering */}
      </header>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 glass-panel flex flex-col
        transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:m-2 md:rounded-xl
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-bold text-zohra-blue">Al Zohra</h1>
            <button
              onClick={closeMobileMenu}
              className="md:hidden p-1 hover:bg-white/10 rounded transition"
            >
              <FiX className="text-xl text-gray-400" />
            </button>
          </div>
          <p className="text-xs text-gray-400 capitalize truncate">{userRole} • {user?.full_name}</p>
        </div>

        {/* Navigation */}
        <nav className="space-y-1 flex-1 overflow-y-auto p-3">
          <SidebarItem to="/dashboard" icon={FiHome} label="Dashboard" active={loc.pathname === '/dashboard'} onClick={closeMobileMenu} />
          <SidebarItem to="/" icon={FiCoffee} label="POS" active={loc.pathname === '/'} onClick={closeMobileMenu} />
          <SidebarItem to="/employees" icon={FiUsers} label="Employees" active={loc.pathname === '/employees'} onClick={closeMobileMenu} />
          <SidebarItem to="/menu" icon={FiMenu} label="Menu" active={loc.pathname === '/menu'} onClick={closeMobileMenu} />
          {canAccessPayroll && (
            <SidebarItem to="/payroll" icon={FiUser} label="Payroll" active={loc.pathname === '/payroll'} onClick={closeMobileMenu} />
          )}
          <SidebarItem to="/advances" icon={FiGift} label="Advances" active={loc.pathname === '/advances'} onClick={closeMobileMenu} />
          {canAccessPayroll && (
            <SidebarItem to="/advances/approvals" icon={FiGift} label="Approvals" active={loc.pathname === '/advances/approvals'} onClick={closeMobileMenu} />
          )}
          <SidebarItem to="/attendance/bulk" icon={FiUsers} label="Attendance" active={loc.pathname === '/attendance/bulk'} onClick={closeMobileMenu} />
          <SidebarItem to="/attendance/leaves" icon={FiUsers} label="Leaves" active={loc.pathname === '/attendance/leaves'} onClick={closeMobileMenu} />

          <div className="my-2 border-t border-white/10 pt-2">
            <p className="text-xs text-gray-500 px-2 mb-1 uppercase font-semibold">Inventory</p>
            <SidebarItem to="/inventory" icon={FiDollarSign} label="Stock" active={loc.pathname === '/inventory'} onClick={closeMobileMenu} />
            <SidebarItem to="/chicken/bills" icon={FiCoffee} label="Chicken Bills" active={loc.pathname === '/chicken/bills'} onClick={closeMobileMenu} />
            <SidebarItem to="/chicken/rates" icon={FiDollarSign} label="Daily Rates" active={loc.pathname === '/chicken/rates'} onClick={closeMobileMenu} />
            <SidebarItem to="/chicken/vendors" icon={FiUsers} label="Vendors" active={loc.pathname === '/chicken/vendors'} onClick={closeMobileMenu} />
            <SidebarItem to="/vendor-payments" icon={FiDollarSign} label="Payments" active={loc.pathname === '/vendor-payments'} onClick={closeMobileMenu} />
          </div>

          <div className="my-2 border-t border-white/10 pt-2">
            <p className="text-xs text-gray-500 px-2 mb-1 uppercase font-semibold">Finance</p>
            <SidebarItem to="/finance" icon={FiDollarSign} label="Ledger" active={loc.pathname === '/finance'} onClick={closeMobileMenu} />
            <SidebarItem to="/finance/summary" icon={FiDollarSign} label="Summary" active={loc.pathname === '/finance/summary'} onClick={closeMobileMenu} />
            <SidebarItem to="/finance/daily-tracker" icon={FiGrid} label="Tracker" active={loc.pathname === '/finance/daily-tracker'} onClick={closeMobileMenu} />
          </div>

          <div className="my-2 border-t border-white/10 pt-2">
            <p className="text-xs text-gray-500 px-2 mb-1 uppercase font-semibold">Analytics</p>
            <SidebarItem to="/reports" icon={FiBarChart2} label="Reports" active={loc.pathname.startsWith('/reports')} onClick={closeMobileMenu} />
            <SidebarItem to="/ai-dashboard" icon={FiTrendingUp} label="AI Insights" active={loc.pathname === '/ai-dashboard'} onClick={closeMobileMenu} />
            <SidebarItem to="/development-status" icon={FiActivity} label="Dev Status" active={loc.pathname === '/development-status'} onClick={closeMobileMenu} />
          </div>
        </nav>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 m-3 rounded-lg hover:bg-red-500/20 transition text-gray-400 hover:text-red-400 text-sm"
        >
          <FiLogOut className="flex-shrink-0" />
          <span>Logout</span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden mt-14 md:mt-0">
        {children}
      </main>
    </div>
  );
};