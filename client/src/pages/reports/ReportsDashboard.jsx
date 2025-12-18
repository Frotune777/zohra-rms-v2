import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import {
    FiDollarSign,
    FiUsers,
    FiTrendingUp,
    FiPackage,
    FiAlertCircle,
    FiBarChart2,
    FiPieChart,
    FiActivity
} from 'react-icons/fi';
import StatsCard from '../../components/reports/StatsCard';
import DateRangePicker from '../../components/reports/DateRangePicker';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

export default function ReportsDashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState(null);
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        fetchKPIs();
    }, [dateRange]);

    const fetchKPIs = async () => {
        try {
            setLoading(true);
            const response = await api.get('reports/dashboard/kpis', {
                params: dateRange
            });
            setKpis(response.data);
        } catch (error) {
            console.error('Error fetching KPIs:', error);
            toast.error('Failed to load dashboard data');
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

    const reportSections = [
        {
            title: 'Financial Reports',
            description: 'Revenue, expenses, and profitability analysis',
            icon: FiDollarSign,
            path: '/reports/financial',
            color: 'bg-green-500'
        },
        {
            title: 'HR & Payroll Reports',
            description: 'Employee costs, advances, and attendance',
            icon: FiUsers,
            path: '/reports/hr',
            color: 'bg-blue-500'
        },
        {
            title: 'Operations Reports',
            description: 'Chicken biller analytics and vendor performance',
            icon: FiActivity,
            path: '/reports/operations',
            color: 'bg-purple-500'
        },
        {
            title: 'Inventory Reports',
            description: 'Stock levels, wastage, and purchase trends',
            icon: FiPackage,
            path: '/reports/inventory',
            color: 'bg-orange-500'
        }
    ];

    return (
        <div className="reports-dashboard">
            <PageHeader title="Business Intelligence & Reports" showBack={true} showHome={false} />

            {/* Hero Section */}
            <div className="reports-hero">
                <div className="hero-content">
                    <p className="hero-description">
                        Comprehensive analytics and insights across all business operations
                    </p>
                </div>

                <DateRangePicker
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    onChange={setDateRange}
                />
            </div>

            {/* KPI Cards */}
            {kpis && (
                <div className="kpi-grid">
                    <StatsCard
                        title="Total Revenue"
                        value={`₹${parseFloat(kpis.financial?.total_revenue || 0).toLocaleString('en-IN')}`}
                        icon={FiDollarSign}
                        changeType="positive"
                    />
                    <StatsCard
                        title="Total Expenses"
                        value={`₹${parseFloat(kpis.financial?.total_expenses || 0).toLocaleString('en-IN')}`}
                        icon={FiTrendingUp}
                        changeType="negative"
                    />
                    <StatsCard
                        title="Net Profit"
                        value={`₹${parseFloat(kpis.financial?.net_profit || 0).toLocaleString('en-IN')}`}
                        icon={FiPieChart}
                        changeType={kpis.financial?.net_profit > 0 ? 'positive' : 'negative'}
                    />
                    <StatsCard
                        title="Active Employees"
                        value={kpis.hr?.total_employees || 0}
                        icon={FiUsers}
                    />
                    <StatsCard
                        title="Outstanding Advances"
                        value={`₹${parseFloat(kpis.advances?.outstanding_advances || 0).toLocaleString('en-IN')}`}
                        icon={FiAlertCircle}
                        changeType="neutral"
                    />
                    <StatsCard
                        title="Inventory Value"
                        value={`₹${parseFloat(kpis.inventory?.inventory_value || 0).toLocaleString('en-IN')}`}
                        icon={FiPackage}
                    />
                    <StatsCard
                        title="Low Stock Items"
                        value={kpis.inventory?.low_stock_items || 0}
                        icon={FiAlertCircle}
                        changeType={kpis.inventory?.low_stock_items > 0 ? 'negative' : 'positive'}
                    />
                    <StatsCard
                        title="Pending Bills"
                        value={kpis.operations?.pending_bills || 0}
                        icon={FiActivity}
                    />
                </div>
            )}

            {/* Report Sections */}
            <div className="report-sections">
                <h2 className="section-title">Detailed Reports</h2>
                <div className="report-cards-grid">
                    {reportSections.map((section) => (
                        <div
                            key={section.path}
                            onClick={() => navigate(section.path)}
                            className="report-card"
                        >
                            <div className={`report-card-icon ${section.color}`}>
                                <section.icon size={32} />
                            </div>
                            <h3 className="report-card-title">{section.title}</h3>
                            <p className="report-card-description">{section.description}</p>
                            <button className="report-card-btn">
                                View Report →
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick Alerts */}
            {kpis && (
                <div className="alerts-section">
                    <h2 className="section-title">
                        <FiAlertCircle className="inline mr-2" />
                        Alerts & Notifications
                    </h2>
                    <div className="alerts-grid">
                        {kpis.inventory?.low_stock_items > 0 && (
                            <div className="alert alert-warning">
                                <FiPackage className="alert-icon" />
                                <div>
                                    <strong>{kpis.inventory.low_stock_items} items</strong> are running low on stock
                                </div>
                            </div>
                        )}
                        {kpis.operations?.pending_bills > 0 && (
                            <div className="alert alert-info">
                                <FiActivity className="alert-icon" />
                                <div>
                                    <strong>{kpis.operations.pending_bills} bills</strong> are pending approval
                                </div>
                            </div>
                        )}
                        {parseFloat(kpis.advances?.outstanding_advances || 0) > 0 && (
                            <div className="alert alert-warning">
                                <FiDollarSign className="alert-icon" />
                                <div>
                                    <strong>₹{parseFloat(kpis.advances.outstanding_advances).toLocaleString('en-IN')}</strong> in outstanding advances
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
