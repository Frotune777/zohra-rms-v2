import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

const EmployeeManagement = () => {
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    position: '',
    department: '',
    age: '',
    gender: '',
    phone_number: '',
    base_salary: '',
    status: 'active',
    role: 'staff',
    payout_method: 'Cash',
    govt_id_type: '',
    govt_id_number: '',
    bank_account_no: '',
    ifsc_code: ''
  });
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('');
  const { userRole } = useAuth();

  // Both owner and manager can register/manage employees
  const canRegister = userRole === 'owner' || userRole === 'manager';

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await api.get('/employees');
      setEmployees(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load employees');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!formData.first_name || !formData.last_name || !formData.position || !formData.base_salary || !formData.department) {
      setError('All required fields must be filled');
      return;
    }

    try {
      const payload = {
        full_name: `${formData.first_name} ${formData.last_name}`,
        first_name: formData.first_name,
        last_name: formData.last_name,
        position: formData.position,
        department: formData.department,
        age: formData.age ? parseInt(formData.age) : null,
        gender: formData.gender,
        phone_number: formData.phone_number,
        base_salary: parseFloat(formData.base_salary),
        status: formData.status,
        role: formData.role,
        payout_method: formData.payout_method,
        govt_id_type: formData.govt_id_type,
        govt_id_number: formData.govt_id_number,
        bank_account_no: formData.bank_account_no,
        ifsc_code: formData.ifsc_code
      };

      if (editingId) {
        await api.put(`/employees/${editingId}`, payload);
        setSuccessMessage('Employee updated successfully');
      } else {
        await api.post('/employees', payload);
        setSuccessMessage('Employee registered successfully');
      }

      setFormData({
        first_name: '',
        last_name: '',
        position: '',
        department: '',
        age: '',
        gender: '',
        phone_number: '',
        base_salary: '',
        status: 'active',
        role: 'staff',
        payout_method: 'Cash',
        govt_id_type: '',
        govt_id_number: '',
        bank_account_no: '',
        ifsc_code: ''
      });
      setShowForm(false);
      setEditingId(null);
      fetchEmployees();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save employee');
    }
  };

  const handleEdit = (employee) => {
    const [firstName, ...lastNameParts] = employee.full_name.split(' ');
    setFormData({
      first_name: firstName,
      last_name: lastNameParts.join(' ') || '',
      position: employee.position,
      department: employee.department || '',
      age: employee.age || '',
      gender: employee.gender || '',
      phone_number: employee.phone_number || '',
      base_salary: employee.base_salary,
      status: employee.status,
      role: employee.role || 'staff',
      payout_method: employee.payout_method || 'Cash',
      govt_id_type: employee.govt_id_type || '',
      govt_id_number: employee.govt_id_number || '',
      bank_account_no: employee.bank_account_no || '',
      ifsc_code: employee.ifsc_code || ''
    });
    setEditingId(employee.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;

    try {
      await api.delete(`/employees/${id}`);
      setSuccessMessage('Employee deleted successfully');
      fetchEmployees();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete employee');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      first_name: '',
      last_name: '',
      position: '',
      department: '',
      age: '',
      gender: '',
      phone_number: '',
      base_salary: '',
      status: 'active',
      role: 'staff',
      payout_method: 'Cash',
      govt_id_type: '',
      govt_id_number: '',
      bank_account_no: '',
      ifsc_code: ''
    });
    setError('');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400">Loading employees...</p>
      </div>
    );
  }



  const handleViewHistory = async (employee) => {
    try {
      setLoading(true);
      const response = await api.get(`/employees/${employee.id}/history`);
      setHistoryData(response.data);
      setSelectedEmployeeName(employee.full_name);
      setShowHistory(true);
    } catch (err) {
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full w-full flex flex-col p-4 md:p-6 overflow-y-auto lg:h-full">
      <PageHeader
        title="Employee Management"
        showBack={true}
        showHome={true}
        actions={
          canRegister && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 btn-primary"
            >
              <FiPlus /> Register New Employee
            </button>
          )
        }
      />

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500 rounded-lg mb-4">
          <FiAlertCircle className="text-red-500" />
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 p-4 bg-green-500/20 border border-green-500 rounded-lg mb-4">
          <FiCheckCircle className="text-green-500" />
          <p className="text-green-200">{successMessage}</p>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="glass-panel p-6 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">History: {selectedEmployeeName}</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-white transition"
              >
                <FiX size={24} />
              </button>
            </div>

            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 sticky top-0">
                    <th className="text-left p-3 font-semibold text-gray-300">Date</th>
                    <th className="text-left p-3 font-semibold text-gray-300">Field</th>
                    <th className="text-left p-3 font-semibold text-gray-300">Old Value</th>
                    <th className="text-left p-3 font-semibold text-gray-300">New Value</th>
                    <th className="text-left p-3 font-semibold text-gray-300">Changed By</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-400">No history records found</td>
                    </tr>
                  ) : (
                    historyData.map((record) => (
                      <tr key={record.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3 text-gray-400">{new Date(record.changed_at).toLocaleString()}</td>
                        <td className="p-3 font-semibold text-zohra-blue">{record.field_changed}</td>
                        <td className="p-3 text-red-300">{record.old_value || '-'}</td>
                        <td className="p-3 text-green-300">{record.new_value || '-'}</td>
                        <td className="p-3 text-gray-400">{record.changed_by}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && canRegister && (
        <form onSubmit={handleSubmit} className="glass-panel p-6 mb-6 rounded-xl space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">{editingId ? 'Edit Employee' : 'Register New Employee'}</h2>
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-400 hover:text-white transition"
            >
              <FiX size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">First Name *</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="John"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Last Name *</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="Doe"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Age</label>
              <input
                type="number"
                min="18"
                max="100"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Gender</label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white"
              >
                <option value="" className="bg-gray-800 text-white">Select Gender</option>
                <option value="Male" className="bg-gray-800 text-white">Male</option>
                <option value="Female" className="bg-gray-800 text-white">Female</option>
                <option value="Other" className="bg-gray-800 text-white">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Phone Number</label>
              <input
                type="tel"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="9876543210"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Position *</label>
              <input
                type="text"
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="Chef, Waiter, etc."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Department *</label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="Kitchen, Service, etc."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Base Salary (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.base_salary}
                onChange={(e) => setFormData({ ...formData, base_salary: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="25000"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-zohra-blue"
              >
                <option value="active" className="bg-gray-800 text-white">Active</option>
                <option value="inactive" className="bg-gray-800 text-white">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">System Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-zohra-blue"
              >
                <option value="staff" className="bg-gray-800 text-white">Staff</option>
                <option value="manager" className="bg-gray-800 text-white">Manager</option>
                <option value="owner" className="bg-gray-800 text-white">Owner</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Govt ID Type</label>
              <select
                value={formData.govt_id_type}
                onChange={(e) => setFormData({ ...formData, govt_id_type: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-zohra-blue"
              >
                <option value="" className="bg-gray-800 text-white">Select Type</option>
                <option value="Aadhar" className="bg-gray-800 text-white">Aadhar Card</option>
                <option value="PAN" className="bg-gray-800 text-white">PAN Card</option>
                <option value="Driving License" className="bg-gray-800 text-white">Driving License</option>
                <option value="Voter ID" className="bg-gray-800 text-white">Voter ID</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Govt ID Number</label>
              <input
                type="text"
                value={formData.govt_id_number}
                onChange={(e) => setFormData({ ...formData, govt_id_number: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="XXXX-XXXX-XXXX"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Payout Method</label>
              <select
                value={formData.payout_method}
                onChange={(e) => setFormData({ ...formData, payout_method: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-zohra-blue"
              >
                <option value="Cash" className="bg-gray-800 text-white">Cash</option>
                <option value="Bank Transfer" className="bg-gray-800 text-white">Bank Transfer</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Bank Account No</label>
              <input
                type="text"
                value={formData.bank_account_no}
                onChange={(e) => setFormData({ ...formData, bank_account_no: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">IFSC Code</label>
              <input
                type="text"
                value={formData.ifsc_code}
                onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
            >
              {editingId ? 'Update Employee' : 'Register Employee'}
            </button>
          </div>
        </form>
      )}

      {/* Employees Table */}
      <div className="flex-1 overflow-auto glass-panel rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 sticky top-0">
              <th className="text-left p-4 font-semibold text-gray-300">ID</th>
              <th className="text-left p-4 font-semibold text-gray-300">Name</th>
              <th className="text-left p-4 font-semibold text-gray-300">Role/Pos/Dept</th>
              <th className="text-left p-4 font-semibold text-gray-300">Govt ID</th>
              <th className="text-left p-4 font-semibold text-gray-300">Salary</th>
              <th className="text-left p-4 font-semibold text-gray-300">Status</th>
              {canRegister && (
                <th className="text-left p-4 font-semibold text-gray-300">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={canRegister ? 8 : 7} className="p-4 text-center text-gray-400">
                  No employees found
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr 
                  key={emp.id} 
                  className="border-b border-white/5 hover:bg-white/10 transition cursor-pointer group"
                  onClick={() => handleEdit(emp)}
                >
                  <td className="p-4 font-mono text-gray-400 text-xs">{emp.employee_code || '-'}</td>
                  <td className="p-4 font-semibold">
                    <div>{emp.full_name}</div>
                    <div className="text-xs text-gray-500">{emp.phone_number}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm text-white">{emp.position}</div>
                    <div className="text-xs text-gray-500 capitalize">{emp.role} • {emp.department}</div>
                  </td>
                  <td className="p-4 text-xs text-gray-400">
                    {emp.govt_id_type ? `${emp.govt_id_type}: ${emp.govt_id_number}` : '-'}
                  </td>
                  <td className="p-4 font-semibold text-zohra-blue">
                    ₹{parseFloat(emp.base_salary).toFixed(2)}
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${emp.status === 'active'
                      ? 'bg-green-500/20 text-green-300'
                      : 'bg-red-500/20 text-red-300'
                      }`}>
                      {emp.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canRegister && (
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewHistory(emp);
                          }}
                          className="p-2 hover:bg-white/10 rounded transition text-purple-400"
                          title="View History"
                        >
                          <FiAlertCircle />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(emp);
                          }}
                          className="p-2 hover:bg-white/10 rounded transition text-blue-400"
                          title="Edit"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(emp.id);
                          }}
                          className="p-2 hover:bg-white/10 rounded transition text-red-400"
                          title="Delete"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmployeeManagement;
