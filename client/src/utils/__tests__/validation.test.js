import { describe, it, expect } from 'vitest';
import {
    validatePositiveNumber,
    validateMaxAmount,
    validateEmail,
    validatePhone,
    validateRequired
} from '../validation';

describe('Validation Utilities', () => {
    describe('validatePositiveNumber', () => {
        it('should return null for positive numbers', () => {
            expect(validatePositiveNumber(100, 'Amount')).toBeNull();
            expect(validatePositiveNumber('50.5', 'Price')).toBeNull();
            expect(validatePositiveNumber(0.01, 'Value')).toBeNull();
        });

        it('should return error for zero', () => {
            const error = validatePositiveNumber(0, 'Amount');
            expect(error).toBe('Amount must be a positive number');
        });

        it('should return error for negative numbers', () => {
            const error = validatePositiveNumber(-10, 'Amount');
            expect(error).toBe('Amount must be a positive number');
        });

        it('should return error for non-numbers', () => {
            const error = validatePositiveNumber('abc', 'Amount');
            expect(error).toBe('Amount must be a positive number');
        });

        it('should return error for empty string', () => {
            const error = validatePositiveNumber('', 'Amount');
            expect(error).toBe('Amount must be a positive number');
        });
    });

    describe('validateMaxAmount', () => {
        it('should return null for amounts within limit', () => {
            expect(validateMaxAmount(50, 100, 'Payment')).toBeNull();
            expect(validateMaxAmount(100, 100, 'Payment')).toBeNull();
            expect(validateMaxAmount('75.50', '100', 'Payment')).toBeNull();
        });

        it('should return error for amounts exceeding limit', () => {
            const error = validateMaxAmount(150, 100, 'Payment');
            expect(error).toBe('Payment cannot exceed ₹100.00');
        });

        it('should handle string inputs', () => {
            const error = validateMaxAmount('150.50', '100', 'Payment');
            expect(error).toBe('Payment cannot exceed ₹100.00');
        });
    });

    describe('validateEmail', () => {
        it('should return null for valid emails', () => {
            expect(validateEmail('user@example.com')).toBeNull();
            expect(validateEmail('test.user@domain.co.in')).toBeNull();
            expect(validateEmail('admin@alzohra.com')).toBeNull();
        });

        it('should return error for invalid emails', () => {
            expect(validateEmail('invalid')).toBe('Please enter a valid email address');
            expect(validateEmail('user@')).toBe('Please enter a valid email address');
            expect(validateEmail('@domain.com')).toBe('Please enter a valid email address');
            expect(validateEmail('user @domain.com')).toBe('Please enter a valid email address');
        });
    });

    describe('validatePhone', () => {
        it('should return null for valid Indian phone numbers', () => {
            expect(validatePhone('9876543210')).toBeNull();
            expect(validatePhone('8123456789')).toBeNull();
            expect(validatePhone('7 9 8 7 6 5 4 3 2 1')).toBeNull(); // with spaces
        });

        it('should return error for invalid phone numbers', () => {
            expect(validatePhone('1234567890')).toBe('Please enter a valid 10-digit phone number');
            expect(validatePhone('98765')).toBe('Please enter a valid 10-digit phone number');
            expect(validatePhone('abcdefghij')).toBe('Please enter a valid 10-digit phone number');
        });
    });

    describe('validateRequired', () => {
        it('should return null for valid values', () => {
            expect(validateRequired('value', 'Field')).toBeNull();
            expect(validateRequired(123, 'Field')).toBeNull();
            expect(validateRequired(true, 'Field')).toBeNull();
        });

        it('should return error for empty string', () => {
            const error = validateRequired('', 'Field');
            expect(error).toBe('Field is required');
        });

        it('should return error for whitespace only', () => {
            const error = validateRequired('   ', 'Field');
            expect(error).toBe('Field is required');
        });

        it('should return error for null', () => {
            const error = validateRequired(null, 'Field');
            expect(error).toBe('Field is required');
        });

        it('should return error for undefined', () => {
            const error = validateRequired(undefined, 'Field');
            expect(error).toBe('Field is required');
        });
    });
});
