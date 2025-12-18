import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import { toast } from 'react-hot-toast';
import { FiCalendar, FiSave } from 'react-icons/fi';
import RatesCalendar from '../../components/RatesCalendar';

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
            <PageHeader title="Daily Market Rates" showBack={true} showHome={true} backTo="/chicken" />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Calendar */}
                <div>
                    <RatesCalendar
                        onDateSelect={setDate}
                        selectedDate={date}
                    />
                </div>

                {/* Form */}
                <div className="glass-panel p-6">
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
        </div>
    );
};

export default DailyRates;
