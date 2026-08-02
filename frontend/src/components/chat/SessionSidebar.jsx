import { Plus, MessageSquare, X } from 'lucide-react';
import clsx from 'clsx';

export default function SessionSidebar({ sessions, activeId, onSelect, onNew, mobileOpen, onCloseMobile }) {
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onCloseMobile} />
      )}
      <aside
        className={clsx(
          'flex flex-col w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950',
          'fixed inset-y-0 left-0 z-40 transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:bg-transparent lg:dark:bg-transparent'
        )}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            onClick={() => { onNew(); onCloseMobile?.(); }}
            className="flex flex-1 items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Plus size={16} /> New chat
          </button>
          <button
            onClick={onCloseMobile}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {sessions.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-slate-400">No conversations yet.</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => { onSelect(s.id); onCloseMobile?.(); }}
              className={clsx(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm truncate mb-0.5',
                s.id === activeId
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <MessageSquare size={14} className="shrink-0" />
              <span className="truncate">{s.title || 'Untitled chat'}</span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
