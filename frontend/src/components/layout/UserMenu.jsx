import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, User, Settings, BarChart3, ShieldCheck, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext.jsx';

function initials(name) {
  if (!name) return '?';
  return name.slice(0, 2).toUpperCase();
}

// UI redesign (2026-08-09): Usage/Settings/Profile/Admin used to be four
// separate always-visible sidebar nav entries — consolidated into this one
// popover per the redesign spec's "single coherent user/profile entry"
// requirement. Only real, backend-verified destinations are listed; Admin
// only appears for admin users, matching the route guard in App.jsx.
const LINKS = [
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/usage', label: 'Usage', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Problem #5 fix (2026-08-09): `variant="compact"` lets MobileNav.jsx reuse
// this exact same component (state, links list, admin gating, click-
// outside/Escape handling) instead of duplicating Usage/Settings/Profile as
// three separate bottom-nav tabs — the audit's "consolidation only landed
// on desktop/drawer" gap. Only the trigger's appearance and the popover's
// horizontal anchor change; everything else (including which links appear)
// is identical to the sidebar version, so behavior never diverges between
// the two entry points.
export default function UserMenu({ variant = 'sidebar' }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);
  const compact = variant === 'compact';

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (!user) return null;

  const links = user.role === 'admin' ? [...LINKS, { to: '/admin', label: 'Admin', icon: ShieldCheck }] : LINKS;

  return (
    <div className={clsx('relative', compact && 'flex justify-center')} ref={ref}>
      {open && (
        <div
          role="menu"
          className={clsx(
            'absolute bottom-full mb-2 w-60 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-20',
            // Sidebar trigger spans the panel's own width, so the popover can
            // anchor flush left. The compact/mobile trigger is a small icon
            // near the edge of the screen — anchoring right keeps the panel
            // inside the viewport at 360px instead of overflowing off-screen.
            compact ? 'right-0' : 'left-0 w-full min-w-60'
          )}
        >
          <div className="flex items-center gap-2.5 px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
              {initials(user.username)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{user.username}</p>
              {user.email && <p className="truncate text-xs text-slate-400 dark:text-slate-500">{user.email}</p>}
            </div>
            {user.role === 'admin' && (
              <span className="ml-auto shrink-0 rounded-full bg-brand-50 dark:bg-brand-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                Admin
              </span>
            )}
          </div>
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
          <div className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              role="menuitem"
              onClick={() => { logout(); navigate('/login'); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      )}
      {compact ? (
        // Matches the sizing/typography of MobileNav's other NavLink tabs
        // (flex-col icon+label, text-xs) so "Account" reads as one of the
        // bottom-nav items rather than a visually different control.
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          className={clsx(
            'flex flex-col items-center gap-0.5 px-3 py-1 text-xs font-medium rounded-md',
            open ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'
          )}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[9px] font-semibold text-white">
            {initials(user.username)}
          </span>
          Account
        </button>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
            {initials(user.username)}
          </span>
          <span className="flex-1 min-w-0 text-left">
            <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">{user.username}</span>
            <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
              {user.role === 'admin' ? 'Admin' : 'Member'}
            </span>
          </span>
          <ChevronUp size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? '' : 'rotate-180'}`} />
        </button>
      )}
    </div>
  );
}
