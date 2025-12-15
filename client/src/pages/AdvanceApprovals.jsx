import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { FiDollarSign, FiCheckCircle, FiXCircle, FiClock, FiPlus, FiUser, FiCalendar } from 'react-icons/fi';

const AdvanceApprovals = () => {
    const [requests, setRequests] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('Pending');
    const { userRole } = useAuth();

    const canApprove = userRole === 'manager' || userRole === 'owner';

    useEffect(() => {
        fetchData();
    }, [filter]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [requestsRes, employeesRes] = await Promise.all([
                api.get(`/advance-requests?status=${filter}`),
                api.get('/employees')
            ]);
            setRequests(requestsRes.data);
            setEmployees(employeesRes.data);
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id, requestedAmount) => {
        const approvedAmount = window.prompt(`Enter approved amount (Requested: ₹${requestedAmount}):`, requestedAmount);
        if (!approvedAmount) return;

        const months = window.prompt('Repayment period (months):', '3');
        if (!months) return;

        try {
            await api.put(`/advance-requests/${id}/approve`, {
                approved_amount: parseFloat(approvedAmount),
                repayment_months: parseInt(months)
            });
            fetchData();
            alert('Advance request approved successfully!');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to approve request');
        }
    };

    const handleReject = async (id) => {
        const reason = window.prompt('Enter rejection reason:');
        if (!reason) return;

        try {
            await api.put(`/advance-requests/${id}/reject`, { rejection_reason: reason });
            fetchData();
            alert('Advance request rejected');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to reject request');
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            Pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500',
            Approved: 'bg-green-500/20 text-green-300 border-green-500',
            Rejected: 'bg-red-500/20 text-red-300 border-red-500',
            Disbursed: 'bg-blue-500/20 text-blue-300 border-blue-500'
        };
        const icons = {
            Pending: FiClock,
            Approved: FiCheckCircle,
            Rejected: FiXCircle,
            Disbursed: FiDollarSign
        };
        const Icon = icons[status];
        return (
            <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}>
                <Icon size={14} />
                {status}
            </span>
        );
    };

    const getUrgencyBadge = (urgency) => {
        const styles = {
            Urgent: 'bg-red-500/20 text-red-300',
            Normal: 'bg-blue-500/20 text-blue-300',
            Low: 'bg-gray-500/20 text-gray-300'
        };
        return (
            <span className={`px-2 py-1 rounded text-xs ${styles[urgency]}`}>
                {urgency}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-gray-400">Loading advance requests...</p>
            </div>
        );
    }

    return (
        <div className="p-8 h-full w-full flex flex-col overflow-hidden bg-gradient-to-br from-midnight to-midnight/95">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-zohra-blue mb-2">Advance Approvals</h2>
                    <p className="text-xs text-gray-400">Review and approve employee advance requests</p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6">
                {['Pending', 'Approved', 'Rejected', 'Disbursed'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === f
                                ? 'bg-zohra-blue text-white'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Requests Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-auto flex-1">
                {requests.length === 0 ? (
                    <div className="col-span-2 glass-panel p-8 rounded-xl text-center text-gray-400">
                        No {filter.toLowerCase()} requests found
                    </div>
                ) : (
                    requests.map((request) => (
                        <div key={request.id} className="glass-panel p-6 rounded-xl space-y-4">
                            {/* Employee Info */}
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-zohra-blue/20 rounded-full flex items-center justify-center">
                                        <FiUser className="text-zohra-blue" size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{request.full_name}</h3>
                                        <p className="text-sm text-gray-400">{request.employee_code} • {request.position}</p>
                                    </div>
                                </div>
                                {getStatusBadge(request.status)}
                            </div>

                            {/* Request Details */}
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                                <div>
                                    <p className="text-xs text-gray-400 mb-1">Requested Amount</p>
                                    <p className="text-2xl font-bold text-zohra-blue">₹{parseFloat(request.requested_amount).toFixed(2)}</p>
                                </div>
                                {request.approved_amount && (
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1">Approved Amount</p>
                                        <p className="text-2xl font-bold text-green-400">₹{parseFloat(request.approved_amount).toFixed(2)}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs text-gray-400 mb-1">Urgency</p>
                                    {getUrgencyBadge(request.urgency)}
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 mb-1">Repayment Period</p>
                                    <p className="text-sm font-semibold">{request.repayment_months} months</p>
                                </div>
                                {request.monthly_deduction && (
                                    <div className="col-span-2">
                                        <p className="text-xs text-gray-400 mb-1">Monthly Deduction</p>
                                        <p className="text-lg font-bold">₹{parseFloat(request.monthly_deduction).toFixed(2)}</p>
                                    </div>
                                )}
                            </div>

                            {/* Reason */}
                            <div className="pt-4 border-t border-white/10">
                                <p className="text-xs text-gray-400 mb-2">Reason</p>
                                <p className="text-sm text-gray-300">{request.reason}</p>
                            </div>

                            {/* Request Date */}
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                                <FiCalendar size={12} />
                                <span>Requested on {new Date(request.requested_at).toLocaleDateString()}</span>
                            </div>

                            {/* Approval Info */}
                            {request.approved_by_name && (
                                <div className="pt-4 border-t border-white/10 text-xs text-gray-400">
                                    {request.status === 'Approved' && (
                                        <p>Approved by {request.approved_by_name} on {new Date(request.approved_at).toLocaleDateString()}</p>
                                    )}
                                    {request.status === 'Rejected' && (
                                        <>
                                            <p>Rejected by {request.approved_by_name} on {new Date(request.approved_at).toLocaleDateString()}</p>
                                            {request.rejection_reason && (
                                                <p className="text-red-300 mt-1">Reason: {request.rejection_reason}</p>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            {canApprove && request.status === 'Pending' && (
                                <div className="flex gap-3 pt-4 border-t border-white/10">
                                    <button
                                        onClick={() => handleApprove(request.id, request.requested_amount)}
                                        className="flex-1 flex items-center justify-center gap-2 bg-green-500/20 text-green-300 px-4 py-2 rounded-lg hover:bg-green-500/30 transition"
                                    >
                                        <FiCheckCircle /> Approve
                                    </button>
                                    <button
                                        onClick={() => handleReject(request.id)}
                                        className="flex-1 flex items-center justify-center gap-2 bg-red-500/20 text-red-300 px-4 py-2 rounded-lg hover:bg-red-500/30 transition"
                                    >
                                        <FiXCircle /> Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AdvanceApprovals;
