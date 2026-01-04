import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import {
    FiTrendingUp, FiActivity, FiDollarSign, FiShoppingBag,
    FiCalendar, FiPlus, FiArrowRight, FiInfo, FiCheck
} from 'react-icons/fi';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import toast from 'react-hot-toast';

const ChickenDashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [rates, setRates] = useState(null);
    const [summary, setSummary] = useState(null);
    const [recentBills, setRecentBills] = useState([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const date = new Date().toISOString().split('T')[0];
            const [ratesRes, summaryRes, billsRes] = await Promise.all([
                api.get(`chicken/rates?date=${date}`),
                api.get('chicken/bills/summary'),
                api.get('chicken/bills?limit=5')
            ]);

            setRates(ratesRes.data);
            setSummary(summaryRes.data.summary);
            setRecentBills(billsRes.data);
        } catch (error) {
            console.error('Failed to load chicken dashboard data:', error);
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-400">Loading Chicken Dashboard...</div>;
    }

    return (
        <div className="p-6 max-w-7xl mx-auto h-full overflow-y-auto">
            <PageHeader
                title="Chicken Tracking Dashboard"
                showBack={true}
                showHome={false}
                actions={
                    <div className="flex gap-3">
                        <button
                            onClick={() => navigate('/chicken/rates')}
                            className="bg-zohra-blue hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
                        >
                            <FiPlus /> Add Rates
                        </button>
                        <button
                            onClick={() => navigate('/chicken/bills')}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
                        >
                            <FiPlus /> Add Bill
                        </button>
                    </div>
                }
            />

            {/* Top Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard
                    title="Total Billings (30d)"
                    value={`₹${summary?.total_amount?.toLocaleString() || 0}`}
                    icon={<FiShoppingBag className="text-blue-400" />}
                    subValue={`${summary?.total_entries || 0} bills recorded`}
                />
                <StatCard
                    title="Procurement Variance"
                    value={`₹${Math.abs(summary?.total_variance || 0).toLocaleString()}`}
                    icon={<FiActivity className={summary?.total_variance > 0 ? "text-red-400" : "text-green-400"} />}
                    subValue={`${summary?.variance_percentage || 0}% from expected`}
                    type={summary?.total_variance > 0 ? "negative" : "positive"}
                />
                <StatCard
                    title="Pending Approvals"
                    value={summary?.pending_count || 0}
                    icon={<FiInfo className="text-yellow-400" />}
                    subValue="Awaiting manager review"
                />
                <StatCard
                    title="Latest Tandoor Rate"
                    value={`₹${rates?.tandoor_rate || 'N/A'}`}
                    icon={<FiTrendingUp className="text-green-400" />}
                    subValue={rates?.date ? `As of ${new Date(rates.date).toLocaleDateString()}` : "Not updated today"}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Bills Table */}
                <div className="lg:col-span-2 glass-panel p-6 rounded-xl overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white">Recent Bill Entries</h3>
                        <button
                            onClick={() => navigate('/chicken/bills')}
                            className="text-zohra-blue hover:text-blue-400 text-sm flex items-center gap-1"
                        >
                            View All <FiArrowRight />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white/5 text-gray-400 text-sm">
                                <tr>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Vendor</th>
                                    <th className="p-3">Item</th>
                                    <th className="p-3">Qty</th>
                                    <th className="p-3">Rate Var</th>
                                    <th className="p-3">Amount</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {recentBills.length > 0 ? (
                                    recentBills.map((bill, idx) => {
                                        const rateVar = parseFloat(bill.vendor_rate || 0) - parseFloat(bill.expected_rate || 0);
                                        return (
                                            <tr key={idx} className="text-sm hover:bg-white/5 transition">
                                                <td className="p-3 text-white">{new Date(bill.date).toLocaleDateString()}</td>
                                                <td className="p-3 text-gray-300">{bill.supplier_name}</td>
                                                <td className="p-3 text-gray-300 capitalize">{bill.item_type || bill.item_name}</td>
                                                <td className="p-3 text-gray-300">{bill.qty} kg</td>
                                                <td className={`p-3 font-medium ${rateVar > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                    {rateVar > 0 ? '+' : ''}{rateVar.toFixed(2)}
                                                </td>
                                                <td className="p-3 text-white font-bold">₹{bill.qty * bill.vendor_rate}</td>
                                                <td className="p-3">
                                                    {bill.status === 'Pending' ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-yellow-400 text-xs">Pending</span>
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        await api.patch(`chicken/bills/${bill.id}/status`, { status: 'Approved' });
                                                                        toast.success('✓ Bill approved');
                                                                        fetchData();
                                                                    } catch (error) {
                                                                        toast.error('Failed to approve bill');
                                                                    }
                                                                }}
                                                                className="p-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition"
                                                                title="Approve Bill"
                                                            >
                                                                <FiCheck size={14} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-[10px] uppercase font-bold">
                                                            {bill.status}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="7" className="p-8 text-center text-gray-500">No recent bills found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Market Rates Card */}
                <div className="glass-panel p-6 rounded-xl">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white">Current Rates</h3>
                        <button
                            onClick={() => navigate('/chicken/rates')}
                            className="text-zohra-blue hover:text-blue-400 text-sm"
                        >
                            Edit
                        </button>
                    </div>
                    <div className="space-y-4">
                        <RateRow label="Tandoor" value={rates?.tandoor_rate} color="blue" />
                        <RateRow label="Boiler" value={rates?.boiler_rate} color="orange" />
                        <RateRow label="Egg" value={rates?.egg_rate} color="yellow" />
                    </div>

                    <div className="mt-8 p-4 bg-white/5 rounded-lg border border-white/10">
                        <p className="text-xs text-gray-400 mb-1">Last Update Information</p>
                        <p className="text-sm text-white">
                            {rates?.updated_by_name ? `Updated by ${rates.updated_by_name}` : "No update info available"}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">
                            Rates are used to calculate expected costs and verify vendor billings.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ title, value, icon, subValue, type }) => (
    <div className="glass-panel p-5 rounded-xl border border-white/5 hover:border-white/10 transition group">
        <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-white/5 rounded-lg group-hover:bg-white/10 transition">
                {icon}
            </div>
        </div>
        <div>
            <p className="text-gray-400 text-xs mb-1 uppercase tracking-wider">{title}</p>
            <h2 className="text-2xl font-bold text-white mb-2">{value}</h2>
            <p className={`text-xs ${type === 'negative' ? 'text-red-400' : type === 'positive' ? 'text-green-400' : 'text-gray-500'}`}>
                {subValue}
            </p>
        </div>
    </div>
);

const RateRow = ({ label, value, color }) => {
    const colorClasses = {
        blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    };

    return (
        <div className={`flex justify-between items-center p-4 rounded-lg border ${colorClasses[color]}`}>
            <span className="font-semibold">{label}</span>
            <span className="text-lg font-bold">₹{value || '0.00'}</span>
        </div>
    );
};

export default ChickenDashboard;
