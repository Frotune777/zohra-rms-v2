import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

/**
 * Custom hook for managing payroll data
 * @param {number} month - Selected month
 * @param {number} year - Selected year
 * @returns {Object} { payrollData, loading, error, refetch, runPayroll, approvePayroll, processPayment }
 */
export const usePayroll = (month, year) => {
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchPayroll = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/payroll/monthly', {
                params: { month, year }
            });
            setPayrollData(response.data);
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to load payroll data';
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const runPayroll = async (employeeId, payrollDetails) => {
        try {
            const response = await api.post('/payroll/run', {
                employeeId,
                month,
                year,
                ...payrollDetails
            });
            toast.success('Payroll processed successfully');
            await fetchPayroll();
            return response.data;
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to run payroll';
            toast.error(errorMsg);
            throw err;
        }
    };

    const approvePayroll = async (payrollId) => {
        try {
            const response = await api.put(`/payroll/${payrollId}/approve`);
            setPayrollData(payrollData.map(p => p.id === payrollId ? response.data : p));
            toast.success('Payroll approved successfully');
            return response.data;
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to approve payroll';
            toast.error(errorMsg);
            throw err;
        }
    };

    const processPayment = async (payrollId, paymentDetails) => {
        try {
            const response = await api.post(`/payroll/${payrollId}/payment`, paymentDetails);
            setPayrollData(payrollData.map(p => p.id === payrollId ? response.data : p));
            toast.success('Payment processed successfully');
            return response.data;
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to process payment';
            toast.error(errorMsg);
            throw err;
        }
    };

    useEffect(() => {
        if (month && year) {
            fetchPayroll();
        }
    }, [month, year]);

    return {
        payrollData,
        loading,
        error,
        refetch: fetchPayroll,
        runPayroll,
        approvePayroll,
        processPayment
    };
};
