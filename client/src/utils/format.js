/**
 * Formats a number as Indian Rupee currency
 * @param {number|string} value - The value to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '₹0.00';

    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
};

/**
 * Formats a date to Indian locale
 * @param {Date|string} date - The date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatDate = (date, options = {}) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-IN', options);
};

/**
 * Formats a date and time to Indian locale
 * @param {Date|string} date - The date to format
 * @returns {string} Formatted date-time string
 */
export const formatDateTime = (date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Formats a number with Indian numbering system (lakhs, crores)
 * @param {number|string} value - The value to format
 * @returns {string} Formatted number string
 */
export const formatNumber = (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '0';

    return new Intl.NumberFormat('en-IN').format(num);
};

/**
 * Formats a percentage
 * @param {number|string} value - The value to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, decimals = 1) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '0%';

    return `${num.toFixed(decimals)}%`;
};

/**
 * Parses a number from a formatted string
 * @param {string} value - The formatted value
 * @returns {number} Parsed number
 */
export const parseFormattedNumber = (value) => {
    if (typeof value === 'number') return value;
    return parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
};
