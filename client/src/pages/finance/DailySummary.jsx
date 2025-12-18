import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { FiCalendar, FiRefreshCw, FiSave, FiAlertCircle, FiCheckCircle, FiLock, FiUnlock, FiPlus } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import DayClosureModal from '../../components/finance/DayClosureModal';

const DailySummary = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [summary, setSummary] = useState(null);
    const [dailyBalance, setDailyBalance] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showClosureModal, setShowClosureModal] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const { userRole } = useAuth();

    useEffect(() => {
        fetchData();
    }, [date]);

    const fetchData = async () => {
        setLoading(true);
        setMessage({ type: '', text: '' });
        try {
            const [summaryRes, balanceRes] = await Promise.all([
                api.get(`/finance/daily-summary?date=${date}`),
                api.get(`/finance/daily-balance/${date}?type=Counter`)
            ]);

            setSummary(summaryRes.data);
            setDailyBalance(balanceRes.data);
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Failed to load daily data.' });
        } finally {
            setLoading(false);
        }
    };

    const handleReopen = async () => {
        const reason = window.prompt("Reason for reopening the day:");
        if (!reason) return;

        try {
            await api.post('/finance/daily-balance/reopen', {
                date,
                type: 'Counter',
                reason
            });
            setMessage({ type: 'success', text: 'Day reopened successfully!' });
            fetchData();
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to reopen' });
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

                    {dailyBalance?.status === 'Closed' ? (
                        userRole === 'admin' && (
                            <button
                                onClick={handleReopen}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition"
                            >
                                <FiUnlock /> Reopen Day
                            </button>
                        )
                    ) : (
                        <button
                            onClick={() => setShowClosureModal(true)}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition"
                        >
                            <FiLock /> Close Day
                        </button>
                    )}
                </div>
            </div>

            {message.text && (
                <div className={`p-4 rounded-lg mb-6 flex items-center gap-2 text-sm font-bold border ${message.type === 'error' ? 'bg-red-500/20 border-red-500 text-red-200' : 'bg-green-500/20 border-green-500 text-green-200'}`}>
                    {message.type === 'error' ? <FiAlertCircle /> : <FiCheckCircle />}
                    {message.text}
                </div>
            )}

            {loading && !summary && !dailyBalance ? (
                <div className="text-center text-gray-500 mt-12 animate-pulse">Loading daily data...</div>
            ) : (
                <div className="space-y-8 animate-in fade-in duration-500">

                    {/* 1. Cash Reconciliation Flow (New Logic) */}
                    <div className="bg-gray-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 relative overflow-hidden">
                        <div className={`absolute top-0 left-0 w-1 h-full ${dailyBalance?.status === 'Closed' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                        <h2 className="text-lg font-bold text-white mb-6 border-b border-white/10 pb-2 flex justify-between items-center">
                            <span>Counter Cash Flow</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${dailyBalance?.status === 'Closed' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                {dailyBalance?.status || 'Open'}
                            </span>
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                            {/* Opening */}
                            <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20 text-center">
                                <p className="text-xs text-blue-300 uppercase font-bold mb-1">Opening Cash</p>
                                <p className="text-xl font-bold text-white font-mono">₹{parseFloat(dailyBalance?.opening_balance || 0).toLocaleString()}</p>
                            </div>

                            <div className="text-center text-gray-500 font-bold">+</div>

                            {/* Inflow */}
                            <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20 text-center">
                                <p className="text-xs text-green-300 uppercase font-bold mb-1">Cash Movement (Dr)</p>
                                <p className="text-xl font-bold text-white font-mono">₹{parseFloat(dailyBalance?.expected_closing_calculated - dailyBalance?.opening_balance + (dailyBalance?.total_credit || 0) || 0).toLocaleString()}</p>
                                <p className="text-[10px] text-gray-500 mt-1">Total Cash Received</p>
                            </div>

                            <div className="text-center text-gray-500 font-bold">-</div>

                            {/* Outflow */}
                            <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/20 text-center">
                                <p className="text-xs text-red-300 uppercase font-bold mb-1">Cash Movement (Cr)</p>
                                <p className="text-xl font-bold text-white font-mono">₹{parseFloat(dailyBalance?.total_credit || 0).toLocaleString()}</p>
                                <p className="text-[10px] text-gray-500 mt-1">Total Cash Paid</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center mt-6 pt-6 border-t border-white/5">
                            <div className="md:col-span-3 text-right">
                                <p className="text-sm text-gray-400 uppercase font-bold">Theoretical System Balance</p>
                            </div>
                            <div className="text-center text-gray-500 font-bold">=</div>
                            <div className="bg-purple-500/10 p-4 rounded-lg border border-purple-500/20 text-center">
                                <p className="text-2xl font-bold text-white font-mono">₹{parseFloat(dailyBalance?.closing_balance || 0).toFixed(2)}</p>
                            </div>
                        </div>
                    </div>

                    {/* 2. Physical Verification Summary */}
                    {dailyBalance?.status === 'Closed' && (
                        <div className="bg-gray-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                            <h2 className="text-lg font-bold text-white mb-6 border-b border-white/10 pb-2">Day Closure Details</h2>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400 text-sm">Actual Balance Counted:</span>
                                        <span className="text-lg font-bold font-mono">₹{parseFloat(dailyBalance?.actual_closing_balance || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400 text-sm">Variance:</span>
                                        <span className={`text-lg font-bold font-mono ${dailyBalance?.variance === 0 ? 'text-green-400' : dailyBalance?.variance > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                            {dailyBalance?.variance > 0 ? '+' : ''}₹{parseFloat(dailyBalance?.variance || 0).toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-4 md:border-l md:border-white/10 md:pl-6 col-span-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400 text-sm">Closed By:</span>
                                        <span className="text-white font-bold">{dailyBalance?.closed_by_name || 'System'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400 text-sm">Closed At:</span>
                                        <span className="text-white font-mono text-sm">{dailyBalance?.closed_at ? new Date(dailyBalance.closed_at).toLocaleString() : '-'}</span>
                                    </div>
                                    {dailyBalance?.variance_je_id && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400 text-sm">Variance Journal:</span>
                                            <span className="text-blue-400 font-mono text-sm underline cursor-help" title="JE Reference">#{dailyBalance.variance_je_id}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {!dailyBalance?.status || dailyBalance?.status === 'Open' ? (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-500/20 p-3 rounded-full text-blue-400 text-xl">
                                    <FiAlertCircle />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white">Day is currently open</h4>
                                    <p className="text-sm text-gray-400">Please count physical cash and close the day to post variances.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowClosureModal(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg transition"
                            >
                                Start Closure Process
                            </button>
                        </div>
                    ) : null}

                    {/* 3. Overall Performance Statistics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 opacity-80 hover:opacity-100 transition">
                        <StatCard label="Total Revenue" value={summary?.sales} color="text-green-400" />
                        <StatCard label="Total Expenses" value={summary?.expenses} color="text-red-400" />
                        <StatCard label="Vendor Payments" value={summary?.vendor_payments} color="text-orange-400" />
                        <StatCard label="Salary Advances" value={summary?.salary_advances} color="text-blue-400" />
                    </div>

                </div>
            )}

            {showClosureModal && (
                <DayClosureModal
                    date={date}
                    onClose={() => setShowClosureModal(false)}
                    onSuccess={(data) => {
                        setMessage({ type: 'success', text: `Closed day with ₹${data.variance} variance.` });
                        fetchData();
                    }}
                />
            )}
        </div>
    );
};

export default DailySummary;
