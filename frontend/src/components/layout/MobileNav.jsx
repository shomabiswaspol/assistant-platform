import { NavLink } from 'react-router-dom';
import { MessageSquare, BarChart3, Settings, User } from 'lucide-react';
import clsx from 'clsx';

const ITEMS = [
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/usage', label: 'Usage', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: User },
];

export default function MobileNav() {
  return (
    <nav className="md:hidden flex items-center justify-around border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1.5">
      {ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center gap-0.5 px-3 py-1 text-xs font-medium rounded-md',
              isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'
            )
          }
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
