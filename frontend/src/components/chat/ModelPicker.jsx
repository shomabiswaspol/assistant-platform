import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Zap, HardDrive, Gem, Info } from 'lucide-react';
import clsx from 'clsx';

const TIER_META = {
  priority_1_free: { label: 'Free', dot: 'bg-green-500', icon: Zap },
  priority_2_local: { label: 'Local', dot: 'bg-brand-500', icon: HardDrive },
  priority_3_paid: { label: 'Paid', dot: 'bg-yellow-500', icon: Gem },
};

// Pre-deployment audit (2026-08-09), FIX 1: the picker's selection is real
// but chat.js's tool-enabled path (the one that runs for most turns) is
// intentionally pinned to a fixed reliable model regardless of what's
// picked here — the selection mainly takes effect on the no-tools fallback
// path. Not changing that routing behavior (out of scope) — just making
// the UI honest about it. The per-message provider/model badge already
// shown under each reply (MessageBubble.jsx) is the ground truth for what
// actually answered.
const DISCLOSURE_TEXT =
  "Selected model is used when tools aren't required. Tool-assisted replies may use the system's reliable tool-capable model instead — check the label under each reply to see what actually answered.";

// Real free/local/paid model tiers from GET /settings/models (same data
// already shown read-only on SettingsPage.jsx), now wired to an actual
// per-message selection via POST /chat/send's existing `model` field.
// Replaces the "Ask/Plan/Code" mode picker from the original redesign
// spec — that concept doesn't exist anywhere on the backend (see UI
// redesign audit, 2026-08-09); this is the real capability that does.
export default function ModelPicker({ models, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const ref = useRef(null);
  const infoRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      if (infoRef.current && !infoRef.current.contains(e.target)) setInfoOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!models) return null;

  const currentTier = Object.keys(models).find((k) => models[k]?.includes(value));
  const currentLabel = !value || value === 'auto' ? 'Auto' : value.split('/').pop();
  const CurrentIcon = currentTier ? TIER_META[currentTier]?.icon : null;

  return (
    <div className="flex items-center gap-1 min-w-0">
      <div className="relative min-w-0" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Select model"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {CurrentIcon && <CurrentIcon size={13} />}
          <span className="max-w-40 truncate">{currentLabel}</span>
          <ChevronDown size={13} className={clsx('transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div
            role="menu"
            className="absolute left-0 top-full z-20 mt-1.5 w-64 max-h-80 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1.5"
          >
            <button
              role="menuitem"
              onClick={() => { onChange('auto'); setOpen(false); }}
              className={clsx(
                'flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800',
                (!value || value === 'auto') ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-slate-700 dark:text-slate-300'
              )}
            >
              Auto (free → local → paid)
            </button>
            {Object.entries(models).map(([tierKey, list]) => {
              const meta = TIER_META[tierKey] || { label: tierKey, dot: 'bg-slate-400' };
              return (
                <div key={tierKey} className="mt-1 first:mt-0">
                  <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <span className={clsx('h-1.5 w-1.5 rounded-full', meta.dot)} /> {meta.label}
                  </p>
                  {list.map((m) => (
                    <button
                      key={m}
                      role="menuitem"
                      title={m}
                      onClick={() => { onChange(m); setOpen(false); }}
                      className={clsx(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-sm truncate hover:bg-slate-100 dark:hover:bg-slate-800',
                        value === m ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-slate-700 dark:text-slate-300'
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="relative shrink-0" ref={infoRef}>
        <button
          type="button"
          onClick={() => setInfoOpen((v) => !v)}
          title={DISCLOSURE_TEXT}
          aria-label="About model selection"
          aria-haspopup="dialog"
          aria-expanded={infoOpen}
          className="flex items-center justify-center rounded-full p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800"
        >
          <Info size={13} />
        </button>
        {infoOpen && (
          <div
            role="tooltip"
            className="absolute left-0 top-full z-20 mt-1.5 w-56 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg px-2.5 py-2 text-[11px] leading-snug text-slate-600 dark:text-slate-300"
          >
            {DISCLOSURE_TEXT}
          </div>
        )}
      </div>
    </div>
  );
}
