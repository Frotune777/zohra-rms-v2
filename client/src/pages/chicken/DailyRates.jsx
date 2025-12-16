import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';
import { FiCalendar, FiSave } from 'react-icons/fi';

const DailyRates = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [rates, setRates] = useState({
        tandoor_rate: '',
        boiler_rate: '',
        egg_rate: ''
    });
    const [loading, setLoading] = useState(false);
    const [rateStatus, setRateStatus] = useState(null);

    useEffect(() => {
        fetchRates();
    }, [date]);

    const fetchRates = async () => {
        try {
            const res = await api.get(`chicken/rates?date=${date}`);
            if (res.data) {
                setRates({
                    tandoor_rate: res.data.tandoor_rate,
                    boiler_rate: res.data.boiler_rate,
                    egg_rate: res.data.egg_rate
                });
            } else {
                setRates({ tandoor_rate: '', boiler_rate: '', egg_rate: '' });
            }

            // Fetch status
            const statusRes = await api.get(`chicken/rates/status?date=${date}`);
            setRateStatus(statusRes.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to fetch rates');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('chicken/rates', {
                date,
                ...rates
            });
            toast.success('Rates updated successfully');
            fetchRates(); // Refresh to get updated status
        } catch (err) {
            console.error(err);
            toast.error('Failed to update rates');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Daily Market Rates</h1>
                {rateStatus && rateStatus.exists && (
                    <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${rateStatus.status === 'confirmed'
                            ? 'bg-green-500/20 text-green-400 border border-green-500'
                            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500'
                            }`}>
                            {rateStatus.status === 'confirmed' ? '✓ Confirmed' : '⏳ Pending'}
                        </span>
                        {rateStatus.updated_by_name && (
                            <span className="text-sm text-gray-400">
                                Last updated by {rateStatus.updated_by_name}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="glass-panel p-6 max-w-xl mx-auto">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-gray-400 mb-2">Date</label>
                        <div className="relative">
                            <FiCalendar className="absolute left-3 top-3 text-gray-500" />
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:border-zohra-blue"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        <div>
                            <label className="block text-gray-400 mb-2">Tandoor Rate (₹)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={rates.tandoor_rate}
                                onChange={(e) => setRates({ ...rates, tandoor_rate: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-zohra-blue"
                                placeholder="0.00"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-gray-400 mb-2">Boiler Rate (₹)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={rates.boiler_rate}
                                onChange={(e) => setRates({ ...rates, boiler_rate: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-zohra-blue"
                                placeholder="0.00"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-gray-400 mb-2">Egg Rate (₹)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={rates.egg_rate}
                                onChange={(e) => setRates({ ...rates, egg_rate: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-zohra-blue"
                                placeholder="0.00"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-zohra-blue hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
                    >
                        <FiSave />
                        {loading ? 'Saving...' : 'Save Rates'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default DailyRates;
