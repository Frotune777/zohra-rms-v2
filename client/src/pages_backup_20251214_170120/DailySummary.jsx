import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiCalendar, FiRefreshCw, FiSave, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';

const DailySummary = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [summary, setSummary] = useState(null);
    const [reconciliation, setReconciliation] = useState(null);
    const [actualClosing, setActualClosing] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Defaulting API URL
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

    useEffect(() => {
        fetchData();
    }, [date]);

    const fetchData = async () => {
        setLoading(true);
        setMessage({ type: '', text: '' });
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            const [summaryRes, reconRes] = await Promise.all([
                axios.get(`${API_URL}/api/finance/daily-summary?date=${date}`, { headers }),
                axios.get(`${API_URL}/api/finance/reconciliation?date=${date}`, { headers })
            ]);

            setSummary(summaryRes.data);
            setReconciliation(reconRes.data);
            if (reconRes.data.actual_closing !== null) {
                setActualClosing(reconRes.data.actual_closing);
            } else {
                setActualClosing('');
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Failed to load daily data.' });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateClosing = async () => {
        if (actualClosing === '' || isNaN(actualClosing)) {
            setMessage({ type: 'error', text: 'Please enter a valid closing balance.' });
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/api/finance/reconciliation/${date}`, {
                actual_closing_balance: parseFloat(actualClosing),
                status: 'Closed',
                type: 'Counter'
            }, { headers: { Authorization: `Bearer ${token}` } });

            setMessage({ type: 'success', text: 'Reconciliation saved successfully!' });
            fetchData(); // Refresh to calculate difference
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Failed to save reconciliation.' });
        } finally {
            setSubmitting(false);
        }
    };

    const StatCard = ({ label, value, color, subLabel }) => (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center hover:bg-white/10 transition">
            <p className="text-gray-400 text-[10px] uppercase font-bold mb-2 tracking-wider">{label}</p>
            <p className={`text-3xl font-bold ${color} font-mono`}>
                {value !== undefined && value !== null ? `₹${parseFloat(value).toLocaleString('en-IN')}` : '-'}
            </p>
            {subLabel && <p className="text-xs text-gray-500 mt-2">{subLabel}</p>}
        </div>
    );

    return (
        <div className="p-6 h-full overflow-auto bg-gradient-to-br from-gray-900 to-gray-800 text-white font-sans">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <FiRefreshCw className="text-blue-400" /> Daily Reconciliation
                    </h1>
                    <p className="text-sm text-gray-400">Track Cash Flow & Verify Closing Balance</p>
                </div>
                <div className="flex gap-4 items-center bg-white/5 p-2 rounded-lg border border-white/10">
                    <FiCalendar className="text-gray-400" />
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="bg-transparent border-none text-white focus:outline-none text-sm font-bold"
                    />
                    <button
                        onClick={fetchData}
                        className="bg-blue-600/20 hover:bg-blue-600 p-2 rounded text-blue-400 hover:text-white transition"
                        title="Refresh Data"
                    >
                        <FiRefreshCw className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {message.text && (
                <div className={`p-4 rounded-lg mb-6 flex items-center gap-2 text-sm font-bold border ${message.type === 'error' ? 'bg-red-500/20 border-red-500 text-red-200' : 'bg-green-500/20 border-green-500 text-green-200'}`}>
                    {message.type === 'error' ? <FiAlertCircle /> : <FiCheckCircle />}
                    {message.text}
                </div>
            )}

            {loading && !summary ? (
                <div className="text-center text-gray-500 mt-12 animate-pulse">Loading daily data...</div>
            ) : (
                <div className="space-y-8 animate-in fade-in duration-500">

                    {/* 1. Cash Reconciliation Flow */}
                    <div className="bg-gray-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                        <h2 className="text-lg font-bold text-white mb-6 border-b border-white/10 pb-2">Counter Cash Flow</h2>

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                            {/* Opening */}
                            <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20 text-center">
                                <p className="text-xs text-blue-300 uppercase font-bold mb-1">Opening Cash</p>
                                <p className="text-xl font-bold text-white font-mono">₹{reconciliation?.opening_balance?.toLocaleString() || 0}</p>
                            </div>

                            <div className="text-center text-gray-500 font-bold">+</div>

                            {/* Inflow */}
                            <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20 text-center">
                                <p className="text-xs text-green-300 uppercase font-bold mb-1">Total Sales (Cash)</p>
                                <p className="text-xl font-bold text-white font-mono">₹{reconciliation?.cash_inflow?.toLocaleString() || 0}</p>
                            </div>

                            <div className="text-center text-gray-500 font-bold">-</div>

                            {/* Outflow */}
                            <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/20 text-center">
                                <p className="text-xs text-red-300 uppercase font-bold mb-1">Cash Expenses</p>
                                <p className="text-xl font-bold text-white font-mono">₹{reconciliation?.cash_outflow?.toLocaleString() || 0}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center mt-4">
                            {/* Transfer Out */}
                            <div className="bg-orange-500/10 p-4 rounded-lg border border-orange-500/20 text-center md:col-start-3">
                                <p className="text-xs text-orange-300 uppercase font-bold mb-1">Transfer to Mgr</p>
                                <p className="text-xl font-bold text-white font-mono">₹{reconciliation?.transfer_out?.toLocaleString() || 0}</p>
                            </div>

                            <div className="text-center text-gray-500 font-bold">=</div>

                            {/* Theoretical */}
                            <div className="bg-purple-500/10 p-4 rounded-lg border border-purple-500/20 text-center">
                                <p className="text-xs text-purple-300 uppercase font-bold mb-1">Theoretical Cash</p>
                                <p className="text-2xl font-bold text-white font-mono">₹{reconciliation?.theoretical_closing?.toLocaleString() || 0}</p>
                            </div>
                        </div>
                    </div>

                    {/* 2. Physical Verification */}
                    <div className="bg-gray-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                        <h2 className="text-lg font-bold text-white mb-6 border-b border-white/10 pb-2 flex justify-between items-center">
                            <span>Physical Verification</span>
                            <span className={`text-xs px-2 py-1 rounded bg-gray-700 ${reconciliation?.status === 'Closed' ? 'text-green-400' : 'text-yellow-400'}`}>
                                Status: {reconciliation?.status || 'Open'}
                            </span>
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Enter Actual Closing Balance (Cash in Drawer)</label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        value={actualClosing}
                                        onChange={(e) => setActualClosing(e.target.value)}
                                        placeholder="0.00"
                                        className="bg-gray-900 border border-white/20 rounded-lg p-3 text-white text-xl font-mono w-full focus:border-green-500 outline-none"
                                    />
                                    <button
                                        onClick={handleUpdateClosing}
                                        disabled={submitting}
                                        className="bg-green-600 hover:bg-green-700 text-white px-6 rounded-lg font-bold flex items-center gap-2 transition disabled:opacity-50"
                                    >
                                        {submitting ? <FiRefreshCw className="animate-spin" /> : <FiSave />} Save
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">Update this value after counting physical cash.</p>
                            </div>

                            <div className="flex flex-col justify-center">
                                <div className={`p-4 rounded-lg border ${(reconciliation?.difference || 0) === 0 ? 'bg-green-500/20 border-green-500' :
                                        (reconciliation?.difference || 0) > 0 ? 'bg-blue-500/20 border-blue-500' : 'bg-red-500/20 border-red-500'
                                    }`}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm font-bold uppercase tracking-wider opacity-80">Variance (Excess/Shortage)</span>
                                        {(reconciliation?.difference || 0) === 0 && <FiCheckCircle className="text-green-400" />}
                                        {(reconciliation?.difference || 0) !== 0 && <FiAlertCircle className="text-yellow-400" />}
                                    </div>
                                    <p className="text-3xl font-bold font-mono">
                                        {((reconciliation?.difference || 0) > 0 ? '+' : '')}
                                        ₹{parseFloat(reconciliation?.difference || 0).toLocaleString()}
                                    </p>
                                    <p className="text-xs mt-1 opacity-70">
                                        {(reconciliation?.difference || 0) === 0 ? 'Perfect match!' :
                                            (reconciliation?.difference || 0) < 0 ? 'Cash Shortage (Money missing)' : 'Cash Overage (Extra money)'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Overall Performance (Existing P&L Summary) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 opacity-80 hover:opacity-100 transition">
                        <StatCard label="Total Revenue" value={summary?.sales} color="text-green-400" />
                        <StatCard label="Total Expenses" value={summary?.expenses} color="text-red-400" />
                        <StatCard label="Vendor Payments" value={summary?.vendor_payments} color="text-orange-400" />
                        <StatCard label="Salary Advances" value={summary?.salary_advances} color="text-blue-400" />
                    </div>

                </div>
            )}
        </div>
    );
};

export default DailySummary;
