import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { FiDollarSign, FiSave } from 'react-icons/fi';

const PaymentEntry = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [formData, setFormData] = useState({
        supplierId: '',
        amount: '',
        paymentMode: 'Cash',
        details: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('http://localhost:5000/api/chicken/suppliers', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuppliers(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('http://localhost:5000/api/finance/payment', formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Payment recorded successfully');
            setFormData({ supplierId: '', amount: '', paymentMode: 'Cash', details: '' });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to record payment');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-6">Vendor Payment Entry</h1>

            <div className="glass-panel p-6 max-w-2xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-gray-400 mb-2">Select Supplier</label>
                        <select
                            value={formData.supplierId}
                            onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white"
                            required
                        >
                            <option value="" className="bg-gray-800 text-white">-- Select Supplier --</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.id} className="bg-gray-800 text-white">{s.name} ({s.vendor_type})</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-gray-400 mb-2">Amount (₹)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-gray-400 mb-2">Payment Mode</label>
                            <select
                                value={formData.paymentMode}
                                onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white"
                            >
                                <option value="Cash" className="bg-gray-800 text-white">Cash</option>
                                <option value="UPI" className="bg-gray-800 text-white">UPI</option>
                                <option value="Bank Transfer" className="bg-gray-800 text-white">Bank Transfer</option>
                                <option value="Cheque" className="bg-gray-800 text-white">Cheque</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-gray-400 mb-2">Details / Remarks</label>
                        <textarea
                            value={formData.details}
                            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white h-24"
                            placeholder="Transaction ID, Cheque No, etc."
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-700 p-4 rounded-lg text-white font-bold flex justify-center items-center gap-2"
                    >
                        <FiDollarSign /> {loading ? 'Processing...' : 'Record Payment'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PaymentEntry;
