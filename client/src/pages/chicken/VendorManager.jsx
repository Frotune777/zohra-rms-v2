import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import { toast } from 'react-hot-toast';
import { FiPlus, FiTrash2, FiEdit2, FiSave } from 'react-icons/fi';

const VendorManager = () => {
    const [activeTab, setActiveTab] = useState('suppliers');
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);

    const [editingSupplierId, setEditingSupplierId] = useState(null);
    const initialSupplierState = {
        name: '',
        phone: '',
        payment_type: 'Cash',
        vendor_type: 'Chicken',
        markup_required: true,
        contact_person: '',
        email: '',
        address: '',
        gstin: ''
    };
    const [newSupplier, setNewSupplier] = useState(initialSupplierState);

    // Markup Rule State
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [rules, setRules] = useState([]);
    const [newRule, setNewRule] = useState({
        item_name: '',
        base_rate_type: 'TandoorRate',
        op1: '+',
        val1: 0,
        op2: '',
        val2: 0
    });
    const [editingRule, setEditingRule] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        fetchSuppliers();
    }, []);

    useEffect(() => {
        if (selectedSupplier) {
            fetchRules(selectedSupplier);
        }
    }, [selectedSupplier]);

    const fetchSuppliers = async () => {
        try {
            const res = await api.get('chicken/suppliers');
            setSuppliers(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchRules = async (supplierId) => {
        try {
            // Using direct axios or api helper. The original code had mixed usage.
            // Using api helper for consistency as we have it.
            const res = await api.get(`chicken/markups?supplierId=${supplierId}`);
            setRules(res.data);
        } catch (err) {
            console.error(err);
        }
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
        setNewSupplier({
            name: supplier.name || '',
            phone: supplier.phone || '',
            payment_type: supplier.payment_type || 'Cash',
            vendor_type: supplier.vendor_type || 'Chicken',
            markup_required: supplier.markup_required ?? true,
            contact_person: supplier.contact_person || '',
            email: supplier.email || '',
            address: supplier.address || '',
            gstin: supplier.gstin || ''
        });
        setEditingSupplierId(supplier.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setNewSupplier(initialSupplierState);
        setEditingSupplierId(null);
    };

    const handleSaveRule = async (e) => {
        e.preventDefault();
        if (!selectedSupplier) return toast.error('Select a supplier first');

        try {
            await api.post('chicken/markups', {
                supplier_id: selectedSupplier,
                item_name: newRule.item_name,
                op1: newRule.op1,
                val1: parseFloat(newRule.val1),
                op2: newRule.op2 || null,
                val2: newRule.val2 ? parseFloat(newRule.val2) : null
            });
            toast.success('Rule saved');
            fetchRules(selectedSupplier);
            setNewRule({ item_name: '', base_rate_type: 'TandoorRate', op1: '+', val1: 0, op2: '', val2: 0 });
        } catch (err) {
            toast.error('Failed to save rule');
        }
    };

    const handleEditRule = (rule) => {
        setEditingRule(rule);
    };

    const handleUpdateRule = async (e) => {
        e.preventDefault();
        console.log('Update rule called', editingRule);
        try {
            console.log('Sending update request for rule ID:', editingRule.id);
            const response = await api.put(`chicken/markups/${editingRule.id}`, editingRule);
            console.log('Update response:', response.data);
            toast.success('Rule updated');
            fetchRules(selectedSupplier);
            setEditingRule(null);
        } catch (err) {
            console.error('Update error:', err);
            toast.error(err.response?.data?.error || 'Failed to update rule');
        }
    };

    const handleDeleteRule = async (ruleId) => {
        console.log('Delete rule called for ID:', ruleId);
        try {
            const response = await api.delete(`chicken/markups/${ruleId}`);
            console.log('Delete response:', response.data);
            toast.success('Rule deleted');
            fetchRules(selectedSupplier);
            setDeleteConfirm(null);
        } catch (err) {
            console.error('Delete error:', err);
            toast.error(err.response?.data?.error || 'Failed to delete rule');
        }
    };

    return (
        <div className="p-6">
            <PageHeader title="Vendor Management" showBack={true} showHome={true} backTo="/chicken" />

            <div className="flex gap-4 mb-6">
                <button
                    onClick={() => setActiveTab('suppliers')}
                    className={`px-4 py-2 rounded-lg transition ${activeTab === 'suppliers' ? 'bg-zohra-blue text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                >
                    Suppliers
                </button>
                <button
                    onClick={() => setActiveTab('rules')}
                    className={`px-4 py-2 rounded-lg transition ${activeTab === 'rules' ? 'bg-zohra-blue text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                >
                    Markup Rules
                </button>
            </div>

            {activeTab === 'suppliers' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Add/Edit Supplier Form */}
                    <div className="glass-panel p-6 h-fit">
                        <h2 className="text-lg font-bold text-white mb-4">
                            {editingSupplierId ? 'Update Supplier' : 'Add New Supplier'}
                        </h2>
                        <form onSubmit={handleSaveSupplier} className="space-y-4">
                            <input
                                type="text"
                                placeholder="Supplier Name"
                                value={newSupplier.name}
                                onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Phone"
                                value={newSupplier.phone}
                                onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="text"
                                    placeholder="Contact Person"
                                    value={newSupplier.contact_person}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })}
                                    className="bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                />
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={newSupplier.email}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                                    className="bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="GSTIN"
                                value={newSupplier.gstin}
                                onChange={(e) => setNewSupplier({ ...newSupplier, gstin: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                            />
                            <textarea
                                placeholder="Address"
                                value={newSupplier.address}
                                onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white h-20"
                            />
                            <select
                                value={newSupplier.vendor_type}
                                onChange={(e) => setNewSupplier({ ...newSupplier, vendor_type: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                            >
                                <option value="Chicken" className="bg-gray-800 text-white">Chicken</option>
                                <option value="Grocery" className="bg-gray-800 text-white">Grocery</option>
                                <option value="Vegetable" className="bg-gray-800 text-white">Vegetable</option>
                                <option value="General" className="bg-gray-800 text-white">General</option>
                            </select>

                            <div className="flex gap-2">
                                <button type="submit" className="flex-1 bg-zohra-blue p-2 rounded-lg text-white font-bold">
                                    {editingSupplierId ? 'Update Supplier' : 'Add Supplier'}
                                </button>
                                {editingSupplierId && (
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className="flex-1 bg-gray-600 p-2 rounded-lg text-white font-bold"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* Supplier List */}
                    <div className="glass-panel p-6 flex flex-col h-[600px]">
                        <h2 className="text-lg font-bold text-white mb-4">Existing Suppliers ({suppliers.length})</h2>
                        <div className="space-y-2 overflow-y-auto pr-2 flex-1 custom-scrollbar">
                            {suppliers.map(s => (
                                <div key={s.id} className="p-3 bg-white/5 rounded-lg flex justify-between items-center group hover:bg-white/10 transition">
                                    <div>
                                        <p className="font-bold text-white">{s.name}</p>
                                        <p className="text-sm text-gray-400">{s.vendor_type} • {s.phone || 'No Phone'}</p>
                                        {(s.contact_person || s.gstin) && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                {s.contact_person && `Contact: ${s.contact_person} `}
                                                {s.gstin && `• GST: ${s.gstin}`}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleEditSupplier(s)}
                                        className="p-2 bg-blue-600/20 text-blue-400 rounded-lg opacity-50 hover:opacity-100 transition hover:bg-blue-600 hover:text-white"
                                        title="Edit Supplier"
                                    >
                                        <FiEdit2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="glass-panel p-6">
                    <h2 className="text-lg font-bold text-white mb-4">Configure Markup Rules</h2>

                    <div className="mb-6">
                        <label className="block text-gray-400 mb-2">Select Supplier</label>
                        <select
                            value={selectedSupplier}
                            onChange={(e) => setSelectedSupplier(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                        >
                            <option value="" className="bg-gray-800 text-white">-- Select Supplier --</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.id} className="bg-gray-800 text-white">{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {selectedSupplier && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Add Rule Form */}
                            <div className="bg-white/5 p-4 rounded-lg">
                                <h3 className="text-white font-bold mb-4">Add/Update Rule</h3>
                                <form onSubmit={handleSaveRule} className="space-y-4">
                                    <input
                                        type="text"
                                        placeholder="Item Name (e.g., Chicken Curry Cut)"
                                        value={newRule.item_name}
                                        onChange={(e) => setNewRule({ ...newRule, item_name: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                        required
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-gray-400">Base Rate</label>
                                            <select
                                                value={newRule.base_rate_type}
                                                onChange={(e) => setNewRule({ ...newRule, base_rate_type: e.target.value })}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                            >
                                                <option value="TandoorRate" className="bg-gray-800 text-white">Tandoor Rate</option>
                                                <option value="BoilerRate" className="bg-gray-800 text-white">Boiler Rate</option>
                                                <option value="EggRate" className="bg-gray-800 text-white">Egg Rate</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-400">Operator 1</label>
                                            <div className="flex gap-2">
                                                <select
                                                    value={newRule.op1}
                                                    onChange={(e) => setNewRule({ ...newRule, op1: e.target.value })}
                                                    className="bg-white/5 border border-white/10 rounded-lg p-2 text-white w-1/3"
                                                >
                                                    <option value="+" className="bg-gray-800 text-white">+</option>
                                                    <option value="-" className="bg-gray-800 text-white">-</option>
                                                    <option value="*" className="bg-gray-800 text-white">*</option>
                                                    <option value="/" className="bg-gray-800 text-white">/</option>
                                                </select>
                                                <input
                                                    type="number"
                                                    value={newRule.val1}
                                                    onChange={(e) => setNewRule({ ...newRule, val1: e.target.value })}
                                                    className="bg-white/5 border border-white/10 rounded-lg p-2 text-white w-2/3"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-400">Operator 2 (Optional)</label>
                                            <div className="flex gap-2">
                                                <select
                                                    value={newRule.op2}
                                                    onChange={(e) => setNewRule({ ...newRule, op2: e.target.value })}
                                                    className="bg-white/5 border border-white/10 rounded-lg p-2 text-white w-1/3"
                                                >
                                                    <option value="" className="bg-gray-800 text-white">None</option>
                                                    <option value="+" className="bg-gray-800 text-white">+</option>
                                                    <option value="-" className="bg-gray-800 text-white">-</option>
                                                    <option value="*" className="bg-gray-800 text-white">*</option>
                                                    <option value="/" className="bg-gray-800 text-white">/</option>
                                                </select>
                                                <input
                                                    type="number"
                                                    value={newRule.val2}
                                                    onChange={(e) => setNewRule({ ...newRule, val2: e.target.value })}
                                                    className="bg-white/5 border border-white/10 rounded-lg p-2 text-white w-2/3"
                                                    disabled={!newRule.op2}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <button type="submit" className="w-full bg-green-600 hover:bg-green-700 p-2 rounded-lg text-white">Save Rule</button>
                                </form>
                            </div>

                            {/* Existing Rules */}
                            <div className="space-y-2">
                                <h3 className="text-white font-bold mb-4">Current Rules</h3>
                                {rules.map(r => (
                                    editingRule?.id === r.id ? (
                                        <form key={r.id} onSubmit={handleUpdateRule} className="p-4 bg-white/10 rounded-lg border border-zohra-blue space-y-3">
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Item Name</label>
                                                <input
                                                    type="text"
                                                    value={editingRule.item_name}
                                                    onChange={(e) => setEditingRule({ ...editingRule, item_name: e.target.value })}
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Base Rate</label>
                                                <select
                                                    value={editingRule.base_rate_type}
                                                    onChange={(e) => setEditingRule({ ...editingRule, base_rate_type: e.target.value })}
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white text-sm"
                                                >
                                                    <option value="TandoorRate" className="bg-gray-800">Tandoor Rate</option>
                                                    <option value="BoilerRate" className="bg-gray-800">Boiler Rate</option>
                                                    <option value="EggRate" className="bg-gray-800">Egg Rate</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Operation 1</label>
                                                <div className="flex gap-2">
                                                    <select
                                                        value={editingRule.op1}
                                                        onChange={(e) => setEditingRule({ ...editingRule, op1: e.target.value })}
                                                        className="bg-white/5 border border-white/10 rounded-lg p-2 text-white text-sm w-20"
                                                    >
                                                        <option value="+" className="bg-gray-800">+</option>
                                                        <option value="-" className="bg-gray-800">-</option>
                                                        <option value="*" className="bg-gray-800">*</option>
                                                        <option value="/" className="bg-gray-800">/</option>
                                                    </select>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={editingRule.val1}
                                                        onChange={(e) => setEditingRule({ ...editingRule, val1: e.target.value })}
                                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg p-2 text-white text-sm"
                                                        placeholder="Value"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Operation 2 (Optional)</label>
                                                <div className="flex gap-2">
                                                    <select
                                                        value={editingRule.op2 || ''}
                                                        onChange={(e) => setEditingRule({ ...editingRule, op2: e.target.value })}
                                                        className="bg-white/5 border border-white/10 rounded-lg p-2 text-white text-sm w-20"
                                                    >
                                                        <option value="" className="bg-gray-800">None</option>
                                                        <option value="+" className="bg-gray-800">+</option>
                                                        <option value="-" className="bg-gray-800">-</option>
                                                        <option value="*" className="bg-gray-800">*</option>
                                                        <option value="/" className="bg-gray-800">/</option>
                                                    </select>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={editingRule.val2 || ''}
                                                        onChange={(e) => setEditingRule({ ...editingRule, val2: e.target.value })}
                                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg p-2 text-white text-sm"
                                                        placeholder="Value"
                                                        disabled={!editingRule.op2}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 pt-2">
                                                <button type="submit" className="flex-1 bg-green-600 hover:bg-green-700 p-2 rounded-lg text-white text-sm flex items-center justify-center gap-1">
                                                    <FiSave /> Save
                                                </button>
                                                <button type="button" onClick={() => setEditingRule(null)} className="flex-1 bg-gray-600 hover:bg-gray-700 p-2 rounded-lg text-white text-sm">
                                                    Cancel
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div key={r.id} className="p-3 bg-white/5 rounded-lg border border-white/10 flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-white">{r.item_name}</p>
                                                <p className="text-sm text-gray-400">
                                                    = {r.base_rate_type} {r.op1} {r.val1} {r.op2 && `${r.op2} ${r.val2}`}
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleEditRule(r)}
                                                    className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition"
                                                    title="Edit rule"
                                                >
                                                    <FiEdit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirm(r.id)}
                                                    className="p-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition"
                                                    title="Delete rule"
                                                >
                                                    <FiTrash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                ))}
                                {rules.length === 0 && <p className="text-gray-500">No rules configured.</p>}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="glass-panel p-6 max-w-md mx-4">
                        <h3 className="text-xl font-bold text-white mb-4">Confirm Delete</h3>
                        <p className="text-gray-300 mb-6">Are you sure you want to delete this markup rule? This action cannot be undone.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleDeleteRule(deleteConfirm)}
                                className="flex-1 bg-red-600 hover:bg-red-700 p-3 rounded-lg text-white font-bold"
                            >
                                Delete
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 bg-gray-600 hover:bg-gray-700 p-3 rounded-lg text-white font-bold"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VendorManager;
