import { CheckCircle2 } from 'lucide-react';

export default function Toast({ show, children }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 shadow-lg animate-[fadeIn_0.15s_ease-out]">
      <CheckCircle2 size={16} className="text-green-400 dark:text-green-600" />
      {children}
    </div>
  );
}
