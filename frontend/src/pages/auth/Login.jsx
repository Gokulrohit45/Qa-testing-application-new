import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Zap, Shield } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useEffect } from 'react';
import { AuthenticationService, ApiClient } from '../../services/api';

export default function Login({ setSession }) {
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('remember_me') === 'true');
  const [email, setEmail]       = useState(() => localStorage.getItem('remember_me') === 'true' ? (localStorage.getItem('saved_email') || '') : '');
  const [password, setPassword] = useState(() => localStorage.getItem('remember_me') === 'true' ? (localStorage.getItem('saved_password') || '') : '');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cloudBooting, setCloudBooting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let interval = null;
    const checkHealth = async () => {
      const isOnline = await ApiClient.checkCloudHealth();
      if (!isOnline) {
        setCloudBooting(true);
        interval = setInterval(async () => {
          const checkAgain = await ApiClient.checkCloudHealth();
          if (checkAgain) {
            setCloudBooting(false);
            clearInterval(interval);
          }
        }, 4000);
      }
    };
    checkHealth();
    return () => { if (interval) clearInterval(interval); };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await AuthenticationService.login(email, password);
      if (setSession && res?.session) {
        setSession(res.session);
      }

      if (rememberMe) {
        localStorage.setItem('remember_me', 'true');
        localStorage.setItem('saved_email', email);
        localStorage.setItem('saved_password', password);
      } else {
        localStorage.removeItem('remember_me');
        localStorage.removeItem('saved_email');
        localStorage.removeItem('saved_password');
      }
      navigate('/');
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen page-bg flex items-center justify-center p-6 relative overflow-hidden transition-colors duration-200">

      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 gradient-brand rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/25">
            <Zap size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">QA·AI Platform</h1>
            <p className="text-secondary text-xs mt-1">Autonomous End-to-End Testing</p>
          </div>
        </div>

        {/* Login Form Card */}
        <div className="card p-8 space-y-6 shadow-2xl backdrop-blur-md">
          <div className="space-y-1 text-center">
            <h2 className="text-xl font-bold text-primary tracking-tight">Welcome Back</h2>
            <p className="text-secondary text-xs">Sign in to your automation workspace</p>
          </div>

          {cloudBooting && (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              <span>Application backend is starting up. Please wait...</span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs px-3.5 py-2.5 rounded-xl text-center">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="section-label">Email Address</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="input-field" placeholder="name@company.com" />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="section-label">Password</label>
                <Link to="/forgot-password" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                  className="input-field pr-11" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary p-1 transition-colors">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-secondary hover:text-primary transition-colors select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Remember me</span>
              </label>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 mt-2 text-xs font-bold">
              {loading ? 'Signing in...' : 'Sign In to Workspace'}
            </button>
          </form>

          <p className="text-center text-xs text-secondary pt-2 border-t border-slate-100/50 dark:border-zinc-800/30">
            Don't have an account?{' '}
            <Link to="/register" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Create one free</Link>
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Shield size={12} className="text-muted" />
          <span className="text-[11px] text-muted font-medium">256-bit SSL encrypted · Secured by Supabase</span>
        </div>
      </div>
    </div>
  );
}
