import clsx from 'clsx';

export default function Input({ label, hint, error, className, ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>}
      <input
        className={clsx(
          'w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100',
          'placeholder:text-slate-400 dark:placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500',
          error ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-700',
          className
        )}
        {...props}
      />
      {/* hint: small helper text under a field, e.g. explaining what an
          optional "label" tag is for — distinct from `error`, which only
          shows on validation failure. */}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}
