import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { FiSave, FiCalendar } from 'react-icons/fi';

const BulkAttendance = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [employees, setEmployees] = useState([]);
    const [attendance, setAttendance] = useState({}); // { empId: 'Present' | 'Absent' | 'Half-Day' }
    const [loading, setLoading] = useState(false);

    const [lastUpdated, setLastUpdated] = useState(null);

    useEffect(() => {
        fetchEmployees();
    }, []);

    useEffect(() => {
        fetchAttendance();
    }, [date]);

    const fetchEmployees = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('http://localhost:5000/api/employees', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const activeEmployees = res.data.filter(e => e.status === 'active');
            setEmployees(activeEmployees);
            // Initialize attendance state
            const initial = {};
            activeEmployees.forEach(e => initial[e.id] = 'Present');
            setAttendance(prev => ({ ...initial, ...prev }));
        } catch (err) {
            console.error(err);
        }
    };

    const fetchAttendance = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`http://localhost:5000/api/attendance?date=${date}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.length > 0) {
                const existing = {};
                res.data.forEach(r => existing[r.employee_id] = r.status);
                setAttendance(prev => ({ ...prev, ...existing }));
                setLastUpdated(res.data[0].updated_at || res.data[0].created_at);
            } else {
                setLastUpdated(null);
            }
        } catch (err) {
            console.error(err);
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
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const records = Object.entries(attendance).map(([id, status]) => ({
                employee_id: parseInt(id),
                status
            }));

            await axios.post('http://localhost:5000/api/attendance/bulk', {
                date,
                records
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Attendance saved successfully');
            fetchAttendance(); // Refresh to get updated timestamp
        } catch (err) {
            toast.error('Failed to save attendance');
        } finally {
            setLoading(false);
        }
    };

    const stats = {
        total: employees.length,
        present: Object.values(attendance).filter(s => s === 'Present').length,
        absent: Object.values(attendance).filter(s => s === 'Absent').length,
        halfDay: Object.values(attendance).filter(s => s === 'Half-Day').length
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Bulk Attendance</h1>
                    {lastUpdated && (
                        <p className="text-xs text-gray-400 mt-1">
                            Last Updated: {new Date(lastUpdated).toLocaleString()}
                        </p>
                    )}
                </div>
                <div className="flex gap-4 items-center">
                    <div className="flex gap-2 mr-4">
                        <button onClick={() => markAll('Present')} className="px-3 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 text-xs font-bold">All Present</button>
                        <button onClick={() => markAll('Absent')} className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 text-xs font-bold">All Absent</button>
                    </div>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg p-2 text-white"
                    />
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="bg-zohra-blue hover:bg-blue-600 px-4 py-2 rounded-lg text-white font-bold flex items-center gap-2"
                    >
                        <FiSave /> {loading ? 'Saving...' : 'Save All'}
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="glass-panel p-4 rounded-lg">
                    <p className="text-gray-400 text-sm uppercase mb-2">Total Employees</p>
                    <p className="text-2xl font-bold text-white">{stats.total}</p>
                </div>
                <div className="glass-panel p-4 rounded-lg">
                    <p className="text-gray-400 text-sm uppercase mb-2">Present</p>
                    <p className="text-2xl font-bold text-green-400">{stats.present}</p>
                </div>
                <div className="glass-panel p-4 rounded-lg">
                    <p className="text-gray-400 text-sm uppercase mb-2">Absent</p>
                    <p className="text-2xl font-bold text-red-400">{stats.absent}</p>
                </div>
                <div className="glass-panel p-4 rounded-lg">
                    <p className="text-gray-400 text-sm uppercase mb-2">Half-Day</p>
                    <p className="text-2xl font-bold text-yellow-400">{stats.halfDay}</p>
                </div>
            </div>

            <div className="glass-panel p-6 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-gray-400 border-b border-white/10">
                            <th className="p-3">EMP ID</th>
                            <th className="p-3">Employee</th>
                            <th className="p-3">Role/Dept</th>
                            <th className="p-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map(emp => (
                            <tr key={emp.id} className="border-b border-white/5 hover:bg-white/5">
                                <td className="p-3 font-mono text-xs text-gray-400">{emp.employee_code || '-'}</td>
                                <td className="p-3 text-white font-medium">{emp.full_name}</td>
                                <td className="p-3 text-sm text-gray-400 capitalize">{emp.role} • {emp.department}</td>
                                <td className="p-3">
                                    <div className="flex justify-center gap-4">
                                        {['Present', 'Absent', 'Half-Day'].map(status => (
                                            <label key={status} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name={`attendance-${emp.id}`}
                                                    checked={attendance[emp.id] === status}
                                                    onChange={() => handleStatusChange(emp.id, status)}
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
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BulkAttendance;
