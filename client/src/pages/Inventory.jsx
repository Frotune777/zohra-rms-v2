import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { FiPlus, FiTrash2, FiEdit2, FiX, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

const Inventory = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { userRole } = useAuth();

  const canManageInventory = userRole === 'manager' || userRole === 'owner';

  const [formData, setFormData] = useState({
    name: '',
    stock_qty: '',
    unit: 'kg',
    unit_cost: ''
  });

  useEffect(() => {
    fetchInventory();
  }, []);

  useEffect(() => {
    console.log('Inventory - User Role:', userRole, 'Can Manage:', canManageInventory);
  }, [userRole, canManageInventory]);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/inventory');
      setItems(res.data);
      setError('');
    } catch (err) {
      console.error('Failed to load inventory:', err);
      setError('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEdit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!formData.name || !formData.stock_qty || !formData.unit_cost) {
      setError('All fields are required');
      return;
    }

    try {
      if (editingId) {
        await api.put(`/inventory/${editingId}`, formData);
        setSuccessMessage(`✓ Inventory item updated successfully`);
      } else {
        await api.post('/inventory', formData);
        setSuccessMessage(`✓ Inventory item added successfully`);
      }

      setFormData({ name: '', stock_qty: '', unit: 'kg', unit_cost: '' });
      setEditingId(null);
      setShowForm(false);
      fetchInventory();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error saving item');
    }
  };

  const handleEdit = (item) => {
    setFormData({
      name: item.name,
      stock_qty: item.stock_qty,
      unit: item.unit,
      unit_cost: item.unit_cost
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This action cannot be undone.`)) return;

    try {
      await api.delete(`/inventory/${id}`);
      setSuccessMessage(`✓ Item deleted successfully`);
      fetchInventory();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete item');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', stock_qty: '', unit: 'kg', unit_cost: '' });
    setError('');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400">Loading inventory...</p>
      </div>
    );
  }

  const totalValue = items.reduce((sum, item) => sum + (parseFloat(item.stock_qty) * parseFloat(item.unit_cost)), 0);
  const lowStockItems = items.filter(item => parseFloat(item.stock_qty) < 10).length;

  return (
    <div className="p-8 h-full w-full flex flex-col overflow-hidden bg-gradient-to-br from-midnight to-midnight/95">
      {/* DEBUG INFO */}
      <div className="text-xs text-gray-500 mb-4 p-2 bg-white/5 rounded">
        Debug: Role={userRole}, CanManage={canManageInventory ? 'YES' : 'NO'}
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-zohra-blue mb-2">Inventory Management</h2>
          <p className="text-xs text-gray-400">Manage and track inventory items</p>
        </div>
        {/* Always show button for testing - canManageInventory: {canManageInventory.toString()} */}
        <button
          onClick={() => {
            console.log('Button clicked! showForm:', showForm, 'canManageInventory:', canManageInventory);
            setShowForm(!showForm);
          }}
          className="flex items-center gap-2 btn-primary"
          title={`Role: ${userRole}, Can Manage: ${canManageInventory}`}
        >
          <FiPlus /> Add Item {!canManageInventory && '(No Permission)'}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500 rounded-lg mb-4">
          <FiAlertCircle className="text-red-500" />
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 p-4 bg-green-500/20 border border-green-500 rounded-lg mb-4">
          <FiCheckCircle className="text-green-500" />
          <p className="text-green-200">{successMessage}</p>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && canManageInventory && (
        <form onSubmit={handleAddEdit} className="glass-panel p-6 mb-6 rounded-xl space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">{editingId ? 'Edit Item' : 'Add New Item'}</h3>
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-400 hover:text-white transition"
            >
              <FiX size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Item Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="e.g., Basmati Rice"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Quantity *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.stock_qty}
                onChange={(e) => setFormData({ ...formData, stock_qty: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="100"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Unit *</label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-zohra-blue"
                required
              >
                <option value="kg" className="bg-gray-800 text-white">kg</option>
                <option value="ltr" className="bg-gray-800 text-white">ltr</option>
                <option value="unit" className="bg-gray-800 text-white">unit</option>
                <option value="pcs" className="bg-gray-800 text-white">pcs</option>
                <option value="gram" className="bg-gray-800 text-white">gram</option>
                <option value="ml" className="bg-gray-800 text-white">ml</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Unit Cost (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.unit_cost}
                onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="50"
                required
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
            >
              {editingId ? 'Update Item' : 'Add Item'}
            </button>
          </div>
        </form>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glass-panel p-4 rounded-lg">
          <p className="text-gray-400 text-sm uppercase mb-2">Total Items</p>
          <p className="text-2xl font-bold text-zohra-blue">{items.length}</p>
        </div>
        <div className="glass-panel p-4 rounded-lg">
          <p className="text-gray-400 text-sm uppercase mb-2">Total Value</p>
          <p className="text-2xl font-bold text-green-400">₹{totalValue.toFixed(2)}</p>
        </div>
        <div className="glass-panel p-4 rounded-lg">
          <p className="text-gray-400 text-sm uppercase mb-2">Low Stock Items</p>
          <p className={`text-2xl font-bold ${lowStockItems > 0 ? 'text-red-400' : 'text-green-400'}`}>{lowStockItems}</p>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-xl overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/5 text-gray-400 border-b border-white/10 sticky top-0">
              <tr>
                <th className="p-4 font-semibold">Item Name</th>
                <th className="p-4 font-semibold">Quantity</th>
                <th className="p-4 font-semibold">Unit</th>
                <th className="p-4 font-semibold">Unit Cost</th>
                <th className="p-4 font-semibold">Total Value</th>
                {canManageInventory && <th className="p-4 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={canManageInventory ? 6 : 5} className="p-4 text-center text-gray-400">No inventory items</td>
                </tr>
              ) : (
                items.map(item => {
                  const totalValue = parseFloat(item.stock_qty) * parseFloat(item.unit_cost);
                  const isLow = parseFloat(item.stock_qty) < 10;

                  return (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="p-4 font-semibold">{item.name}</td>
                      <td className={`p-4 font-bold ${isLow ? 'text-red-400' : 'text-green-400'}`}>
                        {parseFloat(item.stock_qty).toFixed(2)} {isLow && ' (Low)'}
                      </td>
                      <td className="p-4 text-gray-400 text-sm">{item.unit}</td>
                      <td className="p-4 text-zohra-blue">₹{parseFloat(item.unit_cost).toFixed(2)}</td>
                      <td className="p-4 font-semibold">₹{totalValue.toFixed(2)}</td>
                      {canManageInventory && (
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(item)}
                              className="p-2 hover:bg-blue-500/20 rounded transition text-blue-400"
                              title="Edit"
                            >
                              <FiEdit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, item.name)}
                              className="p-2 hover:bg-red-500/20 rounded transition text-red-400"
                              title="Delete"
                            >
                              <FiTrash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default Inventory;