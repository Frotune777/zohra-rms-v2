import React, { useState, useEffect } from 'react';
import axios from 'axios';
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

    useEffect(() => {
        fetchRates();
    }, [date]);

    const fetchRates = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`http://localhost:5000/api/chicken/rates?date=${date}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data) {
                setRates({
                    tandoor_rate: res.data.tandoor_rate,
                    boiler_rate: res.data.boiler_rate,
                    egg_rate: res.data.egg_rate
                });
            } else {
                setRates({ tandoor_rate: '', boiler_rate: '', egg_rate: '' });
            }
        } catch (err) {
            console.error(err);
            toast.error('Failed to fetch rates');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('http://localhost:5000/api/chicken/rates', {
                date,
                ...rates
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Rates updated successfully');
        } catch (err) {
            console.error(err);
            toast.error('Failed to update rates');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-6">Daily Market Rates</h1>

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
