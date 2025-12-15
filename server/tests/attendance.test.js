const AttendanceService = require('../src/modules/attendance/service');
const db = require('../src/config/db');
const { mockQueryResult } = require('./helpers/db-mock');

jest.mock('../src/config/db', () => {
    const mockQuery = jest.fn();
    return {
        query: mockQuery,
    };
});

jest.mock('../src/modules/attendance/service');

describe('Attendance Module', () => {
    let req, res;

    beforeEach(() => {
        req = global.testUtils.mockRequest();
        res = global.testUtils.mockResponse();
        jest.clearAllMocks();
    });

    describe('getAttendance', () => {
        it('should return attendance records for a specific date', async () => {
            const mockDate = '2024-12-15';
            const mockAttendance = [
                {
                    id: 1,
                    employee_id: 1,
                    employee_name: 'John Doe',
                    date: '2024-12-15',
                    status: 'present',
                },
                {
                    id: 2,
                    employee_id: 2,
                    employee_name: 'Jane Smith',
                    date: '2024-12-15',
                    status: 'absent',
                },
            ];

            AttendanceService.getAttendance.mockResolvedValue(mockAttendance);

            const controller = require('../src/modules/attendance/controller');
            req.query = { date: mockDate };

            await controller.getAttendance(req, res);

            expect(AttendanceService.getAttendance).toHaveBeenCalledWith(mockDate);
            expect(res.json).toHaveBeenCalledWith(mockAttendance);
        });

        it('should handle missing date parameter', async () => {
            AttendanceService.getAttendance.mockResolvedValue([]);

            const controller = require('../src/modules/attendance/controller');
            req.query = {};

            await controller.getAttendance(req, res);

            expect(AttendanceService.getAttendance).toHaveBeenCalledWith(undefined);
            expect(res.json).toHaveBeenCalledWith([]);
        });

        it('should handle database errors', async () => {
            const errorMessage = 'Database connection failed';
            AttendanceService.getAttendance.mockRejectedValue(new Error(errorMessage));

            const controller = require('../src/modules/attendance/controller');
            req.query = { date: '2024-12-15' };

            await controller.getAttendance(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: errorMessage });
        });
    });

    describe('saveBulkAttendance', () => {
        it('should save bulk attendance records', async () => {
            const mockDate = '2024-12-15';
            const mockRecords = [
                { employee_id: 1, status: 'present' },
                { employee_id: 2, status: 'absent' },
                { employee_id: 3, status: 'present' },
            ];

            AttendanceService.saveBulkAttendance.mockResolvedValue(true);

            const controller = require('../src/modules/attendance/controller');
            req.body = { date: mockDate, records: mockRecords };

            await controller.saveBulkAttendance(req, res);

            expect(AttendanceService.saveBulkAttendance).toHaveBeenCalledWith(mockDate, mockRecords);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Attendance saved',
            });
        });

        it('should handle empty records array', async () => {
            AttendanceService.saveBulkAttendance.mockResolvedValue(true);

            const controller = require('../src/modules/attendance/controller');
            req.body = { date: '2024-12-15', records: [] };

            await controller.saveBulkAttendance(req, res);

            expect(AttendanceService.saveBulkAttendance).toHaveBeenCalledWith('2024-12-15', []);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Attendance saved',
            });
        });

        it('should handle database errors', async () => {
            const errorMessage = 'Failed to save attendance';
            AttendanceService.saveBulkAttendance.mockRejectedValue(new Error(errorMessage));

            const controller = require('../src/modules/attendance/controller');
            req.body = {
                date: '2024-12-15',
                records: [{ employee_id: 1, status: 'present' }],
            };

            await controller.saveBulkAttendance(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: errorMessage });
        });
    });
});
