import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeEffect } from './context/ThemeContext.jsx';
import { ChatSessionsProvider } from './context/ChatSessionsContext.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import MobileNav from './components/layout/MobileNav.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import OpenCodePage from './pages/OpenCodePage.jsx';
import HermesPage from './pages/HermesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import UsagePage from './pages/UsagePage.jsx';
import AdminPage from './pages/AdminPage.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/chat" replace />;
  return children;
}

// FIX 2: sidebar open/collapse state lives here — one level above the
// sidebar itself — so the toggle button stays reachable even when the
// sidebar is collapsed on desktop or closed on mobile.
function Layout({ children }) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  if (!user) return children;
  return (
    <ChatSessionsProvider>
      <div className="flex h-screen overflow-hidden bg-white dark:bg-slate-950">
        <Sidebar
          open={sidebarOpen}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 px-2 py-2 shrink-0">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              title="Open menu"
            >
              <Menu size={18} />
            </button>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="hidden lg:flex rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
          </div>
          <main className="flex-1 overflow-y-auto">{children}</main>
          <MobileNav />
        </div>
      </div>
    </ChatSessionsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeEffect />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
            <Route path="/opencode" element={<RequireAuth><OpenCodePage /></RequireAuth>} />
            <Route path="/hermes" element={<RequireAdmin><HermesPage /></RequireAdmin>} />
            <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/usage" element={<RequireAuth><UsagePage /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}
