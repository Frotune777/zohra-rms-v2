import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { FiDollarSign } from 'react-icons/fi';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import { validatePositiveNumber, validateRequired } from '../../utils/validation';
import { Input, Select, Textarea, Button } from '../../components/forms';

const PaymentEntry = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [formData, setFormData] = useState({
        supplierId: '',
        amount: '',
        paymentMode: 'Cash',
        details: ''
    });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            const res = await api.get('/chicken/suppliers');
            setSuppliers(res.data);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load suppliers');
        }
    };

    const validateForm = () => {
        const newErrors = {};

        const supplierError = validateRequired(formData.supplierId, 'Supplier');
        if (supplierError) newErrors.supplierId = supplierError;

        const amountError = validatePositiveNumber(formData.amount, 'Amount');
        if (amountError) newErrors.amount = amountError;

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            toast.error('Please fix the errors before submitting');
            return;
        }

        setLoading(true);
        try {
            await api.post('/finance/payment', {
                ...formData,
                amount: parseFloat(formData.amount)
            });
            toast.success('Payment recorded successfully');
            setFormData({ supplierId: '', amount: '', paymentMode: 'Cash', details: '' });
            setErrors({});
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to record payment');
        } finally {
            setLoading(false);
        }
    };

    const paymentModeOptions = [
        { value: 'Cash', label: 'Cash' },
        { value: 'UPI', label: 'UPI' },
        { value: 'Bank Transfer', label: 'Bank Transfer' },
        { value: 'Cheque', label: 'Cheque' }
    ];

    const supplierOptions = suppliers.map(s => ({
        value: s.id,
        label: `${s.name} (${s.vendor_type})`
    }));

    return (
        <div className="p-6">
            <PageHeader title="Vendor Payment Entry" showBack={true} showHome={true} backTo="/finance" />

            <div className="glass-panel p-6 max-w-2xl rounded-xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Select
                        label="Select Supplier"
                        value={formData.supplierId}
                        onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                        options={supplierOptions}
                        error={errors.supplierId}
                        required
                        placeholder="-- Select Supplier --"
                    />

                    <div className="grid grid-cols-2 gap-6">
                        <Input
                            label="Amount (₹)"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            error={errors.amount}
                            required
                            placeholder="0.00"
                        />

                        <Select
                            label="Payment Mode"
                            value={formData.paymentMode}
                            onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                            options={paymentModeOptions}
                        />
                    </div>

                    <Textarea
                        label="Details / Remarks"
                        value={formData.details}
                        onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                        placeholder="Transaction ID, Cheque No, etc."
                        rows={4}
                    />

                    <Button
                        type="submit"
                        variant="success"
                        loading={loading}
                        className="w-full py-4"
                    >
                        <FiDollarSign /> Record Payment
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default PaymentEntry;
