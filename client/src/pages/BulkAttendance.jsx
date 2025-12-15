import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import { FiSave, FiCalendar, FiCheckCircle, FiAlertCircle, FiClock, FiLock } from 'react-icons/fi';

const BulkAttendance = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [employees, setEmployees] = useState([]);
    const [attendance, setAttendance] = useState({});
    const [leaves, setLeaves] = useState([]);
    const [calendar, setCalendar] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

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
                setLastUpdated(res.data[0]?.updated_at || res.data[0]?.created_at);
            } else {
                setLastUpdated(null);
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
            console.error('Error fetching leaves:', err);
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
    };

    const handleSubmit = async () => {
        setSaving(true);
        try {
            const records = Object.entries(attendance).map(([id, status]) => ({
                employee_id: parseInt(id),
                status
            }));

            await api.post('/attendance/bulk', { date, records });

            toast.success('✓ Attendance saved successfully!', {
                duration: 3000,
                icon: '✅',
            });

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
        if (!entry) return { color: 'bg-gray-500', label: 'No Data', icon: FiAlertCircle };

        if (entry.status === 'locked') return { color: 'bg-blue-500', label: 'Locked', icon: FiLock };
        if (entry.status === 'complete') return { color: 'bg-green-500', label: 'Complete', icon: FiCheckCircle };
        if (entry.status === 'partial') return { color: 'bg-yellow-500', label: 'Partial', icon: FiClock };
        return { color: 'bg-red-500', label: 'Missing', icon: FiAlertCircle };
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

    const completionPercentage = stats.total > 0 ? Math.round((stats.present + stats.absent + stats.halfDay) / stats.total * 100) : 0;

    return (
        <div className="p-6 h-full flex gap-4">
            {/* Sidebar Calendar */}
            <div className="w-80 glass-panel p-4 rounded-xl overflow-y-auto">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <FiCalendar /> Attendance Calendar
                </h3>
                <div className="space-y-2">
                    {calendar.map((day) => {
                        const status = getCalendarStatus(day.date);
                        const Icon = status.icon;
                        const isSelected = day.date === date;
                        return (
                            <button
                                key={day.date}
                                onClick={() => setDate(day.date)}
                                className={`w-full p-3 rounded-lg text-left transition ${isSelected ? 'bg-zohra-blue text-white' : 'hover:bg-white/5'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold text-sm">
                                            {new Date(day.date).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {day.filled_records || 0}/{day.total_employees || 0} marked
                                        </p>
                                    </div>
                                    <div className={`w-3 h-3 rounded-full ${status.color}`} title={status.label}></div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="mt-6 pt-4 border-t border-white/10">
                    <p className="text-xs text-gray-400 mb-2 uppercase font-bold">Legend</p>
                    <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="text-gray-300">Complete</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <span className="text-gray-300">Partial</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span className="text-gray-300">Missing</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                            <span className="text-gray-300">Locked</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Bulk Attendance</h1>
                        <div className="flex items-center gap-4 mt-1">
                            <p className="text-sm text-gray-400">
                                {new Date(date).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </p>
                            {lastUpdated && (
                                <p className="text-xs text-green-400 flex items-center gap-1">
                                    <FiCheckCircle /> Last saved: {new Date(lastUpdated).toLocaleTimeString()}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-3 items-center">
                        <button onClick={() => markAll('Present')} className="px-3 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 text-sm font-bold">
                            All Present
                        </button>
                        <button onClick={() => markAll('Absent')} className="px-3 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 text-sm font-bold">
                            All Absent
                        </button>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                        />
                        <button
                            onClick={handleSubmit}
                            disabled={saving}
                            className="bg-zohra-blue hover:bg-blue-600 px-6 py-2 rounded-lg text-white font-bold flex items-center gap-2 disabled:opacity-50"
                        >
                            <FiSave /> {saving ? 'Saving...' : 'Save All'}
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-5 gap-3 mb-4">
                    <div className="glass-panel p-3 rounded-lg">
                        <p className="text-gray-400 text-xs uppercase mb-1">Total</p>
                        <p className="text-xl font-bold text-white">{stats.total}</p>
                    </div>
                    <div className="glass-panel p-3 rounded-lg">
                        <p className="text-gray-400 text-xs uppercase mb-1">Present</p>
                        <p className="text-xl font-bold text-green-400">{stats.present}</p>
                    </div>
                    <div className="glass-panel p-3 rounded-lg">
                        <p className="text-gray-400 text-xs uppercase mb-1">Absent</p>
                        <p className="text-xl font-bold text-red-400">{stats.absent}</p>
                    </div>
                    <div className="glass-panel p-3 rounded-lg">
                        <p className="text-gray-400 text-xs uppercase mb-1">Half-Day</p>
                        <p className="text-xl font-bold text-yellow-400">{stats.halfDay}</p>
                    </div>
                    <div className="glass-panel p-3 rounded-lg">
                        <p className="text-gray-400 text-xs uppercase mb-1">Completion</p>
                        <p className="text-xl font-bold text-zohra-blue">{completionPercentage}%</p>
                    </div>
                </div>

                {/* Table */}
                <div className="glass-panel flex-1 overflow-hidden rounded-xl">
                    <div className="overflow-auto h-full">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-white/5 sticky top-0">
                                <tr className="text-gray-400 border-b border-white/10">
                                    <th className="p-3">EMP ID</th>
                                    <th className="p-3">Employee</th>
                                    <th className="p-3">Role/Dept</th>
                                    <th className="p-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="4" className="p-8 text-center text-gray-400">
                                            Loading attendance data...
                                        </td>
                                    </tr>
                                ) : employees.map(emp => {
                                    const leave = getLeaveForEmployee(emp.id);
                                    const hasLeave = leave !== undefined;
                                    const isApprovedLeave = hasLeave && leave.status === 'Approved';
                                    const isPendingLeave = hasLeave && leave.status === 'Pending';

                                    return (
                                        <tr key={emp.id} className={`border-b border-white/5 hover:bg-white/5 ${isApprovedLeave ? 'bg-blue-500/10' : ''}`}>
                                            <td className="p-3 font-mono text-xs text-gray-400">{emp.employee_code || '-'}</td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white font-medium">{emp.full_name}</span>
                                                    {isApprovedLeave && (
                                                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs flex items-center gap-1">
                                                            <FiCheckCircle size={10} /> {leave.leave_type} Leave
                                                        </span>
                                                    )}
                                                    {isPendingLeave && (
                                                        <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-xs flex items-center gap-1">
                                                            <FiClock size={10} /> Pending Leave
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 text-sm text-gray-400 capitalize">{emp.role} • {emp.position}</td>
                                            <td className="p-3">
                                                <div className="flex justify-center gap-4">
                                                    {['Present', 'Absent', 'Half-Day'].map(status => (
                                                        <label key={status} className={`flex items-center gap-2 cursor-pointer ${isApprovedLeave && status !== 'Absent' ? 'opacity-50' : ''}`}>
                                                            <input
                                                                type="radio"
                                                                name={`attendance-${emp.id}`}
                                                                checked={attendance[emp.id] === status}
                                                                onChange={() => handleStatusChange(emp.id, status)}
                                                                disabled={isApprovedLeave && status !== 'Absent'}
                                                                className="accent-zohra-blue w-4 h-4"
                                                            />
                                                            <span className={`text-sm ${status === 'Present' ? 'text-green-400' :
                                                                    status === 'Absent' ? 'text-red-400' : 'text-yellow-400'
                                                                }`}>{status}</span>
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
        </div>
    );
};

export default BulkAttendance;
