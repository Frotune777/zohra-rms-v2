const {
    getDailyRates,
    saveDailyRates,
    getSuppliers,
    createSupplier,
    getMarkupRules,
    saveMarkupRule,
    createBillEntry,
    getBillEntries,
    getVendorLedger,
} = require('../src/modules/inventory/controller');
const db = require('../src/config/db');
const { fixtures, mockQueryResult } = require('./helpers/db-mock');

jest.mock('../src/config/db');

describe('Chicken/Supplier Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
    });

    describe('getDailyRates', () => {
        it('should return daily rates for a specific date', async () => {
            req.query = { date: '2024-12-08' };
            db.query.mockResolvedValue(mockQueryResult([{
                date: '2024-12-08',
                tandoor_rate: 180,
                boiler_rate: 160,
                egg_rate: 6,
            }]));

            await getDailyRates(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ tandoor_rate: 180 })
            );
        });

        it('should return null if no rates found', async () => {
            req.query = { date: '2024-12-08' };
            db.query.mockResolvedValue(mockQueryResult([]));

            await getDailyRates(req, res);

            expect(res.json).toHaveBeenCalledWith(null);
        });
    });

    describe('saveDailyRates', () => {
        it('should save daily rates for all item types', async () => {
            req.body = {
                date: '2024-12-08',
                tandoor_rate: 185,
                boiler_rate: 165,
                egg_rate: 6.5,
            };

            db.query.mockResolvedValue(mockQueryResult([req.body]));

            await saveDailyRates(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    tandoor_rate: 185,
                    boiler_rate: 165,
                    egg_rate: 6.5,
                })
            );
        });

        it('should handle upsert on conflict', async () => {
            req.body = {
                date: '2024-12-08',
                tandoor_rate: 190,
                boiler_rate: 170,
                egg_rate: 7,
            };

            db.query.mockResolvedValue(mockQueryResult([req.body]));

            await saveDailyRates(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('ON CONFLICT'),
                expect.any(Array)
            );
        });
    });

    describe('getSuppliers', () => {
        it('should return all suppliers', async () => {
            db.query.mockResolvedValue(mockQueryResult(fixtures.suppliers));

            await getSuppliers(req, res);

            expect(res.json).toHaveBeenCalledWith(fixtures.suppliers);
        });
    });

    describe('createSupplier', () => {
        it('should create a new supplier', async () => {
            req.body = {
                name: 'New Supplier',
                phone: '3333333333',
                payment_type: 'Credit',
                vendor_type: 'Chicken',
                markup_required: true,
            };

            const newSupplier = { id: 3, ...req.body };
            db.query.mockResolvedValue(mockQueryResult([newSupplier]));

            await createSupplier(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'New Supplier' })
            );
        });

        it('should handle database errors', async () => {
            req.body = { name: 'Test' };
            db.query.mockRejectedValue(new Error('Database error'));

            await createSupplier(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('getMarkupRules', () => {
        it('should return markup rules for a supplier', async () => {
            req.query = { supplierId: '1' };
            const rules = [
                {
                    id: 1,
                    supplier_id: 1,
                    item_name: 'Tandoor',
                    base_rate_type: 'TandoorRate',
                    op1: '+',
                    val1: 5,
                    op2: null,
                    val2: null,
                },
            ];
            db.query.mockResolvedValue(mockQueryResult(rules));

            await getMarkupRules(req, res);

            expect(res.json).toHaveBeenCalledWith(rules);
        });

        it('should return empty array if no rules found', async () => {
            req.query = { supplierId: '999' };
            db.query.mockResolvedValue(mockQueryResult([]));

            await getMarkupRules(req, res);

            expect(res.json).toHaveBeenCalledWith([]);
        });
    });

    describe('saveMarkupRule', () => {
        it('should create a new markup rule', async () => {
            req.body = {
                supplier_id: 1,
                item_name: 'Tandoor',
                base_rate_type: 'TandoorRate',
                op1: '+',
                val1: 5,
                op2: null,
                val2: null,
            };

            db.query.mockResolvedValue(mockQueryResult([req.body]));

            await saveMarkupRule(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ item_name: 'Tandoor' })
            );
        });

        it('should handle upsert on conflict', async () => {
            req.body = {
                supplier_id: 1,
                item_name: 'Boiler',
                base_rate_type: 'BoilerRate',
                op1: '-',
                val1: 3,
                op2: null,
                val2: null,
            };

            db.query.mockResolvedValue(mockQueryResult([req.body]));

            await saveMarkupRule(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('ON CONFLICT'),
                expect.any(Array)
            );
        });
    });

    describe('createBillEntry', () => {
        it('should create a bill with auto-calculated rate', async () => {
            req.body = {
                date: '2024-12-08',
                supplier_id: 1,
                item_name: 'Tandoor',
                qty: 50,
                vendor_rate: 185,
            };

            // Mock daily rates, markup rule, bill insert, vendor ledger insert
            db.query
                .mockResolvedValueOnce(mockQueryResult([{
                    date: '2024-12-08',
                    tandoor_rate: 180,
                    boiler_rate: 160,
                    egg_rate: 6,
                }])) // Get daily rates
                .mockResolvedValueOnce(mockQueryResult([{
                    supplier_id: 1,
                    item_name: 'Tandoor',
                    base_rate_type: 'TandoorRate',
                    op1: '+',
                    val1: 5,
                    op2: null,
                    val2: null,
                }])) // Get markup rule
                .mockResolvedValueOnce(mockQueryResult([{
                    id: 1,
                    ...req.body,
                    expected_rate: 185,
                    variance: 0,
                    status: 'Pending',
                }])) // Insert bill
                .mockResolvedValueOnce(mockQueryResult([])); // Insert vendor ledger

            await createBillEntry(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    item_name: 'Tandoor',
                    expected_rate: 185,
                })
            );
        });

        it('should handle variance calculation', async () => {
            req.body = {
                date: '2024-12-08',
                supplier_id: 1,
                item_name: 'Tandoor',
                qty: 50,
                vendor_rate: 190,
            };

            db.query
                .mockResolvedValueOnce(mockQueryResult([{
                    tandoor_rate: 180,
                    boiler_rate: 160,
                    egg_rate: 6,
                }]))
                .mockResolvedValueOnce(mockQueryResult([{
                    base_rate_type: 'TandoorRate',
                    op1: '+',
                    val1: 5,
                }]))
                .mockResolvedValueOnce(mockQueryResult([{
                    id: 1,
                    ...req.body,
                    expected_rate: 185,
                    variance: 250, // (190 - 185) * 50
                }]))
                .mockResolvedValueOnce(mockQueryResult([]));

            await createBillEntry(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ variance: 250 })
            );
        });

        it('should return 400 if daily rates not set', async () => {
            req.body = {
                date: '2024-12-08',
                supplier_id: 1,
                item_name: 'Tandoor',
                qty: 50,
                vendor_rate: 185,
            };

            db.query.mockResolvedValue(mockQueryResult([]));

            await createBillEntry(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Daily rates not set for this date' })
            );
        });
    });

    describe('getBillEntries', () => {
        it('should return all bill entries', async () => {
            const bills = [
                {
                    id: 1,
                    supplier_id: 1,
                    supplier_name: 'ABC Suppliers',
                    item_name: 'Tandoor',
                    qty: 50,
                    vendor_rate: 185,
                    expected_rate: 185,
                    variance: 0,
                },
            ];
            db.query.mockResolvedValue(mockQueryResult(bills));

            await getBillEntries(req, res);

            expect(res.json).toHaveBeenCalledWith(bills);
        });

        it('should filter by supplier_id', async () => {
            req.query = { supplierId: '1' };
            db.query.mockResolvedValue(mockQueryResult([]));

            await getBillEntries(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('supplier_id'),
                expect.arrayContaining(['1'])
            );
        });

        it('should filter by date', async () => {
            req.query = { date: '2024-12-08' };
            db.query.mockResolvedValue(mockQueryResult([]));

            await getBillEntries(req, res);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('date'),
                expect.arrayContaining(['2024-12-08'])
            );
        });
    });

    describe('getVendorLedger', () => {
        it('should return vendor ledger entries', async () => {
            req.query = { supplierId: '1' };
            const ledger = [
                {
                    id: 1,
                    supplier_id: 1,
                    transaction_type: 'Bill',
                    amount: 9250,
                    details: 'Bill for Tandoor (50 x 185)',
                    date: '2024-12-08',
                },
            ];
            db.query.mockResolvedValue(mockQueryResult(ledger));

            await getVendorLedger(req, res);

            expect(res.json).toHaveBeenCalledWith(ledger);
        });

        it('should handle empty ledger', async () => {
            req.query = { supplierId: '999' };
            db.query.mockResolvedValue(mockQueryResult([]));

            await getVendorLedger(req, res);

            expect(res.json).toHaveBeenCalledWith([]);
        });
    });
});
