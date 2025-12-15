import { describe, it, expect } from 'vitest';
import {
    formatCurrency,
    formatDate,
    formatDateTime,
    formatNumber,
    formatPercentage,
    parseFormattedNumber
} from '../format';

describe('Formatting Utilities', () => {
    describe('formatCurrency', () => {
        it('should format numbers as Indian Rupees', () => {
            expect(formatCurrency(1000)).toBe('₹1,000.00');
            expect(formatCurrency(100000)).toBe('₹1,00,000.00');
            expect(formatCurrency(1000000)).toBe('₹10,00,000.00');
        });

        it('should handle decimals correctly', () => {
            expect(formatCurrency(1234.56)).toBe('₹1,234.56');
            expect(formatCurrency(99.99)).toBe('₹99.99');
        });

        it('should handle string inputs', () => {
            expect(formatCurrency('5000')).toBe('₹5,000.00');
            expect(formatCurrency('1234.50')).toBe('₹1,234.50');
        });

        it('should handle zero', () => {
            expect(formatCurrency(0)).toBe('₹0.00');
        });

        it('should handle invalid inputs', () => {
            expect(formatCurrency('invalid')).toBe('₹0.00');
            expect(formatCurrency(null)).toBe('₹0.00');
            expect(formatCurrency(undefined)).toBe('₹0.00');
        });
    });

    describe('formatDate', () => {
        it('should format dates in Indian locale', () => {
            const date = new Date('2025-12-14');
            const formatted = formatDate(date);
            expect(formatted).toContain('14');
            expect(formatted).toContain('12');
            expect(formatted).toContain('2025');
        });

        it('should handle string dates', () => {
            const formatted = formatDate('2025-12-14');
            expect(formatted).toBeTruthy();
        });

        it('should accept custom options', () => {
            const date = new Date('2025-12-14');
            const formatted = formatDate(date, { month: 'long', year: 'numeric' });
            expect(formatted).toContain('December');
            expect(formatted).toContain('2025');
        });
    });

    describe('formatDateTime', () => {
        it('should format date and time', () => {
            const date = new Date('2025-12-14T15:30:00');
            const formatted = formatDateTime(date);
            expect(formatted).toContain('14');
            expect(formatted).toContain('Dec');
            // Time may vary based on timezone, just check it's formatted
            expect(formatted).toMatch(/\d{1,2}:\d{2}/); // matches time format
        });
    });

    describe('formatNumber', () => {
        it('should format with Indian numbering system', () => {
            expect(formatNumber(1000)).toBe('1,000');
            expect(formatNumber(100000)).toBe('1,00,000');
            expect(formatNumber(10000000)).toBe('1,00,00,000');
        });

        it('should handle string inputs', () => {
            expect(formatNumber('5000')).toBe('5,000');
        });

        it('should handle invalid inputs', () => {
            expect(formatNumber('invalid')).toBe('0');
        });
    });

    describe('formatPercentage', () => {
        it('should format percentages with default decimals', () => {
            expect(formatPercentage(25)).toBe('25.0%');
            expect(formatPercentage(33.333)).toBe('33.3%');
        });

        it('should format with custom decimals', () => {
            expect(formatPercentage(25.12345, 2)).toBe('25.12%');
            expect(formatPercentage(33.333, 0)).toBe('33%');
        });

        it('should handle string inputs', () => {
            expect(formatPercentage('50')).toBe('50.0%');
        });

        it('should handle invalid inputs', () => {
            expect(formatPercentage('invalid')).toBe('0%');
        });
    });

    describe('parseFormattedNumber', () => {
        it('should extract numbers from formatted strings', () => {
            expect(parseFormattedNumber('₹1,234.56')).toBe(1234.56);
            expect(parseFormattedNumber('1,00,000')).toBe(100000);
            expect(parseFormattedNumber('25.5%')).toBe(25.5);
        });

        it('should handle plain numbers', () => {
            expect(parseFormattedNumber(1234)).toBe(1234);
        });

        it('should handle negative numbers', () => {
            expect(parseFormattedNumber('-1,234.56')).toBe(-1234.56);
        });

        it('should return 0 for invalid inputs', () => {
            expect(parseFormattedNumber('invalid')).toBe(0);
            expect(parseFormattedNumber('')).toBe(0);
        });
    });
});
