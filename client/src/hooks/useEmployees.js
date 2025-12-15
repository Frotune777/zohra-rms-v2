import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

/**
 * Custom hook for managing employees data
 * @returns {Object} { employees, loading, error, refetch, createEmployee, updateEmployee, deleteEmployee }
 */
export const useEmployees = () => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchEmployees = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/employees');
            setEmployees(response.data);
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to load employees';
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const createEmployee = async (employeeData) => {
        try {
            const response = await api.post('/employees', employeeData);
            setEmployees([...employees, response.data]);
            toast.success('Employee created successfully');
            return response.data;
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to create employee';
            toast.error(errorMsg);
            throw err;
        }
    };

    const updateEmployee = async (id, employeeData) => {
        try {
            const response = await api.put(`/employees/${id}`, employeeData);
            setEmployees(employees.map(emp => emp.id === id ? response.data : emp));
            toast.success('Employee updated successfully');
            return response.data;
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to update employee';
            toast.error(errorMsg);
            throw err;
        }
    };

    const deleteEmployee = async (id) => {
        try {
            await api.delete(`/employees/${id}`);
            setEmployees(employees.filter(emp => emp.id !== id));
            toast.success('Employee deleted successfully');
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to delete employee';
            toast.error(errorMsg);
            throw err;
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, []);

    return {
        employees,
        loading,
        error,
        refetch: fetchEmployees,
        createEmployee,
        updateEmployee,
        deleteEmployee
    };
};
