import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiUser, FiBell, FiGlobe, FiGrid, FiList, FiMinus, FiPlus, FiX, FiPrinter, FiSave } from 'react-icons/fi';
import { toast } from 'react-hot-toast';

const POS = () => {
  const navigate = useNavigate();
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderType, setOrderType] = useState('Dine In'); // Dine In, Delivery, Pick Up
  const [paymentMode, setPaymentMode] = useState('Cash'); // Cash, Card, Due, Part

  // Load Menu
  useEffect(() => {
    const loadMenu = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Please login to access POS');
        navigate('/login');
        return;
      }

      try {
        const response = await axios.get('http://localhost:5000/api/menu', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMenu(response.data);

        // Extract Categories
        const cats = ['All', ...new Set(response.data.map(item => item.category))];
        setCategories(cats);
      } catch (err) {
        console.error('Failed to load menu:', err);
        toast.error('Failed to load menu');
        if (err.response && err.response.status === 401) {
          navigate('/login');
        }
      }
    };
    loadMenu();
  }, [navigate]);

  const addToCart = (item) => {
    setCart(prev => {
      const exist = prev.find(i => i.id === item.id);
      if (exist) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  };

  const handleCheckout = async (print = false) => {
    if (cart.length === 0) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:5000/api/orders', {
        items: cart,
        type: orderType,
        paymentMode: paymentMode
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(print ? 'Order Saved & Printed!' : 'Order Saved!');
      setCart([]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save order');
    } finally {
      setLoading(false);
    }
  };

  const filteredMenu = useMemo(() => {
    return menu.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [menu, selectedCategory, searchQuery]);

  return (
    <div className="flex h-screen w-full bg-gray-100 text-gray-800 font-sans overflow-hidden">

      {/* LEFT SIDEBAR - CATEGORIES */}
      <div className="w-48 bg-gray-800 flex flex-col text-gray-300">
        <div className="p-4 border-b border-gray-700 font-bold text-white">Categories</div>
        <div className="flex-1 overflow-y-auto">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`w-full text-left p-4 hover:bg-gray-700 transition-colors border-l-4 ${selectedCategory === cat ? 'border-green-500 bg-gray-700 text-white' : 'border-transparent'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* CENTER - MENU GRID */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-200">
        {/* Top Bar */}
        <div className="bg-white p-2 flex items-center gap-4 shadow-sm">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search item..."
              className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:border-red-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 text-gray-600">
            <button className="p-2 hover:bg-gray-100 rounded"><FiBell /></button>
            <button className="p-2 hover:bg-gray-100 rounded"><FiGlobe /></button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 p-2 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {filteredMenu.map(item => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="bg-white p-2 rounded shadow-sm hover:shadow-md transition-shadow flex flex-col items-center justify-center h-24 text-center border border-transparent hover:border-red-500"
              >
                <span className="font-semibold text-sm line-clamp-2">{item.name}</span>
                <span className="text-xs text-gray-500 mt-1">₹{item.price}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR - CART/BILLING */}
      <div className="w-96 bg-white shadow-xl flex flex-col border-l border-gray-300">

        {/* Order Type Tabs */}
        <div className="flex text-sm font-bold text-white">
          {['Dine In', 'Delivery', 'Pick Up'].map(type => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={`flex-1 py-3 text-center transition-colors ${orderType === type ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Customer Info / Table Info Placeholder */}
        <div className="p-2 border-b flex gap-2 text-sm bg-gray-50">
          <div className="flex-1 flex items-center gap-2 bg-white border p-1 rounded">
            <FiGrid className="text-gray-400" />
            <span className="text-gray-600">Table: --</span>
          </div>
          <div className="flex-1 flex items-center gap-2 bg-white border p-1 rounded">
            <FiUser className="text-gray-400" />
            <span className="text-gray-600">Customer...</span>
          </div>
        </div>

        {/* Cart Items Header */}
        <div className="flex bg-gray-100 text-xs font-bold text-gray-500 p-2 border-b">
          <div className="flex-1">ITEM</div>
          <div className="w-16 text-center">QTY</div>
          <div className="w-16 text-right">PRICE</div>
          <div className="w-8"></div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
              <FiList size={48} className="mb-2" />
              <p>No Item Selected</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="flex items-center text-sm py-2 border-b border-dashed border-gray-200">
                <div className="flex-1 font-medium">{item.name}</div>
                <div className="w-20 flex items-center justify-center gap-2">
                  <button onClick={() => updateQty(item.id, -1)} className="text-gray-400 hover:text-red-500"><FiMinus size={12} /></button>
                  <span>{item.qty}</span>
                  <button onClick={() => updateQty(item.id, 1)} className="text-gray-400 hover:text-green-500"><FiPlus size={12} /></button>
                </div>
                <div className="w-16 text-right">{(item.price * item.qty).toFixed(0)}</div>
                <button onClick={() => updateQty(item.id, -item.qty)} className="w-8 flex justify-center text-gray-300 hover:text-red-500">
                  <FiX />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer / Actions */}
        <div className="bg-gray-800 text-white p-3">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-400">Total</span>
            <span className="text-2xl font-bold">₹ {calculateTotal().toFixed(2)}</span>
          </div>

          {/* Payment Modes */}
          <div className="flex gap-2 mb-3 text-xs">
            {['Cash', 'Card', 'Due', 'Part'].map(mode => (
              <label key={mode} className="flex-1 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMode"
                  className="peer sr-only"
                  checked={paymentMode === mode}
                  onChange={() => setPaymentMode(mode)}
                />
                <div className="text-center py-1 rounded border border-gray-600 peer-checked:bg-white peer-checked:text-black peer-checked:font-bold hover:bg-gray-700 transition-all">
                  {mode}
                </div>
              </label>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleCheckout(false)}
              disabled={cart.length === 0 || loading}
              className="bg-red-600 hover:bg-red-700 text-white py-3 font-bold rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiSave /> SAVE
            </button>
            <button
              onClick={() => handleCheckout(true)}
              disabled={cart.length === 0 || loading}
              className="bg-gray-700 hover:bg-gray-600 text-white py-3 font-bold rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiPrinter /> SAVE & PRINT
            </button>
            <button className="bg-orange-600 hover:bg-orange-700 text-white py-2 font-bold rounded text-sm">
              KOT
            </button>
            <button className="bg-gray-700 hover:bg-gray-600 text-white py-2 font-bold rounded text-sm">
              KOT & PRINT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POS;