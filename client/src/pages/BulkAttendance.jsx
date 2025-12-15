import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import { FiSave, FiCalendar, FiCheckCircle, FiAlertCircle, FiClock, FiChevronLeft, FiChevronRight, FiRefreshCw } from 'react-icons/fi';

const BulkAttendance = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [employees, setEmployees] = useState([]);
    const [attendance, setAttendance] = useState({});
    const [leaves, setLeaves] = useState([]);
    const [calendar, setCalendar] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
        } catch (err) {
            console.error(err);
            toast.error('Failed to load employees');
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
                setAttendance(existing);
                setLastSaved(new Date(res.data[0]?.updated_at || res.data[0]?.created_at));
                setHasUnsavedChanges(false);
            } else {
                // Initialize with Present for new date
                const initial = {};
                employees.forEach(e => initial[e.id] = 'Present');
                setAttendance(initial);
                setLastSaved(null);
                setHasUnsavedChanges(false);
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
        setHasUnsavedChanges(true);
    };

    const markAll = (status) => {
        const newAttendance = {};
        employees.forEach(e => newAttendance[e.id] = status);
        setAttendance(newAttendance);
        setHasUnsavedChanges(true);
        toast.success(`All marked as ${status}`);
    };

    const handleSubmit = async () => {
        setSaving(true);
        try {
            const records = Object.entries(attendance).map(([id, status]) => ({
                employee_id: parseInt(id),
                status
            }));

            await api.post('/attendance/bulk', { date, records });

            setLastSaved(new Date());
            setHasUnsavedChanges(false);
            toast.success('✓ Attendance saved successfully');
            fetchCalendar();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save attendance');
        } finally {
            setSaving(false);
        }
    };

    const getCalendarStatus = (calDate) => {
        const entry = calendar.find(c => c.date === calDate);
        if (!entry) return { status: 'empty', label: 'No Data' };
        return {
            status: entry.status,
            label: entry.status === 'complete' ? 'Complete' :
                entry.status === 'partial' ? 'Partial' :
                    entry.status === 'locked' ? 'Locked' : 'Missing',
            filled: entry.filled_records || 0,
            total: entry.total_employees || 0
        };
    };

    const getLeaveForEmployee = (empId) => {
        return leaves.find(l => l.employee_id === empId);
    };

    const navigateDate = (direction) => {
        const currentDate = new Date(date);
        currentDate.setDate(currentDate.getDate() + direction);
        setDate(currentDate.toISOString().split('T')[0]);
    };

    const stats = {
        total: employees.length,
        present: Object.values(attendance).filter(s => s === 'Present').length,
        absent: Object.values(attendance).filter(s => s === 'Absent').length,
        halfDay: Object.values(attendance).filter(s => s === 'Half-Day').length
    };

    const completionRate = stats.total > 0 ? Math.round((stats.present + stats.absent + stats.halfDay) / stats.total * 100) : 0;

    return (
        <div className="p-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <FiCalendar className="text-zohra-blue" />
                        Bulk Attendance
                    </h1>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                        {lastSaved && (
                            <span className="text-green-400 flex items-center gap-1">
                                <FiCheckCircle size={14} />
                                Last saved: {lastSaved.toLocaleTimeString()}
                            </span>
                        )}
                        {hasUnsavedChanges && (
                            <span className="text-yellow-400 flex items-center gap-1">
                                <FiAlertCircle size={14} />
                                Unsaved changes
                            </span>
                        )}
                        {!lastSaved && !hasUnsavedChanges && (
                            <span className="text-gray-400 flex items-center gap-1">
                                <FiClock size={14} />
                                No data for this date
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => markAll('Present')}
                        className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 text-sm font-medium transition"
                    >
                        All Present
                    </button>
                    <button
                        onClick={() => markAll('Absent')}
                        className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 text-sm font-medium transition"
                    >
                        All Absent
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving || !hasUnsavedChanges}
                        className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FiSave />
                        {saving ? 'Saving...' : 'Save All'}
                    </button>
                </div>
            </div>

            {/* Date Navigator & Stats */}
            <div className="glass-panel p-4 rounded-xl mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigateDate(-1)}
                            className="p-2 hover:bg-white/10 rounded-lg transition"
                        >
                            <FiChevronLeft className="text-gray-400" />
                        </button>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-medium"
                        />
                        <button
                            onClick={() => navigateDate(1)}
                            className="p-2 hover:bg-white/10 rounded-lg transition"
                        >
                            <FiChevronRight className="text-gray-400" />
                        </button>
                        <span className="text-lg font-semibold text-white">
                            {new Date(date).toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                            })}
                        </span>
                    </div>

                    <div className="flex items-center gap-8 text-sm">
                        <div>
                            <span className="text-gray-400">Total: </span>
                            <span className="font-bold text-white">{stats.total}</span>
                        </div>
                        <div>
                            <span className="text-gray-400">Present: </span>
                            <span className="font-bold text-green-400">{stats.present}</span>
                        </div>
                        <div>
                            <span className="text-gray-400">Absent: </span>
                            <span className="font-bold text-red-400">{stats.absent}</span>
                        </div>
                        <div>
                            <span className="text-gray-400">Half-Day: </span>
                            <span className="font-bold text-yellow-400">{stats.halfDay}</span>
                        </div>
                        <div className="pl-4 border-l border-white/10">
                            <span className="text-gray-400">Completion: </span>
                            <span className="font-bold text-zohra-blue">{completionRate}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex gap-4 flex-1 overflow-hidden">
                {/* Calendar Sidebar */}
                <div className="w-64 glass-panel rounded-xl p-4 overflow-y-auto">
                    <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wide">Calendar</h3>
                    <div className="space-y-1">
                        {calendar.map((day) => {
                            const statusInfo = getCalendarStatus(day.date);
                            const isSelected = day.date === date;
                            const dayDate = new Date(day.date);

                            return (
                                <button
                                    key={day.date}
                                    onClick={() => setDate(day.date)}
                                    className={`w-full px-3 py-2 rounded-lg text-left text-sm transition ${isSelected
                                            ? 'bg-zohra-blue text-white font-medium'
                                            : 'hover:bg-white/5 text-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-medium">
                                            {dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded ${statusInfo.status === 'complete' ? 'bg-green-500/20 text-green-400' :
                                                statusInfo.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                                                    statusInfo.status === 'locked' ? 'bg-blue-500/20 text-blue-400' :
                                                        statusInfo.status === 'missing' ? 'bg-red-500/20 text-red-400' :
                                                            'bg-gray-500/20 text-gray-400'
                                            }`}>
                                            {statusInfo.label}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        {statusInfo.filled}/{statusInfo.total} marked
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Attendance Table */}
                <div className="flex-1 glass-panel rounded-xl overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <FiRefreshCw className="animate-spin text-3xl text-zohra-blue" />
                        </div>
                    ) : (
                        <div className="overflow-auto h-full">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white/5 sticky top-0 z-10">
                                    <tr className="text-gray-400 border-b border-white/10">
                                        <th className="p-4 font-semibold">EMP ID</th>
                                        <th className="p-4 font-semibold">Employee</th>
                                        <th className="p-4 font-semibold">Role/Dept</th>
                                        <th className="p-4 text-center font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.map(emp => {
                                        const leave = getLeaveForEmployee(emp.id);
                                        const hasApprovedLeave = leave && leave.status === 'Approved';
                                        const hasPendingLeave = leave && leave.status === 'Pending';

                                        return (
                                            <tr
                                                key={emp.id}
                                                className={`border-b border-white/5 hover:bg-white/5 transition ${hasApprovedLeave ? 'bg-blue-500/10' : ''
                                                    }`}
                                            >
                                                <td className="p-4 font-mono text-xs text-gray-400">
                                                    {emp.employee_code || '-'}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-white font-medium">{emp.full_name}</span>
                                                        {hasApprovedLeave && (
                                                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs flex items-center gap-1">
                                                                <FiCheckCircle size={10} /> {leave.leave_type} Leave
                                                            </span>
                                                        )}
                                                        {hasPendingLeave && (
                                                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-xs flex items-center gap-1">
                                                                <FiClock size={10} /> Pending Leave
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-gray-400 capitalize">
                                                    {emp.role} • {emp.position}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex justify-center gap-6">
                                                        {['Present', 'Absent', 'Half-Day'].map(status => (
                                                            <label
                                                                key={status}
                                                                className="flex items-center gap-2 cursor-pointer group"
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name={`attendance-${emp.id}`}
                                                                    checked={attendance[emp.id] === status}
                                                                    onChange={() => handleStatusChange(emp.id, status)}
                                                                    className="accent-zohra-blue w-4 h-4"
                                                                />
                                                                <span className={`text-sm ${status === 'Present' ? 'text-green-400' :
                                                                        status === 'Absent' ? 'text-red-400' :
                                                                            'text-yellow-400'
                                                                    } ${attendance[emp.id] === status ? 'font-semibold' : ''}`}>
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
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkAttendance;
