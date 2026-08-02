import { Code2 } from 'lucide-react';

export default function OpenCodePage() {
  return (
    <div className="flex h-full min-h-[70vh] flex-col items-center justify-center text-center px-4">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <Code2 className="text-slate-400" size={22} />
      </div>
      <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">OpenCode — coming soon</h1>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        A real integration needs a decision on how it talks to this platform — its own CLI session
        vs. an API bridge — before a UI gets built around it.
      </p>
    </div>
  );
}
