import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, User, Settings, ChevronUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

function initials(name) {
  if (!name) return '?';
  return name.slice(0, 2).toUpperCase();
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1 z-10">
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <User size={16} /> Profile
          </Link>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Settings size={16} /> Settings
          </Link>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
          {initials(user.username)}
        </span>
        <span className="flex-1 text-left text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
          {user.username}
        </span>
        <ChevronUp size={16} className={`text-slate-400 transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
    </div>
  );
}
