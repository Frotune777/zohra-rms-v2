import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FiTrendingUp, FiShoppingCart, FiAlertCircle } from 'react-icons/fi';

const AIDashboard = () => {
    const [suggestedOrders, setSuggestedOrders] = useState([]);
    const [inventoryItems, setInventoryItems] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [forecastData, setForecastData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (selectedItem) {
            fetchForecast(selectedItem);
        }
    }, [selectedItem]);

    const fetchInitialData = async () => {
        try {
            const [ordersRes, itemsRes] = await Promise.all([
                api.get('ai/suggested-orders'),
                api.get('inventory')
            ]);

            setSuggestedOrders(ordersRes.data);
            setInventoryItems(itemsRes.data);
            if (itemsRes.data.length > 0) {
                setSelectedItem(itemsRes.data[0].id);
            }
            setLoading(false);
        } catch (err) {
            console.error("Error fetching AI data:", err);
            setLoading(false);
        }
    };

    const fetchForecast = async (itemId) => {
        try {
            const res = await api.get(`ai/forecast/${itemId}`);

            // Transform data for Recharts
            // dailyUsage is { "2023-10-01": 5, ... }
            const chartData = Object.entries(res.data.dailyUsage).map(([date, usage]) => ({
                date,
                usage
            })).sort((a, b) => new Date(a.date) - new Date(b.date));

            setForecastData({
                ...res.data,
                chartData
            });
        } catch (err) {
            console.error("Error fetching forecast:", err);
        }
    };

    if (loading) return <div className="p-8 text-white">Loading AI Insights...</div>;

    return (
        <div className="p-6 h-full overflow-y-auto">
            <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
                <FiTrendingUp className="text-zohra-blue" />
                AI Insights & Automation
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Smart Procurement Section */}
                <div className="glass-panel p-6 rounded-xl">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <FiShoppingCart className="text-green-400" />
                        Smart Procurement (Auto-PO)
                    </h2>
                    {suggestedOrders.length === 0 ? (
                        <p className="text-gray-400">No low stock items detected.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-gray-300">
                                <thead className="text-xs uppercase bg-white/5 text-gray-400">
                                    <tr>
                                        <th className="p-3">Item</th>
                                        <th className="p-3">Stock</th>
                                        <th className="p-3">Daily Usage</th>
                                        <th className="p-3">Suggested Qty</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/10">
                                    {suggestedOrders.map((order) => (
                                        <tr key={order.inventory_item_id} className="hover:bg-white/5">
                                            <td className="p-3 font-medium text-white">{order.name}</td>
                                            <td className="p-3 text-red-400 font-bold">{order.current_stock}</td>
                                            <td className="p-3">{order.avg_daily_usage}</td>
                                            <td className="p-3 text-green-400 font-bold">{order.suggested_order_qty}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Demand Forecasting Section */}
                <div className="glass-panel p-6 rounded-xl">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <FiTrendingUp className="text-blue-400" />
                        Demand Forecasting
                    </h2>

                    <div className="mb-4">
                        <label className="text-sm text-gray-400 block mb-2">Select Item to Forecast</label>
                        <select
                            className="w-full p-2 rounded bg-black/30 border border-white/10 text-white focus:border-zohra-blue outline-none"
                            value={selectedItem || ''}
                            onChange={(e) => setSelectedItem(e.target.value)}
                        >
                            {inventoryItems.map(item => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                        </select>
                    </div>

                    {forecastData && (
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={forecastData.chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 12 }} />
                                    <YAxis stroke="#888" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Legend />
                                    <Line type="monotone" dataKey="usage" stroke="#3b82f6" strokeWidth={2} dot={false} name="Daily Usage" />
                                </LineChart>
                            </ResponsiveContainer>
                            <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10">
                                <p className="text-gray-400 text-sm">Predicted Demand (Next Day)</p>
                                <p className="text-2xl font-bold text-zohra-blue">{forecastData.forecast} <span className="text-sm text-gray-500">{forecastData.unit}</span></p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AIDashboard;
