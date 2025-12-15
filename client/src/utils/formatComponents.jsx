/**
 * Comprehensive formatting utilities with React component wrappers
 * Use these components to ensure consistent formatting across the application
 */

import React from 'react';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercentage } from './format';

/**
 * Currency display component
 * @param {number|string} value - Amount to format
 * @param {string} className - Optional CSS classes
 */
export const Currency = ({ value, className = '' }) => {
    return <span className={className}>{formatCurrency(value)}</span>;
};

/**
 * Date display component
 * @param {Date|string} value - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @param {string} className - Optional CSS classes
 */
export const DateDisplay = ({ value, options = {}, className = '' }) => {
    return <span className={className}>{formatDate(value, options)}</span>;
};

/**
 * DateTime display component
 * @param {Date|string} value - DateTime to format
 * @param {string} className - Optional CSS classes
 */
export const DateTimeDisplay = ({ value, className = '' }) => {
    return <span className={className}>{formatDateTime(value)}</span>;
};

/**
 * Number display component (with Indian formatting)
 * @param {number|string} value - Number to format
 * @param {string} className - Optional CSS classes
 */
export const NumberDisplay = ({ value, className = '' }) => {
    return <span className={className}>{formatNumber(value)}</span>;
};

/**
 * Percentage display component
 * @param {number|string} value - Percentage to format
 * @param {number} decimals - Number of decimal places
 * @param {string} className - Optional CSS classes
 */
export const PercentageDisplay = ({ value, decimals = 1, className = '' }) => {
    return <span className={className}>{formatPercentage(value, decimals)}</span>;
};

/**
 * Profit/Loss display component with color coding
 * @param {number|string} value - Amount to display
 * @param {string} className - Optional CSS classes (will be merged with color classes)
 */
export const ProfitLoss = ({ value, className = '' }) => {
    const num = parseFloat(value);
    const colorClass = num >= 0 ? 'text-green-400' : 'text-red-400';
    const sign = num >= 0 ? '+' : '';

    return (
        <span className={`${colorClass} ${className}`}>
            {sign}{formatCurrency(value)}
        </span>
    );
};

/**
 * Status badge component
 * @param {string} status - Status text
 * @param {string} variant - Color variant (success, warning, danger, info)
 */
export const StatusBadge = ({ status, variant = 'info' }) => {
    const variants = {
        success: 'bg-green-500/20 text-green-400 border-green-500/50',
        warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
        danger: 'bg-red-500/20 text-red-400 border-red-500/50',
        info: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    };

    return (
        <span className={`px-2 py-1 rounded text-xs font-medium border ${variants[variant]}`}>
            {status}
        </span>
    );
};

/**
 * Trend indicator component
 * @param {number} value - Value to show trend for
 * @param {number} previousValue - Previous value for comparison
 */
export const TrendIndicator = ({ value, previousValue }) => {
    if (!previousValue) return null;

    const change = ((value - previousValue) / previousValue) * 100;
    const isPositive = change >= 0;

    return (
        <span className={`text-xs ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
        </span>
    );
};

// Export all formatting functions as well
export * from './format';
