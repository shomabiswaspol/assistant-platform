import { useState, useEffect, useRef } from 'react';
import { Terminal, Loader2 } from 'lucide-react';
import { api } from '../services/api.js';

// Terminal-style frontend over the same opencode serve backend the chat page
// (OpenCodePage) uses — backend/src/routes/opencode.js (admin-only) →
// opencode-serve.service (host, 127.0.0.1:8091) → OmniRoute. This page adds
// no new backend surface; it is only a different presentation of the same
// session/prompt API. Admin gate matches the backend (RequireAdmin route).
export default function OpenCodeCliPage() {
  const [lines, setLines] = useState([
    { kind: 'system', text: 'OpenCode CLI — full-server workspace (/home/azim). Type a request and press Enter.' },
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const sessions = await api.opencodeSessions();
        let sid = sessions?.[0]?.id;
        if (!sid) {
          const created = await api.opencodeCreateSession();
          sid = created.id;
        }
        setSessionId(sid);
        setReady(true);
        setLines((l) => [...l, { kind: 'system', text: `session ${sid} attached.` }]);
      } catch (err) {
        setFatal(err.message || 'Failed to reach OpenCode');
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (ready && !busy) inputRef.current?.focus();
  }, [lines, busy, ready]);

  async function handleRun() {
    const cmd = input.trim();
    if (!cmd || busy || !sessionId) return;
    setInput('');
    setLines((l) => [...l, { kind: 'input', text: cmd }]);
    setBusy(true);
    try {
      const res = await api.opencodePrompt(sessionId, cmd);
      const model = res.model ? `${res.model.providerID}/${res.model.id}` : '';
      setLines((l) => [
        ...l,
        { kind: 'output', text: res.reply || '(empty reply)' },
        ...(model ? [{ kind: 'meta', text: `[${model}]` }] : []),
      ]);
    } catch (err) {
      setLines((l) => [...l, { kind: 'error', text: err.message || 'request failed' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-950" onClick={() => inputRef.current?.focus()}>
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2 text-xs font-medium text-slate-400">
        <Terminal size={14} className="text-emerald-400" />
        <span className="text-slate-300">opencode@cli</span>
        <span className="text-slate-600">— admin shell over OmniRoute (free-first cascade)</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
        {lines.map((ln, i) => (
          <div key={i} className="whitespace-pre-wrap break-words py-0.5">
            {ln.kind === 'input' && (
              <span>
                <span className="text-emerald-400">azim@vps</span>
                <span className="text-slate-500">:</span>
                <span className="text-sky-400">~</span>
                <span className="text-slate-500">$ </span>
                <span className="text-slate-100">{ln.text}</span>
              </span>
            )}
            {ln.kind === 'output' && <span className="text-slate-300">{ln.text}</span>}
            {ln.kind === 'system' && <span className="text-slate-500"># {ln.text}</span>}
            {ln.kind === 'meta' && <span className="text-slate-600">{ln.text}</span>}
            {ln.kind === 'error' && <span className="text-red-400">error: {ln.text}</span>}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 py-1 text-slate-500">
            <Loader2 size={13} className="animate-spin" /> working…
          </div>
        )}
        {fatal && <div className="py-1 text-red-400">error: {fatal}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-800 px-4 py-2 font-mono text-[13px]">
        <div className="flex items-center">
          <span className="shrink-0">
            <span className="text-emerald-400">azim@vps</span>
            <span className="text-slate-500">:</span>
            <span className="text-sky-400">~</span>
            <span className="text-slate-500">$ </span>
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRun(); } }}
            disabled={!ready || busy}
            placeholder={ready ? 'type a request…' : 'connecting…'}
            className="flex-1 bg-transparent px-1 text-slate-100 placeholder:text-slate-600 focus:outline-none disabled:opacity-50"
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
}
