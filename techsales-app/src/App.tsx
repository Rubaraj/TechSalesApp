import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { AtlasProvider } from './context/AtlasContext';
import { Layout } from './components/layout/Layout';
import { Dashboard, Login, MemberLogin, NotFound, MemberDashboard, MemberPlanDetail, PreviousEnrollments } from './pages';
import {
  AdminLayout,
  UserManagement,
  RoleManagement,
  DepartmentManagement,
  SystemSettings,
  ProductivityDashboard,
  TargetManagement,
  AgentEnrollments,
  AgentLeads,
  AllEnrollments,
} from './pages/admin';
import { LeadList, LeadDetail, LeadForm } from './pages/leads';
import { PlanList, PlanDetail, PlanCompare } from './pages/plans';
import { PharmacySearchPage } from './pages/pharmacies';
import { DrugSearchPage } from './pages/drugs';
import { ProviderSearchPage } from './pages/providers';
import { PBAList } from './pages/pba';
import { PBKitList } from './pages/pbkit';
import { StateAssistanceCheckPage, PlanSubsidyCheckPage } from './pages/eligibility';
import { PlanRecommendations } from './pages/recommendations';
import { YOYComparison } from './pages/yoy';
import { SelectPlanYear, SelectPlan, EnrollmentForm, SubmitEnrollment } from './pages/enrollment';
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

// Member route wrapper (checks for member auth)
function MemberRoute({ children }: { children: ReactNode }) {
  const { member, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!member) {
    return <Navigate to="/member/login" replace />;
  }

  return <>{children}</>;
}

// Member public route (for login page)
function MemberPublicRoute({ children }: { children: ReactNode }) {
  const { member, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (member) {
    return <Navigate to="/member/dashboard" replace />;
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

      {/* Member routes */}
      <Route
        path="/member/login"
        element={
          <MemberPublicRoute>
            <MemberLogin />
          </MemberPublicRoute>
        }
      />
      <Route
        path="/member/dashboard"
        element={
          <MemberRoute>
            <MemberDashboard />
          </MemberRoute>
        }
      />
      <Route
        path="/member/plan/:id"
        element={
          <MemberRoute>
            <MemberPlanDetail />
          </MemberRoute>
        }
      />
      <Route
        path="/member/enrollments"
        element={
          <MemberRoute>
            <PreviousEnrollments />
          </MemberRoute>
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
        <Route path="plans/compare" element={<PlanCompare />} />
        <Route path="plans/:id" element={<PlanDetail />} />
        
        {/* Pharmacy, Drug, and Provider Routes */}
        <Route path="pharmacies" element={<PharmacySearchPage />} />
        <Route path="drugs" element={<DrugSearchPage />} />
        <Route path="providers" element={<ProviderSearchPage />} />
        
        {/* SOA and P-EKIT Routes */}
        <Route path="pba" element={<PBAList />} />
        <Route path="pbkit" element={<PBKitList />} />
        
        {/* Eligibility Routes */}
        <Route path="state-assistance" element={<StateAssistanceCheckPage />} />
        <Route path="plan-subsidy" element={<PlanSubsidyCheckPage />} />
        
        {/* Recommendations and YOY */}
        <Route path="recommendations" element={<PlanRecommendations />} />
        <Route path="yoy" element={<YOYComparison />} />
        
        {/* Enrollment Routes */}
        <Route path="enroll/select-year" element={<SelectPlanYear />} />
        <Route path="enroll/select-plan" element={<SelectPlan />} />
        <Route path="enroll/form" element={<EnrollmentForm />} />
        <Route path="enroll/submit" element={<SubmitEnrollment />} />
        
        {/* Admin routes with nested layout */}
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="roles" element={<RoleManagement />} />
          <Route path="departments" element={<DepartmentManagement />} />
          <Route path="settings" element={<SystemSettings />} />
          <Route path="targets" element={<TargetManagement />} />
        </Route>
        
        {/* Productivity Dashboard (standalone admin route) */}
        <Route path="admin/productivity" element={<ProductivityDashboard />} />
        <Route path="admin/agent/:agentId/enrollments" element={<AgentEnrollments />} />
        <Route path="admin/agent/:agentId/leads" element={<AgentLeads />} />
        <Route path="admin/enrollments" element={<AllEnrollments />} />
        
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
          <CallProvider>
            <AtlasProvider>
              <AppRoutes />
            </AtlasProvider>
          </CallProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
