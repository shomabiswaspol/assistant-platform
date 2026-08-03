export default function StatTile({ label, value, sub, warn }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular-nums ${
          warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}
