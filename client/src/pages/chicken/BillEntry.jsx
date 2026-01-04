import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import { toast } from 'react-hot-toast';
import { FiPlus, FiCalendar, FiTrash2, FiSave } from 'react-icons/fi';

const BillEntry = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [suppliers, setSuppliers] = useState([]);
    const [entries, setEntries] = useState([]);
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [availableItems, setAvailableItems] = useState([]);
    const [summary, setSummary] = useState(null);

    // Bulk entry rows
    const [bulkRows, setBulkRows] = useState([
        { id: 1, item_name: '', qty: '', vendor_rate: '' }
    ]);

    useEffect(() => {
        fetchSuppliers();
    }, []);

    useEffect(() => {
        if (selectedSupplier) {
            fetchSupplierItems(selectedSupplier);
        }
    }, [selectedSupplier]);

    useEffect(() => {
        fetchEntries();
        fetchSummary();
    }, [date, selectedSupplier]);

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
            if (selectedSupplier) url += `&supplierId=${selectedSupplier}`;

            const res = await api.get(url);
            setEntries(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSummary = async () => {
        try {
            let url = `chicken/bills/summary?date=${date}`;
            if (selectedSupplier) url += `&supplierId=${selectedSupplier}`;

            const res = await api.get(url);
            setSummary(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const addRow = () => {
        setBulkRows([...bulkRows, { id: Date.now(), item_name: '', qty: '', vendor_rate: '' }]);
    };

    const removeRow = (id) => {
        if (bulkRows.length === 1) {
            toast.error('At least one row is required');
            return;
        }
        setBulkRows(bulkRows.filter(row => row.id !== id));
    };

    const updateRow = (id, field, value) => {
        setBulkRows(bulkRows.map(row =>
            row.id === id ? { ...row, [field]: value } : row
        ));
    };

    const handleBulkSubmit = async (e) => {
        e.preventDefault();

        if (!selectedSupplier) {
            toast.error('Please select a supplier');
            return;
        }

        // Validate all rows
        const validRows = bulkRows.filter(row => row.item_name && row.qty && row.vendor_rate);

        if (validRows.length === 0) {
            toast.error('Please fill in at least one complete row');
            return;
        }

        try {
            let successCount = 0;
            let failCount = 0;

            for (const row of validRows) {
                try {
                    await api.post('chicken/bills', {
                        date,
                        supplier_id: selectedSupplier,
                        item_name: row.item_name,
                        qty: row.qty,
                        vendor_rate: row.vendor_rate
                    });
                    successCount++;
                } catch (err) {
                    failCount++;
                    console.error('Error adding entry:', err);
                }
            }

            if (successCount > 0) {
                toast.success(`✓ ${successCount} bill ${successCount === 1 ? 'entry' : 'entries'} added successfully`);
                // Reset form
                setBulkRows([{ id: Date.now(), item_name: '', qty: '', vendor_rate: '' }]);
                fetchEntries();
                fetchSummary();
            }

            if (failCount > 0) {
                toast.error(`✗ ${failCount} ${failCount === 1 ? 'entry' : 'entries'} failed`);
            }
        } catch (err) {
            toast.error('Failed to add entries');
        }
    };

    // Get available items for a specific row (excluding already selected items in other rows)
    const getAvailableItemsForRow = (currentRowId) => {
        const selectedItems = bulkRows
            .filter(row => row.id !== currentRowId && row.item_name)
            .map(row => row.item_name);

        return availableItems.filter(item => !selectedItems.includes(item));
    };

    return (
        <div className="h-screen flex flex-col bg-[#0f172a] overflow-hidden">
            {/* Header */}
            <div className="bg-[#1e293b] border-b border-white/10 p-3 shadow-md z-10">
                <PageHeader title="Daily Bill Entry" showBack={true} showHome={true} backTo="/chicken" />
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-7xl mx-auto">
                    {/* Left Panel - New Entry Form */}
                    <div className="lg:col-span-5 space-y-4">
                        <div className="glass-panel p-4">
                            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                <FiPlus /> New Entry
                            </h3>

                            <form onSubmit={handleBulkSubmit} className="space-y-4">
                                {/* Date */}
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm"
                                        required
                                    />
                                </div>

                                {/* Supplier */}
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Supplier</label>
                                    <select
                                        value={selectedSupplier}
                                        onChange={e => setSelectedSupplier(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm"
                                        required
                                    >
                                        <option value="" className="text-black">Select Supplier</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id} className="text-black">{s.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Bulk Entry Rows */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs text-gray-400">Items</label>
                                        <button
                                            type="button"
                                            onClick={addRow}
                                            className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                                        >
                                            <FiPlus size={12} /> Add Row
                                        </button>
                                    </div>

                                    {/* Table Header */}
                                    <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 font-medium px-1">
                                        <div className="col-span-5">Item</div>
                                        <div className="col-span-3">Qty</div>
                                        <div className="col-span-3">Rate</div>
                                        <div className="col-span-1"></div>
                                    </div>

                                    {/* Rows */}
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {bulkRows.map((row, index) => (
                                            <div key={row.id} className="grid grid-cols-12 gap-2 items-center bg-white/5 p-2 rounded">
                                                {/* Item */}
                                                <div className="col-span-5">
                                                    <select
                                                        value={row.item_name}
                                                        onChange={e => updateRow(row.id, 'item_name', e.target.value)}
                                                        className="w-full bg-black/20 border border-white/10 rounded p-1.5 text-white text-xs"
                                                        required
                                                    >
                                                        <option value="" className="text-black">Select Item</option>
                                                        {getAvailableItemsForRow(row.id).map(item => (
                                                            <option key={item} value={item} className="text-black">{item}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Quantity */}
                                                <div className="col-span-3">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder="Qty"
                                                        value={row.qty}
                                                        onChange={e => updateRow(row.id, 'qty', e.target.value)}
                                                        className="w-full bg-black/20 border border-white/10 rounded p-1.5 text-white text-xs"
                                                        required
                                                    />
                                                </div>

                                                {/* Vendor Rate */}
                                                <div className="col-span-3">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder="₹"
                                                        value={row.vendor_rate}
                                                        onChange={e => updateRow(row.id, 'vendor_rate', e.target.value)}
                                                        className="w-full bg-black/20 border border-white/10 rounded p-1.5 text-white text-xs"
                                                        required
                                                    />
                                                </div>

                                                {/* Delete Button */}
                                                <div className="col-span-1 flex justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeRow(row.id)}
                                                        className="p-1 text-red-400 hover:bg-red-600/20 rounded transition"
                                                        disabled={bulkRows.length === 1}
                                                    >
                                                        <FiTrash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Calculated Total */}
                                <div className="bg-white/5 border border-white/10 rounded-md p-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-400">Calculated Total:</span>
                                        <span className="text-lg font-bold text-zohra-blue">
                                            ₹{bulkRows.reduce((sum, row) => {
                                                const qty = parseFloat(row.qty) || 0;
                                                const rate = parseFloat(row.vendor_rate) || 0;
                                                return sum + (qty * rate);
                                            }, 0).toFixed(2)}
                                        </span>
                                    </div>
                                </div>

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    className="w-full bg-zohra-blue hover:bg-blue-600 text-white font-bold py-3 rounded-md transition flex items-center justify-center gap-2"
                                >
                                    <FiSave /> Add {bulkRows.filter(r => r.item_name && r.qty && r.vendor_rate).length} {bulkRows.filter(r => r.item_name && r.qty && r.vendor_rate).length === 1 ? 'Entry' : 'Entries'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Right Panel - Entries List */}
                    <div className="lg:col-span-7 space-y-4">
                        {/* Summary */}
                        {summary && (
                            <div className="glass-panel p-4">
                                <h3 className="text-white font-bold mb-3">Entries for {new Date(date).toLocaleDateString()}</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-white/5 rounded p-3">
                                        <p className="text-xs text-gray-400">Total Entries</p>
                                        <p className="text-2xl font-bold text-white">{summary.total_entries}</p>
                                    </div>
                                    <div className="bg-white/5 rounded p-3">
                                        <p className="text-xs text-gray-400">Total Amount</p>
                                        <p className="text-2xl font-bold text-green-400">₹{summary.total_amount}</p>
                                    </div>
                                    <div className="bg-white/5 rounded p-3">
                                        <p className="text-xs text-gray-400">Variance</p>
                                        <p className={`text-2xl font-bold ${summary.total_variance >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                            ₹{Math.abs(summary.total_variance).toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Entries Table */}
                        <div className="glass-panel p-0 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5 border-b border-white/10">
                                        <tr className="text-gray-400 text-xs">
                                            <th className="p-3 text-left">Supplier</th>
                                            <th className="p-3 text-left">Item</th>
                                            <th className="p-3 text-right">Qty</th>
                                            <th className="p-3 text-right">Rate</th>
                                            <th className="p-3 text-right">Expected</th>
                                            <th className="p-3 text-right">Rate Var</th>
                                            <th className="p-3 text-right">Total Var</th>
                                            <th className="p-3 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entries.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" className="p-8 text-center text-gray-500">
                                                    No entries found for this date.
                                                </td>
                                            </tr>
                                        ) : (
                                            entries.map(entry => (
                                                <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5 transition">
                                                    <td className="p-3 text-white">{entry.supplier_name}</td>
                                                    <td className="p-3 text-white">{entry.item_name}</td>
                                                    <td className="p-3 text-right text-white">{entry.qty}</td>
                                                    <td className="p-3 text-right text-white">₹{entry.vendor_rate}</td>
                                                    <td className="p-3 text-right text-gray-400">₹{entry.expected_rate}</td>
                                                    <td className={`p-3 text-right ${parseFloat(entry.vendor_rate) > parseFloat(entry.expected_rate) ? 'text-red-400' : 'text-green-400'}`}>
                                                        ₹{(parseFloat(entry.vendor_rate) - parseFloat(entry.expected_rate)).toFixed(2)}
                                                    </td>
                                                    <td className={`p-3 text-right font-bold ${parseFloat(entry.variance) >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                        ₹{Math.abs(parseFloat(entry.variance)).toFixed(2)}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-1 rounded text-xs ${entry.status === 'Approved' ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'
                                                            }`}>
                                                            {entry.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BillEntry;
