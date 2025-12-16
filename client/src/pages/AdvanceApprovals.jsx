import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { FiCheck, FiX, FiAlertCircle, FiClock } from 'react-icons/fi';
import { toast } from 'react-hot-toast';

const AdvanceApprovals = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const { userRole } = useAuth();

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const res = await api.get('employees/payroll/requests');
            setRequests(res.data);
            setError('');
        } catch (err) {
            console.error(err);
            setError('Failed to load requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const handleApprove = async (id) => {
        if (!window.confirm('Approve this request? This will update the ledger immediately.')) return;
        try {
            await api.post(`employees/payroll/requests/${id}/approve`);
            toast.success('Request Approved');
            fetchRequests(); // Refresh list
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to approve');
        }
    };

    const handleReject = async (id) => {
        const reason = window.prompt('Enter rejection reason:');
        if (!reason) return;

        try {
            await api.post(`employees/payroll/requests/${id}/reject`, { reason });
            toast.error('Request Rejected');
            fetchRequests();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to reject');
        }
    };

    if (loading) return <div className="p-8 text-gray-400">Loading requests...</div>;

    return (
        <div className="p-8 h-full w-full flex flex-col overflow-hidden bg-gradient-to-br from-midnight to-midnight/95">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-zohra-blue mb-2">Advance Approvals</h2>
                    <p className="text-xs text-gray-400">Review pending advance and repayment requests</p>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500 rounded-lg mb-4">
                    <FiAlertCircle className="text-red-500" />
                    <p className="text-red-200">{error}</p>
                </div>
            )}

            <div className="glass-panel rounded-xl overflow-hidden flex-1 flex flex-col">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white/5 text-gray-400 border-b border-white/10 sticky top-0">
                            <tr>
                                <th className="p-4 font-semibold">Date</th>
                                <th className="p-4 font-semibold">Employee</th>
                                <th className="p-4 font-semibold">Type</th>
                                <th className="p-4 font-semibold">Amount</th>
                                <th className="p-4 font-semibold">Requested By</th>
                                <th className="p-4 font-semibold">Reason</th>
                                <th className="p-4 font-semibold">Status</th>
                                <th className="p-4 font-semibold text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-gray-500">No pending requests found.</td>
                                </tr>
                            ) : (
                                requests.map((req) => (
                                    <tr key={req.id} className="border-b border-white/5 hover:bg-white/5 transition">
                                        <td className="p-4 text-gray-400 text-sm">
                                            {new Date(req.requested_at).toLocaleDateString('en-IN')}
                                            <span className="block text-xs text-gray-500">{new Date(req.requested_at).toLocaleTimeString()}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="font-semibold text-white">{req.employee_name}</div>
                                            <div className="text-xs text-gray-500">{req.role}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${req.type === 'Advance' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'
                                                }`}>
                                                {req.type}
                                            </span>
                                        </td>
                                        <td className="p-4 font-bold text-white">₹{parseFloat(req.amount).toFixed(2)}</td>
                                        <td className="p-4 text-sm text-gray-300">{req.requester_name || 'Unknown'}</td>
                                        <td className="p-4 text-sm text-gray-400 italic">{req.reason || '-'}</td>
                                        <td className="p-4">
                                            <span className={`flex items-center gap-1 px-2 py-1 rounded w-fit text-xs ${req.status === 'Pending' ? 'bg-yellow-500/20 text-yellow-500' :
                                                    req.status === 'Approved' ? 'bg-green-500/20 text-green-500' :
                                                        'bg-red-500/20 text-red-500'
                                                }`}>
                                                {req.status === 'Pending' && <FiClock />}
                                                {req.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            {req.status === 'Pending' && (userRole === 'manager' || userRole === 'owner') && (
                                                <div className="flex gap-2 justify-end">
                                                    <button
                                                        onClick={() => handleApprove(req.id)}
                                                        className="p-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded transition"
                                                        title="Approve"
                                                    >
                                                        <FiCheck />
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(req.id)}
                                                        className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition"
                                                        title="Reject"
                                                    >
                                                        <FiX />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
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

export default AdvanceApprovals;
