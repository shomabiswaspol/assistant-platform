import { useState, useEffect, useRef } from 'react';
import { Sparkles, Globe } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../services/api.js';
import { useChatSessions } from '../context/ChatSessionsContext.jsx';
import MessageBubble from '../components/chat/MessageBubble.jsx';
import ChatInputBar from '../components/chat/ChatInputBar.jsx';
import ModelPicker from '../components/chat/ModelPicker.jsx';

const SUGGESTIONS = [
  'Summarize what you can help me with',
  'Write a function to reverse a string',
  'Explain this codebase in simple terms',
];

// FIX 1: session list + "New chat" now live in the single merged Sidebar
// (App.jsx's Layout), driven by ChatSessionsContext — this page no longer
// renders its own second sidebar, just the active conversation.
export default function ChatPage() {
  const { activeId: sessionId, setActiveId, reload } = useChatSessions();
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState(null);
  const [model, setModel] = useState('auto');
  const [webSearchConfigured, setWebSearchConfigured] = useState(null);
  const bottomRef = useRef(null);

  // Real free/local/paid model list + web-search status — same data
  // SettingsPage.jsx already fetches; header just surfaces it here too.
  useEffect(() => {
    api.models().then(setModels).catch(() => {});
    api.omnirouteStatus().then((s) => setWebSearchConfigured(!!s.tavilyConfigured)).catch(() => {});
  }, []);
  // Guards against re-fetching messages we already have locally right after
  // sending (applyResult sets a brand-new sessionId from the response) —
  // only fetch when the active session changed for some OTHER reason, e.g.
  // the user picked a different past conversation from the sidebar.
  const skipNextFetchRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    api.chatMessages(sessionId).then((msgs) => setMessages(msgs.map((m) => ({ ...m, createdAt: m.created_at }))));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  function startNewChat() {
    setActiveId(null);
    setError('');
  }

  // Problem #5 fix (2026-08-09): messages loaded from history already carry
  // a real createdAt (chat.js's GET /sessions/:id/messages returns
  // cm.created_at — MessageBubble already renders it, see the `{createdAt
  // && <span>...}` block). Freshly sent/received messages within the
  // current session never got one, so they showed no time until the next
  // reload. Stamping with the client clock at send/receive time uses the
  // exact same existing display path, not a new mechanism, and gets
  // silently replaced by the real server value next time this session's
  // history is (re)fetched — no backend change.
  function applyResult(res, userMessage) {
    skipNextFetchRef.current = true;
    setActiveId(res.session_id);
    setMessages((m) => [
      ...m,
      ...(userMessage ? [{ role: 'user', content: userMessage, createdAt: new Date().toISOString() }] : []),
      { role: 'assistant', content: res.reply, provider: res.provider, model: res.model, createdAt: new Date().toISOString() },
    ]);
    reload();
  }

  async function handleSend(text) {
    setError('');
    setMessages((m) => [...m, { role: 'user', content: text, createdAt: new Date().toISOString() }]);
    setSending(true);
    try {
      const res = await api.chatSend({ session_id: sessionId, message: text, model });
      applyResult(res, null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleSendImage(file) {
    setError('');
    const previewUrl = URL.createObjectURL(file);
    setMessages((m) => [...m, { role: 'user', content: '📎 Image attached', imagePreview: previewUrl, createdAt: new Date().toISOString() }]);
    setSending(true);
    try {
      const res = await api.chatSendImage(file, sessionId);
      applyResult(res, null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleSendAudio(blob) {
    setError('');
    setSending(true);
    try {
      const res = await api.chatSendAudio(blob, sessionId);
      applyResult(res, res.transcribed_text ? `🎤 ${res.transcribed_text}` : '🎤 Voice message');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Pre-deployment audit (2026-08-09), FIX 2: flex-wrap instead of a
          rigid single row — a long selected model name plus the web-search
          badge could get close to/over a 360px viewport's width with no
          fallback. Wrapping to a second line beats forcing horizontal page
          overflow; on desktop there's always room for one line so the
          layout is unchanged there. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-slate-100 dark:border-slate-800 px-4 py-2 shrink-0">
        <ModelPicker models={models} value={model} onChange={setModel} />
        {webSearchConfigured !== null && (
          <span
            title={webSearchConfigured ? 'Web search is available for this conversation' : 'Web search is not configured'}
            className={clsx(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
              webSearchConfigured
                ? 'text-green-700 dark:text-green-400'
                : 'text-slate-400 dark:text-slate-500'
            )}
          >
            <Globe size={13} /> Web search {webSearchConfigured ? 'on' : 'off'}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[60vh] flex-col items-center justify-center text-center px-4">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/40">
                  <Sparkles className="text-brand-500" size={22} />
                </div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">How can I help today?</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Ask a question, paste some code, or attach a voice note or image.
                </p>
                <div className="mt-5 flex flex-col gap-2 w-full max-w-sm">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m, i) => <MessageBubble key={i} {...m} />)}
                {sending && (
                  <div className="flex gap-3 py-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                      <span className="flex gap-0.5">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>}
            <div ref={bottomRef} />
          </div>
        </div>
      <div className="mx-auto w-full max-w-3xl">
        <ChatInputBar onSend={handleSend} onSendImage={handleSendImage} onSendAudio={handleSendAudio} sending={sending} />
      </div>
    </div>
  );
}
