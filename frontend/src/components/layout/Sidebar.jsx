import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Code2, BarChart3, Settings, User, ShieldCheck, Plus, MessageSquare, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useChatSessions } from '../../context/ChatSessionsContext.jsx';
import UserMenu from './UserMenu.jsx';

// FIX 1: this used to be two side-by-side panels — this Sidebar (app nav)
// plus a separate SessionSidebar (chat history), rendered next to each
// other only on the /chat route. Chat history is now merged in here as its
// own section, so there is exactly one sidebar everywhere in the app.
// SessionSidebar.jsx has been removed.

const WORKSPACE_ITEMS = [{ to: '/opencode', label: 'OpenCode', icon: Code2 }];

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

// The chat history section — was SessionSidebar.jsx, now lives inside the
// one sidebar. Reads/writes the shared ChatSessionsContext so ChatPage
// (rendered separately, further down the tree) sees the same active session.
function ChatHistorySection({ onNavigateAway }) {
  const { sessions, activeId, setActiveId, startNewChat } = useChatSessions();
  const navigate = useNavigate();
  const location = useLocation();

  function goToChat() {
    if (location.pathname !== '/chat') navigate('/chat');
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="px-3 pt-1">
        <button
          onClick={() => { startNewChat(); goToChat(); onNavigateAway?.(); }}
          className="flex w-full items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Plus size={16} /> New chat
        </button>
      </div>
      <p className="px-3 mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Recent chats
      </p>
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {sessions.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-slate-400">No conversations yet.</p>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => { setActiveId(s.id); goToChat(); onNavigateAway?.(); }}
            className={clsx(
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm truncate mb-0.5',
              s.id === activeId && location.pathname === '/chat'
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
          >
            <MessageSquare size={14} className="shrink-0" />
            <span className="truncate">{s.title || 'Untitled chat'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// `open` — FIX 2: desktop collapse/expand, driven by the toggle button in
// App.jsx's Layout (outside the sidebar itself, so it's reachable even when
// collapsed). `mobileOpen`/`onCloseMobile` — same toggle drives a slide-in
// overlay below the lg breakpoint instead of a width collapse.
export default function Sidebar({ open = true, mobileOpen = false, onCloseMobile }) {
  const { user } = useAuth();

  const content = (
    <>
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <span className="text-lg font-semibold text-slate-900 dark:text-white">⚡ Assistant</span>
        <button
          onClick={onCloseMobile}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
          title="Close"
        >
          <X size={18} />
        </button>
      </div>
      <ChatHistorySection onNavigateAway={onCloseMobile} />
      <nav className="px-3 py-3 flex flex-col gap-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <NavGroup title="Workspace" items={WORKSPACE_ITEMS} />
        <NavGroup title="Account" items={ACCOUNT_ITEMS} />
        {user?.role === 'admin' && <NavGroup title="Admin" items={[{ to: '/admin', label: 'Admin', icon: ShieldCheck }]} />}
      </nav>
      <div className="border-t border-slate-200 dark:border-slate-800 p-3 shrink-0">
        <UserMenu />
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay backdrop, tap to close */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onCloseMobile} />
      )}
      <aside
        className={clsx(
          'flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 h-full overflow-hidden',
          // Desktop: width-collapse, animated. Mobile: fixed slide-in drawer.
          'transition-[width] duration-300 ease-in-out',
          open ? 'lg:w-72' : 'lg:w-0 lg:border-r-0',
          'fixed inset-y-0 left-0 z-40 w-72 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex flex-col h-full w-72 shrink-0">{content}</div>
      </aside>
    </>
  );
}
