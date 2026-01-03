import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { FiSend, FiUser, FiDollarSign, FiArrowRight, FiArrowLeft, FiShield } from 'react-icons/fi';
import toast from 'react-hot-toast';

const MoneyTransfer = () => {
    const { userRole, user } = useAuth();
    const [users, setUsers] = useState([]);
    const [direction, setDirection] = useState('safe-to-user'); // or 'user-to-safe'
    const [formData, setFormData] = useState({
        targetUserId: '',
        amount: '',
        description: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await api.get('/auth/users');
            setUsers(res.data);
        } catch (err) {
            console.error('Failed to fetch users', err);
            toast.error('Could not load user list');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.targetUserId || !formData.amount) {
            return toast.error('Please select user and amount');
        }

        setLoading(true);
        try {
            if (direction === 'safe-to-user') {
                await api.post('/finance/transfer/safe-to-user', {
                    toUserId: formData.targetUserId,
                    amount: parseFloat(formData.amount),
                    description: formData.description
                });
                toast.success('Funds Transferred to User Wallet');
            } else {
                await api.post('/finance/transfer/user-to-safe', {
                    fromUserId: formData.targetUserId, // In this mode, target is the sender (User)
                    amount: parseFloat(formData.amount),
                    description: formData.description
                });
                toast.success('Funds Returned to Main Safe');
            }
            setFormData({ ...formData, amount: '', description: '' });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Transfer Failed');
        } finally {
            setLoading(false);
        }
    };

    const isOwner = userRole === 'owner';
    // If not owner/manager, maybe limit options? For now, open to all but backend protects specific actions if needed.
    // Actually, simple staff shouldn't access this page probably? 
    // Let's assume this page is for Managers/Owners.

    return (
        <div className="p-6 h-full flex flex-col">
            <PageHeader title="Internal Money Transfer" showBack={true} />

            <div className="max-w-2xl mx-auto w-full flex-1">
                <div className="glass-panel p-6 rounded-xl">
                    <div className="flex justify-center mb-8 gap-4">
                        <button
                            onClick={() => setDirection('safe-to-user')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition w-40 ${direction === 'safe-to-user'
                                    ? 'border-zohra-blue bg-zohra-blue/10 text-white'
                                    : 'border-white/10 text-gray-400 hover:bg-white/5'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <FiShield className="text-xl" />
                                <FiArrowRight />
                                <FiUser className="text-xl" />
                            </div>
                            <span className="text-sm font-bold">Safe → User</span>
                            <span className="text-xs text-gray-500">Issue Cash</span>
                        </button>

                        <button
                            onClick={() => setDirection('user-to-safe')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition w-40 ${direction === 'user-to-safe'
                                    ? 'border-green-500 bg-green-500/10 text-white'
                                    : 'border-white/10 text-gray-400 hover:bg-white/5'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <FiUser className="text-xl" />
                                <FiArrowRight />
                                <FiShield className="text-xl" />
                            </div>
                            <span className="text-sm font-bold">User → Safe</span>
                            <span className="text-xs text-gray-500">Return Cash</span>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                {direction === 'safe-to-user' ? 'Transfer To (Recipient)' : 'Received From (Sender)'}
                            </label>
                            <div className="relative">
                                <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <select
                                    value={formData.targetUserId}
                                    onChange={(e) => setFormData({ ...formData, targetUserId: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-zohra-blue appearance-none"
                                    required
                                >
                                    <option value="" className="bg-gray-800">Select Staff Member</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id} className="bg-gray-800">
                                            {u.full_name} ({u.role})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Amount (₹)</label>
                            <div className="relative">
                                <FiDollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    value={formData.amount}
                                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-zohra-blue font-mono text-lg"
                                    placeholder="0.00"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Description / Reason</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-zohra-blue"
                                placeholder={direction === 'safe-to-user' ? "e.g., Shopping Advance" : "e.g., Return remaining change"}
                                rows="3"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition ${direction === 'safe-to-user'
                                    ? 'bg-zohra-blue hover:bg-blue-600'
                                    : 'bg-green-600 hover:bg-green-500'
                                }`}
                        >
                            {loading ? 'Processing...' : (
                                <>
                                    <FiSend />
                                    {direction === 'safe-to-user' ? 'Confirm Transfer' : 'Confirm Receipt'}
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default MoneyTransfer;
