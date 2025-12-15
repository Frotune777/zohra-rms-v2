import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

/**
 * Custom hook for managing vendors data
 * @returns {Object} { vendors, loading, error, refetch, createVendor, updateVendor, deleteVendor }
 */
export const useVendors = () => {
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchVendors = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/vendors/all-suppliers');
            setVendors(response.data);
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to load vendors';
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const createVendor = async (vendorData) => {
        try {
            const response = await api.post('/chicken/suppliers', vendorData);
            setVendors([...vendors, response.data]);
            toast.success('Vendor created successfully');
            return response.data;
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to create vendor';
            toast.error(errorMsg);
            throw err;
        }
    };

    const updateVendor = async (id, vendorData) => {
        try {
            const response = await api.put(`/chicken/suppliers/${id}`, vendorData);
            setVendors(vendors.map(v => v.id === id ? response.data : v));
            toast.success('Vendor updated successfully');
            return response.data;
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to update vendor';
            toast.error(errorMsg);
            throw err;
        }
    };

    const deleteVendor = async (id) => {
        try {
            await api.delete(`/chicken/suppliers/${id}`);
            setVendors(vendors.filter(v => v.id !== id));
            toast.success('Vendor deleted successfully');
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to delete vendor';
            toast.error(errorMsg);
            throw err;
        }
    };

    useEffect(() => {
        fetchVendors();
    }, []);

    return {
        vendors,
        loading,
        error,
        refetch: fetchVendors,
        createVendor,
        updateVendor,
        deleteVendor
    };
};
