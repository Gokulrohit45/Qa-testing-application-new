import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { AuthenticationService, ApiClient } from '../services/api';

export default function Header({ selectedProject }) {
  const { dark, toggle } = useTheme();
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const [currentUser, setCurrentUser] = useState(null);
  const [cloudOnline, setCloudOnline] = useState(true);

  useEffect(() => {
    function getUserData() {
      const stored = localStorage.getItem('user');
      if (stored) {
        try { setCurrentUser(JSON.parse(stored)); } catch (e) { setCurrentUser(null); }
      } else {
        AuthenticationService.getProfile().then(user => {
          if (user) {
            setCurrentUser(user);
            localStorage.setItem('user', JSON.stringify(user));
          }
        });
      }
    }
    getUserData();

    async function verifyCloud() {
      const isOnline = await ApiClient.checkCloudHealth();
      setCloudOnline(isOnline);
    }
    verifyCloud();
    const interval = setInterval(verifyCloud, 15000);

    const handleProfileUpdate = () => getUserData();
    window.addEventListener('profile_updated', handleProfileUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('profile_updated', handleProfileUpdate);
    };
  }, []);

  const crumbs = [
    { label: 'Home', to: '/dashboard' },
    ...segments.map((seg, i) => {
      const to = '/' + segments.slice(0, i + 1).join('/');
      const label = isNaN(seg)
        ? seg.charAt(0).toUpperCase() + seg.slice(1)
        : selectedProject?.name || `#${seg}`;
      return { label, to };
    }),
  ];

  const userInitial = currentUser
    ? (currentUser.user_metadata?.full_name || currentUser.full_name || currentUser.email || 'U').charAt(0).toUpperCase()
    : 'U';

  return (
    <header className="h-16 surface flex items-center justify-between px-6 flex-shrink-0 border-b border-slate-100/50 dark:border-zinc-800/30">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {crumbs.map((c, i) => (
          <React.Fragment key={c.to}>
            {i > 0 && <ChevronRight size={12} className="text-slate-300 dark:text-zinc-700" />}
            {i === crumbs.length - 1 ? (
              <span className="text-primary font-semibold">{c.label}</span>
            ) : (
              <Link to={c.to} className="hover:text-primary transition-colors">{c.label}</Link>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 transition-all ${
          cloudOnline
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
        }`}>
          <span className={`w-2 h-2 rounded-full ${cloudOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          {cloudOnline ? 'Cloud Sync Online' : 'Offline Mode (Local Engine Only)'}
        </span>

        {/* Dark / Light toggle */}
        <button onClick={toggle} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-primary hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors" title="Toggle theme">
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Avatar */}
        <Link to="/profile" title={currentUser?.user_metadata?.full_name || currentUser?.full_name || 'Profile'}>
          <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center text-white font-black text-xs shadow-sm hover:opacity-90 transition-opacity uppercase">
            {userInitial}
          </div>
        </Link>
      </div>
    </header>
  );
}
