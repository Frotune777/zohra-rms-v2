// Test setup file
// This file runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test_db';

// Increase timeout for async operations
jest.setTimeout(10000);

// Global test utilities
global.testUtils = {
    // Helper to create mock request object
    mockRequest: (data = {}) => ({
        body: data.body || {},
        params: data.params || {},
        query: data.query || {},
        user: data.user || null,
        headers: data.headers || {},
    }),

    // Helper to create mock response object
    mockResponse: () => {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        res.send = jest.fn().mockReturnValue(res);
        return res;
    },

    // Helper to create mock next function
    mockNext: () => jest.fn(),
};

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   error: jest.fn(),
//   warn: jest.fn(),
// };
