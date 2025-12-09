import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiMail, FiLock, FiAlertCircle } from 'react-icons/fi';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    
    if (result.success) {
      navigate('/');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  // Demo credentials
  const demoCredentials = [
    { email: 'owner@alzohra.com', password: 'owner123', role: 'Owner' },
    { email: 'manager@alzohra.com', password: 'manager123', role: 'Manager' },
    { email: 'staff@alzohra.com', password: 'staff123', role: 'Staff' }
  ];

  const fillDemoCredentials = (cred) => {
    setEmail(cred.email);
    setPassword(cred.password);
  };

  return (
    <div className="min-h-screen bg-midnight flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-zohra-blue mb-2">Al Zohra</h1>
          <p className="text-gray-400">Restaurant Management System</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="glass-panel p-8 space-y-6 rounded-xl">
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500 rounded-lg">
              <FiAlertCircle className="text-red-500" />
              <p className="text-red-200">{error}</p>
            </div>
          )}

          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-lg">
              <FiMail className="text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-transparent flex-1 outline-none text-white placeholder-gray-500"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-lg">
              <FiLock className="text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-transparent flex-1 outline-none text-white placeholder-gray-500"
                required
              />
            </div>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Demo Credentials */}
        <div className="mt-8 space-y-3">
          <p className="text-center text-gray-400 text-sm font-medium">Demo Credentials</p>
          <div className="grid grid-cols-1 gap-3">
            {demoCredentials.map((cred) => (
              <button
                key={cred.email}
                onClick={() => fillDemoCredentials(cred)}
                className="glass-panel p-4 hover:bg-white/10 transition text-left rounded-lg"
              >
                <p className="text-sm font-semibold text-zohra-blue">{cred.role}</p>
                <p className="text-xs text-gray-400">{cred.email}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
