import { NavLink } from 'react-router-dom';
import { MessageSquare, Code2, BarChart3, Settings, User, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext.jsx';
import UserMenu from './UserMenu.jsx';

const WORKSPACE_ITEMS = [
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/opencode', label: 'OpenCode', icon: Code2 },
];

const ACCOUNT_ITEMS = [
  { to: '/usage', label: 'Usage', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: User },
];

function NavItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
        )
      }
    >
      <Icon size={18} strokeWidth={2} />
      {label}
    </NavLink>
  );
}

function NavGroup({ title, items }) {
  return (
    <div>
      <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
      </p>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => <NavItem key={item.to} {...item} />)}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 h-full">
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <span className="text-lg font-semibold text-slate-900 dark:text-white">⚡ Assistant</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-6">
        <NavGroup title="Workspace" items={WORKSPACE_ITEMS} />
        <NavGroup title="Account" items={ACCOUNT_ITEMS} />
        {user?.role === 'admin' && <NavGroup title="Admin" items={[{ to: '/admin', label: 'Admin', icon: ShieldCheck }]} />}
      </nav>
      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <UserMenu />
      </div>
    </aside>
  );
}
