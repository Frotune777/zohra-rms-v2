const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/config/db');
const { fixtures, mockQueryResult } = require('./helpers/db-mock');
const { generateTestToken } = require('./helpers/auth-helper');

// Mock the database module
jest.mock('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

describe('Auth Module', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/auth/login', () => {
        it('should return 400 if email is missing', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ password: 'test123' });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Email and password required');
        });

        it('should return 400 if password is missing', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com' });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Email and password required');
        });

        it('should return 401 for non-existent user', async () => {
            db.query.mockResolvedValue(mockQueryResult([]));

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'nonexistent@example.com', password: 'wrong' });

            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('error', 'Invalid credentials');
        });

        it('should return 401 for incorrect password', async () => {
            const hashedPassword = await bcrypt.hash('correctpassword', 10);
            const user = { ...fixtures.users.staff, password_hash: hashedPassword };

            db.query.mockResolvedValue(mockQueryResult([user]));

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'staff@alzohra.com', password: 'wrongpassword' });

            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('error', 'Invalid credentials');
        });

        it('should successfully login with correct credentials (demo mode)', async () => {
            const user = fixtures.users.owner;
            db.query.mockResolvedValue(mockQueryResult([user]));

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'owner@alzohra.com', password: 'owner123' });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body).toHaveProperty('user');
            expect(res.body.user).toHaveProperty('email', 'owner@alzohra.com');
            expect(res.body.user).toHaveProperty('role', 'owner');
            expect(res.body.user).not.toHaveProperty('password_hash');
        });

        it('should return valid JWT token on successful login', async () => {
            const user = fixtures.users.manager;
            db.query.mockResolvedValue(mockQueryResult([user]));

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'manager@alzohra.com', password: 'manager123' });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');

            // Verify token is valid
            const decoded = jwt.verify(res.body.token, JWT_SECRET);
            expect(decoded).toHaveProperty('email', 'manager@alzohra.com');
            expect(decoded).toHaveProperty('role', 'manager');
        });
    });

    describe('POST /api/auth/register', () => {
        it('should return 401 if not authenticated', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'password123',
                    full_name: 'Test User',
                    role: 'staff',
                });

            expect(res.statusCode).toEqual(401);
        });

        it('should return 400 if required fields are missing (with auth)', async () => {
            const token = generateTestToken({ role: 'owner' });

            const res = await request(app)
                .post('/api/auth/register')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'test@example.com' }); // Missing other fields

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'All fields required');
        });

        it('should return 400 if email already exists', async () => {
            const token = generateTestToken({ role: 'owner' });
            db.query.mockResolvedValue(mockQueryResult([{ id: 1 }]));

            const res = await request(app)
                .post('/api/auth/register')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'existing@example.com',
                    password: 'password123',
                    full_name: 'Test User',
                    role: 'staff',
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Email already exists');
        });

        it('should successfully register a new user with auth', async () => {
            const token = generateTestToken({ role: 'owner' });

            // First query checks if user exists (returns empty)
            // Second query inserts the user
            db.query
                .mockResolvedValueOnce(mockQueryResult([]))
                .mockResolvedValueOnce(mockQueryResult([{
                    id: 4,
                    email: 'newuser@example.com',
                    full_name: 'New User',
                    role: 'staff',
                }]));

            const res = await request(app)
                .post('/api/auth/register')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'newuser@example.com',
                    password: 'password123',
                    full_name: 'New User',
                    role: 'staff',
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('user');
            expect(res.body.user).toHaveProperty('email', 'newuser@example.com');
            expect(res.body.user).not.toHaveProperty('password_hash');
        });

        it('should hash the password before storing', async () => {
            const token = generateTestToken({ role: 'owner' });

            db.query
                .mockResolvedValueOnce(mockQueryResult([]))
                .mockResolvedValueOnce(mockQueryResult([{
                    id: 5,
                    email: 'test@example.com',
                    full_name: 'Test',
                    role: 'staff',
                }]));

            await request(app)
                .post('/api/auth/register')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'test@example.com',
                    password: 'plainpassword',
                    full_name: 'Test',
                    role: 'staff',
                });

            // Check that the password was hashed
            const insertCall = db.query.mock.calls[1];
            if (insertCall && insertCall[1]) {
                const hashedPassword = insertCall[1][1]; // Second parameter in the query

                expect(hashedPassword).not.toEqual('plainpassword');
                expect(hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$')).toBe(true);
            }
        });
    });

    describe('GET /health', () => {
        it('should return status ok', async () => {
            const res = await request(app).get('/health');

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('status', 'ok');
            expect(res.body).toHaveProperty('timestamp');
        });
    });
});
