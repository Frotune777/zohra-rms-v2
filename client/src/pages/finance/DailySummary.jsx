import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiCalendar, FiRefreshCw } from 'react-icons/fi';

const DailySummary = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchSummary();
    }, [date]);

    const fetchSummary = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`http://localhost:5000/api/finance/daily-summary?date=${date}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSummary(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const StatCard = ({ label, value, color }) => (
        <div className="glass-panel p-6 flex flex-col items-center justify-center">
            <p className="text-gray-400 text-sm uppercase font-bold mb-2">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>
                {value !== undefined ? `₹${parseFloat(value).toLocaleString()}` : '-'}
            </p>
        </div>
    );

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold text-white">Daily Financial Summary</h1>
                <div className="flex gap-4 items-center">
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                    />
                    <button
                        onClick={fetchSummary}
                        className="bg-white/5 hover:bg-white/10 p-2 rounded-lg text-white"
                        title="Refresh"
                    >
                        <FiRefreshCw className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {summary ? (
                <div className="space-y-8">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <StatCard label="Total Sales" value={summary.sales} color="text-green-400" />
                        <StatCard label="Total Expenses" value={summary.expenses} color="text-red-400" />
                        <StatCard label="Vendor Payments" value={summary.vendor_payments} color="text-orange-400" />
                        <StatCard
                            label="Net Cash Flow"
                            value={summary.net_cash_flow}
                            color={summary.net_cash_flow >= 0 ? 'text-blue-400' : 'text-red-500'}
                        />
                    </div>

                    {/* Detailed Breakdown (Placeholder for future expansion) */}
                    <div className="glass-panel p-6">
                        <h2 className="text-lg font-bold text-white mb-4">Breakdown</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-gray-400 mb-2 text-sm uppercase">Inflow</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between p-3 bg-white/5 rounded-lg">
                                        <span className="text-white">POS Sales</span>
                                        <span className="text-green-400 font-bold">₹{summary.sales.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-gray-400 mb-2 text-sm uppercase">Outflow</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between p-3 bg-white/5 rounded-lg">
                                        <span className="text-white">Operational Expenses</span>
                                        <span className="text-red-400 font-bold">₹{summary.expenses.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between p-3 bg-white/5 rounded-lg">
                                        <span className="text-white">Vendor Payments</span>
                                        <span className="text-orange-400 font-bold">₹{summary.vendor_payments.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between p-3 bg-white/5 rounded-lg">
                                        <span className="text-white">Salary Advances</span>
                                        <span className="text-blue-400 font-bold">₹{(summary.salary_advances || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center text-gray-500 mt-12">Loading summary...</div>
            )}
        </div>
    );
};

export default DailySummary;
