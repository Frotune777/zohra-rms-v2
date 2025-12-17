import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import {
    FiTrendingUp, FiTrendingDown, FiDollarSign, FiShoppingBag,
    FiUsers, FiAlertTriangle, FiActivity, FiBox
} from 'react-icons/fi';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

const MasterDashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const response = await api.get('dashboard/stats');
            setStats(response.data);
        } catch (err) {
            console.error('Failed to load dashboard stats:', err);
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-400">Loading Dashboard...</div>;
    if (error) return <div className="p-8 text-center text-red-400">{error}</div>;
    if (!stats) return null;

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

    return (
        <div className="p-4 md:p-6 h-full w-full overflow-y-auto bg-gradient-to-br from-midnight to-gray-900 text-white">
            <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 text-zohra-blue">Business Overview</h1>

            {/* KPI Cards Row 1 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
                <KPICard
                    title="Today's Sales"
                    value={`₹${stats.todaySales.toFixed(0)}`}
                    icon={<FiTrendingUp />}
                    color="text-green-400"
                    bg="bg-green-500/10"
                />
                <KPICard
                    title="Today's Expenses"
                    value={`₹${stats.todayExpenses.toFixed(0)}`}
                    icon={<FiTrendingDown />}
                    color="text-red-400"
                    bg="bg-red-500/10"
                />
                <KPICard
                    title="Approx. Profit"
                    value={`₹${stats.approxProfit.toFixed(0)}`}
                    icon={<FiDollarSign />}
                    color={stats.approxProfit >= 0 ? "text-green-400" : "text-red-400"}
                    bg={stats.approxProfit >= 0 ? "bg-green-500/10" : "bg-red-500/10"}
                />
                <KPICard
                    title="Chicken Purchased"
                    value={`${stats.chickenStats.qty} kg`}
                    subValue={`₹${stats.chickenStats.cost}`}
                    icon={<FiShoppingBag />}
                    color="text-orange-400"
                    bg="bg-orange-500/10"
                />
            </div>

            {/* KPI Cards Row 2 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
                <KPICard
                    title="Kitchen Stock Value"
                    value={`₹${stats.stockValue.toFixed(0)}`}
                    icon={<FiBox />}
                    color="text-blue-400"
                    bg="bg-blue-500/10"
                />
                <KPICard
                    title="Vendor Dues"
                    value={`₹${stats.vendorDues.toFixed(0)}`}
                    icon={<FiAlertTriangle />}
                    color="text-yellow-400"
                    bg="bg-yellow-500/10"
                />
                <KPICard
                    title="Staff Present"
                    value={stats.employeesPresent}
                    icon={<FiUsers />}
                    color="text-purple-400"
                    bg="bg-purple-500/10"
                />
                <KPICard
                    title="System Status"
                    value="Online"
                    icon={<FiActivity />}
                    color="text-green-400"
                    bg="bg-green-500/10"
                />
            </div>

            {/* Charts & Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">

                {/* Sales Trend Chart */}
                <div className="lg:col-span-2 glass-panel p-4 md:p-6 rounded-xl">
                    <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4">Sales Trend (Last 7 Days)</h3>
                    <div className="h-48 md:h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={stats.salesTrend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="date" stroke="#888" tickFormatter={(str) => new Date(str).toLocaleDateString()} />
                                <YAxis stroke="#888" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1a1a1a', border: 'none' }}
                                    labelStyle={{ color: '#888' }}
                                />
                                <Line type="monotone" dataKey="sales" stroke="#00C49F" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Low Stock Alerts */}
                <div className="glass-panel p-4 md:p-6 rounded-xl">
                    <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4 flex items-center gap-2">
                        <FiAlertTriangle className="text-yellow-500" /> Low Stock Alerts
                    </h3>
                    <div className="space-y-3">
                        {stats.lowStockItems.length === 0 ? (
                            <p className="text-gray-400">All stock levels are good.</p>
                        ) : (
                            stats.lowStockItems.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                                    <span className="font-medium">{item.name}</span>
                                    <span className="text-red-400 font-bold">{item.stock_qty} {item.unit}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

const KPICard = ({ title, value, subValue, icon, color, bg }) => (
    <div className="glass-panel p-3 md:p-4 rounded-xl flex items-center justify-between hover:scale-[1.02] transition-transform">
        <div>
            <p className="text-gray-400 text-xs md:text-sm mb-1">{title}</p>
            <h2 className="text-xl md:text-2xl font-bold text-white">{value}</h2>
            {subValue && <p className={`text-xs ${color} mt-1`}>{subValue}</p>}
        </div>
        <div className={`p-2 md:p-3 rounded-full ${bg} ${color} text-lg md:text-xl`}>
            {icon}
        </div>
    </div>
);

export default MasterDashboard;
