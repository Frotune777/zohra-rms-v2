import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { FiAlertCircle, FiCheckCircle, FiPlus, FiX, FiTrash2, FiArrowUpRight, FiArrowDownLeft } from 'react-icons/fi';

const Advances = () => {
  const [transactions, setTransactions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: '',
    type: 'Advance', // Advance or Repayment
    amount: '',
    notes: '',
    paymentMode: 'Cash',
    paidBy: ''
  });
  const { userRole } = useAuth();

  const canManageAdvances = userRole === 'manager' || userRole === 'owner';

  const [selectedEmployee, setSelectedEmployee] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication token missing. Please login again.');
        setLoading(false);
        return;
      }

      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [advRes, empRes] = await Promise.all([
        selectedEmployee
          ? api.get(`http://localhost:5000/api/employees/payroll/advances/${selectedEmployee}`)
          : api.get('employees/payroll/advances'),
        api.get('employees')
      ]);

      setTransactions(Array.isArray(advRes.data) ? advRes.data : []);
      setEmployees(Array.isArray(empRes.data) ? empRes.data : []);
      setError('');
    } catch (err) {
      console.error('Advance Ledger Error:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to load data';
      setError(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedEmployee]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!formData.employeeId || !formData.amount) {
      setError('Employee and Amount are required');
      return;
    }

    if (parseFloat(formData.amount) <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await api.post('employees/payroll/advance', {
        employee_id: formData.employeeId,
        amount: parseFloat(formData.amount),
        reason: formData.notes,
        paidBy: formData.paidBy
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const empName = employees.find(e => e.id == formData.employeeId)?.full_name || 'Employee';
      setSuccessMessage(`✓ ${formData.type} of ₹${parseFloat(formData.amount).toFixed(2)} recorded for ${empName}`);
      setFormData({ employeeId: '', type: 'Advance', amount: '', notes: '', paymentMode: 'Cash', paidBy: '' });
      setShowForm(false);
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save transaction');
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400">Loading advances...</p>
      </div>
    );
  }

  // Calculate Totals
  const totalAdvances = transactions
    .filter(t => t.transaction_type === 'Advance')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const totalRepayments = transactions
    .filter(t => t.transaction_type === 'Repayment')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const outstandingBalance = totalAdvances - totalRepayments;

  return (
    <div className="p-8 h-full w-full flex flex-col overflow-hidden bg-gradient-to-br from-midnight to-midnight/95">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-zohra-blue mb-2">Advance Ledger</h2>
          <p className="text-xs text-gray-400">Track employee advances and repayments</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-zohra-blue"
          >
            <option value="" className="bg-gray-800">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id} className="bg-gray-800">{emp.full_name}</option>
            ))}
          </select>
          {canManageAdvances && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 btn-primary"
            >
              <FiPlus /> New Transaction
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500 rounded-lg mb-4">
          <FiAlertCircle className="text-red-500" />
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 p-4 bg-green-500/20 border border-green-500 rounded-lg mb-4">
          <FiCheckCircle className="text-green-500" />
          <p className="text-green-200">{successMessage}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glass-panel p-4 rounded-lg">
          <p className="text-gray-400 text-sm uppercase mb-2">Total Advances Given</p>
          <p className="text-2xl font-bold text-zohra-blue">₹{totalAdvances.toFixed(2)}</p>
        </div>
        <div className="glass-panel p-4 rounded-lg">
          <p className="text-gray-400 text-sm uppercase mb-2">Total Repaid</p>
          <p className="text-2xl font-bold text-green-400">₹{totalRepayments.toFixed(2)}</p>
        </div>
        <div className="glass-panel p-4 rounded-lg">
          <p className="text-gray-400 text-sm uppercase mb-2">Outstanding Balance</p>
          <p className="text-2xl font-bold text-red-400">₹{outstandingBalance.toFixed(2)}</p>
        </div>
      </div>

      {/* Add Transaction Form */}
      {showForm && canManageAdvances && (
        <form onSubmit={handleSubmit} className="glass-panel p-6 mb-6 rounded-xl space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">New Transaction</h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-gray-400 hover:text-white transition"
            >
              <FiX size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Employee *</label>
              <select
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                required
              >
                <option value="" className="bg-gray-800 text-white">Select Employee</option>
                {employees.filter(e => e.status === 'active').map(emp => (
                  <option key={emp.id} value={emp.id} className="bg-gray-800 text-white">
                    {emp.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                required
              >
                <option value="Advance" className="bg-gray-800 text-white">Give Advance</option>
                <option value="Repayment" className="bg-gray-800 text-white">Repayment</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Amount (₹) *</label>
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

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="Reason for advance/repayment"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Payment Mode</label>
              <select
                value={formData.paymentMode}
                onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
              >
                <option value="Cash" className="bg-gray-800 text-white">Cash</option>
                <option value="UPI" className="bg-gray-800 text-white">UPI</option>
                <option value="Bank Transfer" className="bg-gray-800 text-white">Bank Transfer</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Paid By (Name)</label>
              <select
                value={formData.paidBy}
                onChange={(e) => setFormData({ ...formData, paidBy: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
              >
                <option value="" className="bg-gray-800 text-white">Select Payer</option>
                {employees
                  .filter(e => e.role === 'manager' || e.role === 'owner')
                  .map(emp => (
                    <option key={emp.id} value={emp.full_name} className="bg-gray-800 text-white">
                      {emp.full_name} ({emp.role})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
            >
              Save Transaction
            </button>
          </div>
        </form>
      )}

      {/* Ledger Table */}
      <div className="glass-panel rounded-xl overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/5 text-gray-400 border-b border-white/10 sticky top-0">
              <tr>
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">EMP ID</th>
                <th className="p-4 font-semibold">Employee</th>
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold">Dept</th>
                <th className="p-4 font-semibold">Type</th>
                <th className="p-4 font-semibold">Amount</th>
                <th className="p-4 font-semibold">Mode</th>
                <th className="p-4 font-semibold">Paid By</th>
                <th className="p-4 font-semibold">Balance After</th>
                <th className="p-4 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-4 text-center text-gray-400">
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map((txn) => (
                  <tr key={txn.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="p-4 text-gray-400 text-sm">
                      {new Date(txn.transaction_date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="p-4 font-mono text-xs text-gray-400">{txn.employee_code || '-'}</td>
                    <td className="p-4 font-semibold">{txn.employee_name || 'Unknown'}</td>
                    <td className="p-4 text-sm text-gray-300 capitalize">{txn.role || '-'}</td>
                    <td className="p-4 text-sm text-gray-300">{txn.department || '-'}</td>
                    <td className="p-4">
                      <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold w-fit ${txn.transaction_type === 'Advance'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-green-500/20 text-green-300'
                        }`}>
                        {txn.transaction_type === 'Advance' ? <FiArrowUpRight /> : <FiArrowDownLeft />}
                        {txn.transaction_type}
                      </span>
                    </td>
                    <td className="p-4 font-bold">₹{parseFloat(txn.amount).toFixed(2)}</td>
                    <td className="p-4 text-sm text-gray-300">{txn.payment_mode || '-'}</td>
                    <td className="p-4 text-sm text-gray-300">{txn.paid_by || '-'}</td>
                    <td className="p-4 text-gray-400">₹{parseFloat(txn.balance_after).toFixed(2)}</td>
                    <td className="p-4 text-gray-400 text-sm italic">{txn.notes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Advances;