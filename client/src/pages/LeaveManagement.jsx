import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { FiCalendar, FiCheckCircle, FiXCircle, FiClock, FiPlus, FiUser } from 'react-icons/fi';

const LeaveManagement = () => {
    const [leaves, setLeaves] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [filter, setFilter] = useState('all'); // all, pending, approved, rejected
    const { userRole } = useAuth();

    const [formData, setFormData] = useState({
        employee_id: '',
        leave_type: 'Sick',
        start_date: '',
        end_date: '',
        reason: ''
    });

    const canApprove = userRole === 'manager' || userRole === 'owner';

    useEffect(() => {
        fetchData();
    }, [filter]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const params = filter !== 'all' ? `?status=${filter.charAt(0).toUpperCase() + filter.slice(1)}` : '';
            const [leavesRes, employeesRes] = await Promise.all([
                api.get(`/leaves${params}`),
                api.get('/employees')
            ]);
            setLeaves(leavesRes.data);
            setEmployees(employeesRes.data.filter(e => e.status === 'active'));
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/leaves', formData);
            setShowForm(false);
            setFormData({
                employee_id: '',
                leave_type: 'Sick',
                start_date: '',
                end_date: '',
                reason: ''
            });
            fetchData();
        } catch (err) {
            console.error('Error creating leave request:', err);
            alert(err.response?.data?.error || 'Failed to create leave request');
        }
    };

    const handleApprove = async (id) => {
        if (!window.confirm('Approve this leave request?')) return;
        try {
            await api.put(`/leaves/${id}/approve`);
            fetchData();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to approve leave');
        }
    };

    const handleReject = async (id) => {
        const reason = window.prompt('Enter rejection reason:');
        if (!reason) return;
        try {
            await api.put(`/leaves/${id}/reject`, { rejection_reason: reason });
            fetchData();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to reject leave');
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            Pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500',
            Approved: 'bg-green-500/20 text-green-300 border-green-500',
            Rejected: 'bg-red-500/20 text-red-300 border-red-500'
        };
        const icons = {
            Pending: FiClock,
            Approved: FiCheckCircle,
            Rejected: FiXCircle
        };
        const Icon = icons[status];
        return (
            <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}>
                <Icon size={14} />
                {status}
            </span>
        );
    };

    const calculateDays = (start, end) => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-gray-400">Loading leave requests...</p>
            </div>
        );
    }

    return (
        <div className="p-8 h-full w-full flex flex-col overflow-hidden bg-gradient-to-br from-midnight to-midnight/95">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-zohra-blue mb-2">Leave Management</h2>
                    <p className="text-xs text-gray-400">Manage employee leave requests and approvals</p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-2 btn-primary"
                >
                    <FiPlus /> New Leave Request
                </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6">
                {['all', 'pending', 'approved', 'rejected'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === f
                                ? 'bg-zohra-blue text-white'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* New Leave Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="glass-panel p-6 mb-6 rounded-xl space-y-4">
                    <h3 className="text-xl font-bold mb-4">New Leave Request</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Employee *</label>
                            <select
                                value={formData.employee_id}
                                onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                required
                            >
                                <option value="">Select Employee</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_code})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Leave Type *</label>
                            <select
                                value={formData.leave_type}
                                onChange={(e) => setFormData({ ...formData, leave_type: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                required
                            >
                                <option value="Sick">Sick Leave</option>
                                <option value="Casual">Casual Leave</option>
                                <option value="Paid">Paid Leave</option>
                                <option value="Unpaid">Unpaid Leave</option>
                                <option value="Emergency">Emergency Leave</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Start Date *</label>
                            <input
                                type="date"
                                value={formData.start_date}
                                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">End Date *</label>
                            <input
                                type="date"
                                value={formData.end_date}
                                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                min={formData.start_date}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                required
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-300 mb-2">Reason *</label>
                            <textarea
                                value={formData.reason}
                                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                rows="3"
                                required
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end">
                        <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary">
                            Submit Request
                        </button>
                    </div>
                </form>
            )}

            {/* Leave Requests Table */}
            <div className="glass-panel rounded-xl overflow-hidden flex-1 flex flex-col">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white/5 text-gray-400 border-b border-white/10 sticky top-0">
                            <tr>
                                <th className="p-4 font-semibold">Employee</th>
                                <th className="p-4 font-semibold">Type</th>
                                <th className="p-4 font-semibold">Start Date</th>
                                <th className="p-4 font-semibold">End Date</th>
                                <th className="p-4 font-semibold">Days</th>
                                <th className="p-4 font-semibold">Reason</th>
                                <th className="p-4 font-semibold">Status</th>
                                {canApprove && <th className="p-4 font-semibold">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {leaves.length === 0 ? (
                                <tr>
                                    <td colSpan={canApprove ? 8 : 7} className="p-4 text-center text-gray-400">
                                        No leave requests found
                                    </td>
                                </tr>
                            ) : (
                                leaves.map((leave) => (
                                    <tr key={leave.id} className="border-b border-white/5 hover:bg-white/5 transition">
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <FiUser className="text-gray-400" />
                                                <div>
                                                    <p className="font-semibold">{leave.full_name}</p>
                                                    <p className="text-xs text-gray-400">{leave.employee_code}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">
                                                {leave.leave_type}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm">{new Date(leave.start_date).toLocaleDateString()}</td>
                                        <td className="p-4 text-sm">{new Date(leave.end_date).toLocaleDateString()}</td>
                                        <td className="p-4 text-sm font-bold">{leave.total_days}</td>
                                        <td className="p-4 text-sm text-gray-300 max-w-xs truncate">{leave.reason}</td>
                                        <td className="p-4">{getStatusBadge(leave.status)}</td>
                                        {canApprove && (
                                            <td className="p-4">
                                                {leave.status === 'Pending' && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleApprove(leave.id)}
                                                            className="p-2 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition"
                                                            title="Approve"
                                                        >
                                                            <FiCheckCircle />
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(leave.id)}
                                                            className="p-2 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition"
                                                            title="Reject"
                                                        >
                                                            <FiXCircle />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default LeaveManagement;
