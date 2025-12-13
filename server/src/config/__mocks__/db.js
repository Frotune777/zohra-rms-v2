// Manual mock for src/config/db.js
const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
};

const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
    on: jest.fn(),
    end: jest.fn(),
};

const mockDb = {
    query: jest.fn(),
    pool: mockPool,
    _mockClient: mockClient, // Helper to access the client mock in tests
};

module.exports = mockDb;
