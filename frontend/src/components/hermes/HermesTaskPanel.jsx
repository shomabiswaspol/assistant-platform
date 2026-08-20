import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Check, X, RefreshCw } from 'lucide-react';
import { api } from '../../services/api.js';

// Minimal Owner-facing Task/Approval panel (2026-08-20, Owner-directed Phase
// 5 closure pass — brief section 5/16 K-N). Shows the current/active task
// and any pending action needing approval; WhatsApp/chat remains the
// primary, first-class way to create tasks and grant authorization — this
// panel is read-plus-approve/reject only, never required for Hermes to
// work. Polls every 30s while the tab is open (no websocket/SSE mechanism
// exists anywhere in this frontend today — confirmed before adding this,
// see project memory — so this is genuinely new, not copied).
const POLL_MS = 30000;

// Prefer showing a task that's actually being worked on right now over an
// old finished one — this ordering is a client-side display preference
// only, not a backend contract.
const ACTIVE_STATUS_PRIORITY = ['WAITING_APPROVAL', 'VERIFYING', 'IN_PROGRESS', 'READY', 'BLOCKED'];

function pickActiveTask(tasks) {
  for (const status of ACTIVE_STATUS_PRIORITY) {
    const match = tasks.find((t) => t.status === status);
    if (match) return match;
  }
  return null;
}

function statusColor(status) {
  switch (status) {
    case 'DONE': return 'text-emerald-600 dark:text-emerald-400';
    case 'FAILED': return 'text-red-600 dark:text-red-400';
    case 'BLOCKED': return 'text-amber-600 dark:text-amber-400';
    case 'WAITING_APPROVAL': return 'text-brand-600 dark:text-brand-400';
    default: return 'text-slate-600 dark:text-slate-300';
  }
}

function riskColor(risk) {
  switch (risk) {
    case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400';
    case 'high': return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400';
    case 'low': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400';
    default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

export default function HermesTaskPanel() {
  const [expanded, setExpanded] = useState(true);
  const [task, setTask] = useState(null);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyActionId, setBusyActionId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [tasksRes, actionsRes] = await Promise.all([
        api.hermesTasks(),
        api.hermesPendingActions(),
      ]);
      setTask(pickActiveTask(tasksRes.tasks || []));
      setActions(actionsRes.actions || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not reach the task panel');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function decide(actionId, approve) {
    setBusyActionId(actionId);
    try {
      if (approve) {
        await api.hermesApproveAction(actionId);
      } else {
        // eslint-disable-next-line no-alert
        const reason = window.prompt('Reason for rejecting? (optional)') || '';
        await api.hermesRejectAction(actionId, reason);
      }
      await refresh();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusyActionId(null);
    }
  }

  // Nothing to show and nothing wrong — stay out of the way entirely
  // rather than showing an empty card (brief: WhatsApp remains usable
  // without the UI, and the UI should never feel like it's demanding
  // attention when there's genuinely nothing pending).
  if (!loading && !error && !task && actions.length === 0) return null;

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300"
      >
        <span className="flex items-center gap-1.5">
          Task &amp; approvals
          {actions.length > 0 && (
            <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {actions.length} pending
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
              <RefreshCw size={12} /> {error}
            </p>
          )}

          {task && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800 dark:text-slate-100">{task.title}</span>
                <span className={`font-semibold ${statusColor(task.status)}`}>{task.status}</span>
              </div>
              {task.description && (
                <p className="mt-1 text-slate-500 dark:text-slate-400 line-clamp-2">{task.description}</p>
              )}
              {task.build_scope?.repos?.length > 0 && (
                <p className="mt-1 truncate text-slate-400 dark:text-slate-500">
                  Repos: {task.build_scope.repos.join(', ')}
                </p>
              )}
              {task.verification && (
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Verification: {typeof task.verification === 'string' ? task.verification : JSON.stringify(task.verification)}
                </p>
              )}
              {task.next_action && (
                <p className="mt-1 text-slate-500 dark:text-slate-400">Next: {task.next_action}</p>
              )}
            </div>
          )}

          {actions.map((a) => (
            <div key={a.id} className="rounded-lg border border-brand-200 dark:border-brand-900 bg-white dark:bg-slate-900 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800 dark:text-slate-100">{a.action_type}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${riskColor(a.risk)}`}>
                  {a.risk} risk
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">{a.summary}</p>
              {a.files_changed?.length > 0 && (
                <p className="text-slate-400 dark:text-slate-500">Files: {a.files_changed.join(', ')}</p>
              )}
              {a.diff && (
                <pre className="max-h-40 overflow-auto rounded bg-slate-100 dark:bg-slate-800 p-2 text-[10px] leading-tight text-slate-700 dark:text-slate-300">
                  {a.diff}
                </pre>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busyActionId === a.id}
                  onClick={() => decide(a.id, true)}
                  className="flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  <Check size={12} /> Approve
                </button>
                <button
                  type="button"
                  disabled={busyActionId === a.id}
                  onClick={() => decide(a.id, false)}
                  className="flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <X size={12} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
