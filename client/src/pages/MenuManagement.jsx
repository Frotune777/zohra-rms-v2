import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { FiPlus, FiTrash2, FiX, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

const MenuManagement = () => {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: ''
  });
  const { userRole } = useAuth();

  // Only owner and manager can manage menu
  const canManageMenu = userRole === 'owner' || userRole === 'manager';

  useEffect(() => {
    fetchMenuItems();
  }, []);

  const fetchMenuItems = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/menu', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load menu items');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!formData.name || !formData.price || !formData.category) {
      setError('All fields are required');
      return;
    }

    if (parseFloat(formData.price) <= 0) {
      setError('Price must be greater than 0');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        price: parseFloat(formData.price),
        category: formData.category
      };

      const token = localStorage.getItem('token');
      await axios.post('http://localhost:5000/api/menu', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccessMessage(`✓ Menu item "${formData.name}" added successfully`);
      setFormData({ name: '', price: '', category: '' });
      setShowForm(false);
      fetchMenuItems();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add menu item');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete menu item "${name}"? This action cannot be undone.`)) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://localhost:5000/api/menu/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccessMessage(`✓ Menu item "${name}" deleted successfully`);
      fetchMenuItems();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete menu item');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({ name: '', price: '', category: '' });
    setError('');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400">Loading menu items...</p>
      </div>
    );
  }

  // Group items by category
  const groupedByCategory = items.reduce((acc, item) => {
    const category = item.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  return (
    <div className="h-full w-full flex flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-zohra-blue">Menu Management</h1>
        {canManageMenu && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 btn-primary"
          >
            <FiPlus /> Add Menu Item
          </button>
        )}
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

      {/* Add Form */}
      {showForm && canManageMenu && (
        <form onSubmit={handleSubmit} className="glass-panel p-6 mb-6 rounded-xl space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Add New Menu Item</h2>
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-400 hover:text-white transition"
            >
              <FiX size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">Item Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="e.g., Butter Chicken"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="250"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-zohra-blue"
                required
              >
                <option value="" className="bg-gray-800 text-white">Select Category</option>
                <option value="Biryani" className="bg-gray-800 text-white">Biryani</option>
                <option value="Curry" className="bg-gray-800 text-white">Curry</option>
                <option value="Bread" className="bg-gray-800 text-white">Bread</option>
                <option value="Starter" className="bg-gray-800 text-white">Starter</option>
                <option value="South Indian" className="bg-gray-800 text-white">South Indian</option>
                <option value="Beverage" className="bg-gray-800 text-white">Beverage</option>
                <option value="Other" className="bg-gray-800 text-white">Other</option>
              </select>
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
              Add Menu Item
            </button>
          </div>
        </form>
      )}

      {/* Menu Items by Category */}
      <div className="flex-1 overflow-auto">
        {Object.entries(groupedByCategory).map(([category, categoryItems]) => (
          <div key={category} className="mb-8">
            <h3 className="text-lg font-bold text-zohra-blue mb-4 sticky top-0 bg-midnight/80 py-2">
              {category}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryItems.map((item) => (
                <div key={item.id} className="glass-panel p-4 rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-white mb-1">{item.name}</h4>
                      <p className="text-2xl font-bold text-zohra-blue">₹{parseFloat(item.price).toFixed(2)}</p>
                    </div>
                    {canManageMenu && (
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        className="p-2 hover:bg-red-500/20 rounded transition text-red-400 ml-2"
                        title="Delete item"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{category}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {items.length === 0 && !loading && (
          <div className="text-center py-8">
            <p className="text-gray-400">No menu items found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuManagement;
