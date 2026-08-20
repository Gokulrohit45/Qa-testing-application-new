import React, { useState } from 'react';
import { User, ShieldCheck, Mail, CheckCircle2, Lock, Save } from 'lucide-react';
import { AuthenticationService } from '../../services/api';

export default function Profile({ session, setSession }) {
  const user = session?.user;
  const initialName = user?.user_metadata?.full_name || 'Gokulnath';
  const email = user?.email || 'gokulnath96880@gmail.com';

  const [fullName, setFullName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');

    try {
      // Update local session metadata
      const updatedSession = {
        ...session,
        user: {
          ...user,
          user_metadata: {
            ...user?.user_metadata,
            full_name: fullName
          }
        }
      };
      localStorage.setItem('qa_offline_session', JSON.stringify(updatedSession));
      if (setSession) setSession(updatedSession);
      setSuccessMsg('Profile updated successfully!');
    } catch (err) {
      alert('Failed to update profile: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const initialLetter = (fullName || 'G').charAt(0).toUpperCase();

  return (
    <div className="p-8 space-y-6 min-h-full max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Profile</h2>
        <p className="text-xs text-slate-400 mt-1">
          Manage your account identity, security preferences, and workspace credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Avatar Card (4 cols) */}
        <div className="lg:col-span-4">
          <div className="glass-card rounded-2xl p-8 border border-slate-800 flex flex-col items-center text-center space-y-4">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-3xl font-extrabold shadow-xl shadow-indigo-600/30 border-2 border-indigo-400/30">
              {initialLetter}
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">{fullName}</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{email}</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <span className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium">
                QA Automation Engineer
              </span>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verified User
              </span>
            </div>
          </div>
        </div>

        {/* Right Details Card (8 cols) */}
        <div className="lg:col-span-8">
          <div className="glass-card rounded-2xl p-8 border border-slate-800 space-y-6 relative">
            <div className="flex items-center justify-between border-b border-dark-border pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Account Details</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update your personal information displayed across the platform.
                </p>
              </div>
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
            </div>

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> {successMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Full Name
                    </label>
                    <span className="text-[10px] text-indigo-400 font-mono">EDITABLE</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-3 pl-10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
                    />
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Email Address (Registered Login)
                    </label>
                    <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                      <Lock className="w-3 h-3" /> READ-ONLY LOGIN EMAIL
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="email"
                      disabled
                      value={email}
                      className="w-full bg-[#0D111A] border border-dark-border rounded-xl px-4 py-3 pl-10 text-xs text-slate-400 cursor-not-allowed font-mono opacity-80"
                    />
                    <Mail className="w-4 h-4 text-slate-600 absolute left-3.5 top-3.5" />
                  </div>
                </div>
              </div>

              {/* Identity Sync Notice */}
              <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 space-y-1">
                <h4 className="text-xs font-bold text-indigo-300">Identity Synchronization Notice</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Saving your name updates your identity live across all active workspaces, execution logs, reports, sidebar user card, and top navigation header avatar.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-600/25 flex items-center space-x-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving Changes...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
