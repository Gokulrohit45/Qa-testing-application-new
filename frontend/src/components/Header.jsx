import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function Header({ user, projects = [], selectedProject }) {
  const location = useLocation();
  const navigate = useNavigate();

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Gokulnath';
  const initialLetter = (userName || 'G').charAt(0).toUpperCase();

  // Generate breadcrumb items
  const pathParts = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = [{ name: 'Home', path: '/dashboard' }];

  if (pathParts[0] === 'projects') {
    breadcrumbs.push({ name: 'Projects', path: '/dashboard' });
    if (pathParts[1] === 'new') {
      breadcrumbs.push({ name: 'Create', path: '/projects/new' });
    } else if (pathParts[1]) {
      const proj = projects.find(p => p.id === pathParts[1]) || selectedProject;
      breadcrumbs.push({ name: proj?.name || 'Project Details', path: `/projects/${pathParts[1]}` });
    }
  } else if (pathParts[0] === 'profile') {
    breadcrumbs.push({ name: 'Profile', path: '/profile' });
  }

  return (
    <header className="h-14 border-b border-dark-border bg-[#0B0F17] px-6 flex items-center justify-between sticky top-0 z-30 select-none shrink-0">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center space-x-2 text-xs font-medium text-slate-400">
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={crumb.path + idx}>
            {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600" />}
            <Link
              to={crumb.path}
              className={`hover:text-slate-200 transition-colors ${
                idx === breadcrumbs.length - 1 ? 'text-slate-200 font-semibold' : ''
              }`}
            >
              {crumb.name}
            </Link>
          </React.Fragment>
        ))}
      </div>

      {/* Top Right Actions */}
      <div className="flex items-center space-x-3">
        {/* User Avatar Circle */}
        <button
          onClick={() => navigate('/profile')}
          className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center hover:opacity-90 transition-opacity shadow-md shadow-indigo-600/20"
          title="Account Profile"
        >
          {initialLetter}
        </button>
      </div>
    </header>
  );
}
