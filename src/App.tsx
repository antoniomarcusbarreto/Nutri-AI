import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { PageLoader } from './components/layout/PageLoader';
import { ToastProvider } from './contexts/ToastContext';

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
const PatientPortal = lazy(() => import('./pages/PatientPortal').then(m => ({ default: m.PatientPortal })));
const PreConsulta = lazy(() => import('./pages/PreConsulta').then(m => ({ default: m.PreConsulta })));
const ConfirmAppointment = lazy(() => import('./pages/ConfirmAppointment').then(m => ({ default: m.ConfirmAppointment })));

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/ficha/:token" element={<PreConsulta />} />
              <Route path="/plano/:id" element={<PublicPlanViewer />} />
              <Route path="/confirmar/:token" element={<ConfirmAppointment />} />
              <Route path="/login" element={<Login />} />
              <Route path="/termos" element={<TermsOfService />} />
              <Route path="/privacidade" element={<PrivacyPolicy />} />

              {/* Patient Portal Route (Standalone, no sidebar) */}
              <Route path="/portal" element={
                <ProtectedRoute>
                  <PatientPortal />
                </ProtectedRoute>
              } />

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
                <Route path="/consultas" element={<Consultations />} />
                <Route path="/acompanhamento" element={<Tracking />} />
                <Route path="/planos" element={<MealPlans />} />
                <Route path="/exames" element={<Exams />} />
                <Route path="/admin" element={<AdminDashboard />} />
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
  );
}

export default App;
