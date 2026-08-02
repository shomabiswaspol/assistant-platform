import { useState, useEffect, useRef } from 'react';
import { Bot, Send, Loader2, RotateCcw } from 'lucide-react';
import { api } from '../services/api.js';
import MessageBubble from '../components/chat/MessageBubble.jsx';

// Admin-only full-capability agent — see backend/src/routes/hermes.js and
// /home/azim/hermes-runner/server.py. v1: one continuous conversation, no
// multi-session switcher (matches OpenCodePage's same simplicity tradeoff).
// Replies can genuinely take a while (real tool use, not a quick
// completion) — the loading state below reflects that rather than
// implying something's stuck.
export default function HermesPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.hermesMessages()
      .then((msgs) => setMessages(msgs.map((m) => ({ role: m.role, content: m.content, createdAt: m.created_at }))))
      .catch((err) => setError(err.message || 'Failed to load Hermes history'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setSending(true);
    try {
      const res = await api.hermesSend(text);
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setError(err.message || 'Hermes request failed');
    } finally {
      setSending(false);
    }
  }

  async function handleReset() {
    if (!confirm('Start a fresh Hermes conversation? This clears history and memory of this session.')) return;
    await api.hermesReset();
    setMessages([]);
    setError('');
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Bot size={16} className="text-brand-500" /> Hermes — full capability
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <RotateCcw size={13} /> Reset conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center text-center px-4">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/40">
                <Bot className="text-brand-500" size={22} />
              </div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Hermes</h2>
              <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
                Real terminal, file, and code access on this VPS. It will investigate freely, but
                will describe any destructive or state-changing action and wait for your explicit
                "yes" before doing it. Replies can take a little while — it's actually doing the work.
              </p>
            </div>
          ) : (
            messages.map((m, i) => <MessageBubble key={i} {...m} />)
          )}
          {sending && (
            <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
              <Loader2 size={14} className="animate-spin" /> Hermes is working — this can take a minute or two…
            </div>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 focus-within:ring-2 focus-within:ring-brand-500/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Instruct Hermes…"
            rows={1}
            disabled={sending}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="shrink-0 rounded-lg bg-brand-500 p-2 text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
