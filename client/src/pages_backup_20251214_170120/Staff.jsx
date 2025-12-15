import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { FiAlertCircle, FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi';

const Staff = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { userRole } = useAuth();

  // Only manager and owner can access payroll functions
  const canManagePayroll = userRole === 'manager' || userRole === 'owner';

  if (!canManagePayroll) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center glass-panel p-8 rounded-xl max-w-md">
          <FiAlertCircle className="text-4xl text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Restricted</h2>
          <p className="text-gray-400">Only managers and owners can access payroll management. Please contact your manager for assistance.</p>
        </div>
      </div>
    );
  }

  const fetchEmployees = () => {
    setLoading(true);
    axios.get('http://localhost:5000/api/employees-payroll')
      .then(res => {
        setEmployees(res.data);
        setError('');
      })
      .catch(err => {
        setError('Failed to load employees');
        console.error(err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleAdvance = async (id, name) => {
    const amount = prompt(`Enter Advance Amount (₹) for ${name}:`);
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;

    try {
      setError('');
      setSuccessMessage('');
      await axios.post('http://localhost:5000/api/employees/payroll/advance', {
        employeeId: id,
        amount: parseFloat(amount)
      });
      setSuccessMessage(`✓ Advance of ₹${parseFloat(amount).toFixed(2)} given to ${name}`);
      fetchEmployees();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (e) {
      setError(e.response?.data?.error || 'Error giving advance');
    }
  };

  const handlePayroll = async (id, name) => {
    if (!confirm(`Run payroll for ${name}? This will deduct active advances.`)) return;

    try {
      setError('');
      setSuccessMessage('');
      const res = await axios.post('http://localhost:5000/api/employees/payroll/run', { employeeId: id });
      const { netPay, advanceDeduction, baseSalary } = res.data;

      setSuccessMessage(
        `✓ Payroll processed for ${name}\n` +
        `Base Salary: ₹${baseSalary.toFixed(2)}\n` +
        `Advances Deducted: ₹${advanceDeduction.toFixed(2)}\n` +
        `Net Pay: ₹${netPay.toFixed(2)}`
      );
      fetchEmployees();
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (e) {
      setError(e.response?.data?.error || 'Error running payroll');
    }
  };

  if (loading && employees.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400">Loading employees...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-8 h-full w-full rounded-xl flex flex-col overflow-hidden">
      <h2 className="text-2xl font-bold mb-6 text-zohra-gold">Staff & Payroll Management</h2>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500 rounded-lg mb-4">
          <FiAlertCircle className="text-red-500" />
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-500/20 border border-green-500 rounded-lg mb-4">
          <p className="text-green-200 whitespace-pre-line text-sm">{successMessage}</p>
        </div>
      )}

      <div className="overflow-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="bg-white/5 text-gray-400 border-b border-white/10 sticky top-0">
            <tr>
              <th className="p-4 font-semibold">Name</th>
              <th className="p-4 font-semibold">Position</th>
              <th className="p-4 font-semibold">Base Salary</th>
              <th className="p-4 font-semibold">Active Advances</th>
              <th className="p-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-4 text-center text-gray-400">
                  No employees found
                </td>
              </tr>
            ) : (
              employees.map(emp => (
                <tr key={emp.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="p-4 font-bold">{emp.full_name}</td>
                  <td className="p-4 text-sm text-gray-400">{emp.position}</td>
                  <td className="p-4 text-zohra-gold font-semibold">₹{parseFloat(emp.base_salary).toFixed(2)}</td>
                  <td className={`p-4 font-bold ${parseFloat(emp.active_advances) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    ₹{parseFloat(emp.active_advances).toFixed(2)}
                  </td>
                  <td className="p-4 flex gap-2">
                    <button
                      onClick={() => handleAdvance(emp.id, emp.full_name)}
                      className="btn-secondary text-xs flex items-center gap-1"
                    >
                      <FiPlus size={14} /> Give Advance
                    </button>
                    <button
                      onClick={() => handlePayroll(emp.id, emp.full_name)}
                      className="btn-primary text-xs"
                    >
                      Run Payroll
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default Staff;