import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthenticationService, ApiClient } from '../../services/api';
import { Mail, ArrowLeft, KeyRound, CheckCircle, Lock, ShieldCheck, RefreshCw } from 'lucide-react';

export default function ForgotPassword() {
  const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: New Password, 4: Success
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await AuthenticationService.sendOtp(email);
      if (res.success) {
        setStep(2);
      } else {
        setError(res.error || res.message || 'Failed to send OTP via Brevo.');
      }
    } catch (err) {
      setError(err.message || 'Network error sending OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await AuthenticationService.verifyOtp(email, otp);
      if (res.success) {
        setStep(3);
      } else {
        setError(res.error || 'Invalid OTP code.');
      }
    } catch (err) {
      setError(err.message || 'Error verifying OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await AuthenticationService.resetPasswordWithOtp(email, otp, newPassword);
      if (res.success) {
        setStep(4);
      } else {
        setError(res.error || 'Failed to reset password.');
      }
    } catch (err) {
      setError(err.message || 'Error resetting password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="w-full max-w-md glass-card rounded-2xl p-8 border border-slate-800 relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 items-center justify-center mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Reset Password</h2>
          <p className="text-xs text-slate-400 mt-1">Brevo OTP Verification for Registered Email</p>
        </div>

        {cloudBooting && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            <span>Application backend is starting up. Please wait...</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Step 1: Send OTP to Email */}
        {step === 1 && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Registered Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-3 pl-10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  placeholder="name@company.com"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-xs hover:from-indigo-500 hover:to-purple-500 transition-all flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sending Brevo OTP...</span>
                </>
              ) : (
                <span>Send 6-Digit OTP via Email</span>
              )}
            </button>
          </form>
        )}

        {/* Step 2: Verify OTP Code */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Enter 6-Digit OTP Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-3 text-center text-lg font-mono text-emerald-400 tracking-[8px] focus:outline-none focus:border-indigo-500"
                placeholder="123456"
              />
              <p className="text-[11px] text-slate-400 mt-2 text-center">
                OTP sent to <span className="text-indigo-400 font-semibold">{email}</span>. Valid for 10 minutes.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-500 transition-all"
            >
              {loading ? 'Verifying...' : 'Verify OTP Code'}
            </button>
          </form>
        )}

        {/* Step 3: Enter New Password */}
        {step === 3 && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-3 pl-10 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  placeholder="••••••••"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold text-xs hover:from-emerald-500 hover:to-teal-500 transition-all"
            >
              {loading ? 'Updating Password...' : 'Reset Password & Save'}
            </button>
          </form>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs text-center space-y-3">
            <CheckCircle className="w-10 h-10 mx-auto text-emerald-400" />
            <h3 className="font-bold text-sm text-white">Password Reset Complete!</h3>
            <p className="text-slate-400 text-xs">Your password has been updated. You can now log into your workspace.</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-all mt-2"
            >
              Return to Login
            </button>
          </div>
        )}

        {step < 4 && (
          <div className="mt-6 text-center">
            <Link to="/login" className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Login</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
