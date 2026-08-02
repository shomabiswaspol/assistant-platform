import { useState } from 'react';

// Validated categorical palette (dataviz skill, references/palette.md) —
// fixed order, never cycled/reassigned by filtering. Light/dark values are
// defined once as CSS custom properties in globals.css (var(--series-N)),
// swapped automatically by the same .dark class the rest of the app uses.
const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--series-${n})`);

function fmt(n) {
  return new Intl.NumberFormat().format(n);
}

// Providers past the 8th validated slot fold into "Other" rather than
// generating an unvalidated 9th hue (skill's non-negotiable #1).
function assignSlots(items) {
  if (items.length <= SLOTS.length) return items.map((it, i) => ({ ...it, slot: SLOTS[i] }));
  const head = items.slice(0, SLOTS.length - 1).map((it, i) => ({ ...it, slot: SLOTS[i] }));
  const rest = items.slice(SLOTS.length - 1);
  const other = { label: 'Other', value: rest.reduce((s, r) => s + r.value, 0), slot: SLOTS[SLOTS.length - 1] };
  return [...head, other];
}

export default function ProviderBarChart({ data }) {
  const [hover, setHover] = useState(null);
  const rows = assignSlots(data);
  const max = Math.max(...rows.map((r) => r.value), 1);

  if (rows.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">No usage yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const pct = Math.max((row.value / max) * 100, 2);
        return (
          <div
            key={row.label}
            className="relative group"
            onMouseEnter={() => setHover(row.label)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">{row.label}</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">{fmt(row.value)}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${pct}%`, backgroundColor: row.slot }}
              />
            </div>
            {hover === row.label && (
              <div className="absolute -top-8 left-0 z-10 rounded-md bg-slate-900 dark:bg-slate-100 px-2 py-1 text-[11px] font-medium text-white dark:text-slate-900 shadow-lg">
                {row.label}: {fmt(row.value)} tokens
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
