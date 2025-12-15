import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { FiCalendar, FiRefreshCw, FiDollarSign, FiArrowDown, FiArrowUp, FiAlertCircle } from 'react-icons/fi';

const ManagerFloat = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [floatData, setFloatData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

    useEffect(() => {
        fetchFloatData();
    }, [date]);

    const fetchFloatData = async () => {
        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/api/finance/reconciliation/float?date=${date}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setFloatData(res.data);
        } catch (err) {
            console.error(err);
            setError('Failed to fetch float data');
        } finally {
            setLoading(false);
        }
    };

    const FloatCard = ({ label, value, subtext, color, icon }) => (
        <div className="bg-gray-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-white/5 rounded-lg text-white">
                    {icon}
                </div>
                {subtext && <span className="text-xs text-gray-500 bg-black/20 px-2 py-1 rounded">{subtext}</span>}
            </div>

            <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold font-mono ${color}`}>
                ₹{value !== undefined ? parseFloat(value).toLocaleString('en-IN') : '-'}
            </p>
        </div>
    );

    return (
        <div className="p-8 h-full overflow-auto bg-gradient-to-br from-gray-900 to-gray-800 text-white font-sans">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <FiDollarSign className="text-purple-400" /> Manager Float Status
                    </h1>
                    <p className="text-sm text-gray-400">Track petty cash held by manager</p>
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
                        onClick={fetchFloatData}
                        className="bg-purple-600/20 hover:bg-purple-600 p-2 rounded text-purple-400 hover:text-white transition"
                        title="Refresh Data"
                    >
                        <FiRefreshCw className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/20 border border-red-500 rounded-lg mb-6 flex items-center gap-2 text-red-200">
                    <FiAlertCircle /> {error}
                </div>
            )}

            {loading && !floatData ? (
                <div className="text-center text-gray-500 mt-12 animate-pulse">Loading float status...</div>
            ) : (
                <div className="space-y-8 animate-in fade-in duration-500">

                    {/* Visual Flow */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                        <FloatCard
                            label="Opening Float"
                            value={floatData?.opening_float}
                            icon={<FiDollarSign />}
                            color="text-blue-400"
                        />

                        <div className="hidden md:flex flex-col items-center justify-center text-gray-500">
                            <FiRefreshCw className="mb-2" />
                            <span className="text-xs font-bold">+ Incoming</span>
                        </div>

                        <FloatCard
                            label="Replenishment"
                            subtext="From Counter"
                            value={floatData?.replenishment}
                            icon={<FiArrowDown className="text-green-400" />}
                            color="text-green-400"
                        />

                        <div className="hidden md:flex flex-col items-center justify-center text-gray-500">
                            <FiRefreshCw className="mb-2" />
                            <span className="text-xs font-bold">- Spending</span>
                        </div>

                        <FloatCard
                            label="Expenses Paid"
                            subtext="Float Expenses"
                            value={floatData?.float_expenses}
                            icon={<FiArrowUp className="text-red-400" />}
                            color="text-red-400"
                        />
                    </div>

                    {/* Result */}
                    <div className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center border border-purple-500/30 bg-purple-900/10">
                        <p className="text-gray-400 text-sm uppercase font-bold tracking-widest mb-2">Current Estimated Float</p>
                        <p className="text-5xl font-bold text-white font-mono">
                            ₹{floatData?.current_float?.toLocaleString('en-IN')}
                        </p>
                        <div className="mt-4 text-xs text-gray-500 bg-black/20 px-3 py-1 rounded-full">
                            Calculated as: Opening + Replenishment - Expenses
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default ManagerFloat;
