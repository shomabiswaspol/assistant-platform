import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api.js';

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    if (!input.trim() || sending) return;
    const text = input;
    setInput('');
    setError('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setSending(true);
    try {
      const res = await api.chatSend({ session_id: sessionId, message: text });
      setSessionId(res.session_id);
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, provider: res.provider, model: res.model }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="bubble-content">{m.content}</div>
            {m.provider && <div className="bubble-meta">{m.provider} / {m.model}</div>}
          </div>
        ))}
        {error && <p className="error">{error}</p>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-bar">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask anything..."
        />
        <button onClick={send} disabled={sending}>{sending ? '...' : 'Send'}</button>
      </div>
      <p className="chat-note">
        Voice input, web search, and file upload are not wired up yet — see the deployment report's next-implementation order.
      </p>
    </div>
  );
}
