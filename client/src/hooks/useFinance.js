import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

/**
 * Custom hook for managing finance data
 * @param {number} month - Selected month
 * @param {number} year - Selected year
 * @returns {Object} { financeData, transactions, loading, error, refetch, addRevenue, addExpense, deleteTransaction }
 */
export const useFinance = (month, year) => {
    const [financeData, setFinanceData] = useState({ revenue: 0, expenses: 0, profit: 0 });
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchFinanceData = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/finance/pnl', {
                params: { month, year }
            });
            setFinanceData(response.data);
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to load finance data';
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const fetchTransactions = async () => {
        try {
            const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month, 0).toISOString().split('T')[0];

            const response = await api.get('/finance/transactions', {
                params: { startDate, endDate }
            });
            setTransactions(response.data);
        } catch (err) {
            console.error('Failed to load transactions:', err);
        }
    };

    const addRevenue = async (revenueData) => {
        try {
            const response = await api.post('/finance/revenue', revenueData);
            toast.success('Revenue added successfully');
            await fetchFinanceData();
            await fetchTransactions();
            return response.data;
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to add revenue';
            toast.error(errorMsg);
            throw err;
        }
    };

    const addExpense = async (expenseData) => {
        try {
            const response = await api.post('/finance/expense', expenseData);
            toast.success('Expense added successfully');
            await fetchFinanceData();
            await fetchTransactions();
            return response.data;
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to add expense';
            toast.error(errorMsg);
            throw err;
        }
    };

    const deleteTransaction = async (id) => {
        try {
            await api.delete(`/finance/transaction/${id}`);
            toast.success('Transaction deleted successfully');
            await fetchFinanceData();
            await fetchTransactions();
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to delete transaction';
            toast.error(errorMsg);
            throw err;
        }
    };

    useEffect(() => {
        if (month && year) {
            fetchFinanceData();
            fetchTransactions();
        }
    }, [month, year]);

    return {
        financeData,
        transactions,
        loading,
        error,
        refetch: () => {
            fetchFinanceData();
            fetchTransactions();
        },
        addRevenue,
        addExpense,
        deleteTransaction
    };
};
