import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { GroupsPage } from './pages/GroupsPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsPage } from './pages/SettingsPage';
import { JoinGroupPage } from './pages/JoinGroupPage';
import { GuestGroupPage } from './pages/GuestGroupPage';
import { QuickBillPage } from './pages/QuickBillPage';
import {
  ForgotPasswordPage,
  LoginPage,
  OnboardingPage,
  RegisterPage,
  ResetPasswordPage,
} from './pages/AuthPages';
import { PodeliLogo } from './components/PodeliLogo';

const FullScreenLoader: React.FC = () => (
  <div className="min-h-screen bg-[#F5F7F6] flex flex-col items-center justify-center gap-4">
    <PodeliLogo size="lg" />
    <div className="w-8 h-8 rounded-full border-2 border-[#E8ECE9] border-t-[#35483F] animate-spin" />
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Zero-Friction Shareable Group Link (No registration required) */}
      <Route path="/g/:shareToken" element={<GuestGroupPage />} />

      {/* 1-Minute Quick Bill Split (Works for both logged-in users & guests, local-only) */}
      <Route path="/brzi-racun" element={<QuickBillPage />} />

      {/* Shareable Invitation Link */}
      <Route path="/join/:token" element={<JoinGroupPage />} />

      {/* Onboarding */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      {/* Protected Main Application */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="groups/:groupId" element={<GroupDetailPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="settlements" element={<SettlementsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <AppRoutes />
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
