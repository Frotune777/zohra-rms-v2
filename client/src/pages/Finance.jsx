import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight, FiDownload, FiTrendingUp, FiTrendingDown, FiBarChart2, FiPieChart, FiPlus, FiX, FiTrash2, FiAlertCircle, FiCheckCircle, FiGrid, FiDollarSign } from 'react-icons/fi';

const FinanceCard = ({ title, value, color, change, trend, suffix = '' }) => (
  <div className="glass-panel p-3 md:p-4 lg:p-6 rounded-xl relative overflow-hidden group hover:bg-white/5 transition">
    <div className="flex justify-between items-start mb-1 md:mb-2">
      <h3 className="text-gray-400 text-xs md:text-sm uppercase font-semibold">{title}</h3>
      {trend !== undefined && (
        trend >= 0 ? <FiTrendingUp className="text-green-400 group-hover:scale-110 transition text-sm md:text-base" /> : <FiTrendingDown className="text-red-400 group-hover:scale-110 transition text-sm md:text-base" />
      )}
    </div>
    <p className={`text-xl md:text-2xl lg:text-3xl font-bold mt-1 md:mt-2 ${color}`}>
      {value !== undefined ? (suffix === '%' ? value.toFixed(1) : `₹${value.toFixed(2)}`) : '-'}
      {suffix}
    </p>
    {change !== undefined && (
      <p className={`text-xs mt-1 md:mt-2 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {trend >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(2)}% from last
      </p>
    )}
  </div>
);

const Finance = () => {
  const navigate = useNavigate();
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [data, setData] = useState({ revenue: 0, expenses: 0, profit: 0 });
  const [yearData, setYearData] = useState([]);
  const [previousData, setPreviousData] = useState({ revenue: 0, expenses: 0, profit: 0 });
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date().toLocaleTimeString('en-IN'));
  const [viewMode, setViewMode] = useState('monthly'); // monthly, yearly, quarterly
  const [profitMargin, setProfitMargin] = useState(0);
  const [transactions, setTransactions] = useState([]);

  // KPIs
  const [foodCost, setFoodCost] = useState(0); // Amount
  const [laborCost, setLaborCost] = useState(0); // Amount
  const [foodCostPct, setFoodCostPct] = useState(0);
  const [laborCostPct, setLaborCostPct] = useState(0);

  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionType, setTransactionType] = useState('revenue'); // revenue or expense
  const [formData, setFormData] = useState({ description: '', amount: '' });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { userRole } = useAuth();

  const canManageTransactions = userRole === 'manager' || userRole === 'owner';

  useEffect(() => {
    fetchFinanceData();
    fetchPreviousMonthData();
    fetchYearData();
    fetchTransactions();
  }, [selectedMonth, selectedYear]);

  // Recalculate KPIs when transactions or revenue changes
  useEffect(() => {
    calculateKPIs();
  }, [transactions, data.revenue]);

  const calculateKPIs = () => {
    if (!transactions || transactions.length === 0) {
      setFoodCost(0); setLaborCost(0); setFoodCostPct(0); setLaborCostPct(0);
      return;
    }

    const food = transactions
      .filter(t => t.category_name === 'Grocery' && t.type === 'Expense')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const labor = transactions
      .filter(t => t.category_name === 'Labor' && t.type === 'Expense')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    setFoodCost(food);
    setLaborCost(labor);

    if (data.revenue > 0) {
      setFoodCostPct((food / data.revenue) * 100);
      setLaborCostPct((labor / data.revenue) * 100);
    } else {
      setFoodCostPct(0);
      setLaborCostPct(0);
    }
  };

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/finance/pnl', {
        params: { month: selectedMonth, year: selectedYear }
      });
      setData(response.data);

      // Calculate profit margin
      if (response.data.revenue > 0) {
        const margin = (response.data.profit / response.data.revenue) * 100;
        setProfitMargin(margin);
      }
      setLastUpdate(new Date().toLocaleTimeString('en-IN'));
    } catch (err) {
      console.error('Failed to load finance data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPreviousMonthData = async () => {
    try {
      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;

      if (prevMonth < 1) {
        prevMonth = 12;
        prevYear -= 1;
      }

      const response = await api.get('/finance/pnl', {
        params: { month: prevMonth, year: prevYear }
      });
      setPreviousData(response.data);
    } catch (err) {
      console.error('Failed to load previous month data:', err);
    }
  };

  const fetchYearData = async () => {
    try {
      const response = await api.get('/finance/pnl/yearly', {
        params: { year: selectedYear }
      });
      setYearData(response.data);
    } catch (err) {
      console.error('Failed to load year data:', err);
    }
  };

  const fetchTransactions = async () => {
    try {
      // Calculate start and end date for the month
      const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

      const response = await api.get('/finance/transactions', {
        params: { startDate, endDate }
      });
      setTransactions(response.data);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!formData.description || !formData.amount) {
      setError('Description and amount are required');
      return;
    }

    if (parseFloat(formData.amount) <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    try {
      const endpoint = transactionType === 'revenue'
        ? '/finance/revenue'
        : '/finance/expense';

      await api.post(endpoint, {
        description: formData.description,
        amount: parseFloat(formData.amount)
      });

      setSuccessMessage(`✓ ${transactionType === 'revenue' ? 'Revenue' : 'Expense'} of ₹${parseFloat(formData.amount).toFixed(2)} added`);
      setFormData({ description: '', amount: '' });
      setShowTransactionForm(false);
      fetchFinanceData();
      fetchTransactions();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || `Failed to add ${transactionType}`);
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm('Delete this transaction? This action cannot be undone.')) return;

    try {
      await api.delete(`finance/transaction/${id}`);
      setSuccessMessage('✓ Transaction deleted successfully');
      fetchFinanceData();
      fetchTransactions();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete transaction');
    }
  };

  const calculateChange = (current, previous) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const handleMonthChange = (offset) => {
    let newMonth = selectedMonth + offset;
    let newYear = selectedYear;

    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }

    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
  };

  const handleExport = () => {
    const csvContent = [
      ['Al Zohra RMS - Financial Report'],
      [`Period: ${monthName}`],
      [],
      ['Metric', 'Amount (₹)'],
      ['Total Revenue', data.revenue.toFixed(2)],
      ['Total Expenses', data.expenses.toFixed(2)],
      ['Net Profit', data.profit.toFixed(2)],
      ['Profit Margin %', profitMargin.toFixed(2)],
      [],
      ['KPIs'],
      ['Food Cost %', foodCostPct.toFixed(2)],
      ['Labor Cost %', laborCostPct.toFixed(2)],
      [],
      ['Previous Period', 'Current Period', 'Change %'],
      ['Revenue', previousData.revenue.toFixed(2), data.revenue.toFixed(2), calculateChange(data.revenue, previousData.revenue).toFixed(2)],
      ['Expenses', previousData.expenses.toFixed(2), data.expenses.toFixed(2), calculateChange(data.expenses, previousData.expenses).toFixed(2)],
      ['Profit', previousData.profit.toFixed(2), data.profit.toFixed(2), calculateChange(data.profit, previousData.profit).toFixed(2)]
    ].map(row => row.join(',')).join('\n');

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
    element.setAttribute('download', `Al-Zohra-Finance-${monthName.replace(' ', '-')}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const prevMonthIndex = (selectedMonth - 2 + 12) % 12;
  const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
  const previousMonthName = new Date(prevYear, prevMonthIndex).toLocaleDateString('en-IN', { month: 'short' });

  return (
    <div className="p-4 md:p-6 lg:p-8 h-full w-full overflow-auto flex flex-col bg-gradient-to-br from-midnight to-midnight/95">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 md:mb-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-zohra-blue mb-1">Financial Dashboard</h2>
          <p className="text-xs text-gray-400">Complete financial overview and KPIs</p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full sm:w-auto">
          <div className="flex gap-1 glass-panel p-1 rounded-lg">
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 rounded transition text-xs md:text-sm font-medium ${viewMode === 'monthly' ? 'bg-zohra-blue text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setViewMode('yearly')}
              className={`px-3 py-1.5 rounded transition text-xs md:text-sm font-medium ${viewMode === 'yearly' ? 'bg-zohra-blue text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Yearly
            </button>
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-1 btn-primary"
            title="Export to CSV"
          >
            <FiDownload size={14} />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Quick Links */}
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/finance/daily-tracker')}
              className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white px-2 md:px-3 py-1.5 rounded-lg font-medium transition text-xs md:text-sm"
            >
              <FiGrid size={14} />
              <span className="hidden sm:inline">Tracker</span>
            </button>
            <button
              onClick={() => navigate('/finance/float')}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-2 md:px-3 py-1.5 rounded-lg font-medium transition text-xs md:text-sm"
            >
              <FiDollarSign size={14} />
              <span className="hidden sm:inline">Float</span>
            </button>
          </div>
        </div>
      </div>

      {/* Month/Year Navigation */}
      <div className="glass-panel p-3 md:p-4 rounded-lg mb-4 md:mb-6 flex items-center justify-between">
        <button
          onClick={() => handleMonthChange(-1)}
          className="p-2 hover:bg-white/10 rounded transition"
        >
          <FiChevronLeft size={20} />
        </button>

        <div className="text-center">
          <p className="text-lg md:text-xl font-bold text-zohra-blue">{monthName}</p>
          <p className="text-xs text-gray-400">Period {selectedMonth}/{selectedYear}</p>
        </div>

        <button
          onClick={() => handleMonthChange(1)}
          className="p-2 hover:bg-white/10 rounded transition"
        >
          <FiChevronRight size={20} />
        </button>

        <div className="ml-auto text-right">
          <p className="text-xs text-gray-400">Last updated: {lastUpdate}</p>
          {loading && <p className="text-xs text-zohra-blue animate-pulse">Updating...</p>}
        </div>
      </div>

      {/* Key Metrics & KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
        <FinanceCard
          title="Revenue"
          value={data.revenue}
          color="text-green-400"
          change={calculateChange(data.revenue, previousData.revenue)}
          trend={data.revenue >= previousData.revenue ? 1 : -1}
        />
        <FinanceCard
          title="Net Profit"
          value={data.profit}
          color={data.profit >= 0 ? "text-zohra-blue" : "text-red-400"}
          change={calculateChange(data.profit, previousData.profit)}
          trend={data.profit >= previousData.profit ? 1 : -1}
        />
        {/* KPI Cards */}
        <FinanceCard
          title="Food Cost %"
          value={foodCostPct}
          suffix="%"
          color={foodCostPct > 35 ? "text-red-400" : "text-green-400"}
          trend={1} // Static trend for now 
        />
        <FinanceCard
          title="Labor Cost %"
          value={laborCostPct}
          suffix="%"
          color={laborCostPct > 30 ? "text-red-400" : "text-green-400"}
          trend={1}
        />
      </div>

      {/* Main Report Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6 flex-1 overflow-auto">
        {/* P&L Statement */}
        <div className="lg:col-span-2 glass-panel p-4 md:p-6 rounded-xl">
          <h3 className="text-base md:text-lg font-bold mb-4 md:mb-6 text-white flex items-center gap-2">
            <FiBarChart2 size={18} className="text-zohra-blue" />
            P&L Statement
          </h3>

          <div className="space-y-4">
            {/* Revenue Section */}
            <div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg mb-2">
                <span className="text-gray-300 font-semibold">Revenue</span>
                <span className="text-green-400 font-bold text-lg">+₹{data.revenue.toFixed(2)}</span>
              </div>
            </div>

            <div className="border-t border-white/10 my-4"></div>

            {/* Expenses Section */}
            <div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg mb-2">
                <span className="text-gray-300 font-semibold">Total Expenses</span>
                <span className="text-red-400 font-bold text-lg">-₹{data.expenses.toFixed(2)}</span>
              </div>
              <div className="ml-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Cost of Goods Sold (Grocery):</span>
                  <span className="text-red-400">₹{foodCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Labor/Payroll:</span>
                  <span className="text-red-400">₹{laborCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Other Expenses:</span>
                  <span className="text-red-400">₹{Math.max(0, data.expenses - foodCost - laborCost).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 my-4"></div>

            {/* Net Profit Section */}
            <div className="bg-gradient-to-r from-white/10 to-white/5 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-semibold text-lg">Net Profit</span>
                <span className={`font-bold text-2xl ${data.profit >= 0 ? 'text-zohra-blue' : 'text-red-400'}`}>
                  {data.profit >= 0 ? '+' : '-'}₹{Math.abs(data.profit).toFixed(2)}
                </span>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10 flex justify-between text-xs">
                <span className="text-gray-400">Margin:</span>
                <span className={profitMargin >= 0 ? 'text-zohra-blue' : 'text-red-400'}>
                  {profitMargin.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Summary & Metrics */}
        <div className="glass-panel p-6 rounded-xl">
          <h3 className="text-lg font-bold mb-6 text-white flex items-center gap-2">
            <FiPieChart size={20} className="text-zohra-blue" />
            Summary
          </h3>

          <div className="space-y-6">
            <div className="p-4 rounded-lg" style={{ backgroundColor: data.profit >= 0 ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
              <p className={`text-sm font-semibold ${data.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {data.profit >= 0 ? '✓ Profitable' : '⚠ Loss'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {data.profit >= 0
                  ? `You earned ₹${data.profit.toFixed(2)} this period`
                  : `You lost ₹${Math.abs(data.profit).toFixed(2)} this period`}
              </p>
            </div>

            {/* Comparison with Previous */}
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3">vs {previousMonthName}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Revenue</span>
                  <span className={calculateChange(data.revenue, previousData.revenue) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {calculateChange(data.revenue, previousData.revenue) >= 0 ? '↑' : '↓'} {Math.abs(calculateChange(data.revenue, previousData.revenue)).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Expenses</span>
                  <span className={calculateChange(data.expenses, previousData.expenses) <= 0 ? 'text-green-400' : 'text-red-400'}>
                    {calculateChange(data.expenses, previousData.expenses) >= 0 ? '↑' : '↓'} {Math.abs(calculateChange(data.expenses, previousData.expenses)).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Expense Breakdown Visualization */}
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3">Cost Breakdown</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400">Food Cost</span>
                    <span className="text-gray-300">{foodCostPct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div className="bg-red-400 h-2 rounded-full" style={{ width: `${Math.min(foodCostPct, 100)}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400">Labor</span>
                    <span className="text-gray-300">{laborCostPct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div className="bg-orange-400 h-2 rounded-full" style={{ width: `${Math.min(laborCostPct, 100)}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Year Overview (Hidden for brevity for now, kept logic if viewMode toggled) */}
      {viewMode === 'yearly' && (
        <div className="mt-8 glass-panel p-6 rounded-xl">
          <h3 className="text-lg font-bold mb-6 text-white">Year Overview - {selectedYear}</h3>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {yearData.map((month, idx) => {
              const monthShort = new Date(selectedYear, idx).toLocaleDateString('en-IN', { month: 'short' });
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg text-center cursor-pointer transition ${selectedMonth === idx + 1 ? 'glass-panel border border-zohra-blue' : 'bg-white/5 hover:bg-white/10'
                    }`}
                  onClick={() => setSelectedMonth(idx + 1)}
                >
                  <p className="text-xs font-semibold text-gray-400 mb-2">{monthShort}</p>
                  <p className={`text-sm font-bold ${month.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ₹{(month.profit / 1000).toFixed(1)}K
                  </p>
                  <p className="text-xs text-gray-500 mt-1">₹{(month.revenue / 1000).toFixed(1)}K</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transaction Management Logic ... (Kept similar but simpler for this replace) */}
      {/* For brevity, I am assuming the user might not need to see the manual add form section regenerated entirely if I replaced whole file. 
          But I replaced the whole file content. I must ensure I didn't lose the Manual Transaction form!
          I included it in logic but stripped it from JSX above?
          Wait, I should check my ReplacementContent.
          I see "Transaction Management Logic ..." comment in my ReplacementContent above. 
          This means I am DELETING the manual transaction form from the UI if I use this ReplacementContent!
          I MUST include the manual transaction form JSX too. 
      */}
      {canManageTransactions && (
        <div className="mt-8 glass-panel p-6 rounded-xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white">Transactions Log</h3>
            <button
              onClick={() => setShowTransactionForm(!showTransactionForm)}
              className="flex items-center gap-2 btn-primary"
            >
              <FiPlus size={16} />
              Add Entry
            </button>
          </div>

          {/* Transaction Form */}
          {showTransactionForm && (
            <form onSubmit={handleAddTransaction} className="bg-white/5 border border-white/10 p-6 rounded-lg mb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-zohra-blue"
                  >
                    <option value="revenue" className="bg-gray-800 text-white">Revenue</option>
                    <option value="expense" className="bg-gray-800 text-white">Expense</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                    placeholder="e.g., Office rent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                    placeholder="5000"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="submit" className="btn-primary">Save</button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-white/5 text-gray-400 border-b border-white/10">
                <tr>
                  <th className="p-4 font-semibold">Date</th>
                  <th className="p-4 font-semibold">Description</th>
                  <th className="p-4 font-semibold">Category</th>
                  <th className="p-4 font-semibold text-right">Amount</th>
                  {userRole === 'owner' && <th className="p-4 font-semibold">Action</th>}
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => (
                  <tr key={txn.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="p-4 text-gray-400 text-xs">{new Date(txn.transaction_date || txn.date).toLocaleDateString('en-IN')}</td>
                    <td className="p-4 font-semibold">{txn.description}</td>
                    <td className="p-4 text-gray-400 text-xs">{txn.category_name || '-'}</td>
                    <td className={`p-4 font-bold text-right ${txn.type === 'Sales' || txn.transaction_type === 'Revenue' ? 'text-green-400' : 'text-red-400'}`}>
                      {txn.type === 'Sales' || txn.transaction_type === 'Revenue' ? '+' : '-'}₹{parseFloat(txn.amount || txn.debit_total || 0).toFixed(2)}
                    </td>
                    {userRole === 'owner' && (
                      <td className="p-4">
                        <button onClick={() => handleDeleteTransaction(txn.id)} className="text-red-400 hover:text-white"><FiTrash2 /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
export default Finance;