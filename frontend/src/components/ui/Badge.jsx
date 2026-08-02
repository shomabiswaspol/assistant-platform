import clsx from 'clsx';

const COLORS = {
  gray: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  brand: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
};

export default function Badge({ color = 'gray', children, className }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', COLORS[color], className)}>
      {children}
    </span>
  );
}

export function StatusDot({ ok }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx('h-2 w-2 rounded-full', ok ? 'bg-green-500' : 'bg-red-500')} />
      <span className={clsx('text-sm font-medium', ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>
        {ok ? 'Online' : 'Offline'}
      </span>
    </span>
  );
}
