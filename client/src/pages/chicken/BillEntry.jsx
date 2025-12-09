import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { FiPlus, FiCalendar } from 'react-icons/fi';

const BillEntry = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [suppliers, setSuppliers] = useState([]);
    const [entries, setEntries] = useState([]);

    // Form State
    const [formData, setFormData] = useState({
        supplier_id: '',
        item_name: '',
        qty: '',
        vendor_rate: ''
    });

    // Available items for selected supplier
    const [availableItems, setAvailableItems] = useState([]);

    useEffect(() => {
        fetchSuppliers();
    }, []);

    useEffect(() => {
        if (formData.supplier_id) {
            fetchSupplierItems(formData.supplier_id);
        }
    }, [formData.supplier_id]);

    useEffect(() => {
        fetchEntries();
    }, [date, formData.supplier_id]);

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

    const fetchSupplierItems = async (supplierId) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`http://localhost:5000/api/chicken/markups?supplierId=${supplierId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAvailableItems(res.data.map(r => r.item_name));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchEntries = async () => {
        try {
            const token = localStorage.getItem('token');
            let url = `http://localhost:5000/api/chicken/bills?date=${date}`;
            if (formData.supplier_id) url += `&supplierId=${formData.supplier_id}`;

            const res = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEntries(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            await axios.post('http://localhost:5000/api/chicken/bills', {
                date,
                ...formData
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Bill entry added');
            fetchEntries();
            setFormData({ ...formData, item_name: '', qty: '', vendor_rate: '' });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to add entry');
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-6">Daily Bill Entry</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Entry Form */}
                <div className="glass-panel p-6 h-fit">
                    <h2 className="text-lg font-bold text-white mb-4">New Entry</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-gray-400 mb-1 text-sm">Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-gray-400 mb-1 text-sm">Supplier</label>
                            <select
                                value={formData.supplier_id}
                                onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                required
                            >
                                <option value="" className="bg-gray-800 text-white">Select Supplier</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id} className="bg-gray-800 text-white">{s.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <div>
                                <label className="block text-gray-400 mb-1 text-sm">Item</label>
                                <select
                                    value={formData.item_name}
                                    onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                    required
                                >
                                    <option value="" className="bg-gray-800 text-white">Select Item</option>
                                    {availableItems.map((item, idx) => (
                                        <option key={idx} value={item} className="bg-gray-800 text-white">{item}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-gray-400 mb-1 text-sm">Quantity</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.qty}
                                    onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                    placeholder="Qty"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-gray-400 mb-1 text-sm">Vendor Rate</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.vendor_rate}
                                    onChange={(e) => setFormData({ ...formData, vendor_rate: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                    placeholder="₹"
                                    required
                                />
                            </div>
                        </div>

                        <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-400">Calculated Total:</span>
                                <span className="font-bold text-white">
                                    ₹{(parseFloat(formData.qty || 0) * parseFloat(formData.vendor_rate || 0)).toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <button type="submit" className="w-full bg-zohra-blue hover:bg-blue-600 p-3 rounded-lg text-white font-bold flex justify-center items-center gap-2">
                            <FiPlus /> Add Entry
                        </button>
                    </form>
                </div>

                {/* Entries Table */}
                <div className="lg:col-span-2 glass-panel p-6 overflow-x-auto">
                    <h2 className="text-lg font-bold text-white mb-4">Entries for {date}</h2>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-gray-400 border-b border-white/10">
                                <th className="p-3">Supplier</th>
                                <th className="p-3">Item</th>
                                <th className="p-3 text-right">Qty</th>
                                <th className="p-3 text-right">Rate</th>
                                <th className="p-3 text-right">Expected</th>
                                <th className="p-3 text-right">Variance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(entry => (
                                <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="p-3 text-white">{entry.supplier_name}</td>
                                    <td className="p-3 text-white">{entry.item_name}</td>
                                    <td className="p-3 text-right text-white">{entry.qty}</td>
                                    <td className="p-3 text-right text-white">₹{entry.vendor_rate}</td>
                                    <td className="p-3 text-right text-gray-400">₹{entry.expected_rate}</td>
                                    <td className={`p-3 text-right font-bold ${parseFloat(entry.variance) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                        {parseFloat(entry.variance) > 0 ? '+' : ''}{parseFloat(entry.variance).toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                            {entries.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="p-8 text-center text-gray-500">No entries found for this date.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BillEntry;
