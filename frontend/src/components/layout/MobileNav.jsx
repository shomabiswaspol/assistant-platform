import { NavLink } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import UserMenu from './UserMenu.jsx';

// Problem #5 fix (2026-08-09): Usage/Settings/Profile used to be three
// separate always-visible tabs here — the same "scattered nav" pattern the
// desktop sidebar was consolidated away from, but the fix never reached
// this file. Now mirrors the desktop UserMenu popover exactly (same
// component, same links, same admin gating) via its `compact` variant, so
// mobile and desktop never diverge on what "the profile menu" contains.
export default function MobileNav() {
  return (
    <nav className="md:hidden flex items-center justify-around border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1.5">
      <NavLink
        to="/chat"
        className={({ isActive }) =>
          clsx(
            'flex flex-col items-center gap-0.5 px-3 py-1 text-xs font-medium rounded-md',
            isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'
          )
        }
      >
        <MessageSquare size={20} />
        Chat
      </NavLink>
      <UserMenu variant="compact" />
    </nav>
  );
}
