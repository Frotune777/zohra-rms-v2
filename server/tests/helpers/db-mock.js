// Database mocking utilities for tests

/**
 * Creates a mock database query function
 * @param {Object} mockData - Data to return from queries
 * @returns {Object} Mock database object
 */
const createMockDb = (mockData = {}) => {
    return {
        query: jest.fn((sql, params) => {
            // Return mock data based on the query
            if (mockData.customHandler) {
                return mockData.customHandler(sql, params);
            }

            return Promise.resolve({
                rows: mockData.rows || [],
                rowCount: mockData.rowCount || 0,
            });
        }),
    };
};

/**
 * Common test fixtures
 */
const fixtures = {
    users: {
        owner: {
            id: 1,
            email: 'owner@alzohra.com',
            full_name: 'Owner User',
            role: 'owner',
            password_hash: '$2a$10$dummyhash', // bcrypt hash for 'owner123'
        },
        manager: {
            id: 2,
            email: 'manager@alzohra.com',
            full_name: 'Manager User',
            role: 'manager',
            password_hash: '$2a$10$dummyhash',
        },
        staff: {
            id: 3,
            email: 'staff@alzohra.com',
            full_name: 'Staff User',
            role: 'staff',
            password_hash: '$2a$10$dummyhash',
        },
    },

    employees: [
        {
            id: 1,
            name: 'John Doe',
            position: 'Chef',
            designation: 'Head Chef',
            salary: 30000,
            contact: '1234567890',
            govt_id_type: 'Aadhar',
            govt_id_number: '1234-5678-9012',
            role: 'staff',
            status: 'active',
            hire_date: '2024-01-01',
        },
        {
            id: 2,
            name: 'Jane Smith',
            position: 'Waiter',
            designation: 'Senior Waiter',
            salary: 20000,
            contact: '9876543210',
            govt_id_type: 'PAN',
            govt_id_number: 'ABCDE1234F',
            role: 'staff',
            status: 'active',
            hire_date: '2024-02-01',
        },
    ],

    inventory: [
        {
            id: 1,
            item_name: 'Rice',
            category: 'Grains',
            quantity: 100,
            unit: 'kg',
            unit_cost: 50,
            total_value: 5000,
        },
        {
            id: 2,
            item_name: 'Chicken',
            category: 'Meat',
            quantity: 50,
            unit: 'kg',
            unit_cost: 200,
            total_value: 10000,
        },
    ],

    suppliers: [
        {
            id: 1,
            name: 'ABC Suppliers',
            contact: '1111111111',
            address: '123 Main St',
        },
        {
            id: 2,
            name: 'XYZ Vendors',
            contact: '2222222222',
            address: '456 Market Rd',
        },
    ],

    dailyRates: {
        tandoor: 180,
        boiler: 160,
        egg: 6,
        date: '2024-12-08',
    },
};

/**
 * Helper to create a mock query result
 */
const mockQueryResult = (rows = [], rowCount = null) => ({
    rows,
    rowCount: rowCount !== null ? rowCount : rows.length,
});

module.exports = {
    createMockDb,
    fixtures,
    mockQueryResult,
};
