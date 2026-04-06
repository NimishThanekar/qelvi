import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import LogMeal from './pages/LogMeal';
import History from './pages/History';
import Profile from './pages/Profile';
import Groups from './pages/Groups';
import Insights from './pages/Insights';
import Admin from './pages/Admin';
import InstallBanner from './components/InstallBanner';
import { setupPushNotifications } from './lib/push';

const PUSH_ASKED_KEY = 'push-permission-asked';

/**
 * On every app mount, re-fetch the user record from the server so that
 * security-relevant fields (is_pro, ai_uses_remaining) cannot be spoofed
 * by editing localStorage. localStorage is only used for the initial render
 * before this async call resolves.
 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, refreshUser } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshUser();

    if (!('Notification' in window)) return;
    const perm = Notification.permission;

    if (perm === 'denied') return;

    if (perm === 'granted') {
      // Already permitted — silently ensure an active subscription exists
      // (e.g., after a fresh SW registration or new device).
      setTimeout(() => setupPushNotifications().catch(() => {}), 4000);
    } else if (!localStorage.getItem(PUSH_ASKED_KEY)) {
      // Permission is 'default' — ask once. Delay so the user sees the app first.
      localStorage.setItem(PUSH_ASKED_KEY, '1');
      setTimeout(() => setupPushNotifications().catch(() => {}), 4000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <InstallBanner />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--bg-border)',
            fontSize: '13px',
            borderRadius: '12px',
          },
          success: { iconTheme: { primary: 'var(--accent, #3B7BFF)', secondary: '#000' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#000' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="log" element={<LogMeal />} />
          <Route path="history" element={<History />} />
          <Route path="groups" element={<Groups />} />
          <Route path="insights" element={<Insights />} />
          <Route path="profile" element={<Profile />} />
          <Route path="admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
