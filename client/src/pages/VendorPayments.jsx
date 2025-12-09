import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiDollarSign, FiTrendingUp, FiUsers, FiAlertCircle, FiPlus, FiX, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function VendorPayments() {
    const navigate = useNavigate();
    const [vendors, setVendors] = useState([]);
    const [payments, setPayments] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [vendorDetails, setVendorDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [formData, setFormData] = useState({
        vendorId: '',
        amount: '',
        paymentMode: 'Cash',
        reference: '',
        notes: '',
        paidBy: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Bearer ${token}` } };

            const [vendorsRes, paymentsRes, categoriesRes] = await Promise.all([
                axios.get('http://localhost:5000/api/vendors/outstanding', config),
                axios.get('http://localhost:5000/api/vendors/payments', config),
                axios.get('http://localhost:5000/api/vendors/categories', config)
            ]);

            setVendors(vendorsRes.data);
            setPayments(paymentsRes.data);
            setCategories(categoriesRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to load vendor data');
        } finally {
            setLoading(false);
        }
    };

    const fetchVendorDetails = async (vendorId) => {
        if (!vendorId) {
            setVendorDetails(null);
            return;
        }

        try {
            setLoadingDetails(true);
            const token = localStorage.getItem('token');
            const response = await axios.get(`http://localhost:5000/api/vendors/${vendorId}/details`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setVendorDetails(response.data);
        } catch (error) {
            console.error('Error fetching vendor details:', error);
            toast.error('Failed to load vendor details');
        } finally {
            setLoadingDetails(false);
        }
    };

    const handlePaymentSubmit = async (e) => {
        e.preventDefault();

        try {
            const token = localStorage.getItem('token');
            await axios.post('http://localhost:5000/api/vendors/payments', formData, {
                headers: { Authorization: `Bearer ${token}` }
            });

            toast.success('Payment processed successfully');
            setShowPaymentModal(false);
            setFormData({
                vendorId: '',
                amount: '',
                paymentMode: 'Cash',
                reference: '',
                notes: '',
                paidBy: ''
            });
            setVendorDetails(null);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to process payment');
        }
    };

    const openPaymentModal = (vendor) => {
        setSelectedVendor(vendor);
        setFormData({
            ...formData,
            vendorId: vendor.vendor_id,
            amount: parseFloat(vendor.outstanding_balance) > 0 ? parseFloat(vendor.outstanding_balance).toFixed(2) : ''
        });
        setShowPaymentModal(true);
    };

    const totalOutstanding = vendors.reduce((sum, v) => sum + parseFloat(v.outstanding_balance || 0), 0);
    const vendorsWithBalance = vendors.filter(v => parseFloat(v.outstanding_balance) > 0).length;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-8 h-full w-full flex flex-col overflow-hidden bg-gradient-to-br from-midnight to-midnight/95">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-zohra-blue mb-2">Vendor Payments</h2>
                    <p className="text-xs text-gray-400">Manage vendor payments and track outstanding balances</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => navigate('/chicken/vendors')}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
                    >
                        <FiUsers /> Manage Vendors
                    </button>
                    <button
                        onClick={() => setShowPaymentModal(true)}
                        className="flex items-center gap-2 btn-primary"
                    >
                        <FiPlus /> Process Payment
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="glass-panel p-4 rounded-lg">
                    <p className="text-gray-400 text-sm uppercase mb-2">Total Outstanding</p>
                    <p className="text-2xl font-bold text-red-400">₹{totalOutstanding.toLocaleString('en-IN')}</p>
                </div>
                <div className="glass-panel p-4 rounded-lg">
                    <p className="text-gray-400 text-sm uppercase mb-2">Vendors with Balance</p>
                    <p className="text-2xl font-bold text-zohra-blue">{vendorsWithBalance}</p>
                </div>
                <div className="glass-panel p-4 rounded-lg">
                    <p className="text-gray-400 text-sm uppercase mb-2">Total Vendors</p>
                    <p className="text-2xl font-bold text-white">{vendors.length}</p>
                </div>
                <div className="glass-panel p-4 rounded-lg">
                    <p className="text-gray-400 text-sm uppercase mb-2">Payments Today</p>
                    <p className="text-2xl font-bold text-green-400">
                        {payments.filter(p => new Date(p.payment_date).toDateString() === new Date().toDateString()).length}
                    </p>
                </div>
            </div>

            {/* Vendors Table */}
            <div className="glass-panel rounded-xl overflow-hidden flex-1 flex flex-col mb-6">
                <div className="p-4 border-b border-white/10">
                    <h3 className="text-lg font-bold text-white">Vendor Outstanding Balances</h3>
                </div>
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white/5 text-gray-400 border-b border-white/10 sticky top-0">
                            <tr>
                                <th className="p-4 font-semibold">Vendor</th>
                                <th className="p-4 font-semibold">Type</th>
                                <th className="p-4 font-semibold">Category</th>
                                <th className="p-4 font-semibold">Outstanding</th>
                                <th className="p-4 font-semibold">Bills</th>
                                <th className="p-4 font-semibold">Payments</th>
                                <th className="p-4 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendors.map((vendor) => (
                                <tr key={vendor.vendor_id} className="border-b border-white/5 hover:bg-white/5 transition">
                                    <td className="p-4 font-semibold">{vendor.vendor_name}</td>
                                    <td className="p-4 text-sm text-gray-300">{vendor.vendor_type}</td>
                                    <td className="p-4 text-sm text-gray-300">{vendor.category_name || '-'}</td>
                                    <td className={`p-4 font-bold ${parseFloat(vendor.outstanding_balance) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                        ₹{parseFloat(vendor.outstanding_balance).toLocaleString('en-IN')}
                                    </td>
                                    <td className="p-4 text-sm">{vendor.total_bills || 0}</td>
                                    <td className="p-4 text-sm text-green-400">{vendor.total_payments || 0}</td>
                                    <td className="p-4">
                                        {parseFloat(vendor.outstanding_balance) > 0 && (
                                            <button
                                                onClick={() => openPaymentModal(vendor)}
                                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition"
                                            >
                                                Pay
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Payment Modal */}
            {
                showPaymentModal && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                        <div className="glass-panel p-6 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-bold">Process Vendor Payment</h3>
                                <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-white">
                                    <FiX size={24} />
                                </button>
                            </div>

                            {loadingDetails && (
                                <div className="mb-4 p-4 bg-white/5 rounded-lg flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                                    <span className="text-gray-400">Loading vendor details...</span>
                                </div>
                            )}

                            {vendorDetails && !loadingDetails && (
                                <div className="mb-4 space-y-3">
                                    {/* Current Balance Card */}
                                    <div className="p-4 bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/50 rounded-lg">
                                        <p className="text-sm text-gray-300">Outstanding Balance</p>
                                        <p className="text-3xl font-bold text-red-400">
                                            ₹{parseFloat(vendorDetails.outstanding_balance).toLocaleString('en-IN')}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            {vendorDetails.category_name} • {vendorDetails.vendor_type}
                                        </p>
                                    </div>

                                    {/* Summary Grid */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 bg-white/5 rounded-lg">
                                            <p className="text-xs text-gray-400">Total Bills</p>
                                            <p className="text-lg font-bold">{vendorDetails.total_bills}</p>
                                            <p className="text-xs text-gray-500">₹{vendorDetails.total_bill_amount.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div className="p-3 bg-white/5 rounded-lg">
                                            <p className="text-xs text-gray-400">Total Payments</p>
                                            <p className="text-lg font-bold text-green-400">{vendorDetails.total_payments}</p>
                                            <p className="text-xs text-gray-500">₹{vendorDetails.total_payment_amount.toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>

                                    {/* Last Payment */}
                                    {vendorDetails.last_payment ? (
                                        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                            <p className="text-xs text-gray-400 mb-1">Last Payment</p>
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="text-sm font-medium">₹{parseFloat(vendorDetails.last_payment.amount).toLocaleString('en-IN')}</p>
                                                    <p className="text-xs text-gray-500">{new Date(vendorDetails.last_payment.date).toLocaleDateString()}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-400">{vendorDetails.last_payment.payment_mode}</p>
                                                    <p className="text-xs text-gray-500">by {vendorDetails.last_payment.paid_by}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                                            <p className="text-xs text-yellow-400">No previous payments</p>
                                        </div>
                                    )}

                                    {/* Recent Payments */}
                                    {vendorDetails.recent_payments && vendorDetails.recent_payments.length > 0 && (
                                        <div className="p-3 bg-white/5 rounded-lg">
                                            <p className="text-xs text-gray-400 mb-2">Recent Payments (Last 5)</p>
                                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                                {vendorDetails.recent_payments.map((payment, idx) => (
                                                    <div key={idx} className="flex justify-between text-xs border-b border-white/5 pb-1">
                                                        <span className="text-gray-400">{new Date(payment.date).toLocaleDateString()}</span>
                                                        <span className="text-green-400 font-medium">₹{parseFloat(payment.amount).toLocaleString('en-IN')}</span>
                                                        <span className="text-gray-500">{payment.payment_mode}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <form onSubmit={handlePaymentSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Vendor *</label>
                                    <select
                                        value={formData.vendorId}
                                        onChange={(e) => {
                                            const vendorId = e.target.value;
                                            const vendor = vendors.find(v => v.vendor_id == vendorId);
                                            setFormData({
                                                ...formData,
                                                vendorId: vendorId,
                                                amount: parseFloat(vendor?.outstanding_balance) > 0 ? parseFloat(vendor.outstanding_balance).toFixed(2) : ''
                                            });
                                            setSelectedVendor(vendor);
                                            fetchVendorDetails(vendorId);
                                        }}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                        required
                                    >
                                        <option value="">Select Vendor</option>
                                        {vendors.map(v => (
                                            <option key={v.vendor_id} value={v.vendor_id} className="bg-gray-800">
                                                {v.vendor_name} - ₹{parseFloat(v.outstanding_balance).toFixed(2)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Amount (₹) *</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.amount}
                                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                                            required
                                        />
                                        {vendorDetails && formData.amount && (
                                            <div className="mt-2 text-xs text-right">
                                                <span className="text-gray-400">Balance after: </span>
                                                <span className={`font-bold ${(parseFloat(vendorDetails.outstanding_balance) - parseFloat(formData.amount)) < 0
                                                    ? 'text-green-400'
                                                    : 'text-red-400'
                                                    }`}>
                                                    ₹{(parseFloat(vendorDetails.outstanding_balance) - parseFloat(formData.amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Payment Mode *</label>
                                        <select
                                            value={formData.paymentMode}
                                            onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                            required
                                        >
                                            <option value="Cash" className="bg-gray-800">Cash</option>
                                            <option value="UPI" className="bg-gray-800">UPI</option>
                                            <option value="Bank Transfer" className="bg-gray-800">Bank Transfer</option>
                                            <option value="Cheque" className="bg-gray-800">Cheque</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Reference Number</label>
                                    <input
                                        type="text"
                                        value={formData.reference}
                                        onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                                        placeholder="Transaction ID / Cheque No"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Paid By *</label>
                                    <select
                                        value={formData.paidBy}
                                        onChange={(e) => setFormData({ ...formData, paidBy: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                                        required
                                    >
                                        <option value="" className="bg-gray-800">Select Payer</option>
                                        <option value="Owner" className="bg-gray-800">Owner</option>
                                        <option value="Manager" className="bg-gray-800">Manager</option>
                                        <option value="Staff" className="bg-gray-800">Staff</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Notes *</label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                                        rows="3"
                                        placeholder="Payment details / Bill reference"
                                        required
                                    />
                                </div>

                                <div className="flex gap-3 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowPaymentModal(false)}
                                        className="btn-secondary"
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-primary">
                                        Process Payment
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
