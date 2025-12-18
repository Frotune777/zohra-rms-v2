import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { FiDollarSign, FiSave, FiX, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';

const DayClosureModal = ({ date, type = 'Counter', onClose, onSuccess }) => {
    const [summary, setSummary] = useState(null);
    const [actualBalance, setActualBalance] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchSummary();
    }, [date]);

    const fetchSummary = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/finance/daily-balance/${date}?type=${type}`);
            setSummary(res.data);
        } catch (err) {
            console.error(err);
            setError('Failed to load balance summary');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (actualBalance === '' || isNaN(actualBalance)) {
            setError('Please enter a valid actual balance');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            const res = await api.post('/finance/daily-balance/close', {
                date,
                type,
                actualClosingBalance: parseFloat(actualBalance)
            });

            if (res.data.success) {
                onSuccess(res.data);
                onClose();
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Failed to close day');
        } finally {
            setSubmitting(false);
        }
    };

    const variance = summary ? (parseFloat(actualBalance || 0) - parseFloat(summary.closing_balance || 0)) : 0;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                    <FiX />
                </button>

                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <FiDollarSign className="text-blue-500" /> Daily Cash Closure
                </h3>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <FiRefreshCw className="animate-spin text-blue-500 text-3xl" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                                <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Expected Balance</p>
                                <p className="text-xl font-bold text-white font-mono">₹{parseFloat(summary?.closing_balance || 0).toFixed(2)}</p>
                            </div>
                            <div className={`p-3 rounded-lg border ${variance === 0 ? 'bg-green-500/10 border-green-500/20' : variance > 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Variance</p>
                                <p className={`text-xl font-bold font-mono ${variance === 0 ? 'text-green-400' : variance > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                    {variance > 0 ? '+' : ''}₹{variance.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Actual Cash in Drawer</label>
                            <input
                                type="number"
                                value={actualBalance}
                                onChange={(e) => setActualBalance(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-gray-800 border border-white/10 rounded-lg p-3 text-white text-2xl font-mono text-center focus:outline-none focus:border-blue-500"
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded-lg flex items-center gap-2 text-sm italic">
                                <FiAlertCircle /> {error}
                            </div>
                        )}

                        <div className="pt-4 border-t border-white/10">
                            <button
                                onClick={handleSave}
                                disabled={submitting}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
                            >
                                {submitting ? <FiRefreshCw className="animate-spin" /> : <FiSave />}
                                {submitting ? 'Closing Day...' : 'Post Variance & Close Day'}
                            </button>
                            <p className="text-center text-[10px] text-gray-500 mt-3">
                                Closing this day will lock all transactions and post any variance to the General Ledger.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DayClosureModal;
