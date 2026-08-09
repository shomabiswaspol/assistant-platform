import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Code2, Plus, MessageSquare, Search, MoreVertical, Pencil, Trash2, X, Bot } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useChatSessions } from '../../context/ChatSessionsContext.jsx';
import { api } from '../../services/api.js';
import UserMenu from './UserMenu.jsx';

// FIX 1: this used to be two side-by-side panels — this Sidebar (app nav)
// plus a separate SessionSidebar (chat history), rendered next to each
// other only on the /chat route. Chat history is now merged in here as its
// own section, so there is exactly one sidebar everywhere in the app.
// SessionSidebar.jsx has been removed.

// OpenCode and Hermes are both admin-only (2026-08-03: OpenCode used to be
// open to every approved user, but its filesystem scope is now the whole
// VPS again including fazle-core — see opencode-serve.service — so it must
// stay behind the same admin-only gate Hermes already has). Appended
// conditionally in Sidebar() below, not part of what every user sees.
const OPENCODE_ITEM = { to: '/opencode', label: 'OpenCode', icon: Code2 };
const HERMES_ITEM = { to: '/hermes', label: 'Hermes', icon: Bot };

// UI redesign (2026-08-09): Usage/Settings/Profile/Admin used to live here
// as a separate "Account"/"Admin" NavGroup — moved into UserMenu's popover
// (single coherent profile entry, per redesign spec section 2/3). Workspace
// tools (OpenCode/Hermes) stay here since they're distinct dev tools, not
// account/profile items.
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

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];

// Groups sessions by their existing `updated_at` field (already returned by
// GET /chat/sessions — no backend change needed for this). Pure client-side
// bucketing, same data the flat list used before.
function groupSessions(sessions) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const groups = { Today: [], Yesterday: [], 'Previous 7 Days': [], Older: [] };
  for (const s of sessions) {
    const updated = new Date(s.updated_at);
    if (updated >= startOfToday) groups.Today.push(s);
    else if (updated >= startOfYesterday) groups.Yesterday.push(s);
    else if (updated >= startOfWeek) groups['Previous 7 Days'].push(s);
    else groups.Older.push(s);
  }
  return groups;
}

// The chat history section — was SessionSidebar.jsx, now lives inside the
// one sidebar. Reads/writes the shared ChatSessionsContext so ChatPage
// (rendered separately, further down the tree) sees the same active session.
// UI redesign (2026-08-09): added date grouping, a client-side title search
// (no backend needed — filters the already-loaded list), and a per-row
// rename/delete menu backed by the new PATCH/DELETE /chat/sessions/:id
// routes (chat.js).
function ChatHistorySection({ onNavigateAway }) {
  const { sessions, activeId, setActiveId, startNewChat, reload } = useChatSessions();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  // Pre-deployment audit (2026-08-09), Problem #5 fix: Escape was meant to
  // discard the edit, but the input's onBlur (fired as it unmounts once
  // editingId clears) could still race in and call commitRename with the
  // same in-progress text — turning a cancel into a save in some browsers.
  // This ref is set only by the Escape handler and checked (and cleared)
  // at the very top of onBlur, so a genuine cancel can never be silently
  // overridden by the blur that follows it.
  const cancelingRef = useRef(false);

  useEffect(() => {
    if (menuOpenId === null) return;
    function onClick(e) {
      if (!e.target.closest('[data-session-menu]')) setMenuOpenId(null);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpenId]);

  function goToChat() {
    if (location.pathname !== '/chat') navigate('/chat');
  }

  async function commitRename(id) {
    const title = editValue.trim();
    setEditingId(null);
    if (!title) return;
    try {
      await api.chatRenameSession(id, title);
      reload();
    } catch {
      // Reload reflects whatever the server actually has if this failed.
    }
  }

  async function handleDelete(id) {
    setMenuOpenId(null);
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await api.chatDeleteSession(id);
      if (id === activeId) startNewChat();
      reload();
    } catch {
      // Reload reflects whatever the server actually has if this failed.
    }
  }

  const filtered = search.trim()
    ? sessions.filter((s) => (s.title || 'Untitled chat').toLowerCase().includes(search.trim().toLowerCase()))
    : sessions;
  const groups = groupSessions(filtered);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="px-3 pt-1 flex items-center gap-1.5">
        <button
          onClick={() => { startNewChat(); goToChat(); onNavigateAway?.(); }}
          className="flex flex-1 items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Plus size={16} /> New chat
        </button>
        <button
          onClick={() => setShowSearch((v) => !v)}
          className={clsx(
            'shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
            showSearch && 'bg-slate-100 dark:bg-slate-800'
          )}
          title="Search chats"
          aria-label="Search chats"
        >
          <Search size={16} />
        </button>
      </div>
      {showSearch && (
        <div className="px-3 mt-2">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-3 pb-2 mt-3">
        {sessions.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-slate-400">No conversations yet.</p>
        )}
        {sessions.length > 0 && filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-slate-400">No matches.</p>
        )}
        {GROUP_ORDER.filter((g) => groups[g].length > 0).map((groupName) => (
          <div key={groupName} className="mb-3">
            <p className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {groupName}
            </p>
            {groups[groupName].map((s) => (
              <div key={s.id} className="group/row relative flex items-center rounded-lg mb-0.5">
                {editingId === s.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => {
                      if (cancelingRef.current) {
                        cancelingRef.current = false;
                        return;
                      }
                      commitRename(s.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(s.id);
                      if (e.key === 'Escape') {
                        cancelingRef.current = true;
                        setEditingId(null);
                      }
                    }}
                    aria-label="Rename conversation"
                    className="w-full rounded-lg border border-brand-400 bg-white dark:bg-slate-900 px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                ) : (
                  <>
                    <button
                      onClick={() => { setActiveId(s.id); goToChat(); onNavigateAway?.(); }}
                      className={clsx(
                        'flex flex-1 min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm truncate',
                        s.id === activeId && location.pathname === '/chat'
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      )}
                    >
                      <MessageSquare size={14} className="shrink-0" />
                      <span className="truncate">{s.title || 'Untitled chat'}</span>
                    </button>
                    <div data-session-menu className="relative shrink-0">
                      <button
                        onClick={() => setMenuOpenId((id) => (id === s.id ? null : s.id))}
                        className="rounded-lg p-1.5 text-slate-400 opacity-0 group-hover/row:opacity-100 focus:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-700"
                        title="Conversation options"
                        aria-label="Conversation options"
                        aria-haspopup="menu"
                      >
                        <MoreVertical size={14} />
                      </button>
                      {menuOpenId === s.id && (
                        <div
                          role="menu"
                          className="absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1"
                        >
                          <button
                            role="menuitem"
                            onClick={() => { setEditingId(s.id); setEditValue(s.title || ''); setMenuOpenId(null); }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Pencil size={13} /> Rename
                          </button>
                          <button
                            role="menuitem"
                            onClick={() => handleDelete(s.id)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
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
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>
      <ChatHistorySection onNavigateAway={onCloseMobile} />
      {user?.role === 'admin' && (
        <nav className="px-3 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <NavGroup title="Workspace" items={[OPENCODE_ITEM, HERMES_ITEM]} />
        </nav>
      )}
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
