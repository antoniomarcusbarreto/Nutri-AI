import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, RequireRole } from './components/layout/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { PageLoader } from './components/layout/PageLoader';
import { ToastProvider } from './contexts/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';

// Entradas não autenticadas: carregadas de imediato (sem flash na 1ª visita).
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';

// Todo o resto entra sob demanda (PERF-01). recharts, p.ex., só é baixado
// quando /acompanhamento é aberto.
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Services = lazy(() => import('./pages/Services').then(m => ({ default: m.Services })));
const Patients = lazy(() => import('./pages/Patients').then(m => ({ default: m.Patients })));
const Agenda = lazy(() => import('./pages/Agenda').then(m => ({ default: m.Agenda })));
const TermsOfService = lazy(() => import('./pages/TermsOfService').then(m => ({ default: m.TermsOfService })));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Onboarding = lazy(() => import('./pages/Onboarding').then(m => ({ default: m.Onboarding })));
const Financial = lazy(() => import('./pages/Financial').then(m => ({ default: m.Financial })));
const Consultations = lazy(() => import('./pages/Consultations').then(m => ({ default: m.Consultations })));
const Exams = lazy(() => import('./pages/Exams').then(m => ({ default: m.Exams })));
const Tracking = lazy(() => import('./pages/Tracking').then(m => ({ default: m.Tracking })));
const MealPlans = lazy(() => import('./pages/MealPlans').then(m => ({ default: m.MealPlans })));
const PublicPlanViewer = lazy(() => import('./pages/PublicPlanViewer'));
const PortalInvite = lazy(() => import('./pages/PortalInvite').then(m => ({ default: m.PortalInvite })));
const PortalLayout = lazy(() => import('./components/portal/PortalLayout').then(m => ({ default: m.PortalLayout })));
const PortalHome = lazy(() => import('./pages/portal/PortalHome').then(m => ({ default: m.PortalHome })));
const PortalPlan = lazy(() => import('./pages/portal/PortalPlan').then(m => ({ default: m.PortalPlan })));
const PortalAgenda = lazy(() => import('./pages/portal/PortalAgenda').then(m => ({ default: m.PortalAgenda })));
const PortalProfile = lazy(() => import('./pages/portal/PortalProfile').then(m => ({ default: m.PortalProfile })));
const FichaMoved = lazy(() => import('./pages/FichaMoved').then(m => ({ default: m.FichaMoved })));
const PortalBodyAssessmentPage = lazy(() => import('./pages/portal/PortalBodyAssessment').then(m => ({ default: m.PortalBodyAssessmentPage })));
const PortalHealthPage = lazy(() => import('./pages/portal/PortalHealth').then(m => ({ default: m.PortalHealthPage })));
const ConfirmAppointment = lazy(() => import('./pages/ConfirmAppointment').then(m => ({ default: m.ConfirmAppointment })));

const CLINICAL: ('owner' | 'nutritionist')[] = ['owner', 'nutritionist'];

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/ficha/:token" element={<FichaMoved />} />
              <Route path="/plano/:id" element={<PublicPlanViewer />} />
              <Route path="/confirmar/:token" element={<ConfirmAppointment />} />
              <Route path="/convite/:token" element={<PortalInvite />} />
              <Route path="/login" element={<Login />} />
              <Route path="/termos" element={<TermsOfService />} />
              <Route path="/privacidade" element={<PrivacyPolicy />} />

              {/* Portal do Paciente (sem sidebar; migration 0031) */}
              <Route path="/portal" element={
                <ProtectedRoute>
                  <PortalLayout />
                </ProtectedRoute>
              }>
                <Route index element={<PortalHome />} />
                <Route path="plano" element={<PortalPlan />} />
                <Route path="agenda" element={<PortalAgenda />} />
                <Route path="perfil" element={<PortalProfile />} />
                <Route path="ficha" element={<PortalHealthPage />} />
                <Route path="avaliacao" element={<PortalBodyAssessmentPage />} />
                <Route path="*" element={<Navigate to="/portal" replace />} />
              </Route>

              {/* Protected Routes with Sidebar Layout */}
              <Route element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/agenda" element={<Agenda />} />
                <Route path="/pacientes" element={<Patients />} />
                <Route path="/servicos" element={<Services />} />
                <Route path="/financeiro" element={<Financial />} />
                {/* Telas clínicas: só profissionais (secretária não vê prontuário). */}
                <Route path="/consultas" element={<RequireRole roles={CLINICAL}><Consultations /></RequireRole>} />
                <Route path="/acompanhamento" element={<RequireRole roles={CLINICAL}><Tracking /></RequireRole>} />
                <Route path="/planos" element={<RequireRole roles={CLINICAL}><MealPlans /></RequireRole>} />
                <Route path="/exames" element={<RequireRole roles={CLINICAL}><Exams /></RequireRole>} />
                <Route path="/admin" element={<RequireRole superadminOnly><AdminDashboard /></RequireRole>} />
                <Route path="/settings" element={<Settings />} />
                {/* Catch-all redirect to dashboard for logged in users */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
