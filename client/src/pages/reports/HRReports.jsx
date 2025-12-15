import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import ReportLayout from '../../components/reports/ReportLayout';
import StatsCard from '../../components/reports/StatsCard';
import DateRangePicker from '../../components/reports/DateRangePicker';
import ExportButton from '../../components/reports/ExportButton';
import {
    BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { FiUsers, FiDollarSign, FiCalendar, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function HRReports() {
    const [loading, setLoading] = useState(true);
    const [payrollData, setPayrollData] = useState(null);
    const [advanceData, setAdvanceData] = useState(null);
    const [attendanceData, setAttendanceData] = useState(null);
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        fetchHRData();
    }, [dateRange]);

    const fetchHRData = async () => {
        try {
            setLoading(true);

            const [payrollRes, advanceRes, attendanceRes] = await Promise.all([
                axios.get('reports/hr/payroll-summary', { params: dateRange }),
                axios.get('reports/hr/advances', { params: dateRange }),
                axios.get('reports/hr/attendance', { params: dateRange })
            ]);

            setPayrollData(payrollRes.data);
            setAdvanceData(advanceRes.data);
            setAttendanceData(attendanceRes.data);
        } catch (error) {
            console.error('Error fetching HR data:', error);
            toast.error('Failed to load HR reports');
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
            title="HR & Payroll Reports"
            description="Employee costs, advances, and attendance analytics"
            dateRangePicker={
                <DateRangePicker
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    onChange={setDateRange}
                />
            }
            exportButtons={
                <ExportButton
                    data={advanceData?.advances || []}
                    filename="hr_report"
                    reportType="hr"
                />
            }
        >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatsCard
                    title="Total Payroll"
                    value={`₹${parseFloat(payrollData?.summary?.total_net_pay || 0).toLocaleString('en-IN')}`}
                    icon={FiDollarSign}
                />
                <StatsCard
                    title="Employees"
                    value={payrollData?.summary?.employee_count || 0}
                    icon={FiUsers}
                />
                <StatsCard
                    title="Advance Deductions"
                    value={`₹${parseFloat(payrollData?.summary?.total_advance_deductions || 0).toLocaleString('en-IN')}`}
                    icon={FiAlertCircle}
                />
                <StatsCard
                    title="Attendance Rate"
                    value={`${parseFloat(attendanceData?.stats?.attendance_rate || 0).toFixed(1)}%`}
                    icon={FiCalendar}
                    changeType="positive"
                />
            </div>

            {/* Payroll Trend */}
            <div className="report-chart-card mb-8">
                <h3 className="chart-title">Monthly Payroll Trend</h3>
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={payrollData?.monthlyTrend || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                            dataKey={(item) => `${item.month}/${item.year}`}
                            stroke="#6b7280"
                        />
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
                        <Bar dataKey="total_payout" fill="#3b82f6" name="Total Payout" radius={[8, 8, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Advance Tracking */}
            <div className="report-table-card mb-8">
                <h3 className="table-title">
                    Advance Tracking
                    <span className="ml-4 text-sm font-normal text-gray-600">
                        Total Outstanding: ₹{parseFloat(
                            advanceData?.advances?.reduce((sum, a) => sum + parseFloat(a.outstanding_balance || 0), 0) || 0
                        ).toLocaleString('en-IN')}
                    </span>
                </h3>
                <div className="overflow-x-auto">
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Position</th>
                                <th>Total Advances</th>
                                <th>Recovered</th>
                                <th>Outstanding</th>
                                <th>Recovery %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {advanceData?.advances?.map((advance, idx) => {
                                const recoveryPercent = (parseFloat(advance.total_recovered) / parseFloat(advance.total_advances)) * 100;

                                return (
                                    <tr key={idx}>
                                        <td className="font-semibold">{advance.full_name}</td>
                                        <td>{advance.position}</td>
                                        <td>₹{parseFloat(advance.total_advances).toLocaleString('en-IN')}</td>
                                        <td className="text-green-600">
                                            ₹{parseFloat(advance.total_recovered).toLocaleString('en-IN')}
                                        </td>
                                        <td className="text-red-600 font-semibold">
                                            ₹{parseFloat(advance.outstanding_balance).toLocaleString('en-IN')}
                                        </td>
                                        <td>
                                            <div className="flex items-center">
                                                <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                                                    <div
                                                        className="bg-green-600 h-2 rounded-full"
                                                        style={{ width: `${recoveryPercent}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm">{recoveryPercent.toFixed(0)}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Attendance Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Attendance Trend */}
                <div className="report-chart-card">
                    <h3 className="chart-title">Daily Attendance Trend</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={attendanceData?.trend || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                                dataKey={(item) => new Date(item.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                                stroke="#6b7280"
                            />
                            <YAxis stroke="#6b7280" />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="present" stroke="#10b981" name="Present" strokeWidth={2} />
                            <Line type="monotone" dataKey="absent" stroke="#ef4444" name="Absent" strokeWidth={2} />
                            <Line type="monotone" dataKey="half_day" stroke="#f59e0b" name="Half Day" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Employee Attendance Table */}
                <div className="report-table-card">
                    <h3 className="table-title">Employee Attendance Summary</h3>
                    <div className="overflow-x-auto max-h-80">
                        <table className="report-table">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Present</th>
                                    <th>Absent</th>
                                    <th>Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attendanceData?.employeeStats?.slice(0, 10).map((emp, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <div className="font-semibold">{emp.full_name}</div>
                                            <div className="text-sm text-gray-500">{emp.position}</div>
                                        </td>
                                        <td className="text-green-600">{emp.present_days}</td>
                                        <td className="text-red-600">{emp.absent_days}</td>
                                        <td>
                                            <span className={`font-semibold ${emp.attendance_percentage >= 90 ? 'text-green-600' :
                                                    emp.attendance_percentage >= 75 ? 'text-yellow-600' :
                                                        'text-red-600'
                                                }`}>
                                                {parseFloat(emp.attendance_percentage || 0).toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </ReportLayout>
    );
}
