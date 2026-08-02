import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeEffect } from './context/ThemeContext.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import MobileNav from './components/layout/MobileNav.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import OpenCodePage from './pages/OpenCodePage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import UsagePage from './pages/UsagePage.jsx';
import AdminPage from './pages/AdminPage.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Layout({ children }) {
  const { user } = useAuth();
  if (!user) return children;
  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-slate-950">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <main className="flex-1 overflow-y-auto">{children}</main>
        <MobileNav />
      </div>
    </div>
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
            <Route path="/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
            <Route path="/opencode" element={<RequireAuth><OpenCodePage /></RequireAuth>} />
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
