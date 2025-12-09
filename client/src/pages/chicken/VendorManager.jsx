import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { FiPlus, FiTrash2, FiEdit2, FiSave } from 'react-icons/fi';

const VendorManager = () => {
    const [activeTab, setActiveTab] = useState('suppliers');
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);

    // Supplier Form State
    const [newSupplier, setNewSupplier] = useState({
        name: '',
        phone: '',
        payment_type: 'Cash',
        vendor_type: 'Chicken',
        markup_required: true,
        contact_person: '',
        email: '',
        address: '',
        gstin: ''
    });

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
            const token = localStorage.getItem('token');
            const res = await axios.get('http://localhost:5000/api/chicken/suppliers', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuppliers(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchRules = async (supplierId) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`http://localhost:5000/api/chicken/markups?supplierId=${supplierId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRules(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleAddSupplier = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            await axios.post('http://localhost:5000/api/chicken/suppliers', newSupplier, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Supplier added');
            fetchSuppliers();
            setNewSupplier({
                name: '', phone: '', payment_type: 'Cash', vendor_type: 'Chicken', markup_required: true,
                contact_person: '', email: '', address: '', gstin: ''
            });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to add supplier');
        }
    };

    const handleSaveRule = async (e) => {
        e.preventDefault();
        if (!selectedSupplier) return toast.error('Select a supplier first');

        try {
            const token = localStorage.getItem('token');
            await axios.post('http://localhost:5000/api/chicken/markups', {
                supplier_id: selectedSupplier,
                ...newRule
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Rule saved');
            fetchRules(selectedSupplier);
        } catch (err) {
            toast.error('Failed to save rule');
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-6">Vendor Management</h1>

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
                    {/* Add Supplier Form */}
                    <div className="glass-panel p-6 h-fit">
                        <h2 className="text-lg font-bold text-white mb-4">Add New Supplier</h2>
                        <form onSubmit={handleAddSupplier} className="space-y-4">
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
                            </select>
                            <button type="submit" className="w-full bg-zohra-blue p-2 rounded-lg text-white font-bold">Add Supplier</button>
                        </form>
                    </div>

                    {/* Supplier List */}
                    <div className="glass-panel p-6">
                        <h2 className="text-lg font-bold text-white mb-4">Existing Suppliers</h2>
                        <div className="space-y-2">
                            {suppliers.map(s => (
                                <div key={s.id} className="p-3 bg-white/5 rounded-lg flex justify-between items-center">
                                    <div>
                                        <p className="font-bold text-white">{s.name}</p>
                                        <p className="text-sm text-gray-400">{s.vendor_type} • {s.phone}</p>
                                        {s.contact_person && <p className="text-xs text-gray-500">Contact: {s.contact_person}</p>}
                                        {s.gstin && <p className="text-xs text-gray-500">GSTIN: {s.gstin}</p>}
                                    </div>
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
                                    <div key={r.id} className="p-3 bg-white/5 rounded-lg border border-white/10">
                                        <p className="font-bold text-white">{r.item_name}</p>
                                        <p className="text-sm text-gray-400">
                                            = {r.base_rate_type} {r.op1} {r.val1} {r.op2 && `${r.op2} ${r.val2}`}
                                        </p>
                                    </div>
                                ))}
                                {rules.length === 0 && <p className="text-gray-500">No rules configured.</p>}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default VendorManager;
