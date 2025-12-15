import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import ReportLayout from '../../components/reports/ReportLayout';
import StatsCard from '../../components/reports/StatsCard';
import DateRangePicker from '../../components/reports/DateRangePicker';
import ExportButton from '../../components/reports/ExportButton';
import {
    LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { FiActivity, FiTrendingUp, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function OperationsReports() {
    const [loading, setLoading] = useState(true);
    const [chickenData, setChickenData] = useState(null);
    const [vendorData, setVendorData] = useState(null);
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        fetchOperationsData();
    }, [dateRange]);

    const fetchOperationsData = async () => {
        try {
            setLoading(true);

            const [chickenRes, vendorRes] = await Promise.all([
                axios.get('reports/operations/chicken-analytics', { params: dateRange }),
                axios.get('reports/operations/vendor-performance', { params: dateRange })
            ]);

            setChickenData(chickenRes.data);
            setVendorData(vendorRes.data);
        } catch (error) {
            console.error('Error fetching operations data:', error);
            toast.error('Failed to load operations reports');
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

    return (
        <ReportLayout
            title="Operations Reports"
            description="Chicken biller analytics and vendor performance"
            dateRangePicker={
                <DateRangePicker
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    onChange={setDateRange}
                />
            }
            exportButtons={
                <ExportButton
                    data={chickenData?.itemSummary || []}
                    filename="operations_report"
                    reportType="operations"
                />
            }
        >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatsCard
                    title="Total Bills"
                    value={chickenData?.billSummary?.total_bills || 0}
                    icon={FiActivity}
                />
                <StatsCard
                    title="Approved Bills"
                    value={chickenData?.billSummary?.approved_bills || 0}
                    icon={FiCheckCircle}
                    changeType="positive"
                />
                <StatsCard
                    title="Pending Bills"
                    value={chickenData?.billSummary?.pending_bills || 0}
                    icon={FiAlertTriangle}
                    changeType="neutral"
                />
                <StatsCard
                    title="Total Variance"
                    value={`₹${parseFloat(chickenData?.billSummary?.total_variance || 0).toLocaleString('en-IN')}`}
                    icon={FiTrendingUp}
                    changeType={chickenData?.billSummary?.total_variance > 0 ? 'negative' : 'positive'}
                />
            </div>

            {/* Daily Rates Trend */}
            <div className="report-chart-card mb-8">
                <h3 className="chart-title">Daily Chicken Rates Trend</h3>
                <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={chickenData?.rates?.map(r => ({
                        ...r,
                        date: new Date(r.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
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
                            formatter={(value) => `₹${parseFloat(value).toFixed(2)}`}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="tandoor_rate"
                            stroke="#ef4444"
                            strokeWidth={2}
                            name="Tandoor Rate"
                            dot={{ fill: '#ef4444', r: 3 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="boiler_rate"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            name="Boiler Rate"
                            dot={{ fill: '#3b82f6', r: 3 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="egg_rate"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            name="Egg Rate"
                            dot={{ fill: '#f59e0b', r: 3 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Item-wise Purchase Summary */}
            <div className="report-chart-card mb-8">
                <h3 className="chart-title">Item-wise Purchase Summary</h3>
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={chickenData?.itemSummary || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="item_name" stroke="#6b7280" />
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
                        <Bar dataKey="total_amount" fill="#8b5cf6" name="Total Amount" radius={[8, 8, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Vendor Performance */}
            <div className="report-table-card mb-8">
                <h3 className="table-title">Vendor Performance Analysis</h3>
                <div className="overflow-x-auto">
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th>Vendor</th>
                                <th>Type</th>
                                <th>Total Bills</th>
                                <th>Amount</th>
                                <th>Avg Variance</th>
                                <th>Approved</th>
                                <th>Pending</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendorData?.vendorPerformance?.map((vendor, idx) => (
                                <tr key={idx}>
                                    <td className="font-semibold">{vendor.name}</td>
                                    <td>{vendor.vendor_type}</td>
                                    <td>{vendor.total_bills}</td>
                                    <td>₹{parseFloat(vendor.total_amount).toLocaleString('en-IN')}</td>
                                    <td className={parseFloat(vendor.avg_variance) > 0 ? 'text-red-600' : 'text-green-600'}>
                                        ₹{parseFloat(vendor.avg_variance).toFixed(2)}
                                    </td>
                                    <td className="text-green-600">{vendor.approved_count}</td>
                                    <td className="text-yellow-600">{vendor.pending_count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Vendor Ledger */}
            <div className="report-table-card">
                <h3 className="table-title">Vendor Ledger Summary</h3>
                <div className="overflow-x-auto">
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th>Vendor</th>
                                <th>Total Bills</th>
                                <th>Total Payments</th>
                                <th>Outstanding Balance</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendorData?.vendorLedger?.map((ledger, idx) => {
                                const outstanding = parseFloat(ledger.outstanding_balance);

                                return (
                                    <tr key={idx}>
                                        <td className="font-semibold">{ledger.name}</td>
                                        <td>₹{parseFloat(ledger.total_bills).toLocaleString('en-IN')}</td>
                                        <td className="text-green-600">
                                            ₹{parseFloat(ledger.total_payments).toLocaleString('en-IN')}
                                        </td>
                                        <td className={outstanding > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                            ₹{outstanding.toLocaleString('en-IN')}
                                        </td>
                                        <td>
                                            {outstanding > 0 ? (
                                                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                                                    Outstanding
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                                    Settled
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </ReportLayout>
    );
}
