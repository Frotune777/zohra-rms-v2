import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { FiSend, FiUser, FiDollarSign, FiArrowRight, FiShield, FiUsers } from 'react-icons/fi';
import toast from 'react-hot-toast';

const MoneyTransfer = () => {
    const { userRole } = useAuth();
    const [users, setUsers] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [direction, setDirection] = useState('safe-to-user'); // or 'user-to-safe'

    // Form State
    const [recipientType, setRecipientType] = useState('user'); // 'user' or 'employee'
    const [targetId, setTargetId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [availableModes, setAvailableModes] = useState([]);

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const [usersRes, empRes, modesRes] = await Promise.all([
                api.get('/auth/users'),
                api.get('/employees'),
                api.get('/finance/payment-modes')
            ]);
            setUsers(usersRes.data);
            setEmployees(empRes.data);
            // Extract distinct names from payment modes, prioritize Cash/Bank
            const modes = modesRes.data.map(m => m.name);
            setAvailableModes(modes.length > 0 ? modes : ['Cash', 'Bank Transfer', 'UPI']);
        } catch (err) {
            console.error('Failed to fetch data', err);
            toast.error('Could not load system data');
            setAvailableModes(['Cash', 'Bank Transfer', 'UPI']);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!targetId || !amount) {
            return toast.error('Please select recipient and amount');
        }

        setLoading(true);
        try {
            const payload = {
                amount: parseFloat(amount),
                description,
                mode: paymentMode,
                targetType: recipientType
            };

            if (direction === 'safe-to-user') {
                await api.post('/finance/transfer/safe-to-user', {
                    ...payload,
                    toUserId: targetId // Controller expects toUserId for both types effectively
                });
                toast.success(`Funds Transferred to ${recipientType === 'user' ? 'User' : 'Staff Member'}`);
            } else {
                await api.post('/finance/transfer/user-to-safe', {
                    ...payload,
                    fromUserId: targetId
                });
                toast.success('Funds Returned to Main Safe');
            }
            // Reset Amount only
            setAmount('');
            setDescription('');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Transfer Failed');
        } finally {
            setLoading(false);
        }
    };

    const listToDisplay = recipientType === 'user' ? users : employees;

    return (
        <div className="p-6 h-full flex flex-col">
            <PageHeader title="Internal Money Transfer" showBack={true} />

            <div className="max-w-2xl mx-auto w-full flex-1">
                <div className="glass-panel p-6 rounded-xl">

                    {/* Direction Toggle */}
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
                            <span className="text-sm font-bold">Safe → Recipient</span>
                            <span className="text-xs text-gray-500">Issue Funds</span>
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
                            <span className="text-sm font-bold">Recipient → Safe</span>
                            <span className="text-xs text-gray-500">Return Funds</span>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* Type Toggle */}
                        <div className="bg-white/5 p-1 rounded-lg flex items-center mb-4">
                            <button
                                type="button"
                                onClick={() => { setRecipientType('user'); setTargetId(''); }}
                                className={`flex-1 py-2 rounded-md text-sm font-bold transition flex items-center justify-center gap-2 ${recipientType === 'user' ? 'bg-zohra-blue text-white' : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                <FiUser /> System User (Admin/Manager)
                            </button>
                            <button
                                type="button"
                                onClick={() => { setRecipientType('employee'); setTargetId(''); }}
                                className={`flex-1 py-2 rounded-md text-sm font-bold transition flex items-center justify-center gap-2 ${recipientType === 'employee' ? 'bg-zohra-blue text-white' : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                <FiUsers /> Staff Member
                            </button>
                        </div>

                        {/* Recipient Dropdown */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                {direction === 'safe-to-user' ? 'Transfer To' : 'Received From'}
                            </label>
                            <div className="relative">
                                <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <select
                                    value={targetId}
                                    onChange={(e) => setTargetId(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-zohra-blue appearance-none cursor-pointer"
                                    required
                                >
                                    <option value="" className="bg-gray-800">Select {recipientType === 'user' ? 'User' : 'Staff Member'}</option>
                                    {listToDisplay.map(item => (
                                        <option key={item.id} value={item.id} className="bg-gray-800">
                                            {item.full_name} ({item.role || item.position})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Payment Mode Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Payment Mode (Funding Source)</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {availableModes.map(mode => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setPaymentMode(mode)}
                                        className={`py-2 px-3 rounded-lg border text-sm font-bold transition capitalize ${paymentMode === mode
                                                ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                                                : 'border-white/10 text-gray-400 hover:bg-white/5'
                                            }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Amount (₹)</label>
                                <div className="relative">
                                    <FiDollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="number"
                                        min="1"
                                        step="0.01"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-zohra-blue font-mono text-lg"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Description / Reason</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-zohra-blue"
                                placeholder={direction === 'safe-to-user' ? "e.g., Shopping Advance, Salary Advance" : "e.g., Return remaining change"}
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
