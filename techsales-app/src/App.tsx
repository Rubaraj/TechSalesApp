import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { Dashboard, Login, NotFound } from './pages';
import {
  AdminLayout,
  UserManagement,
  RoleManagement,
  DepartmentManagement,
  SystemSettings,
} from './pages/admin';
import { LeadList, LeadDetail, LeadForm } from './pages/leads';
import { PlanList, PlanDetail } from './pages/plans';
import { PharmacySearchPage } from './pages/pharmacies';
import { DrugSearchPage } from './pages/drugs';
import { PBAList } from './pages/pba';
import { PBKitList } from './pages/pbkit';
import { StateAssistanceCheckPage, PlanSubsidyCheckPage } from './pages/eligibility';
import { PlanRecommendations } from './pages/recommendations';
import { YOYComparison } from './pages/yoy';
import type { ReactNode } from 'react';

// Protected route wrapper
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Public route wrapper (redirects to home if authenticated)
function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/insights" replace />} />
        <Route path="insights" element={<Dashboard tab="insights" />} />
        <Route path="sales" element={<Dashboard tab="sales" />} />
        
        {/* Lead Management Routes */}
        <Route path="leads" element={<LeadList />} />
        <Route path="leads/new" element={<LeadForm />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="leads/:id/edit" element={<LeadForm />} />
        
        {/* Plan Routes */}
        <Route path="plans" element={<PlanList />} />
        <Route path="plans/:id" element={<PlanDetail />} />
        
        {/* Pharmacy and Drug Routes */}
        <Route path="pharmacies" element={<PharmacySearchPage />} />
        <Route path="drugs" element={<DrugSearchPage />} />
        
        {/* PBA and PBKit Routes */}
        <Route path="pba" element={<PBAList />} />
        <Route path="pbkit" element={<PBKitList />} />
        
        {/* Eligibility Routes */}
        <Route path="state-assistance" element={<StateAssistanceCheckPage />} />
        <Route path="plan-subsidy" element={<PlanSubsidyCheckPage />} />
        
        {/* Recommendations and YOY */}
        <Route path="recommendations" element={<PlanRecommendations />} />
        <Route path="yoy" element={<YOYComparison />} />
        
        {/* Admin routes with nested layout */}
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="roles" element={<RoleManagement />} />
          <Route path="departments" element={<DepartmentManagement />} />
          <Route path="settings" element={<SystemSettings />} />
        </Route>
        
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
