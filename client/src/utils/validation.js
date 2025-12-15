/**
 * Validates that a value is a positive number
 * @param {string|number} value - The value to validate
 * @param {string} fieldName - Name of the field for error message
 * @returns {string|null} Error message or null if valid
 */
export const validatePositiveNumber = (value, fieldName) => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
        return `${fieldName} must be a positive number`;
    }
    return null;
};

/**
 * Validates that a value doesn't exceed a maximum
 * @param {string|number} value - The value to validate
 * @param {string|number} max - Maximum allowed value
 * @param {string} fieldName - Name of the field for error message
 * @returns {string|null} Error message or null if valid
 */
export const validateMaxAmount = (value, max, fieldName) => {
    const num = parseFloat(value);
    const maxNum = parseFloat(max);
    if (num > maxNum) {
        return `${fieldName} cannot exceed ₹${maxNum.toFixed(2)}`;
    }
    return null;
};

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {string|null} Error message or null if valid
 */
export const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return 'Please enter a valid email address';
    }
    return null;
};

/**
 * Validates phone number (Indian format)
 * @param {string} phone - Phone number to validate
 * @returns {string|null} Error message or null if valid
 */
export const validatePhone = (phone) => {
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        return 'Please enter a valid 10-digit phone number';
    }
    return null;
};

/**
 * Validates required field
 * @param {any} value - Value to validate
 * @param {string} fieldName - Name of the field for error message
 * @returns {string|null} Error message or null if valid
 */
export const validateRequired = (value, fieldName) => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
        return `${fieldName} is required`;
    }
    return null;
};
