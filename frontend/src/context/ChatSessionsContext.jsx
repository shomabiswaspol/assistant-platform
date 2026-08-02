import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';

// Shared chat-session state (session list + which one is active). The
// merged Sidebar (renders the list + "New chat") lives above ChatPage in
// the component tree — App.jsx's Layout — so both need this via context
// rather than prop-drilling, same pattern as AuthContext/ThemeContext.
const ChatSessionsContext = createContext(null);

export function ChatSessionsProvider({ children }) {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const reload = useCallback(async () => {
    setSessions(await api.chatSessions());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const startNewChat = useCallback(() => setActiveId(null), []);

  return (
    <ChatSessionsContext.Provider value={{ sessions, activeId, setActiveId, startNewChat, reload }}>
      {children}
    </ChatSessionsContext.Provider>
  );
}

export function useChatSessions() {
  return useContext(ChatSessionsContext);
}
