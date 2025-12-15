const vendorsController = require('../src/modules/vendors/payments.controller');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');

jest.mock('../src/config/db', () => {
    const mockQuery = jest.fn();
    const mockRelease = jest.fn();
    const mockClient = {
        query: mockQuery,
        release: mockRelease,
    };
    return {
        query: mockQuery,
        pool: {
            connect: jest.fn().mockResolvedValue(mockClient),
        },
    };
});

describe('Vendors Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
    });

    describe('processPayment', () => {
        it('should process vendor payment successfully', async () => {
            req.body = {
                vendorId: 1,
                amount: 5000,
                paymentMode: 'Cash',
                reference: 'REF123',
                notes: 'Payment for supplies',
                paidBy: 'Manager',
            };
            req.user = { id: 1 };

            const mockVendor = { id: 1, name: 'ABC Suppliers' };
            const mockPayment = {
                id: 1,
                vendor_id: 1,
                amount: 5000,
                payment_mode: 'Cash',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([mockVendor])) // Get vendor
                .mockResolvedValueOnce(mockQueryResult([{ outstanding_balance: 10000 }])) // Get balance
                .mockResolvedValueOnce(mockQueryResult([mockPayment])) // Insert payment
                .mockResolvedValueOnce(mockQueryResult([])) // Insert vendor_ledger
                .mockResolvedValueOnce(mockQueryResult([{ id: 100 }])) // Insert journal entry
                .mockResolvedValueOnce(mockQueryResult([])) // Update payment with JE ID
                .mockResolvedValueOnce(mockQueryResult([])) // Debit ledger line
                .mockResolvedValueOnce(mockQueryResult([])) // Credit ledger line (duplicate in controller)
                .mockResolvedValueOnce(mockQueryResult([])) // Credit ledger line
                .mockResolvedValueOnce(mockQueryResult([])) // Insert transaction
                .mockResolvedValueOnce(mockQueryResult([])) // COMMIT
                .mockResolvedValueOnce(mockQueryResult([{ outstanding_balance: 5000 }])); // Get new balance

            await vendorsController.processPayment(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    payment: expect.any(Object),
                    newBalance: 5000,
                })
            );
        });

        it('should return 404 if vendor not found', async () => {
            req.body = {
                vendorId: 999,
                amount: 5000,
                paymentMode: 'Cash',
                notes: 'Payment',
                paidBy: 'Manager',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([])) // Vendor not found
                .mockResolvedValueOnce(mockQueryResult([])); // ROLLBACK

            await vendorsController.processPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: 'Vendor not found' });
        });

        it('should prevent overpayment', async () => {
            req.body = {
                vendorId: 1,
                amount: 15000,
                paymentMode: 'Cash',
                notes: 'Payment',
                paidBy: 'Manager',
            };

            const mockVendor = { id: 1, name: 'ABC Suppliers' };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([mockVendor])) // Get vendor
                .mockResolvedValueOnce(mockQueryResult([{ outstanding_balance: 10000 }])) // Balance
                .mockResolvedValueOnce(mockQueryResult([])); // ROLLBACK

            await vendorsController.processPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.stringContaining('exceeds outstanding balance'),
                })
            );
        });

        it('should validate required fields', async () => {
            req.body = {
                vendorId: 1,
                amount: 5000,
                paymentMode: 'Cash',
                // Missing notes and paidBy
            };

            const mockVendor = { id: 1, name: 'ABC Suppliers' };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockResolvedValueOnce(mockQueryResult([mockVendor]))
                .mockResolvedValueOnce(mockQueryResult([{ outstanding_balance: 10000 }]))
                .mockResolvedValueOnce(mockQueryResult([])); // ROLLBACK

            await vendorsController.processPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should handle database errors and rollback', async () => {
            req.body = {
                vendorId: 1,
                amount: 5000,
                paymentMode: 'Cash',
                notes: 'Payment',
                paidBy: 'Manager',
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([])) // BEGIN
                .mockRejectedValueOnce(new Error('Database error'));

            await vendorsController.processPayment(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('getPayments', () => {
        it('should return all vendor payments', async () => {
            const mockPayments = [
                {
                    id: 1,
                    vendor_id: 1,
                    vendor_name: 'ABC Suppliers',
                    amount: 5000,
                    payment_mode: 'Cash',
                    payment_date: '2024-12-15',
                },
            ];

            db.query.mockResolvedValue(mockQueryResult(mockPayments));

            await vendorsController.getPayments(req, res);

            expect(res.json).toHaveBeenCalledWith(mockPayments);
        });

        it('should filter payments by vendor ID', async () => {
            req.query = { vendorId: '1' };

            db.query.mockResolvedValue(mockQueryResult([]));

            await vendorsController.getPayments(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('vp.vendor_id = $1'),
                expect.arrayContaining(['1'])
            );
        });

        it('should filter payments by date range', async () => {
            req.query = {
                startDate: '2024-12-01',
                endDate: '2024-12-31',
            };

            db.query.mockResolvedValue(mockQueryResult([]));

            await vendorsController.getPayments(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('payment_date >='),
                expect.arrayContaining(['2024-12-01', '2024-12-31'])
            );
        });

        it('should handle database errors', async () => {
            db.query.mockRejectedValue(new Error('Query failed'));

            await vendorsController.getPayments(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('getOutstanding', () => {
        it('should return outstanding balance for vendor', async () => {
            req.params = { id: '1' };

            const mockOutstanding = {
                vendor_id: 1,
                outstanding_balance: 5000,
            };

            db.query.mockResolvedValue(mockQueryResult([mockOutstanding]));

            await vendorsController.getOutstanding(req, res);

            expect(res.json).toHaveBeenCalledWith(mockOutstanding);
        });

        it('should return 404 if vendor not found', async () => {
            req.params = { id: '999' };

            db.query.mockResolvedValue(mockQueryResult([]));

            await vendorsController.getOutstanding(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('getVendorLedger', () => {
        it('should return vendor ledger entries', async () => {
            req.params = { id: '1' };

            const mockLedger = [
                {
                    id: 1,
                    supplier_id: 1,
                    vendor_name: 'ABC Suppliers',
                    transaction_type: 'Bill',
                    amount: 10000,
                    date: '2024-12-01',
                },
                {
                    id: 2,
                    supplier_id: 1,
                    vendor_name: 'ABC Suppliers',
                    transaction_type: 'Payment',
                    amount: 5000,
                    date: '2024-12-15',
                },
            ];

            db.query.mockResolvedValue(mockQueryResult(mockLedger));

            await vendorsController.getVendorLedger(req, res);

            expect(res.json).toHaveBeenCalledWith(mockLedger);
        });

        it('should filter ledger by date range', async () => {
            req.params = { id: '1' };
            req.query = {
                startDate: '2024-12-01',
                endDate: '2024-12-31',
            };

            db.query.mockResolvedValue(mockQueryResult([]));

            await vendorsController.getVendorLedger(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('vl.date >='),
                expect.arrayContaining(['1', '2024-12-01', '2024-12-31'])
            );
        });
    });

    describe('getVendorDetails', () => {
        it('should return comprehensive vendor details', async () => {
            req.params = { id: '1' };

            const mockVendor = {
                vendor_id: 1,
                vendor_name: 'ABC Suppliers',
                outstanding_balance: 5000,
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([mockVendor])) // Basic info
                .mockResolvedValueOnce(mockQueryResult([{ total_bill_amount: 15000 }])) // Total bills
                .mockResolvedValueOnce(mockQueryResult([{ total_payment_amount: 10000 }])) // Total payments
                .mockResolvedValueOnce(mockQueryResult([{ date: '2024-12-15', amount: 5000 }])) // Last payment
                .mockResolvedValueOnce(mockQueryResult([])) // Recent payments
                .mockResolvedValueOnce(mockQueryResult([{ days_0_30: 5000 }])); // Aging

            await vendorsController.getVendorDetails(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    vendor_id: 1,
                    vendor_name: 'ABC Suppliers',
                    outstanding_balance: 5000,
                    total_bill_amount: 15000,
                    total_payment_amount: 10000,
                    aging: expect.any(Object),
                })
            );
        });

        it('should return 404 if vendor not found', async () => {
            req.params = { id: '999' };

            db.query.mockResolvedValue(mockQueryResult([]));

            await vendorsController.getVendorDetails(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('getVendorsWithOutstanding', () => {
        it('should return vendors with outstanding balances', async () => {
            const mockVendors = [
                {
                    vendor_id: 1,
                    vendor_name: 'ABC Suppliers',
                    outstanding_balance: 10000,
                },
                {
                    vendor_id: 2,
                    vendor_name: 'XYZ Traders',
                    outstanding_balance: 5000,
                },
            ];

            db.query.mockResolvedValue(mockQueryResult(mockVendors));

            await vendorsController.getVendorsWithOutstanding(req, res);

            expect(res.json).toHaveBeenCalledWith(mockVendors);
        });

        it('should filter by category', async () => {
            req.query = { categoryId: '1' };

            db.query.mockResolvedValue(mockQueryResult([]));

            await vendorsController.getVendorsWithOutstanding(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('category_id = $1'),
                ['1']
            );
        });
    });

    describe('getAllSuppliers', () => {
        it('should return all suppliers for dropdown', async () => {
            const mockSuppliers = [
                { id: 1, name: 'ABC Suppliers' },
                { id: 2, name: 'XYZ Traders' },
            ];

            db.query.mockResolvedValue(mockQueryResult(mockSuppliers));

            await vendorsController.getAllSuppliers(req, res);

            expect(res.json).toHaveBeenCalledWith(mockSuppliers);
        });
    });

    describe('getCategories', () => {
        it('should return all vendor categories', async () => {
            const mockCategories = [
                { id: 1, name: 'Food Supplies' },
                { id: 2, name: 'Utilities' },
            ];

            db.query.mockResolvedValue(mockQueryResult(mockCategories));

            await vendorsController.getCategories(req, res);

            expect(res.json).toHaveBeenCalledWith(mockCategories);
        });
    });
});
