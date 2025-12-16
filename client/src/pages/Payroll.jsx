import React, { useState, useEffect } from 'react';
import { FiSearch } from 'react-icons/fi';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { FiAlertCircle, FiCheckCircle, FiClock, FiDownload, FiDollarSign, FiFileText, FiRefreshCw, FiPlus, FiTrash2, FiRotateCcw } from 'react-icons/fi';
import toast from 'react-hot-toast';

const Payroll = () => {
  const { userRole } = useAuth();
  const [activeTab, setActiveTab] = useState('run'); // run, payouts, history
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [payrollData, setPayrollData] = useState([]);

  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  // Modal State
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [processForm, setProcessForm] = useState({
    daysWorked: '',
    overtimeHours: '',
    overtimeRate: '',
    overtimeAmount: '',
    extraDays: '',
    extraDayRate: '',
    extraDayAmount: '',
    manualAdjustment: '',
    adjustmentReason: '',
    advanceDeduction: ''
  });

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState({
    id: null,
    name: '',
    amount: '',
    mode: 'Cash',
    customMode: '',
    paidBy: ''
  });

  // Only manager and owner can access payroll
  const canManagePayroll = userRole === 'manager' || userRole === 'owner';
  const isOwner = userRole === 'owner';

  // Delete/Revert Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'delete'|'revert', id, targetStatus, employeeName }
  const [confirmReason, setConfirmReason] = useState('');

  useEffect(() => {
    if (canManagePayroll) {
      fetchPayrollData();
    }
  }, [selectedMonth, selectedYear, activeTab]);

  const fetchPayrollData = async () => {
    setLoading(true);
    try {
      const response = await api.get('payroll/monthly', {
        params: { month: selectedMonth, year: selectedYear }
      });
      setPayrollData(response.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  const openProcessModal = (employee) => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const dailyRate = (parseFloat(employee.base_salary) / 30).toFixed(2);
    const hourlyRate = (dailyRate / 8).toFixed(2);

    setSelectedEmployee(employee);
    setProcessForm({
      daysWorked: employee.days_worked || daysInMonth,
      overtimeHours: employee.overtime_hours || '',
      overtimeRate: hourlyRate,
      overtimeAmount: employee.overtime_amount || '',
      extraDays: employee.extra_days || '',
      extraDayRate: dailyRate,
      extraDayAmount: employee.extra_day_amount || '',
      manualAdjustment: employee.manual_adjustment || '',
      adjustmentReason: employee.adjustment_reason || '',
      advanceDeduction: employee.advance_deduction || ''
    });
    setShowProcessModal(true);
  };

  const handleProcessPayroll = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    setLoading(true);
    try {
      await api.post('payroll/run', {
        month: selectedMonth,
        year: selectedYear,
        employeeId: selectedEmployee.employee_id || selectedEmployee.id,
        daysWorked: parseInt(processForm.daysWorked),
        overtimeHours: parseFloat(processForm.overtimeHours) || 0,
        overtimeAmount: parseFloat(processForm.overtimeAmount) || 0,
        extraDays: parseFloat(processForm.extraDays) || 0,
        extraDayAmount: parseFloat(processForm.extraDayAmount) || 0,
        manualAdjustment: parseFloat(processForm.manualAdjustment) || 0,
        adjustmentReason: processForm.adjustmentReason,
        advanceDeduction: parseFloat(processForm.advanceDeduction) || 0
      });
      toast.success('Payroll calculated');
      setShowProcessModal(false);
      fetchPayrollData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to process');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.post('payroll/approve', { id });
      toast.success('Payroll approved');
      fetchPayrollData();
    } catch (err) {
      toast.error('Failed to approve');
    }
  };

  const openPaymentModal = (employee, defaultMode) => {
    setPaymentData({
      id: employee.id,
      name: employee.full_name,
      amount: employee.net_pay,
      mode: defaultMode || 'Cash',
      customMode: '',
      paidBy: ''
    });
    setShowPaymentModal(true);
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    const finalMode = paymentData.mode === 'Other' ? paymentData.customMode : paymentData.mode;

    if (!finalMode) {
      toast.error('Please specify a payment mode');
      return;
    }

    try {
      await api.post('payroll/payout', {
        id: paymentData.id,
        payment_mode: finalMode,
        payment_date: new Date(),
        paid_by: paymentData.paidBy
      });
      toast.success('Marked as Paid');
      setShowPaymentModal(false);
      fetchPayrollData();
    } catch (err) {
      toast.error('Failed to mark as paid');
    }
  };

  const exportBankSheet = () => {
    const approved = payrollData.filter(p => p.status === 'Approved' && p.payout_method === 'Bank Transfer');
    if (approved.length === 0) return toast.error('No approved bank transfer records');

    const csvContent = "data:text/csv;charset=utf-8,"
      + "Employee Name,Bank Account,IFSC,Amount,Payment Mode\n"
      + approved.map(e => `${e.full_name},${e.bank_account_no || ''},${e.ifsc_code || ''},${e.net_pay},Bank Transfer`).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bank_sheet_${selectedMonth}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  const handleDeletePayroll = (id, employeeName) => {
    setConfirmAction({ type: 'delete', id, employeeName });
    setConfirmReason('');
    setShowConfirmModal(true);
  };

  const handleRevertPayroll = (id, targetStatus, employeeName) => {
    setConfirmAction({ type: 'revert', id, targetStatus, employeeName });
    setConfirmReason('');
    setShowConfirmModal(true);
  };

  const executeConfirmAction = async () => {
    if (!confirmReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }

    setLoading(true);
    try {
      if (confirmAction.type === 'delete') {
        await api.delete(`payroll/${confirmAction.id}`, {
          data: { reason: confirmReason }
        });
        toast.success('Payroll record deleted successfully');
      } else if (confirmAction.type === 'revert') {
        await api.post(`payroll/revert/${confirmAction.id}`, {
          targetStatus: confirmAction.targetStatus,
          reason: confirmReason
        });
        toast.success(`Payroll reverted to ${confirmAction.targetStatus}`);
      }
      setShowConfirmModal(false);
      setConfirmAction(null);
      setConfirmReason('');
      fetchPayrollData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!canManagePayroll) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center glass-panel p-8 rounded-xl max-w-md">
          <FiAlertCircle className="text-4xl text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Restricted</h2>
          <p className="text-gray-400">Only managers and owners can access payroll management.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col relative">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <FiDollarSign className="text-zohra-blue" />
          Payroll Automation
        </h1>

        <div className="flex items-center gap-4 glass-panel px-4 py-2 rounded-lg">
          <select
            id="payroll-month"
            name="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1} className="bg-gray-800">{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
            ))}
          </select>
          <select
            id="payroll-year"
            name="year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
          >
            <option value={2024} className="bg-gray-800">2024</option>
            <option value={2025} className="bg-gray-800">2025</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-white/10">
        <button
          onClick={() => setActiveTab('run')}
          className={`pb-2 px-4 font-medium transition ${activeTab === 'run' ? 'text-zohra-blue border-b-2 border-zohra-blue' : 'text-gray-400 hover:text-white'}`}
        >
          1. Run Payroll
        </button>
        <button
          onClick={() => setActiveTab('payouts')}
          className={`pb-2 px-4 font-medium transition ${activeTab === 'payouts' ? 'text-zohra-blue border-b-2 border-zohra-blue' : 'text-gray-400 hover:text-white'}`}
        >
          2. Payouts
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-2 px-4 font-medium transition ${activeTab === 'history' ? 'text-zohra-blue border-b-2 border-zohra-blue' : 'text-gray-400 hover:text-white'}`}
        >
          3. History
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto glass-panel rounded-xl p-6">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <FiRefreshCw className="animate-spin text-3xl text-zohra-blue" />
          </div>
        ) : (
          <>
            {activeTab === 'run' && (
              <div>
                <div className="flex justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">Draft Calculations</h2>
                    {payrollData.some(p => p.status === 'Pending') && (
                      <p className="text-xs text-gray-400 mt-1">
                        Last Calculated: {new Date(Math.max(...payrollData.filter(p => p.status === 'Pending').map(p => new Date(p.processed_at)))).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button onClick={() => {
                    if (window.confirm('Run full payroll calculation?')) {
                      setLoading(true);
                      api.post('payroll/run', { month: selectedMonth, year: selectedYear })
                        .then(() => { toast.success('Calculated'); fetchPayrollData(); })
                        .catch((err) => toast.error(err.response?.data?.error || 'Failed to run payroll'))
                        .finally(() => setLoading(false));
                    }
                  }} className="btn-primary flex items-center gap-2">
                    <FiRefreshCw /> Calculate All
                  </button>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="text-gray-400 border-b border-white/10">
                    <tr>
                      <th className="p-3">Employee</th>
                      <th className="p-3 text-right">Base</th>
                      <th className="p-3 text-right">Days</th>
                      <th className="p-3 text-right">OT/Extra</th>
                      <th className="p-3 text-right">Gross</th>
                      <th className="p-3 text-right">Outstanding</th>
                      <th className="p-3 text-right">Adv. Ded.</th>
                      <th className="p-3 text-right">Net Pay</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollData.filter(p => p.status === 'Pending').length === 0 ? (
                      <tr><td colSpan="10" className="p-8 text-center text-gray-500">No pending records. Click Calculate All to start.</td></tr>
                    ) : (
                      payrollData.filter(p => p.status === 'Pending').map(p => (
                        <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-3 font-medium text-white">
                            {p.full_name}
                            <span className="block text-xs text-gray-500">{p.position}</span>
                          </td>
                          <td className="p-3 text-right text-gray-400">₹{p.base_salary}</td>
                          <td className="p-3 text-right">{p.days_worked}</td>
                          <td className="p-3 text-right text-yellow-400">
                            ₹{(parseFloat(p.overtime_amount || 0) + parseFloat(p.extra_day_amount || 0)).toFixed(0)}
                          </td>
                          <td className="p-3 text-right">
                            ₹{(parseFloat(p.calculated_salary) + parseFloat(p.overtime_amount || 0) + parseFloat(p.extra_day_amount || 0)).toFixed(2)}
                          </td>
                          <td className={`p-3 text-right ${parseFloat(p.total_outstanding_advances || 0) > 0 ? 'text-red-400 font-medium' : 'text-gray-500'}`}>
                            ₹{parseFloat(p.total_outstanding_advances || 0).toFixed(0)}
                          </td>
                          <td className="p-3 text-right text-red-400">-₹{p.advance_deduction}</td>
                          <td className="p-3 text-right font-bold text-green-400">₹{p.net_pay}</td>
                          <td className="p-3 text-center"><span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-xs">Draft</span></td>
                          <td className="p-3 text-right flex justify-end gap-2">
                            <button onClick={() => openProcessModal(p)} className="text-gray-300 hover:text-white" title="Adjust"><FiClock /></button>
                            <button onClick={() => handleApprove(p.id)} className="text-zohra-blue hover:underline">Approve</button>
                            {isOwner && (
                              <button onClick={() => handleDeletePayroll(p.id, p.full_name)} className="text-red-400 hover:text-red-300" title="Delete"><FiTrash2 /></button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'payouts' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-white">Ready for Payout</h2>
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      id="payout-search"
                      name="search"
                      placeholder="Search Employee..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-zohra-blue w-64"
                    />
                  </div>
                </div>

                <div className="glass-panel overflow-hidden rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="text-gray-400 border-b border-white/10 bg-black/20">
                      <tr>
                        <th className="p-4">Employee</th>
                        <th className="p-4 text-right">Net Pay</th>
                        <th className="p-4 text-right">Outstanding Adv.</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollData
                        .filter(p => p.status === 'Approved' &&
                          (searchTerm === '' || p.full_name.toLowerCase().includes(searchTerm.toLowerCase())))
                        .length === 0 ? (
                        <tr><td colSpan="4" className="p-8 text-center text-gray-500">No approved records ready for payout.</td></tr>
                      ) : (
                        payrollData
                          .filter(p => p.status === 'Approved' &&
                            (searchTerm === '' || p.full_name.toLowerCase().includes(searchTerm.toLowerCase())))
                          .map(p => (
                            <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                              <td className="p-4">
                                <div className="font-medium text-white">{p.full_name}</div>
                                <div className="text-xs text-gray-400">{p.position}</div>
                              </td>
                              <td className="p-4 text-right font-bold text-green-400 text-lg">₹{p.net_pay}</td>
                              <td className={`p-4 text-right ${parseFloat(p.total_outstanding_advances || 0) > 0 ? 'text-red-400 font-medium' : 'text-gray-500'}`}>
                                ₹{parseFloat(p.total_outstanding_advances || 0).toFixed(0)}
                              </td>
                              <td className="p-4 text-right flex justify-end gap-3 items-center">
                                <button
                                  onClick={() => openPaymentModal(p, 'Cash')}
                                  className="btn-primary text-xs px-4 py-2 flex items-center gap-2"
                                >
                                  <FiDollarSign /> Mark Paid
                                </button>
                                {isOwner && (
                                  <>
                                    <button onClick={() => handleRevertPayroll(p.id, 'Pending', p.full_name)} className="text-yellow-400 hover:text-yellow-300 p-2 hover:bg-white/10 rounded" title="Revert to Draft"><FiRotateCcw /></button>
                                    <button onClick={() => handleDeletePayroll(p.id, p.full_name)} className="text-red-400 hover:text-red-300 p-2 hover:bg-white/10 rounded" title="Delete"><FiTrash2 /></button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div>
                <h2 className="text-xl font-bold text-white mb-4">Payment History</h2>
                <table className="w-full text-left text-sm">
                  <thead className="text-gray-400 border-b border-white/10">
                    <tr>
                      <th className="p-3">Employee</th>
                      <th className="p-3">Paid On</th>
                      <th className="p-3">Mode</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollData.filter(p => p.status === 'Paid').map(p => (
                      <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3 font-medium text-white">{p.full_name}</td>
                        <td className="p-3 text-gray-400">{new Date(p.payment_date).toLocaleDateString()}</td>
                        <td className="p-3 text-gray-400">{p.payment_mode}</td>
                        <td className="p-3 text-right font-bold text-green-400">₹{p.net_pay}</td>
                        <td className="p-3 text-center">
                          <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs">Paid</span>
                          {isOwner && (
                            <div className="flex justify-center gap-2 mt-2">
                              <button onClick={() => handleRevertPayroll(p.id, 'Approved', p.full_name)} className="text-yellow-400 hover:text-yellow-300 text-xs" title="Revert Payment"><FiRotateCcw /> Revert</button>
                              <button onClick={() => handleDeletePayroll(p.id, p.full_name)} className="text-red-400 hover:text-red-300 text-xs" title="Delete"><FiTrash2 /> Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="glass-panel p-6 rounded-xl w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4">Confirm Payment</h3>
            <form onSubmit={submitPayment} className="space-y-4">
              <div className="bg-white/5 p-4 rounded-lg">
                <p className="text-sm text-gray-400">Employee</p>
                <p className="font-bold text-lg">{paymentData.name}</p>
                <div className="flex justify-between mt-2">
                  <span className="text-gray-400">Net Payable:</span>
                  <span className="font-bold text-green-400">₹{paymentData.amount}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Paid By</label>
                <input
                  id="payment-paid-by"
                  name="paidBy"
                  type="text"
                  value={paymentData.paidBy}
                  onChange={(e) => setPaymentData({ ...paymentData, paidBy: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white mb-4"
                  placeholder="Name of payer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Payment Mode</label>
                <select
                  id="payment-mode"
                  name="paymentMode"
                  value={paymentData.mode}
                  onChange={(e) => setPaymentData({ ...paymentData, mode: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-zohra-blue"
                >
                  <option value="Cash" className="bg-gray-800 text-white">Cash</option>
                  <option value="Bank Transfer" className="bg-gray-800 text-white">Bank Transfer</option>
                  <option value="UPI" className="bg-gray-800 text-white">UPI</option>
                  <option value="Cheque" className="bg-gray-800 text-white">Cheque</option>
                  <option value="Other" className="bg-gray-800 text-white">Other</option>
                </select>
              </div>

              {paymentData.mode === 'Other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Specify Mode</label>
                  <input
                    id="payment-custom-mode"
                    name="customMode"
                    type="text"
                    value={paymentData.customMode}
                    onChange={(e) => setPaymentData({ ...paymentData, customMode: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                    placeholder="e.g. Demand Draft"
                    required
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Process Modal */}
      {showProcessModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="glass-panel p-6 rounded-xl w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Adjust Payroll: {selectedEmployee.full_name}</h3>
            <form onSubmit={handleProcessPayroll} className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Days Worked</label>
                <div className="flex gap-2">
                  <input
                    id="process-days-worked"
                    name="daysWorked"
                    type="number"
                    value={processForm.daysWorked}
                    onChange={(e) => setProcessForm({ ...processForm, daysWorked: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                    required
                  />
                  <div className="text-xs text-gray-500 flex items-center">
                    (Auto-calculated from Attendance if available)
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">OT Hours</label>
                  <input
                    id="process-overtime-hours"
                    name="overtimeHours"
                    type="number"
                    step="0.5"
                    value={processForm.overtimeHours}
                    onChange={(e) => {
                      const hours = parseFloat(e.target.value) || 0;
                      const rate = parseFloat(processForm.overtimeRate) || 0;
                      setProcessForm({ ...processForm, overtimeHours: e.target.value, overtimeAmount: (hours * rate).toFixed(2) });
                    }}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Rate/Hr</label>
                  <input
                    id="process-overtime-rate"
                    name="overtimeRate"
                    type="number"
                    step="0.01"
                    value={processForm.overtimeRate}
                    onChange={(e) => {
                      const rate = parseFloat(e.target.value) || 0;
                      const hours = parseFloat(processForm.overtimeHours) || 0;
                      setProcessForm({ ...processForm, overtimeRate: e.target.value, overtimeAmount: (hours * rate).toFixed(2) });
                    }}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">OT Amount (₹)</label>
                  <input
                    id="process-overtime-amount"
                    name="overtimeAmount"
                    type="number"
                    value={processForm.overtimeAmount}
                    onChange={(e) => setProcessForm({ ...processForm, overtimeAmount: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Extra Days</label>
                  <input
                    id="process-extra-days"
                    name="extraDays"
                    type="number"
                    step="0.5"
                    value={processForm.extraDays}
                    onChange={(e) => {
                      const days = parseFloat(e.target.value) || 0;
                      const rate = parseFloat(processForm.extraDayRate) || 0;
                      setProcessForm({ ...processForm, extraDays: e.target.value, extraDayAmount: (days * rate).toFixed(2) });
                    }}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Rate/Day</label>
                  <input
                    id="process-extra-day-rate"
                    name="extraDayRate"
                    type="number"
                    step="0.01"
                    value={processForm.extraDayRate}
                    onChange={(e) => {
                      const rate = parseFloat(e.target.value) || 0;
                      const days = parseFloat(processForm.extraDays) || 0;
                      setProcessForm({ ...processForm, extraDayRate: e.target.value, extraDayAmount: (days * rate).toFixed(2) });
                    }}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Extra Amount (₹)</label>
                  <input
                    id="process-extra-day-amount"
                    name="extraDayAmount"
                    type="number"
                    value={processForm.extraDayAmount}
                    onChange={(e) => setProcessForm({ ...processForm, extraDayAmount: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Manual Adjustment (₹)</label>
                  <input
                    id="process-manual-adjustment"
                    name="manualAdjustment"
                    type="number"
                    step="0.01"
                    value={processForm.manualAdjustment}
                    onChange={(e) => setProcessForm({ ...processForm, manualAdjustment: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                    placeholder="+ Bonus or - Deduction"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Advance Deduction (₹)</label>
                  <input
                    id="process-advance-deduction"
                    name="advanceDeduction"
                    type="number"
                    step="0.01"
                    value={processForm.advanceDeduction}
                    onChange={(e) => setProcessForm({ ...processForm, advanceDeduction: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                    placeholder="Amount to deduct"
                  />
                  {selectedEmployee?.total_outstanding_advances > 0 && (
                    <p className="text-xs text-red-400 mt-1">
                      Total Outstanding: ₹{selectedEmployee.total_outstanding_advances}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowProcessModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Update Calculation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete/Revert Confirmation Modal */}
      {showConfirmModal && confirmAction && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full border border-white/10">
            <h3 className="text-xl font-bold text-white mb-4">
              {confirmAction.type === 'delete' ? 'Delete Payroll Record' : 'Revert Payroll Status'}
            </h3>

            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded">
              <p className="text-red-400 text-sm font-medium">⚠️ Warning</p>
              <p className="text-gray-300 text-sm mt-1">
                {confirmAction.type === 'delete'
                  ? 'This will permanently delete the payroll record and reverse all financial transactions.'
                  : `This will revert the payroll status to ${confirmAction.targetStatus} and reverse associated transactions.`
                }
              </p>
            </div>

            <div className="mb-4">
              <p className="text-gray-400 text-sm mb-2">
                <span className="font-medium text-white">Employee:</span> {confirmAction.employeeName}
              </p>
              <p className="text-gray-400 text-sm">
                <span className="font-medium text-white">Action:</span> {confirmAction.type === 'delete' ? 'Delete' : `Revert to ${confirmAction.targetStatus}`}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reason (Required) <span className="text-red-400">*</span>
              </label>
              <textarea
                id="confirm-reason"
                name="reason"
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                className="w-full bg-gray-700 border border-white/10 rounded p-2 text-white text-sm"
                rows="3"
                placeholder="Explain why this action is necessary..."
                required
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmAction(null);
                  setConfirmReason('');
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmAction}
                className={`px-4 py-2 rounded text-white ${confirmAction.type === 'delete'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-yellow-600 hover:bg-yellow-700'
                  }`}
                disabled={loading || !confirmReason.trim()}
              >
                {loading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;
