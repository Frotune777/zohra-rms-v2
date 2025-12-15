import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import { FiSave, FiCalendar, FiCheckCircle, FiAlertCircle, FiClock, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const BulkAttendance = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [employees, setEmployees] = useState([]);
    const [attendance, setAttendance] = useState({});
    const [leaves, setLeaves] = useState([]);
    const [calendar, setCalendar] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showCalendar, setShowCalendar] = useState(true);

    useEffect(() => {
        fetchEmployees();
        fetchCalendar();
    }, []);

    useEffect(() => {
        fetchAttendance();
        fetchLeaves();
    }, [date]);

    const fetchEmployees = async () => {
        try {
            const res = await api.get('/employees');
            const activeEmployees = res.data.filter(e => e.status === 'active');
            setEmployees(activeEmployees);
            const initial = {};
            activeEmployees.forEach(e => initial[e.id] = 'Present');
            setAttendance(prev => ({ ...initial, ...prev }));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchAttendance = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/attendance?date=${date}`);
            if (res.data.length > 0) {
                const existing = {};
                res.data.forEach(r => {
                    if (r.employee_id) {
                        existing[r.employee_id] = r.status || 'Present';
                    }
                });
                setAttendance(prev => ({ ...prev, ...existing }));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLeaves = async () => {
        try {
            const res = await api.get(`/leaves/date/${date}`);
            setLeaves(res.data || []);
        } catch (err) {
            setLeaves([]);
        }
    };

    const fetchCalendar = async () => {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 15);
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 15);

            const res = await api.get(`/attendance/calendar?startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`);
            setCalendar(res.data || []);
        } catch (err) {
            console.error('Error fetching calendar:', err);
        }
    };

    const handleStatusChange = (empId, status) => {
        setAttendance(prev => ({ ...prev, [empId]: status }));
    };

    const markAll = (status) => {
        const newAttendance = {};
        employees.forEach(e => newAttendance[e.id] = status);
        setAttendance(newAttendance);
        toast.success(`All employees marked as ${status}`);
    };

    const handleSubmit = async () => {
        setSaving(true);
        try {
            const records = Object.entries(attendance).map(([id, status]) => ({
                employee_id: parseInt(id),
                status
            }));

            await api.post('/attendance/bulk', { date, records });

            toast.success('Attendance saved successfully');
            fetchAttendance();
            fetchCalendar();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save attendance');
        } finally {
            setSaving(false);
        }
    };

    const getCalendarStatus = (calDate) => {
        const entry = calendar.find(c => c.date === calDate);
        if (!entry) return 'empty';
        if (entry.status === 'locked') return 'locked';
        if (entry.status === 'complete') return 'complete';
        if (entry.status === 'partial') return 'partial';
        return 'missing';
    };

    const getLeaveForEmployee = (empId) => {
        return leaves.find(l => l.employee_id === empId);
    };

    const stats = {
        total: employees.length,
        present: Object.values(attendance).filter(s => s === 'Present').length,
        absent: Object.values(attendance).filter(s => s === 'Absent').length,
        halfDay: Object.values(attendance).filter(s => s === 'Half-Day').length
    };

    const navigateDate = (direction) => {
        const currentDate = new Date(date);
        currentDate.setDate(currentDate.getDate() + direction);
        setDate(currentDate.toISOString().split('T')[0]);
    };

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
            {/* Top Bar */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Attendance</h1>
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <button onClick={() => navigateDate(-1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                                <FiChevronLeft />
                            </button>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button onClick={() => navigateDate(1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                                <FiChevronRight />
                            </button>
                            <span className="ml-2 font-medium text-gray-700 dark:text-gray-300">
                                {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowCalendar(!showCalendar)}
                            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md flex items-center gap-2"
                        >
                            <FiCalendar size={16} />
                            {showCalendar ? 'Hide' : 'Show'} Calendar
                        </button>
                        <button
                            onClick={() => markAll('Present')}
                            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                        >
                            Mark All Present
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={saving}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <FiSave size={16} />
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>

                {/* Stats Bar */}
                <div className="flex items-center gap-6 mt-4 text-sm">
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400">Total:</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{stats.total}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400">Present:</span>
                        <span className="font-semibold text-green-600 dark:text-green-400">{stats.present}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400">Absent:</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{stats.absent}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400">Half-Day:</span>
                        <span className="font-semibold text-yellow-600 dark:text-yellow-400">{stats.halfDay}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                        <span className="text-gray-500 dark:text-gray-400">Completion:</span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {Math.round((stats.present + stats.absent + stats.halfDay) / stats.total * 100)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Calendar Sidebar */}
                {showCalendar && (
                    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
                        <div className="p-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Calendar</h3>
                            <div className="space-y-1">
                                {calendar.map((day) => {
                                    const status = getCalendarStatus(day.date);
                                    const isSelected = day.date === date;
                                    const dayDate = new Date(day.date);

                                    return (
                                        <button
                                            key={day.date}
                                            onClick={() => setDate(day.date)}
                                            className={`w-full px-3 py-2 rounded-md text-left text-sm transition ${isSelected
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span>{dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                <div className={`w-2 h-2 rounded-full ${status === 'complete' ? 'bg-green-500' :
                                                        status === 'partial' ? 'bg-yellow-500' :
                                                            status === 'locked' ? 'bg-blue-500' :
                                                                status === 'missing' ? 'bg-red-500' : 'bg-gray-300'
                                                    }`} />
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                {day.filled_records || 0}/{day.total_employees || 0}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Attendance Table */}
                <div className="flex-1 overflow-auto bg-white dark:bg-gray-800">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10">
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Employee
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Role
                                </th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan="3" className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                                        Loading...
                                    </td>
                                </tr>
                            ) : employees.map(emp => {
                                const leave = getLeaveForEmployee(emp.id);
                                const hasApprovedLeave = leave && leave.status === 'Approved';

                                return (
                                    <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-shrink-0 w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
                                                    {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white">{emp.full_name}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">{emp.employee_code}</div>
                                                </div>
                                                {hasApprovedLeave && (
                                                    <span className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-md">
                                                        On Leave
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                            {emp.position}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-4">
                                                {['Present', 'Absent', 'Half-Day'].map(status => (
                                                    <label key={status} className="flex items-center gap-2 cursor-pointer group">
                                                        <input
                                                            type="radio"
                                                            name={`attendance-${emp.id}`}
                                                            checked={attendance[emp.id] === status}
                                                            onChange={() => handleStatusChange(emp.id, status)}
                                                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 focus:ring-2"
                                                        />
                                                        <span className={`text-sm ${attendance[emp.id] === status
                                                                ? 'font-medium text-gray-900 dark:text-white'
                                                                : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white'
                                                            }`}>
                                                            {status}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BulkAttendance;
