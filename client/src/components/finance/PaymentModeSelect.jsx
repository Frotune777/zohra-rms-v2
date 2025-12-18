import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { FiCreditCard } from 'react-icons/fi';

const PaymentModeSelect = ({ value, onChange, className = '', disabledValue = '' }) => {
    const [modes, setModes] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchModes();
    }, []);

    const fetchModes = async () => {
        setLoading(true);
        try {
            const res = await api.get('/finance/payment-modes');
            setModes(res.data);
        } catch (err) {
            console.error('Failed to fetch payment modes:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`relative ${className}`}>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-gray-900 border border-white/10 rounded px-2 py-1 text-xs text-gray-300 focus:border-blue-500 outline-none appearance-none pr-8"
                disabled={loading}
            >
                <option value={disabledValue}>- Method -</option>
                {modes.map(mode => (
                    <option key={mode.id} value={mode.name}>
                        {mode.display_name}
                    </option>
                ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
                <FiCreditCard className="w-3 h-3" />
            </div>
        </div>
    );
};

export default PaymentModeSelect;
