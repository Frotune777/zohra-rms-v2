import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
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
    const [summary, setSummary] = useState(null);

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
        fetchSummary();
    }, [date, formData.supplier_id]);

    const fetchSuppliers = async () => {
        try {
            const res = await api.get('chicken/suppliers');
            setSuppliers(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSupplierItems = async (supplierId) => {
        try {
            const res = await api.get(`chicken/markups?supplierId=${supplierId}`);
            setAvailableItems(res.data.map(r => r.item_name));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchEntries = async () => {
        try {
            let url = `chicken/bills?date=${date}`;
            if (formData.supplier_id) url += `&supplierId=${formData.supplier_id}`;

            const res = await api.get(url);
            setEntries(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSummary = async () => {
        try {
            let url = `chicken/bills/summary?date=${date}`;
            if (formData.supplier_id) url += `&supplierId=${formData.supplier_id}`;

            const res = await api.get(url);
            setSummary(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await api.post('chicken/bills', {
                date,
                ...formData
            });

            // Check if stock was updated
            if (response.data.stock_updated) {
                toast.success(`✓ Bill entry added and inventory stock updated (+${formData.qty})`);
            } else {
                toast.success('✓ Bill entry added');
                toast('⚠️ Item not found in inventory - stock not updated. Add it in Inventory Management.', {
                    duration: 5000,
                    icon: '⚠️',
                });
            }

            fetchEntries();
            fetchSummary();
            setFormData({ ...formData, item_name: '', qty: '', vendor_rate: '' });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to add entry');
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 h-full w-full flex flex-col overflow-hidden">
            <PageHeader title="Daily Bill Entry" showBack={true} showHome={true} backTo="/chicken" />

            {/* Summary Cards */}
            {summary && summary.summary.total_entries > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                    {/* Total Amount Card */}
                    <div
                        className="glass-panel p-4 cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/20 hover:border-blue-500/30 border border-transparent"
                        onClick={() => {
                            toast.success(`Total: ₹${summary.summary.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
                        }}
                    >
                        <p className="text-gray-400 text-sm mb-1 flex items-center gap-2">
                            <span className="text-blue-400">💰</span>
                            Total Amount
                        </p>
                        <p className="text-2xl font-bold text-white">₹{summary.summary.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-500 mt-1">{summary.summary.total_entries} entries</p>
                        <div className="mt-2 h-1 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>

                    {/* Expected Amount Card */}
                    <div
                        className="glass-panel p-4 cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-green-500/20 hover:border-green-500/30 border border-transparent"
                        onClick={() => {
                            const diff = summary.summary.total_amount - summary.summary.total_expected;
                            toast.success(`Expected: ₹${summary.summary.total_expected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\nDifference: ₹${diff.toFixed(2)}`);
                        }}
                    >
                        <p className="text-gray-400 text-sm mb-1 flex items-center gap-2">
                            <span className="text-green-400">📊</span>
                            Expected Amount
                        </p>
                        <p className="text-2xl font-bold text-white">₹{summary.summary.total_expected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-500 mt-1">Based on rates</p>
                    </div>

                    {/* Variance Card */}
                    <div
                        className={`glass-panel p-4 cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-xl border border-transparent ${summary.summary.total_variance > 0
                            ? 'hover:shadow-red-500/20 hover:border-red-500/30'
                            : 'hover:shadow-green-500/20 hover:border-green-500/30'
                            }`}
                        onClick={() => {
                            const msg = summary.summary.total_variance > 0
                                ? `⚠️ Over budget by ₹${Math.abs(summary.summary.total_variance).toFixed(2)} (${summary.summary.variance_percentage}%)`
                                : `✅ Under budget by ₹${Math.abs(summary.summary.total_variance).toFixed(2)} (${summary.summary.variance_percentage}%)`;
                            toast(msg, {
                                icon: summary.summary.total_variance > 0 ? '⚠️' : '✅',
                                duration: 4000,
                            });
                        }}
                    >
                        <p className="text-gray-400 text-sm mb-1 flex items-center gap-2">
                            <span className={summary.summary.total_variance > 0 ? 'text-red-400' : 'text-green-400'}>
                                {summary.summary.total_variance > 0 ? '📈' : '📉'}
                            </span>
                            Variance
                        </p>
                        <p className={`text-2xl font-bold ${summary.summary.total_variance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {summary.summary.total_variance > 0 ? '+' : ''}₹{summary.summary.total_variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{summary.summary.variance_percentage}%</p>
                    </div>

                    {/* Status Card */}
                    <div
                        className="glass-panel p-4 cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/20 hover:border-purple-500/30 border border-transparent"
                        onClick={() => {
                            toast.success(`✅ ${summary.summary.approved_count} Approved\n⏳ ${summary.summary.pending_count} Pending`);
                        }}
                    >
                        <p className="text-gray-400 text-sm mb-1 flex items-center gap-2">
                            <span className="text-purple-400">📋</span>
                            Status
                        </p>
                        <div className="flex gap-2 mt-2">
                            <span className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-sm font-semibold transition-all hover:bg-green-500/30">
                                ✓ {summary.summary.approved_count}
                            </span>
                            <span className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm font-semibold transition-all hover:bg-yellow-500/30">
                                ⏳ {summary.summary.pending_count}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Click for details</p>
                    </div>
                </div>
            )}

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
