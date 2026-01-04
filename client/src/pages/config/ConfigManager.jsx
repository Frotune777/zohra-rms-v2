import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import { toast } from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiToggleLeft, FiToggleRight, FiDownload, FiUpload } from 'react-icons/fi';

const ConfigManager = () => {
    const [categories, setCategories] = useState([]);
    const [activeCategory, setActiveCategory] = useState('item_categories');
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingOption, setEditingOption] = useState(null);
    const [newOption, setNewOption] = useState({ value: '', label: '', display_order: 0 });
    const [showAddForm, setShowAddForm] = useState(false);

    // Category display names
    const categoryLabels = {
        item_categories: 'Item Categories',
        units: 'Units of Measurement',
        payment_types: 'Payment Types',
        vendor_types: 'Vendor Types',
        bill_status: 'Bill Status',
        employee_roles: 'Employee Roles',
        base_rate_types: 'Base Rate Types',
        markup_operations: 'Markup Operations',
        threshold_operations: 'Threshold Operations'
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    useEffect(() => {
        if (activeCategory) {
            fetchOptions(activeCategory);
        }
    }, [activeCategory]);

    const fetchCategories = async () => {
        try {
            const res = await api.get('config/categories');
            setCategories(res.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to fetch categories');
        }
    };

    const fetchOptions = async (category) => {
        setLoading(true);
        try {
            const res = await api.get(`config/${category}`);
            setOptions(res.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to fetch options');
        } finally {
            setLoading(false);
        }
    };

    const handleAddOption = async (e) => {
        e.preventDefault();
        try {
            await api.post(`config/${activeCategory}`, newOption);
            toast.success('Option added successfully');
            setNewOption({ value: '', label: '', display_order: 0 });
            setShowAddForm(false);
            fetchOptions(activeCategory);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to add option');
        }
    };

    const handleUpdateOption = async (e) => {
        e.preventDefault();
        try {
            await api.put(`config/${activeCategory}/${editingOption.id}`, editingOption);
            toast.success('Option updated successfully');
            setEditingOption(null);
            fetchOptions(activeCategory);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update option');
        }
    };

    const handleDeleteOption = async (id) => {
        if (!window.confirm('Are you sure you want to delete this option?')) return;
        try {
            await api.delete(`config/${activeCategory}/${id}`);
            toast.success('Option deleted successfully');
            fetchOptions(activeCategory);
        } catch (err) {
            toast.error('Failed to delete option');
        }
    };

    const handleToggleActive = async (id) => {
        try {
            await api.patch(`config/${activeCategory}/${id}/toggle`);
            toast.success('Status toggled');
            fetchOptions(activeCategory);
        } catch (err) {
            toast.error('Failed to toggle status');
        }
    };

    const handleExport = () => {
        const dataStr = JSON.stringify(options, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${activeCategory}_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        toast.success('Exported successfully');
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedOptions = JSON.parse(event.target.result);
                await api.post(`config/${activeCategory}/bulk-import`, { options: importedOptions });
                toast.success('Imported successfully');
                fetchOptions(activeCategory);
            } catch (err) {
                toast.error('Failed to import options');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="h-screen flex flex-col bg-[#0f172a] overflow-hidden">
            {/* Header */}
            <div className="bg-[#1e293b] border-b border-white/10 p-3 shadow-md z-10">
                <PageHeader title="Configuration Management" showBack={true} showHome={true} />
            </div>

            {/* Category Tabs */}
            <div className="bg-[#1e293b] border-b border-white/10 px-4 py-2 flex gap-2 overflow-x-auto">
                {Object.keys(categoryLabels).map(cat => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${activeCategory === cat
                                ? 'bg-zohra-blue text-white'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        {categoryLabels[cat]}
                        {categories.find(c => c.category === cat) && (
                            <span className="ml-2 text-xs opacity-75">
                                ({categories.find(c => c.category === cat).active_options})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4">
                <div className="max-w-6xl mx-auto">
                    {/* Actions Bar */}
                    <div className="glass-panel p-4 mb-4 flex justify-between items-center">
                        <h2 className="text-white font-bold text-lg">
                            {categoryLabels[activeCategory]} ({options.length})
                        </h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowAddForm(!showAddForm)}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition"
                            >
                                <FiPlus /> Add New
                            </button>
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition"
                            >
                                <FiDownload /> Export
                            </button>
                            <label className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition cursor-pointer">
                                <FiUpload /> Import
                                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                            </label>
                        </div>
                    </div>

                    {/* Add Form */}
                    {showAddForm && (
                        <div className="glass-panel p-4 mb-4">
                            <h3 className="text-white font-bold mb-3">Add New Option</h3>
                            <form onSubmit={handleAddOption} className="space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                    <input
                                        type="text"
                                        placeholder="Value (internal)"
                                        value={newOption.value}
                                        onChange={e => setNewOption({ ...newOption, value: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm"
                                        required
                                    />
                                    <input
                                        type="text"
                                        placeholder="Label (display)"
                                        value={newOption.label}
                                        onChange={e => setNewOption({ ...newOption, label: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm"
                                        required
                                    />
                                    <input
                                        type="number"
                                        placeholder="Display Order"
                                        value={newOption.display_order}
                                        onChange={e => setNewOption({ ...newOption, display_order: parseInt(e.target.value) })}
                                        className="bg-white/5 border border-white/10 rounded-md p-2 text-white text-sm"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm">
                                        <FiSave /> Save
                                    </button>
                                    <button type="button" onClick={() => setShowAddForm(false)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm">
                                        <FiX /> Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Options List */}
                    <div className="glass-panel p-4">
                        {loading ? (
                            <p className="text-gray-400 text-center py-8">Loading...</p>
                        ) : options.length === 0 ? (
                            <p className="text-gray-400 text-center py-8">No options found. Add one to get started!</p>
                        ) : (
                            <div className="space-y-2">
                                {options.map(option => (
                                    <div key={option.id} className="bg-white/5 border border-white/10 rounded-md p-3 hover:bg-white/10 transition">
                                        {editingOption?.id === option.id ? (
                                            <form onSubmit={handleUpdateOption} className="space-y-3">
                                                <div className="grid grid-cols-3 gap-3">
                                                    <input
                                                        type="text"
                                                        value={editingOption.value}
                                                        onChange={e => setEditingOption({ ...editingOption, value: e.target.value })}
                                                        className="bg-black/20 border border-white/20 rounded p-2 text-white text-sm"
                                                        required
                                                    />
                                                    <input
                                                        type="text"
                                                        value={editingOption.label}
                                                        onChange={e => setEditingOption({ ...editingOption, label: e.target.value })}
                                                        className="bg-black/20 border border-white/20 rounded p-2 text-white text-sm"
                                                        required
                                                    />
                                                    <input
                                                        type="number"
                                                        value={editingOption.display_order}
                                                        onChange={e => setEditingOption({ ...editingOption, display_order: parseInt(e.target.value) })}
                                                        className="bg-black/20 border border-white/20 rounded p-2 text-white text-sm"
                                                    />
                                                </div>
                                                <div className="flex gap-2">
                                                    <button type="submit" className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs">
                                                        <FiSave /> Save
                                                    </button>
                                                    <button type="button" onClick={() => setEditingOption(null)} className="flex items-center gap-1 px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs">
                                                        <FiX /> Cancel
                                                    </button>
                                                </div>
                                            </form>
                                        ) : (
                                            <div className="flex justify-between items-center">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-white font-medium">{option.label}</span>
                                                        <span className="text-xs text-gray-500 font-mono bg-black/30 px-2 py-0.5 rounded">{option.value}</span>
                                                        <span className="text-xs text-gray-400">Order: {option.display_order}</span>
                                                        {!option.is_active && (
                                                            <span className="text-xs bg-red-600/20 text-red-400 px-2 py-0.5 rounded">Inactive</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleToggleActive(option.id)}
                                                        className={`p-2 rounded transition ${option.is_active ? 'text-green-400 hover:bg-green-600/20' : 'text-gray-500 hover:bg-gray-600/20'}`}
                                                        title={option.is_active ? 'Deactivate' : 'Activate'}
                                                    >
                                                        {option.is_active ? <FiToggleRight size={18} /> : <FiToggleLeft size={18} />}
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingOption(option)}
                                                        className="p-2 text-blue-400 hover:bg-blue-600/20 rounded transition"
                                                    >
                                                        <FiEdit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteOption(option.id)}
                                                        className="p-2 text-red-400 hover:bg-red-600/20 rounded transition"
                                                    >
                                                        <FiTrash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfigManager;
