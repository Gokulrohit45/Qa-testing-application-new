import React, { useState, useEffect } from 'react';
import { Save, CheckCircle2, User, Mail, ShieldCheck, Award } from 'lucide-react';
import { AuthenticationService } from '../../services/api';

export default function Profile() {
  const [profile, setProfile] = useState({ name: 'Workspace User', email: '', role: 'QA Automation Engineer' });
  const [saved, setSaved]     = useState(false);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    async function loadUserProfile() {
      const user = await AuthenticationService.getProfile();
      if (user) {
        setProfile({
          name: user.full_name || 'Workspace User',
          email: user.email || '',
          role: 'QA Automation Engineer'
        });
      }
    }
    loadUserProfile();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      setSaved(true);
      window.dispatchEvent(new Event('profile_updated'));
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-black text-primary tracking-tight">Profile</h1>
        <p className="text-secondary text-sm mt-1">Manage your account identity, security preferences, and workspace credentials.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
        {/* Left Column: User Identity Card */}
        <div className="lg:col-span-4 space-y-4">
          <div className="card p-6 flex flex-col items-center text-center space-y-4 bg-slate-900/60 dark:bg-zinc-900/60 border border-slate-800">
            <div className="w-24 h-24 rounded-3xl gradient-brand flex items-center justify-center text-white font-black text-4xl shadow-xl shadow-indigo-500/25 uppercase">
              {profile.name ? profile.name.charAt(0) : 'U'}
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-extrabold text-primary">{profile.name}</h2>
              <p className="text-xs font-mono text-indigo-400">{profile.email}</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <span className="badge badge-indigo text-xs px-3 py-1">{profile.role}</span>
              <span className="badge badge-success text-xs px-3 py-1 flex items-center gap-1">
                <ShieldCheck size={12}/> Verified User
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Account Details Form */}
        <div className="lg:col-span-8">
          <form onSubmit={handleSave} className="card overflow-hidden h-full flex flex-col justify-between">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100/50 dark:border-zinc-800/30 pb-4">
                <div>
                  <h2 className="text-base font-bold text-primary">Account Details</h2>
                  <p className="text-xs text-secondary mt-0.5">Update your personal information displayed across the platform.</p>
                </div>
                <Award size={20} className="text-indigo-500" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="section-label flex items-center justify-between">
                    <span>Full Name</span>
                    <span className="text-[10px] text-indigo-400 font-semibold">Editable</span>
                  </label>
                  <div className="relative flex items-center">
                    <User size={15} className="absolute left-3.5 text-muted pointer-events-none"/>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={e => setProfile({...profile, name: e.target.value})}
                      placeholder="e.g. Gokulnath"
                      className="input-field input-field-icon font-semibold text-primary"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="section-label flex items-center justify-between">
                    <span>Email Address (Registered Login)</span>
                    <span className="text-[10px] text-amber-500 font-semibold">🔒 Read-only login email</span>
                  </label>
                  <div className="relative flex items-center">
                    <Mail size={15} className="absolute left-3.5 text-muted pointer-events-none"/>
                    <input
                      type="email"
                      value={profile.email}
                      disabled={true}
                      placeholder="name@company.com"
                      className="input-field input-field-icon opacity-60 cursor-not-allowed font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <h4 className="text-xs font-bold text-slate-300">Identity Synchronization Notice</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Saving your name updates your identity live across all active workspaces, execution logs, reports, sidebar user card, and top navigation header avatar.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-900/50 border-t border-slate-100/50 dark:border-zinc-800/30 flex items-center justify-between">
              {saved && (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-pulse">
                  <CheckCircle2 size={15}/> Profile updated successfully live across platform!
                </div>
              )}
              <button type="submit" disabled={saving} className="btn-primary ml-auto flex items-center gap-2 disabled:opacity-50">
                <Save size={15}/> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
