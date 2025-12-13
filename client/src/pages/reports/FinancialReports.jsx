import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReportLayout from '../../components/reports/ReportLayout';
import StatsCard from '../../components/reports/StatsCard';
import DateRangePicker from '../../components/reports/DateRangePicker';
import ExportButton from '../../components/reports/ExportButton';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { FiDollarSign, FiTrendingUp, FiTrendingDown } from 'react-icons/fi';
import toast from 'react-hot-toast';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function FinancialReports() {
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState(null);
    const [expenseBreakdown, setExpenseBreakdown] = useState([]);
    const [spendingByPerson, setSpendingByPerson] = useState([]); // [NEW]
    const [balanceSheet, setBalanceSheet] = useState(null);
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        fetchFinancialData();
    }, [dateRange]);

    const fetchFinancialData = async () => {
        try {
            setLoading(true);

            const [overviewRes, expenseRes, balanceSheetRes, spendingRes] = await Promise.all([
                axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/reports/financial/overview`, { params: dateRange }),
                axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/reports/financial/expense-breakdown`, { params: dateRange }),
                axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/reports/financial/balance-sheet`, { params: { date: dateRange.endDate } }),
                axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/reports/financial/spending-by-person`, { params: dateRange })
            ]);

            setOverview(overviewRes.data);
            setExpenseBreakdown(expenseRes.data);
            setBalanceSheet(balanceSheetRes.data);
            setSpendingByPerson(spendingRes.data); // [NEW]
        } catch (error) {
            console.error('Error fetching financial data:', error);
            toast.error('Failed to load financial reports');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    // Merge revenue and expense trends for combined chart
    const combinedTrend = overview?.revenueTrend?.map((rev, idx) => ({
        date: new Date(rev.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        revenue: parseFloat(rev.revenue),
        expenses: parseFloat(overview.expenseTrend[idx]?.expenses || 0)
    })) || [];

    return (
        <ReportLayout
            title="Financial Reports"
            description="Revenue, expenses, and profitability analysis"
            dateRangePicker={
                <DateRangePicker
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    onChange={setDateRange}
                />
            }
            exportButtons={
                <ExportButton
                    data={combinedTrend}
                    filename="financial_report"
                    reportType="financial"
                />
            }
        >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <StatsCard
                    title="Total Revenue"
                    value={`₹${parseFloat(overview?.summary?.total_revenue || 0).toLocaleString('en-IN')}`}
                    icon={FiDollarSign}
                    changeType="positive"
                />
                <StatsCard
                    title="Total Expenses"
                    value={`₹${parseFloat(overview?.summary?.total_expenses || 0).toLocaleString('en-IN')}`}
                    icon={FiTrendingDown}
                    changeType="negative"
                />
                <StatsCard
                    title="Net Profit"
                    value={`₹${parseFloat(overview?.summary?.net_profit || 0).toLocaleString('en-IN')}`}
                    icon={FiTrendingUp}
                    changeType={overview?.summary?.net_profit > 0 ? 'positive' : 'negative'}
                />
            </div>

            {/* Revenue vs Expenses Chart */}
            <div className="report-chart-card mb-8">
                <h3 className="chart-title">Revenue vs Expenses Trend</h3>
                <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={combinedTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" stroke="#6b7280" />
                        <YAxis stroke="#6b7280" />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px'
                            }}
                            formatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="revenue"
                            stroke="#10b981"
                            strokeWidth={3}
                            name="Revenue"
                            dot={{ fill: '#10b981', r: 4 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="expenses"
                            stroke="#ef4444"
                            strokeWidth={3}
                            name="Expenses"
                            dot={{ fill: '#ef4444', r: 4 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Expense Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Pie Chart */}
                <div className="report-chart-card">
                    <h3 className="chart-title">Expense Breakdown by Category</h3>
                    <ResponsiveContainer width="100%" height={350}>
                        <PieChart>
                            <Pie
                                data={expenseBreakdown}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ category, percent }) => `${category}: ${(percent * 100).toFixed(0)}%`}
                                outerRadius={120}
                                fill="#8884d8"
                                dataKey="amount"
                                nameKey="category"
                            >
                                {expenseBreakdown.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => `₹${parseFloat(value).toLocaleString('en-IN')}`} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Bar Chart */}
                <div className="report-chart-card">
                    <h3 className="chart-title">Expense Amounts by Category</h3>
                    <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={expenseBreakdown}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="category" stroke="#6b7280" />
                            <YAxis stroke="#6b7280" />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px'
                                }}
                                formatter={(value) => `₹${parseFloat(value).toLocaleString('en-IN')}`}
                            />
                            <Bar dataKey="amount" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Expense Table */}
            <div className="report-table-card mt-8">
                <h3 className="table-title">Detailed Expense Breakdown</h3>
                <div className="overflow-x-auto">
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Amount</th>
                                <th>Transactions</th>
                                <th>Percentage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenseBreakdown.map((expense, idx) => {
                                const total = expenseBreakdown.reduce((sum, e) => sum + parseFloat(e.amount), 0);
                                const percentage = (parseFloat(expense.amount) / total) * 100;

                                return (
                                    <tr key={idx}>
                                        <td>
                                            <div className="flex items-center">
                                                <div
                                                    className="w-3 h-3 rounded-full mr-2"
                                                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                                                />
                                                {expense.category}
                                            </div>
                                        </td>
                                        <td className="font-semibold">
                                            ₹{parseFloat(expense.amount).toLocaleString('en-IN')}
                                        </td>
                                        <td>{expense.transaction_count}</td>
                                        <td>{percentage.toFixed(1)}%</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Spending By Person Table [NEW] */}
            <div className="report-table-card mt-8">
                <h3 className="table-title">Spending by Person</h3>
                <div className="overflow-x-auto">
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th>Person</th>
                                <th>Total Spent</th>
                                <th>Calculated Transactions</th>
                                <th>% of Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {spendingByPerson.map((item, idx) => {
                                const total = spendingByPerson.reduce((sum, i) => sum + parseFloat(i.total_amount), 0);
                                const percentage = total > 0 ? (parseFloat(item.total_amount) / total) * 100 : 0;

                                return (
                                    <tr key={idx}>
                                        <td className="font-medium text-white">{item.paid_by || 'Unknown'}</td>
                                        <td className="font-mono text-yellow-400">
                                            ₹{parseFloat(item.total_amount).toLocaleString('en-IN')}
                                        </td>
                                        <td>{item.transaction_count}</td>
                                        <td>{percentage.toFixed(1)}%</td>
                                    </tr>
                                );
                            })}
                            {spendingByPerson.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="text-center py-4 text-gray-500">No spending data available.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Balance Sheet Section */}
            {
                balanceSheet && (
                    <div className="mt-8">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <FiDollarSign className="text-zohra-blue" />
                            Balance Sheet (As of {new Date(dateRange.endDate).toLocaleDateString('en-IN')})
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Assets */}
                            <div className="glass-panel p-6 rounded-xl border border-green-500/20">
                                <h3 className="text-lg font-bold text-green-400 mb-4 border-b border-white/10 pb-2">Assets</h3>
                                <div className="space-y-3">
                                    {balanceSheet.assets.map((asset, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-sm">
                                            <span className="text-gray-300">{asset.name}</span>
                                            <span className="font-mono text-white">₹{parseFloat(asset.balance).toLocaleString('en-IN')}</span>
                                        </div>
                                    ))}
                                    <div className="border-t border-white/10 pt-3 flex justify-between items-center font-bold text-lg">
                                        <span className="text-white">Total Assets</span>
                                        <span className="text-green-400">₹{parseFloat(balanceSheet.summary.totalAssets).toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Liabilities & Equity */}
                            <div className="glass-panel p-6 rounded-xl border border-red-500/20">
                                <h3 className="text-lg font-bold text-red-400 mb-4 border-b border-white/10 pb-2">Liabilities & Equity</h3>

                                <div className="mb-6">
                                    <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase">Liabilities</h4>
                                    <div className="space-y-3">
                                        {balanceSheet.liabilities.map((liab, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-sm">
                                                <span className="text-gray-300">{liab.name}</span>
                                                <span className="font-mono text-white">₹{parseFloat(liab.balance).toLocaleString('en-IN')}</span>
                                            </div>
                                        ))}
                                        <div className="border-t border-white/10 pt-2 flex justify-between items-center font-bold">
                                            <span className="text-gray-400">Total Liabilities</span>
                                            <span className="text-white">₹{parseFloat(balanceSheet.summary.totalLiabilities).toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase">Equity</h4>
                                    <div className="space-y-3">
                                        {balanceSheet.equity.map((eq, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-sm">
                                                <span className="text-gray-300">{eq.name}</span>
                                                <span className="font-mono text-white">₹{parseFloat(eq.balance).toLocaleString('en-IN')}</span>
                                            </div>
                                        ))}
                                        <div className="border-t border-white/10 pt-2 flex justify-between items-center font-bold">
                                            <span className="text-gray-400">Total Equity</span>
                                            <span className="text-white">₹{parseFloat(balanceSheet.summary.totalEquity).toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t-2 border-white/20 mt-4 pt-3 flex justify-between items-center font-bold text-lg">
                                    <span className="text-white">Total Liabilities & Equity</span>
                                    <span className="text-red-400">₹{parseFloat(balanceSheet.summary.totalLiabilitiesAndEquity).toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </ReportLayout >
    );
}
