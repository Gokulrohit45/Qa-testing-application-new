import React from 'react';
import { ShieldCheck, Cloud, Wifi, User, LogOut, Cpu } from 'lucide-react';
import { AuthenticationService } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function Header({ user, isOffline }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await AuthenticationService.logout();
    navigate('/login');
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'QA Engineer';

  return (
    <header className="h-16 border-b border-dark-border bg-[#0E1420]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Brand Title */}
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
          <Cpu className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-white tracking-wide text-base flex items-center gap-2">
            QA-AI Platform
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              v2.0 Standalone
            </span>
          </h1>
        </div>
      </div>

      {/* Center Status Indicators */}
      <div className="flex items-center space-x-3">
        {/* Python Daemon Status */}
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Daemon Connected (Port 5000)</span>
        </div>

        {/* Cloud / Local Sync Badge */}
        <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
          isOffline
            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
        }`}>
          {isOffline ? <Wifi className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />}
          <span>{isOffline ? 'Offline Storage Mode' : 'Cloud Sync Active'}</span>
        </div>
      </div>

      {/* User Actions */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-3 bg-dark-card/60 px-3 py-1.5 rounded-lg border border-dark-border">
          <div className="w-7 h-7 rounded-full bg-indigo-600/30 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/40">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-medium text-slate-200">{userName}</span>
        </div>

        <button
          onClick={handleLogout}
          className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
