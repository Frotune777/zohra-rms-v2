import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import { toast } from 'react-hot-toast';
import { FiPlus, FiTrash2, FiEdit2, FiSave, FiCalendar, FiArrowLeft, FiMonitor } from 'react-icons/fi';
import RatesCalendar from '../../components/RatesCalendar';

const VendorManager = () => {
    const [activeTab, setActiveTab] = useState('rates');
    const [loading, setLoading] = useState(false);

    // --- Daily Rates State ---
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [dailyRates, setDailyRates] = useState({ tandoor_rate: '', boiler_rate: '', egg_rate: '' });
    const [rateStatus, setRateStatus] = useState(null);

    // --- Suppliers State ---
    const [suppliers, setSuppliers] = useState([]);
    const [editingSupplierId, setEditingSupplierId] = useState(null);
    const initialSupplierState = {
        name: '', phone: '', payment_type: 'Cash', vendor_type: 'Chicken',
        markup_required: true, contact_person: '', email: '', address: '', gstin: ''
    };
    const [newSupplier, setNewSupplier] = useState(initialSupplierState);

    // --- Markup Rules State ---
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [rules, setRules] = useState([]);
    const [newRule, setNewRule] = useState({
        item_name: '', base_rate_type: 'TandoorRate', op1: '+', val1: 0,
        op2: '', val2: 0,
        threshold_val: '', threshold_op: '>', threshold_markup_op: '', threshold_markup_val: ''
    });
    const [editingRule, setEditingRule] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // --- Effects ---
    useEffect(() => {
        if (activeTab === 'rates') fetchRates();
        if (activeTab === 'suppliers' || activeTab === 'rules') fetchSuppliers();
    }, [activeTab, date]);

    useEffect(() => {
        if (activeTab === 'rules' && selectedSupplier) {
            fetchRules(selectedSupplier);
        }
    }, [selectedSupplier, activeTab]);

    // --- API Calls: Rates ---
    const fetchRates = async () => {
        try {
            const res = await api.get(`chicken/rates?date=${date}`);
            setDailyRates(res.data ? {
                tandoor_rate: res.data.tandoor_rate,
                boiler_rate: res.data.boiler_rate,
                egg_rate: res.data.egg_rate
            } : { tandoor_rate: '', boiler_rate: '', egg_rate: '' });

            const statusRes = await api.get(`chicken/rates/status?date=${date}`);
            setRateStatus(statusRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveRates = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('chicken/rates', { date, ...dailyRates });
            toast.success('Rates updated');
            fetchRates();
        } catch (err) {
            toast.error('Failed to update rates');
        } finally {
            setLoading(false);
        }
    };

    // --- API Calls: Suppliers ---
    const fetchSuppliers = async () => {
        try {
            const res = await api.get('chicken/suppliers');
            setSuppliers(res.data);
        } catch (err) { console.error(err); }
    };

    const handleSaveSupplier = async (e) => {
        e.preventDefault();
        try {
            if (editingSupplierId) {
                await api.put(`chicken/suppliers/${editingSupplierId}`, newSupplier);
                toast.success('Supplier updated');
            } else {
                await api.post('chicken/suppliers', newSupplier);
                toast.success('Supplier added');
            }
            fetchSuppliers();
            setNewSupplier(initialSupplierState);
            setEditingSupplierId(null);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save supplier');
        }
    };

    const handleEditSupplier = (supplier) => {
        setNewSupplier({ ...supplier, markup_required: supplier.markup_required ?? true });
        setEditingSupplierId(supplier.id);
    };

    // --- API Calls: Rules ---
    const fetchRules = async (supplierId) => {
        try {
            const res = await api.get(`chicken/markups?supplierId=${supplierId}`);
            setRules(res.data);
        } catch (err) { console.error(err); }
    };

    const handleSaveRule = async (e) => {
        e.preventDefault();
        if (!selectedSupplier) return toast.error('Select a supplier first');
        try {
            await api.post('chicken/markups', { supplier_id: selectedSupplier, ...newRule });
            toast.success('Rule saved');
            fetchRules(selectedSupplier);
            setNewRule({
                item_name: '', base_rate_type: 'TandoorRate', op1: '+', val1: 0,
                op2: '', val2: 0,
                threshold_val: '', threshold_op: '>', threshold_markup_op: '', threshold_markup_val: ''
            });
        } catch (err) { toast.error('Failed to save rule'); }
    };

    const handleUpdateRule = async (e) => {
        e.preventDefault();
        try {
            await api.put(`chicken/markups/${editingRule.id}`, editingRule);
            toast.success('Rule updated');
            fetchRules(selectedSupplier);
            setEditingRule(null);
        } catch (err) { toast.error('Failed to update rule'); }
    };

    const handleDeleteRule = async (ruleId) => {
        try {
            await api.delete(`chicken/markups/${ruleId}`);
            toast.success('Rule deleted');
            fetchRules(selectedSupplier);
            setDeleteConfirm(null);
        } catch (err) { toast.error('Failed to delete rule'); }
    };

    // --- Render Helpers ---
    const TabButton = ({ id, label, icon: Icon }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === id
                    ? 'bg-zohra-blue text-white border-b-2 border-zohra-blue'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
        >
            <Icon size={16} />
            {label}
        </button>
    );

    return (
        <div className="h-screen flex flex-col bg-[#0f172a] overflow-hidden">
            {/* 1. Compact Header */}
            <div className="bg-[#1e293b] border-b border-white/10 p-3 flex justify-between items-center shadow-md z-10">
                <div className="flex items-center gap-3">
                    <PageHeader title="Procurement Manager" showBack={true} showHome={true} backTo="/chicken" />
                </div>
                <div className="flex gap-1">
                    <TabButton id="rates" label="Daily Rates" icon={FiCalendar} />
                    <TabButton id="suppliers" label="Suppliers" icon={FiPlus} />
                    <TabButton id="rules" label="Markup Rules" icon={FiMonitor} />
                </div>
            </div>

            {/* 2. Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">

                {/* --- DAILY RATES TAB --- */}
                {activeTab === 'rates' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl mx-auto">
                        <div className="glass-panel p-0 overflow-hidden h-fit">
                            <RatesCalendar onDateSelect={setDate} selectedDate={date} />
                        </div>
                        <div className="glass-panel p-5 h-fit">
                            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                <FiEdit2 /> Edit Rates for {new Date(date).toLocaleDateString()}
                            </h3>
                            <form onSubmit={handleSaveRates} className="space-y-4">
                                <div className="grid grid-cols-3 gap-3">
                                    {['tandoor_rate', 'boiler_rate', 'egg_rate'].map(rate => (
                                        <div key={rate}>
                                            <label className="block text-xs text-gray-400 mb-1 capitalize">
                                                {rate.replace('_', ' ')}
                                            </label>
                                            <input
                                                type="number" step="0.01" placeholder="0.00"
                                                value={dailyRates[rate]}
                                                onChange={e => setDailyRates({ ...dailyRates, [rate]: e.target.value })}
                                                className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm focus:border-zohra-blue outline-none transition"
                                                required
                                            />
                                        </div>
                                    ))}
                                </div>
                                <button type="submit" disabled={loading}
                                    className="w-full bg-zohra-blue hover:bg-blue-600 text-white font-bold py-2 rounded-md transition text-sm flex justify-center items-center gap-2">
                                    <FiSave /> {loading ? 'Saving...' : 'Save Market Rates'}
                                </button>
                            </form>
                            {rateStatus && (
                                <div className="mt-4 p-3 bg-white/5 rounded-md border border-white/10">
                                    <p className="text-xs text-gray-400">Last Updated Details</p>
                                    <p className="text-xs text-white mt-1">
                                        By: <span className="text-zohra-blue">{rateStatus.updated_by || 'Unknown'}</span> at {new Date(rateStatus.updated_at).toLocaleTimeString()}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- SUPPLIERS TAB --- */}
                {activeTab === 'suppliers' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
                        {/* List - Takes 4 cols */}
                        <div className="lg:col-span-4 glass-panel p-0 flex flex-col h-full max-h-[calc(100vh-140px)]">
                            <div className="p-3 border-b border-white/10 bg-white/5">
                                <h3 className="text-white font-bold text-sm">Suppliers ({suppliers.length})</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                {suppliers.map(s => (
                                    <div key={s.id} onClick={() => handleEditSupplier(s)}
                                        className={`p-3 rounded-md cursor-pointer border transition-colors ${editingSupplierId === s.id ? 'bg-zohra-blue/20 border-zohra-blue' : 'bg-white/5 border-transparent hover:bg-white/10'
                                            }`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="text-white font-medium text-sm">{s.name}</span>
                                            <span className="text-xs text-gray-400">{s.phone}</span>
                                        </div>
                                        <div className="flex gap-2 mt-1">
                                            <span className="text-[10px] bg-gray-700 px-1.5 rounded text-gray-300">{s.vendor_type}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Form - Takes 8 cols */}
                        <div className="lg:col-span-8 glass-panel p-5 h-fit">
                            <h2 className="text-base font-bold text-white mb-4 border-b border-white/10 pb-2">
                                {editingSupplierId ? 'Edit Supplier' : 'Add New Supplier'}
                            </h2>
                            <form onSubmit={handleSaveSupplier} className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" placeholder="Name" value={newSupplier.name}
                                        onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm" required />
                                    <input type="text" placeholder="Phone" value={newSupplier.phone}
                                        onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="email" placeholder="Email" value={newSupplier.email}
                                        onChange={e => setNewSupplier({ ...newSupplier, email: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm" />
                                    <input type="text" placeholder="Contact Person" value={newSupplier.contact_person}
                                        onChange={e => setNewSupplier({ ...newSupplier, contact_person: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm" />
                                </div>
                                <textarea placeholder="Address" value={newSupplier.address}
                                    onChange={e => setNewSupplier({ ...newSupplier, address: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm h-16" />
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" placeholder="GSTIN" value={newSupplier.gstin}
                                        onChange={e => setNewSupplier({ ...newSupplier, gstin: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm" />
                                    <select value={newSupplier.vendor_type}
                                        onChange={e => setNewSupplier({ ...newSupplier, vendor_type: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm">
                                        <option value="Chicken" className="text-black">Chicken</option>
                                        <option value="Grocery" className="text-black">Grocery</option>
                                    </select>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    {editingSupplierId && (
                                        <button type="button" onClick={() => { setNewSupplier(initialSupplierState); setEditingSupplierId(null); }}
                                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-md text-white text-sm">Cancel</button>
                                    )}
                                    <button type="submit" className="px-6 py-2 bg-zohra-blue hover:bg-blue-600 rounded-md text-white text-sm font-bold">
                                        {editingSupplierId ? 'Update' : 'Add'} Supplier
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* --- MARKUP RULES TAB --- */}
                {activeTab === 'rules' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
                        {/* Selection & Form - Left Side */}
                        <div className="lg:col-span-5 space-y-4">
                            <div className="glass-panel p-4">
                                <label className="text-xs text-gray-400 block mb-1">Select Supplier to Configure</label>
                                <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm">
                                    <option value="" className="text-black">-- Select Supplier --</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id} className="text-black">{s.name}</option>)}
                                </select>
                            </div>

                            {selectedSupplier && (
                                <div className="glass-panel p-4 bg-white/5">
                                    <h4 className="text-sm font-bold text-white mb-3">Add New Rule</h4>
                                    <form onSubmit={handleSaveRule} className="space-y-3">
                                        <input type="text" placeholder="Item Name" value={newRule.item_name}
                                            onChange={e => setNewRule({ ...newRule, item_name: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm" required />

                                        <div className="grid grid-cols-2 gap-2">
                                            <select value={newRule.base_rate_type} onChange={e => setNewRule({ ...newRule, base_rate_type: e.target.value })}
                                                className="bg-white/5 border border-white/10 rounded-md p-2 text-white text-xs">
                                                <option value="TandoorRate" className="text-black">Tandoor Rate</option>
                                                <option value="BoilerRate" className="text-black">Boiler Rate</option>
                                                <option value="EggRate" className="text-black">Egg Rate</option>
                                            </select>
                                            <div className="flex gap-1">
                                                <select value={newRule.op1} onChange={e => setNewRule({ ...newRule, op1: e.target.value })}
                                                    className="bg-white/5 border border-white/10 rounded-md p-1 text-white text-xs w-10">
                                                    <option value="+" className="text-black">+</option>
                                                    <option value="-" className="text-black">-</option>
                                                    <option value="*" className="text-black">*</option>
                                                </select>
                                                <input type="number" value={newRule.val1} onChange={e => setNewRule({ ...newRule, val1: e.target.value })}
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-md p-1 text-white text-xs" />
                                            </div>
                                        </div>

                                        {/* Conditional Markup Compact */}
                                        <div className="border-t border-white/10 pt-2">
                                            <p className="text-[10px] text-gray-400 mb-1">Conditional Adjustment (Optional)</p>
                                            <div className="flex gap-2 items-center">
                                                <span className="text-xs text-gray-500">If &gt;</span>
                                                <input type="number" placeholder="Threshold" value={newRule.threshold_val}
                                                    onChange={e => setNewRule({ ...newRule, threshold_val: e.target.value })}
                                                    className="w-20 bg-white/5 border border-white/10 rounded-md p-1 text-white text-xs" />
                                                <span className="text-xs text-gray-500">Then</span>
                                                <select value={newRule.threshold_markup_op} onChange={e => setNewRule({ ...newRule, threshold_markup_op: e.target.value })}
                                                    className="bg-white/5 border border-white/10 rounded-md p-1 text-white text-xs w-10">
                                                    <option value="" className="text-black">-</option>
                                                    <option value="+" className="text-black">+</option>
                                                    <option value="-" className="text-black">-</option>
                                                </select>
                                                <input type="number" placeholder="Value" value={newRule.threshold_markup_val}
                                                    onChange={e => setNewRule({ ...newRule, threshold_markup_val: e.target.value })}
                                                    className="w-16 bg-white/5 border border-white/10 rounded-md p-1 text-white text-xs" />
                                            </div>
                                        </div>

                                        <button type="submit" className="w-full bg-green-600 hover:bg-green-700 p-2 rounded-md text-white text-sm font-bold">
                                            Add Rule
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>

                        {/* Rules List - Right Side */}
                        <div className="lg:col-span-7 glass-panel p-0 flex flex-col h-full max-h-[calc(100vh-140px)]">
                            <div className="p-3 border-b border-white/10 bg-white/5">
                                <h3 className="text-white font-bold text-sm">Configured Rules</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                                {rules.length === 0 && <p className="text-gray-500 text-sm text-center mt-4">No rules found for this supplier.</p>}
                                {rules.map(r => (
                                    <div key={r.id} className="p-3 bg-white/5 rounded-md border border-white/10 group hover:bg-white/10 transition">
                                        {editingRule?.id === r.id ? (
                                            <form onSubmit={handleUpdateRule} className="space-y-2">
                                                {/* Edit Mode */}
                                                <div className="flex gap-2">
                                                    <input type="text" value={editingRule.item_name} onChange={e => setEditingRule({ ...editingRule, item_name: e.target.value })}
                                                        className="flex-1 bg-black/20 border border-white/20 rounded p-1 text-xs text-white" />
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <button type="submit" className="text-xs bg-green-600 px-2 py-1 rounded text-white">Save</button>
                                                    <button type="button" onClick={() => setEditingRule(null)} className="text-xs bg-gray-600 px-2 py-1 rounded text-white">Cancel</button>
                                                </div>
                                            </form>
                                        ) : (
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-bold text-white text-sm">{r.item_name}</p>
                                                    <p className="text-xs text-gray-400">
                                                        {r.base_rate_type} {r.op1} {r.val1}
                                                    </p>
                                                    {r.threshold_val && (
                                                        <p className="text-[10px] text-zohra-blue mt-0.5">
                                                            Condition: If {r.threshold_op} {r.threshold_val}, apply {r.threshold_markup_op}{r.threshold_markup_val}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex gap-1 opacity-50 group-hover:opacity-100 transition">
                                                    <button onClick={() => setEditingRule(r)} className="p-1.5 bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600 hover:text-white"><FiEdit2 size={12} /></button>
                                                    <button onClick={() => setDeleteConfirm(r.id)} className="p-1.5 bg-red-600/20 text-red-400 rounded hover:bg-red-600 hover:text-white"><FiTrash2 size={12} /></button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="glass-panel p-6 max-w-sm mx-4 text-center">
                        <h3 className="text-lg font-bold text-white mb-2">Confirm Delete</h3>
                        <p className="text-gray-400 text-sm mb-4">Are you sure you want to delete this rule?</p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => handleDeleteRule(deleteConfirm)} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white text-sm font-bold">Delete</button>
                            <button onClick={() => setDeleteConfirm(null)} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-white text-sm">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VendorManager;
