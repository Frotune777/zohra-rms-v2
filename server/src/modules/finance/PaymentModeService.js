/**
 * PaymentModeService - Payment Mode & Account Resolution
 * 
 * Purpose: Resolve payment modes to GL accounts dynamically
 * Replaces hardcoded account mappings throughout the system
 * 
 * @module PaymentModeService
 */

const db = require('../../config/db');

class PaymentModeService {
    /**
     * Get account code for a payment mode
     * 
     * @param {String} paymentMode - Name of payment mode (case-insensitive)
     * @returns {Promise<Number>} GL account code
     * @throws {Error} If payment mode not found or inactive
     */
    async getAccountCode(paymentMode) {
        const result = await db.query(`
            SELECT account_code, requires_reference 
            FROM payment_modes 
            WHERE LOWER(name) = LOWER($1) AND is_active = TRUE
        `, [paymentMode]);

        if (result.rows.length === 0) {
            throw new Error(`Invalid or inactive payment mode: ${paymentMode}`);
        }

        return result.rows[0].account_code;
    }

    /**
     * Get payment mode details
     * 
     * @param {String} paymentMode - Name of payment mode
     * @returns {Promise<Object>} Payment mode details
     */
    async getPaymentMode(paymentMode) {
        const result = await db.query(`
            SELECT pm.*, ca.name as account_name, ca.type as account_type
            FROM payment_modes pm
            JOIN chart_of_accounts ca ON pm.account_code = ca.code
            WHERE LOWER(pm.name) = LOWER($1) AND pm.is_active = TRUE
        `, [paymentMode]);

        if (result.rows.length === 0) {
            throw new Error(`Invalid or inactive payment mode: ${paymentMode}`);
        }

        return result.rows[0];
    }

    /**
     * Get all active payment modes
     * 
     * @returns {Promise<Array>} List of active payment modes
     */
    async getAllPaymentModes() {
        const result = await db.query(`
            SELECT pm.*, ca.name as account_name, ca.type as account_type
            FROM payment_modes pm
            LEFT JOIN chart_of_accounts ca ON pm.account_code::integer = ca.code
            WHERE pm.is_active = TRUE
            ORDER BY pm.display_name
        `);

        return result.rows;
    }

    /**
     * Validate payment mode and reference
     * 
     * @param {String} paymentMode - Payment mode name
     * @param {String} reference - Optional reference number
     * @throws {Error} If validation fails
     */
    async validatePayment(paymentMode, reference = null) {
        const mode = await this.getPaymentMode(paymentMode);

        if (mode.requires_reference && !reference) {
            throw new Error(`Payment mode "${mode.display_name}" requires a reference number`);
        }

        return true;
    }
}

module.exports = new PaymentModeService();
