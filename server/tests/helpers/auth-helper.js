// Authentication helper utilities for tests
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

/**
 * Generate a test JWT token
 * @param {Object} payload - Token payload
 * @returns {String} JWT token
 */
const generateTestToken = (payload = {}) => {
    const defaultPayload = {
        id: 1,
        email: 'test@example.com',
        role: 'staff',
        full_name: 'Test User',
    };

    return jwt.sign(
        { ...defaultPayload, ...payload },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
};

/**
 * Create mock authenticated request
 * @param {Object} user - User object
 * @param {Object} data - Additional request data
 * @returns {Object} Mock request with user
 */
const mockAuthRequest = (user = {}, data = {}) => {
    const defaultUser = {
        id: 1,
        email: 'test@example.com',
        role: 'staff',
        full_name: 'Test User',
    };

    return {
        user: { ...defaultUser, ...user },
        body: data.body || {},
        params: data.params || {},
        query: data.query || {},
        headers: data.headers || {},
    };
};

/**
 * User fixtures for different roles
 */
const userFixtures = {
    owner: {
        id: 1,
        email: 'owner@alzohra.com',
        full_name: 'Owner User',
        role: 'owner',
    },
    manager: {
        id: 2,
        email: 'manager@alzohra.com',
        full_name: 'Manager User',
        role: 'manager',
    },
    staff: {
        id: 3,
        email: 'staff@alzohra.com',
        full_name: 'Staff User',
        role: 'staff',
    },
};

/**
 * Generate tokens for different roles
 */
const tokens = {
    owner: () => generateTestToken(userFixtures.owner),
    manager: () => generateTestToken(userFixtures.manager),
    staff: () => generateTestToken(userFixtures.staff),
};

module.exports = {
    generateTestToken,
    mockAuthRequest,
    userFixtures,
    tokens,
};
