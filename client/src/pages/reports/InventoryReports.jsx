import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReportLayout from '../../components/reports/ReportLayout';
import StatsCard from '../../components/reports/StatsCard';
import DateRangePicker from '../../components/reports/DateRangePicker';
import ExportButton from '../../components/reports/ExportButton';
import {
    BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { FiPackage, FiAlertCircle, FiTrendingDown, FiDollarSign } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function InventoryReports() {
    const [loading, setLoading] = useState(true);
    const [stockData, setStockData] = useState(null);
    const [wastageData, setWastageData] = useState(null);
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        fetchInventoryData();
    }, [dateRange]);

    const fetchInventoryData = async () => {
        try {
            setLoading(true);

            const [stockRes, wastageRes] = await Promise.all([
                axios.get('http://localhost:5000/api/reports/inventory/stock-status'),
                axios.get('http://localhost:5000/api/reports/inventory/wastage', { params: dateRange })
            ]);

            setStockData(stockRes.data);
            setWastageData(wastageRes.data);
        } catch (error) {
            console.error('Error fetching inventory data:', error);
            toast.error('Failed to load inventory reports');
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

    const getStockLevelColor = (level) => {
        switch (level) {
            case 'low': return 'bg-red-500';
            case 'medium': return 'bg-yellow-500';
            case 'high': return 'bg-green-500';
            default: return 'bg-gray-500';
        }
    };

    return (
        <ReportLayout
            title="Inventory Reports"
            description="Stock levels, wastage tracking, and purchase trends"
            dateRangePicker={
                <DateRangePicker
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    onChange={setDateRange}
                />
            }
            exportButtons={
                <ExportButton
                    data={stockData?.items || []}
                    filename="inventory_report"
                    reportType="inventory"
                />
            }
        >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatsCard
                    title="Total Items"
                    value={stockData?.summary?.total_items || 0}
                    icon={FiPackage}
                />
                <StatsCard
                    title="Inventory Value"
                    value={`₹${parseFloat(stockData?.summary?.total_value || 0).toLocaleString('en-IN')}`}
                    icon={FiDollarSign}
                />
                <StatsCard
                    title="Low Stock Items"
                    value={stockData?.summary?.low_stock_count || 0}
                    icon={FiAlertCircle}
                    changeType={stockData?.summary?.low_stock_count > 0 ? 'negative' : 'positive'}
                />
                <StatsCard
                    title="Wastage Cost"
                    value={`₹${parseFloat(wastageData?.summary?.total_cost || 0).toLocaleString('en-IN')}`}
                    icon={FiTrendingDown}
                    changeType="negative"
                />
            </div>

            {/* Stock Levels */}
            <div className="report-table-card mb-8">
                <h3 className="table-title">Current Stock Levels</h3>
                <div className="overflow-x-auto">
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Stock Qty</th>
                                <th>Unit</th>
                                <th>Unit Cost</th>
                                <th>Stock Value</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stockData?.items?.map((item, idx) => (
                                <tr key={idx}>
                                    <td className="font-semibold">{item.name}</td>
                                    <td>{parseFloat(item.stock_qty).toFixed(2)}</td>
                                    <td>{item.unit}</td>
                                    <td>₹{parseFloat(item.unit_cost).toFixed(2)}</td>
                                    <td className="font-semibold">
                                        ₹{parseFloat(item.stock_value).toLocaleString('en-IN')}
                                    </td>
                                    <td>
                                        <div className="flex items-center">
                                            <div className={`w-3 h-3 rounded-full mr-2 ${getStockLevelColor(item.stock_level)}`} />
                                            <span className="capitalize">{item.stock_level}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Wastage Trend */}
            <div className="report-chart-card mb-8">
                <h3 className="chart-title">Daily Wastage Trend</h3>
                <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={wastageData?.trend?.map(t => ({
                        ...t,
                        date: new Date(t.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
                    })) || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" stroke="#6b7280" />
                        <YAxis stroke="#6b7280" />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px'
                            }}
                            formatter={(value) => `₹${parseFloat(value).toLocaleString('en-IN')}`}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="daily_cost"
                            stroke="#ef4444"
                            strokeWidth={3}
                            name="Wastage Cost"
                            dot={{ fill: '#ef4444', r: 4 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Top Wasted Items */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Wastage by Item */}
                <div className="report-chart-card">
                    <h3 className="chart-title">Top Wasted Items (by Cost)</h3>
                    <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={wastageData?.itemWastage?.slice(0, 10) || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="item_name" stroke="#6b7280" angle={-45} textAnchor="end" height={100} />
                            <YAxis stroke="#6b7280" />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px'
                                }}
                                formatter={(value) => `₹${parseFloat(value).toLocaleString('en-IN')}`}
                            />
                            <Bar dataKey="total_cost" fill="#ef4444" name="Wastage Cost" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Wastage Table */}
                <div className="report-table-card">
                    <h3 className="table-title">Wastage Details</h3>
                    <div className="overflow-x-auto max-h-96">
                        <table className="report-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Qty</th>
                                    <th>Cost</th>
                                    <th>Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {wastageData?.itemWastage?.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="font-semibold">{item.item_name}</td>
                                        <td>{parseFloat(item.total_qty).toFixed(2)} {item.unit}</td>
                                        <td className="text-red-600 font-semibold">
                                            ₹{parseFloat(item.total_cost).toLocaleString('en-IN')}
                                        </td>
                                        <td>
                                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                                                {item.reason || 'N/A'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Wastage Summary */}
            <div className="report-card-info mt-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="info-card">
                        <div className="info-label">Total Incidents</div>
                        <div className="info-value">{wastageData?.summary?.total_incidents || 0}</div>
                    </div>
                    <div className="info-card">
                        <div className="info-label">Total Quantity Wasted</div>
                        <div className="info-value">{parseFloat(wastageData?.summary?.total_qty || 0).toFixed(2)}</div>
                    </div>
                    <div className="info-card">
                        <div className="info-label">Total Cost Impact</div>
                        <div className="info-value text-red-600">
                            ₹{parseFloat(wastageData?.summary?.total_cost || 0).toLocaleString('en-IN')}
                        </div>
                    </div>
                </div>
            </div>
        </ReportLayout>
    );
}
