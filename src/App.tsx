import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Services } from './pages/Services';
import { Patients } from './pages/Patients';
import { Agenda } from './pages/Agenda';
import { TermsOfService } from './pages/TermsOfService';
import { PrivacyPolicy } from './pages/PrivacyPolicy';

import { AdminDashboard } from './pages/AdminDashboard';
import { Settings } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { Financial } from './pages/Financial';
import { Consultations } from './pages/Consultations';
import { Tracking } from './pages/Tracking';
import { MealPlans } from './pages/MealPlans';

import { PatientPortal } from './pages/PatientPortal';
import { PreConsulta } from './pages/PreConsulta';
import { ConfirmAppointment } from './pages/ConfirmAppointment';
import { ToastProvider } from './contexts/ToastContext';
import { Exams } from './pages/Exams';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/ficha/:token" element={<PreConsulta />} />
          <Route path="/confirmar/:appointmentId" element={<ConfirmAppointment />} />
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
      </BrowserRouter>
    </AuthProvider>
    </ToastProvider>
  );
}

export default App;
