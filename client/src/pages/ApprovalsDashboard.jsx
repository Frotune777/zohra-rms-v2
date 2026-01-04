import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import { toast } from 'react-hot-toast';
import { FiCheck, FiX, FiClock, FiDollarSign, FiShoppingBag, FiUser } from 'react-icons/fi';

const ApprovalsDashboard = () => {
    const [loading, setLoading] = useState(true);
    const [pendingBills, setPendingBills] = useState([]);
    const [advanceRequests, setAdvanceRequests] = useState([]);
    const [activeTab, setActiveTab] = useState('all');

    useEffect(() => {
        fetchPendingItems();
    }, []);

    const fetchPendingItems = async () => {
        setLoading(true);
        try {
            const [billsRes, advancesRes] = await Promise.all([
                api.get('chicken/bills?status=Pending'),
                api.get('employees/payroll/requests')
            ]);

            setPendingBills(billsRes.data);
            // Filter advances on frontend since the endpoint returns all
            setAdvanceRequests(advancesRes.data.filter(r => r.status === 'Pending'));
        } catch (error) {
            console.error('Failed to load pending items:', error);
            toast.error('Failed to load pending approvals');
        } finally {
            setLoading(false);
        }
    };

    const approveBill = async (id) => {
        try {
            await api.patch(`chicken/bills/${id}/status`, { status: 'Approved' });
            toast.success('Bill approved');
            setPendingBills(prev => prev.filter(b => b.id !== id));
        } catch (error) {
            toast.error('Failed to approve bill');
        }
    };

    const rejectBill = async (id) => {
        // Assuming we have a reject endpoint or just use status update
        // For now, let's assume we can set status to Rejected
        if (!window.confirm('Are you sure you want to reject this bill?')) return;

        try {
            await api.patch(`chicken/bills/${id}/status`, { status: 'Rejected' });
            toast.success('Bill rejected');
            setPendingBills(prev => prev.filter(b => b.id !== id));
        } catch (error) {
            toast.error('Failed to reject bill');
        }
    };

    const approveAdvance = async (id) => {
        try {
            await api.post(`employees/payroll/requests/${id}/approve`);
            toast.success('Advance request approved');
            setAdvanceRequests(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            toast.error('Failed to approve request');
        }
    };

    const rejectAdvance = async (id) => {
        const reason = window.prompt('Enter rejection reason:');
        if (reason === null) return;

        try {
            await api.post(`employees/payroll/requests/${id}/reject`, { reason });
            toast.success('Advance request rejected');
            setAdvanceRequests(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            toast.error('Failed to reject request');
        }
    };

    const totalPending = pendingBills.length + advanceRequests.length;

    return (
        <div className="p-6 max-w-7xl mx-auto h-full overflow-y-auto">
            <PageHeader
                title="Pending Approvals"
                subtitle={`${totalPending} items awaiting review`}
                showBack={true}
            />

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="glass-panel p-6 rounded-xl flex items-center justify-between border-l-4 border-yellow-500">
                    <div>
                        <p className="text-gray-400 text-sm uppercase tracking-wider">Total Pending</p>
                        <h2 className="text-3xl font-bold text-white mt-1">{totalPending}</h2>
                    </div>
                    <div className="p-3 bg-yellow-500/20 rounded-full text-yellow-400">
                        <FiClock size={24} />
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-xl flex items-center justify-between">
                    <div>
                        <p className="text-gray-400 text-sm uppercase tracking-wider">Pending Bills</p>
                        <h2 className="text-3xl font-bold text-white mt-1">{pendingBills.length}</h2>
                    </div>
                    <div className="p-3 bg-blue-500/20 rounded-full text-blue-400">
                        <FiShoppingBag size={24} />
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-xl flex items-center justify-between">
                    <div>
                        <p className="text-gray-400 text-sm uppercase tracking-wider">Advance Requests</p>
                        <h2 className="text-3xl font-bold text-white mt-1">{advanceRequests.length}</h2>
                    </div>
                    <div className="p-3 bg-purple-500/20 rounded-full text-purple-400">
                        <FiUser size={24} />
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-white/10">
                <button
                    onClick={() => setActiveTab('all')}
                    className={`pb-3 px-2 text-sm font-medium transition ${activeTab === 'all'
                        ? 'text-zohra-blue border-b-2 border-zohra-blue'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    All Items
                </button>
                <button
                    onClick={() => setActiveTab('bills')}
                    className={`pb-3 px-2 text-sm font-medium transition ${activeTab === 'bills'
                        ? 'text-zohra-blue border-b-2 border-zohra-blue'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    Vendor Bills ({pendingBills.length})
                </button>
                <button
                    onClick={() => setActiveTab('advances')}
                    className={`pb-3 px-2 text-sm font-medium transition ${activeTab === 'advances'
                        ? 'text-zohra-blue border-b-2 border-zohra-blue'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    Advance Requests ({advanceRequests.length})
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading pending items...</div>
            ) : (
                <div className="space-y-8">
                    {/* Chicken Bills Section */}
                    {(activeTab === 'all' || activeTab === 'bills') && pendingBills.length > 0 && (
                        <div className="glass-panel rounded-xl overflow-hidden">
                            <div className="p-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <FiShoppingBag className="text-blue-400" /> Vendor Bills
                                </h3>
                                <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded-full font-bold">
                                    {pendingBills.length} Pending
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-white/5 text-gray-400">
                                        <tr>
                                            <th className="p-4">Date</th>
                                            <th className="p-4">Supplier</th>
                                            <th className="p-4">Item</th>
                                            <th className="p-4 text-right">Qty</th>
                                            <th className="p-4 text-right">Amount</th>
                                            <th className="p-4 text-right">Variance</th>
                                            <th className="p-4 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {pendingBills.map(bill => (
                                            <tr key={bill.id} className="hover:bg-white/5 transition">
                                                <td className="p-4 text-white">{new Date(bill.date).toLocaleDateString()}</td>
                                                <td className="p-4 text-gray-300">{bill.supplier_name}</td>
                                                <td className="p-4 text-gray-300">{bill.item_name}</td>
                                                <td className="p-4 text-right text-gray-300">{bill.qty}</td>
                                                <td className="p-4 text-right font-bold text-white">₹{(bill.qty * bill.vendor_rate).toFixed(2)}</td>
                                                <td className={`p-4 text-right ${parseFloat(bill.variance) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                    {parseFloat(bill.variance) > 0 ? '+' : ''}{parseFloat(bill.variance).toFixed(2)}
                                                </td>
                                                <td className="p-4 flex justify-center gap-2">
                                                    <button
                                                        onClick={() => approveBill(bill.id)}
                                                        className="p-1.5 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition"
                                                        title="Approve"
                                                    >
                                                        <FiCheck size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => rejectBill(bill.id)}
                                                        className="p-1.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition"
                                                        title="Reject"
                                                    >
                                                        <FiX size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Advance Requests Section */}
                    {(activeTab === 'all' || activeTab === 'advances') && advanceRequests.length > 0 && (
                        <div className="glass-panel rounded-xl overflow-hidden">
                            <div className="p-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <FiUser className="text-purple-400" /> Advance Requests
                                </h3>
                                <span className="bg-purple-500/20 text-purple-400 text-xs px-2 py-1 rounded-full font-bold">
                                    {advanceRequests.length} Pending
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-white/5 text-gray-400">
                                        <tr>
                                            <th className="p-4">Date</th>
                                            <th className="p-4">Employee</th>
                                            <th className="p-4">Type</th>
                                            <th className="p-4">Reason</th>
                                            <th className="p-4 text-right">Amount</th>
                                            <th className="p-4 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {advanceRequests.map(req => (
                                            <tr key={req.id} className="hover:bg-white/5 transition">
                                                <td className="p-4 text-white">{new Date(req.requested_at).toLocaleDateString()}</td>
                                                <td className="p-4">
                                                    <div>
                                                        <p className="text-white font-medium">{req.employee_name}</p>
                                                        <p className="text-xs text-gray-500">{req.role}</p>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${req.type === 'Advance' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                                                        }`}>
                                                        {req.type}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-gray-300 max-w-xs truncate" title={req.reason}>
                                                    {req.reason || '-'}
                                                </td>
                                                <td className="p-4 text-right font-bold text-white">₹{parseFloat(req.amount).toFixed(2)}</td>
                                                <td className="p-4 flex justify-center gap-2">
                                                    <button
                                                        onClick={() => approveAdvance(req.id)}
                                                        className="p-1.5 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition"
                                                        title="Approve"
                                                    >
                                                        <FiCheck size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => rejectAdvance(req.id)}
                                                        className="p-1.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition"
                                                        title="Reject"
                                                    >
                                                        <FiX size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {totalPending === 0 && (
                        <div className="glass-panel p-12 text-center rounded-xl">
                            <FiCheck className="mx-auto text-green-500 mb-4" size={48} />
                            <h3 className="text-xl font-bold text-white mb-2">All Caught Up!</h3>
                            <p className="text-gray-400">There are no pending items requiring your approval.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ApprovalsDashboard;
