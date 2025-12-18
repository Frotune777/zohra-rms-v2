import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import PaymentModeSelect from '../../components/finance/PaymentModeSelect';
import {
    FiCalendar, FiPlus, FiTrash2, FiSave, FiAlertCircle,
    FiCheckCircle, FiDollarSign, FiRefreshCw, FiTrendingUp,
    FiTrendingDown, FiArchive, FiLock
} from 'react-icons/fi';

const DailyTracker = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [summary, setSummary] = useState(null);
    const [dayStatus, setDayStatus] = useState('Open');
    const [transactions, setTransactions] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [categories, setCategories] = useState([]);
    const [mappings, setMappings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showCashModal, setShowCashModal] = useState(false);
    const { userRole } = useAuth();

    // Tab State: 'sales' | 'expenses'
    const [activeTab, setActiveTab] = useState('sales');

    // -------------------------------------------------------------------------
    // Grid State: Array of rows
    // -------------------------------------------------------------------------
    const createEmptyRow = (type) => ({
        id: `temp-${Date.now()}-${Math.random()}`,
        description: '',
        amount: '',
        payment_method: 'Cash', // Name of the payment mode
        mode: 'Cash', // Kept for backward compatibility if needed by some backend logic
        category_id: '',
        vendor_id: '',
        status: 'Paid',
        type: type === 'sales' ? 'Sales' : 'Expense',
        isNew: true
    });

    const [rows, setRows] = useState([]);

    // Cash Denomination State
    const [cashDenominations, setCashDenominations] = useState({
        500: '', 200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 2: '', 1: ''
    });

    useEffect(() => {
        fetchData();
        fetchSuppliers();
        fetchCategories();
        fetchMappings();
    }, [date]);

    useEffect(() => {
        setRows([createEmptyRow(activeTab)]);
        setError('');
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [summaryRes, txRes, statusRes] = await Promise.all([
                api.get(`/finance/daily-summary/${date}`),
                api.get(`/finance/tracker/transactions?date=${date}`),
                api.get(`/finance/daily-balance/${date}`)
            ]);

            setSummary(summaryRes.data);
            setTransactions(txRes.data);
            setDayStatus(statusRes.data.status || 'Open');
            setError('');
        } catch (err) {
            console.error(err);
            setError('Failed to load data.');
        } finally {
            setLoading(false);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const res = await api.get('/vendors/all-suppliers');
            setSuppliers(res.data);
        } catch (err) { console.error(err); }
    };

    const fetchCategories = async () => {
        try {
            const res = await api.get('/finance/tracker/categories');
            setCategories(res.data);
        } catch (err) { console.error(err); }
    };

    const fetchMappings = async () => {
        try {
            const res = await api.get('/finance/mappings');
            setMappings(res.data);
        } catch (err) { console.error(err); }
    };

    const handleAddRow = () => {
        if (dayStatus === 'Closed') return;
        setRows([...rows, createEmptyRow(activeTab)]);
    };

    const handleRowChange = (index, field, value) => {
        if (dayStatus === 'Closed') return;
        const newRows = [...rows];
        newRows[index][field] = value;

        // Auto-categorization based on description
        if (field === 'description' && value && !newRows[index].category_id) {
            const desc = value.toLowerCase();
            let suggestedCategory = null;

            if (desc.includes('grocery') || desc.includes('vegetables') || desc.includes('chicken') || desc.includes('meat')) {
                suggestedCategory = categories.find(c => c.name === 'Grocery');
            } else if (desc.includes('salary') || desc.includes('wages') || desc.includes('payroll')) {
                suggestedCategory = categories.find(c => c.name === 'Labor');
            } else if (desc.includes('rent') || desc.includes('lease')) {
                suggestedCategory = categories.find(c => c.name === 'Rent');
            } else if (desc.includes('utility') || desc.includes('electricity') || desc.includes('water') || desc.includes('gas')) {
                suggestedCategory = categories.find(c => c.name === 'Utilities');
            } else if (desc.includes('repair') || desc.includes('maintenance')) {
                suggestedCategory = categories.find(c => c.name === 'Maintenance');
            } else if (desc.includes('transport') || desc.includes('fuel') || desc.includes('delivery')) {
                suggestedCategory = categories.find(c => c.name === 'Transportation');
            }

            if (suggestedCategory) {
                newRows[index].category_id = suggestedCategory.id;
            }
        }

        // Auto-categorization based on vendor selection
        if (field === 'vendor_id' && value && !newRows[index].category_id) {
            const selectedVendor = suppliers.find(s => s.id === parseInt(value));
            if (selectedVendor) {
                if (selectedVendor.vendor_type === 'Chicken') {
                    const groceryCategory = categories.find(c => c.name === 'Grocery');
                    if (groceryCategory) {
                        newRows[index].category_id = groceryCategory.id;
                    }
                }
            }
        }

        // Auto-set Mode based on Payment Method (Dynamic)
        if (field === 'payment_method') {
            newRows[index].mode = value; // Sync mode with method

            if (value === 'Manager Float') {
                const matchedMapping = mappings.find(m => m.name === 'Manager Float');
                if (matchedMapping) {
                    newRows[index].category_id = matchedMapping.category_id;
                }
            }
        }

        setRows(newRows);
    };

    const handleRemoveRow = (index) => {
        if (dayStatus === 'Closed') return;
        if (rows.length === 1) return;
        const newRows = [...rows];
        newRows.splice(index, 1);
        setRows(newRows);
    };

    const calculateCashTotal = () => {
        return Object.entries(cashDenominations).reduce((total, [denom, count]) => {
            return total + (parseInt(denom) * (parseInt(count) || 0));
        }, 0);
    };

    const handleCashSave = async () => {
        if (dayStatus === 'Closed') return;
        const total = calculateCashTotal();
        if (total <= 0) {
            alert("Total amount must be greater than 0");
            return;
        }

        const payload = {
            type: 'Sales',
            description: 'Cash Closing (Counter)',
            amount: total,
            payment_method: 'Cash',
            mode: 'Cash',
            category_id: null,
            status: 'Paid',
            date: date,
            metadata: { denominations: cashDenominations }
        };

        try {
            await api.post('/finance/tracker/transaction', payload);
            setShowCashModal(false);
            setCashDenominations({ 500: '', 200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 2: '', 1: '' });
            fetchData();
            setSuccess('Cash sale saved successfully!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Failed to save cash sale.');
        }
    };

    const handleSaveAll = async () => {
        if (dayStatus === 'Closed') {
            setError('This day is closed. No further entries allowed.');
            return;
        }

        const rowsToSave = rows.filter(r => r.description && r.amount);
        if (rowsToSave.length === 0) {
            setError("No valid rows to save.");
            return;
        }

        if (activeTab === 'expenses') {
            const missingVendor = rowsToSave.find(r => r.type === 'Expense' && !r.vendor_id);
            if (missingVendor) {
                setError(`Vendor is required for expense: "${missingVendor.description}"`);
                return;
            }
            const missingCat = rowsToSave.find(r => r.type === 'Expense' && !r.category_id);
            if (missingCat) {
                setError(`Category is required for expense: "${missingCat.description}"`);
                return;
            }
        }

        setLoading(true);
        try {
            await Promise.all(rowsToSave.map(row => {
                const payload = {
                    date,
                    type: activeTab === 'sales' ? 'Sales' : 'Expense',
                    description: row.description,
                    amount: parseFloat(row.amount),
                    status: row.status,
                    payment_method: row.payment_method,
                    payment_mode: row.payment_method, // Using payment_mode for refactored backend
                    category_id: row.category_id || null,
                    vendor_id: row.vendor_id || null,
                    paid_by: row.status === 'Paid' ? 'Biller' : null,
                    paid_date: date
                };
                return api.post('/finance/tracker/transaction', payload);
            }));

            setSuccess(`Saved ${rowsToSave.length} transactions!`);
            setRows([createEmptyRow(activeTab)]);
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Failed to save some transactions.');
        } finally {
            setLoading(false);
        }
    };

    const filteredCategories = categories.filter(c =>
        activeTab === 'sales' ? c.type === 'Income' : c.type === 'Expense'
    );

    const SummaryCard = ({ title, value, color }) => (
        <div className="bg-white/5 p-3 rounded-lg border border-white/10">
            <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">{title}</p>
            <p className={`text-xl font-bold ${color}`}>₹{parseFloat(value || 0).toFixed(2)}</p>
        </div>
    );

    const isClosed = dayStatus === 'Closed';

    return (
        <div className="p-4 md:p-6 h-full overflow-auto bg-gradient-to-br from-gray-900 to-gray-800 text-white font-sans flex flex-col">
            {/* Top Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-blue-400 flex items-center gap-2">
                        <FiDollarSign /> Daily Financial Tracker
                    </h2>
                    {isClosed && (
                        <div className="flex items-center gap-1 text-xs text-red-400 font-bold mt-1 bg-red-400/10 px-2 py-0.5 rounded w-fit border border-red-400/20">
                            <FiLock /> DAY CLOSED
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {activeTab === 'sales' && !isClosed && (
                        <button onClick={() => setShowCashModal(true)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition">
                            <FiDollarSign /> Cash Calculator
                        </button>
                    )}
                    <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-lg border border-white/20">
                        <FiCalendar className="text-gray-400" />
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent border-none text-white focus:outline-none text-sm" />
                    </div>
                </div>
            </div>

            {/* Messages */}
            {error && <div className="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded-lg mb-4 flex items-center gap-2 text-sm"><FiAlertCircle /> {error}</div>}
            {success && <div className="bg-green-500/20 border border-green-500 text-green-200 p-3 rounded-lg mb-4 flex items-center gap-2 text-sm"><FiCheckCircle /> {success}</div>}

            {/* Tabs & Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
                <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {activeTab === 'sales' ? (
                        <>
                            <SummaryCard title="Total Sales" value={summary?.totalSales} color="text-green-400" />
                            <SummaryCard title="Cash Sales" value={summary?.cashSales} color="text-green-500" />
                            <SummaryCard title="Gross Profit" value={summary?.grossProfit} color="text-yellow-400" />
                            <SummaryCard title="Cash Flow" value={summary?.cashFlow} color="text-blue-400" />
                        </>
                    ) : (
                        <>
                            <SummaryCard title="Total Expenses" value={summary?.totalExpenses} color="text-red-400" />
                            <SummaryCard title="Cash Expenses" value={summary?.cashExpenses} color="text-red-300" />
                            <SummaryCard title="Pending Payments" value={summary?.pendingPayments} color="text-purple-400" />
                            <SummaryCard title="Bank Expenses" value={summary?.bankExpenses} color="text-red-200" />
                        </>
                    )}
                </div>
                <div className="flex justify-end items-start gap-2">
                    <button onClick={() => setActiveTab('sales')} className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${activeTab === 'sales' ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-800 text-gray-400 border border-white/10'}`}>
                        <FiTrendingUp /> Sales
                    </button>
                    <button onClick={() => setActiveTab('expenses')} className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${activeTab === 'expenses' ? 'bg-red-600 text-white shadow-lg' : 'bg-gray-800 text-gray-400 border border-white/10'}`}>
                        <FiTrendingDown /> Expenses
                    </button>
                </div>
            </div>

            {/* BATCH ENTRY GRID */}
            <div className={`bg-gray-800/50 backdrop-blur-md p-4 rounded-xl border border-white/10 mb-6 flex-1 flex flex-col ${isClosed ? 'opacity-60 cursor-not-allowed' : ''}`}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <FiPlus className="text-blue-400" /> Batch Entry ({activeTab === 'sales' ? 'Sales' : 'Expenses'})
                        {isClosed && <span className="text-[10px] text-red-400 uppercase tracking-tighter ml-2">[Read Only]</span>}
                    </h3>
                    {!isClosed && (
                        <div className="flex gap-2">
                            <button onClick={handleAddRow} className="bg-blue-600/30 text-blue-200 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded text-xs transition border border-blue-500/50">
                                + Add Row
                            </button>
                            <button onClick={handleSaveAll} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-xs font-bold transition flex items-center gap-2">
                                {loading ? <FiRefreshCw className="animate-spin" /> : <FiSave />} Save All
                            </button>
                        </div>
                    )}
                </div>

                <div className="overflow-auto border border-white/10 rounded-lg flex-1 min-h-[300px]">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-white/5 text-gray-400 sticky top-0 backdrop-blur-sm z-10">
                            <tr>
                                {activeTab === 'sales' && <th className="p-3 w-10">Transfer?</th>}
                                <th className="p-3">Description *</th>
                                <th className="p-3 w-32">Amount *</th>
                                <th className="p-3 w-40">Category</th>
                                <th className="p-3 w-48">Method *</th>
                                {activeTab === 'expenses' && <th className="p-3 w-48">Vendor</th>}
                                {activeTab === 'expenses' && <th className="p-3 w-32">Status</th>}
                                <th className="p-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {!isClosed && rows.map((row, idx) => (
                                <tr key={row.id} className="hover:bg-white/5 transition">
                                    {activeTab === 'sales' && (
                                        <td className="p-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={row.mode === 'Bank_Cash'}
                                                onChange={(e) => handleRowChange(idx, 'transfer_to_manager', e.target.checked)}
                                                className="w-4 h-4 rounded border-gray-600 text-blue-600 bg-gray-700"
                                                title="Transfer to Manager Float"
                                            />
                                        </td>
                                    )}
                                    <td className="p-2">
                                        <input
                                            type="text"
                                            value={row.description}
                                            onChange={(e) => handleRowChange(idx, 'description', e.target.value)}
                                            placeholder="Description"
                                            className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-white placeholder-gray-600"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            value={row.amount}
                                            onChange={(e) => handleRowChange(idx, 'amount', e.target.value)}
                                            placeholder="0.00"
                                            className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-green-400 font-mono"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <select
                                            value={row.category_id}
                                            onChange={(e) => handleRowChange(idx, 'category_id', e.target.value)}
                                            className="w-full bg-gray-900 border border-white/10 rounded px-2 py-1 text-xs text-gray-300 focus:border-blue-500 outline-none"
                                        >
                                            <option value="">- Category -</option>
                                            {filteredCategories.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-2">
                                        <PaymentModeSelect
                                            value={row.payment_method}
                                            onChange={(val) => handleRowChange(idx, 'payment_method', val)}
                                        />
                                    </td>
                                    {activeTab === 'expenses' && (
                                        <>
                                            <td className="p-2">
                                                <select
                                                    value={row.vendor_id}
                                                    onChange={(e) => handleRowChange(idx, 'vendor_id', e.target.value)}
                                                    className="w-full bg-gray-900 border border-white/10 rounded px-2 py-1 text-xs text-gray-300 focus:border-blue-500 outline-none"
                                                >
                                                    <option value="">- No Vendor -</option>
                                                    {suppliers.map(s => (
                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="p-2">
                                                <select
                                                    value={row.status}
                                                    onChange={(e) => handleRowChange(idx, 'status', e.target.value)}
                                                    className={`w-full bg-gray-900 border border-white/10 rounded px-2 py-1 text-xs outline-none ${row.status === 'Paid' ? 'text-green-400' : 'text-yellow-400'}`}
                                                >
                                                    <option value="Paid">Paid</option>
                                                    <option value="Pending">Pending</option>
                                                </select>
                                            </td>
                                        </>
                                    )}
                                    <td className="p-2 text-center">
                                        <button onClick={() => handleRemoveRow(idx)} className="text-gray-600 hover:text-red-400">
                                            <FiTrash2 />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {isClosed && (
                                <tr>
                                    <td colSpan={activeTab === 'expenses' ? 8 : 6} className="p-12 text-center text-gray-500 italic">
                                        This day is closed. Entries are locked.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* TRANSACTIONS LOG (Read Only) */}
            <div className="bg-gray-800/30 backdrop-blur-md rounded-xl border border-white/10 p-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white text-sm uppercase text-gray-400">Today's Log</h3>
                    <button onClick={fetchData} className="text-gray-400 hover:text-white"><FiRefreshCw /></button>
                </div>
                <div className="overflow-auto max-h-[300px]">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white/5 text-gray-500 sticky top-0">
                            <tr>
                                <th className="p-2">Time</th>
                                <th className="p-2">Description</th>
                                <th className="p-2">Category</th>
                                <th className="p-2">Method</th>
                                <th className="p-2 text-right">Amount</th>
                                <th className="p-2 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {transactions.filter(t => activeTab === 'sales' ? t.type === 'Sales' : t.type === 'Expense').map(txn => (
                                <tr key={txn.id} className="hover:bg-white/5 transition">
                                    <td className="p-2 text-gray-500 font-mono text-xs">
                                        {new Date(txn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="p-2">
                                        <div className="text-gray-300">{txn.description}</div>
                                        {txn.vendor_name && <div className="text-[10px] text-blue-400">{txn.vendor_name}</div>}
                                        {txn.mode === 'Bank_Cash' && <div className="text-[10px] text-orange-400 bg-orange-500/10 px-1 rounded w-fit">Transfer Logic</div>}
                                    </td>
                                    <td className="p-2 text-gray-400 text-xs">{txn.category_name || '-'}</td>
                                    <td className="p-2 text-gray-400 text-xs">{txn.payment_method}</td>
                                    <td className={`p-2 text-right font-mono font-bold ${txn.type === 'Sales' ? 'text-green-400' : 'text-red-400'}`}>
                                        {parseFloat(txn.amount).toFixed(2)}
                                    </td>
                                    <td className="p-2 text-center">
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Cash Denomination Modal */}
            {showCashModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
                        <button
                            onClick={() => setShowCashModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white"
                        >
                            ✕
                        </button>

                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <FiDollarSign className="text-green-500" /> Cash Calculator
                        </h3>

                        <div className="space-y-2 max-h-[60vh] overflow-auto pr-2">
                            {['500', '200', '100', '50', '20', '10', '5', '2', '1'].map(denom => (
                                <div key={denom} className="flex items-center gap-4">
                                    <div className="w-16 text-right font-mono text-gray-400 text-sm">₹{denom} x</div>
                                    <input
                                        type="number"
                                        className="flex-1 bg-gray-800 border border-white/10 rounded p-2 text-white focus:outline-none focus:border-green-500 text-right"
                                        placeholder="0"
                                        value={cashDenominations[denom]}
                                        onChange={(e) => setCashDenominations(p => ({ ...p, [denom]: e.target.value }))}
                                    />
                                    <div className="w-20 text-right font-mono text-white text-sm">
                                        = ₹{(parseInt(denom) * (parseInt(cashDenominations[denom]) || 0))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 pt-4 border-t border-white/10">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-gray-400">Total Cash</span>
                                <span className="text-2xl font-bold text-green-400">₹{calculateCashTotal()}</span>
                            </div>

                            <button
                                onClick={handleCashSave}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition"
                            >
                                Save as Cash Sale
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DailyTracker;

