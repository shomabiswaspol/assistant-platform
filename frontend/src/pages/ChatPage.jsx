import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Menu, SquarePen } from 'lucide-react';
import { api } from '../services/api.js';
import SessionSidebar from '../components/chat/SessionSidebar.jsx';
import MessageBubble from '../components/chat/MessageBubble.jsx';
import ChatInputBar from '../components/chat/ChatInputBar.jsx';

const SUGGESTIONS = [
  'Summarize what you can help me with',
  'Write a function to reverse a string',
  'Explain this codebase in simple terms',
];

export default function ChatPage() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const bottomRef = useRef(null);

  const loadSessions = useCallback(async () => {
    setSessions(await api.chatSessions());
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function selectSession(id) {
    setSessionId(id);
    const msgs = await api.chatMessages(id);
    setMessages(msgs.map((m) => ({ ...m, createdAt: m.created_at })));
  }

  function startNewChat() {
    setSessionId(null);
    setMessages([]);
    setError('');
  }

  function applyResult(res, userMessage) {
    setSessionId(res.session_id);
    setMessages((m) => [
      ...m,
      ...(userMessage ? [{ role: 'user', content: userMessage }] : []),
      { role: 'assistant', content: res.reply, provider: res.provider, model: res.model },
    ]);
    loadSessions();
  }

  async function handleSend(text) {
    setError('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setSending(true);
    try {
      const res = await api.chatSend({ session_id: sessionId, message: text });
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
    setMessages((m) => [...m, { role: 'user', content: '📎 Image attached', imagePreview: previewUrl }]);
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
    <div className="flex h-full">
      <SessionSidebar
        sessions={sessions}
        activeId={sessionId}
        onSelect={selectSession}
        onNew={startNewChat}
        mobileOpen={mobileSessionsOpen}
        onCloseMobile={() => setMobileSessionsOpen(false)}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3 py-2 lg:hidden">
          <button
            onClick={() => setMobileSessionsOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title="Chat history"
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {sessions.find((s) => s.id === sessionId)?.title || 'New chat'}
          </span>
          <button
            onClick={startNewChat}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title="New chat"
          >
            <SquarePen size={18} />
          </button>
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
    </div>
  );
}
