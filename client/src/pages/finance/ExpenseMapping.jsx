import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { FiPlus, FiTrash2, FiEdit2, FiSave, FiX, FiRefreshCw, FiList, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

const ExpenseMapping = () => {
    const [mappings, setMappings] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ item_keyword: '', category_id: '' });
    const [showForm, setShowForm] = useState(false);

    // Applying history state
    const [applyingId, setApplyingId] = useState(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [mapRes, catRes] = await Promise.all([
                api.get('finance/mappings'),
                api.get('finance/tracker/categories')
            ]);
            setMappings(mapRes.data);
            setCategories(catRes.data);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load mappings');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`finance/mappings/${editingId}`, formData);
                toast.success('Mapping updated');
            } else {
                await api.post('finance/mappings', formData);
                toast.success('Mapping created');
            }
            fetchData();
            handleCancel();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to save mapping');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this mapping?')) return;
        try {
            await api.delete(`finance/mappings/${id}`);
            toast.success('Mapping deleted');
            fetchData();
        } catch (error) {
            toast.error('Failed to delete mapping');
        }
    };

    const handleApplyHistory = async (id, keyword) => {
        if (!window.confirm(`Apply mapping for "${keyword}" to all historical transactions? This will overwrite existing categories for matching descriptions.`)) return;

        setApplyingId(id);
        try {
            const res = await api.post(`finance/mappings/${id}/apply`);
            toast.success(`Updated ${res.data.updatedCount} transactions`);
        } catch (error) {
            toast.error('Failed to apply mapping to history');
        } finally {
            setApplyingId(null);
        }
    };

    const handleEdit = (mapping) => {
        setEditingId(mapping.id);
        setFormData({ item_keyword: mapping.item_keyword, category_id: mapping.category_id });
        setShowForm(true);
    };

    const handleCancel = () => {
        setEditingId(null);
        setFormData({ item_keyword: '', category_id: '' });
        setShowForm(false);
    };

    return (
        <div className="p-6 max-w-6xl mx-auto h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <FiList className="text-purple-400" /> Expense Auto-Categorization
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">Manage rules to automatically categorize expenses based on keywords.</p>
                </div>
                <button
                    onClick={() => setShowForm(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
                >
                    <FiPlus /> Add Rule
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <div className="mb-8 glass-panel p-6 rounded-xl border border-purple-500/30">
                    <h3 className="text-lg font-bold text-white mb-4">{editingId ? 'Edit Rule' : 'New Auto-Categorization Rule'}</h3>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Concept / Keyword (Item Name)</label>
                            <input
                                type="text"
                                value={formData.item_keyword}
                                onChange={(e) => setFormData({ ...formData, item_keyword: e.target.value })}
                                className="w-full bg-gray-800 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                                placeholder="e.g. Uber, Milk, Salary"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Map to Category</label>
                            <select
                                value={formData.category_id}
                                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                                className="w-full bg-gray-800 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                                required
                            >
                                <option value="">Select Category</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={handleCancel} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex-1">Cancel</button>
                            <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex-1 flex items-center justify-center gap-2">
                                <FiSave /> Save Rule
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* List */}
            <div className="glass-panel flex-1 rounded-xl overflow-hidden border border-white/5 flex flex-col">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white/5 text-gray-400 sticky top-0 backdrop-blur-md">
                            <tr>
                                <th className="p-4 font-semibold border-b border-white/10">Keyword / Description</th>
                                <th className="p-4 font-semibold border-b border-white/10">Mapped Category</th>
                                <th className="p-4 font-semibold border-b border-white/10 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {mappings.map(map => (
                                <tr key={map.id} className="hover:bg-white/5 transition">
                                    <td className="p-4 text-white font-medium">{map.item_keyword}</td>
                                    <td className="p-4 text-purple-300">
                                        <span className="bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded text-sm">
                                            {map.category_name || 'Unknown'}
                                        </span>
                                    </td>
                                    <td className="p-4 flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => handleApplyHistory(map.id, map.item_keyword)}
                                            disabled={applyingId === map.id}
                                            className="text-blue-400 hover:text-blue-300 p-2 rounded hover:bg-white/5 disabled:opacity-50"
                                            title="Apply to Historical Data"
                                        >
                                            {applyingId === map.id ? <FiRefreshCw className="animate-spin" /> : <FiRefreshCw />}
                                        </button>
                                        <button
                                            onClick={() => handleEdit(map)}
                                            className="text-gray-400 hover:text-white p-2 rounded hover:bg-white/5"
                                        >
                                            <FiEdit2 />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(map.id)}
                                            className="text-red-400 hover:text-red-300 p-2 rounded hover:bg-white/5"
                                        >
                                            <FiTrash2 />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {mappings.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="3" className="p-8 text-center text-gray-500">
                                        No categorization rules defined yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ExpenseMapping;
