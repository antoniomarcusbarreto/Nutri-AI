import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Stethoscope } from 'lucide-react';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading, profile, clinic, isPatient } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Stethoscope className="h-12 w-12 text-primary-600 animate-pulse" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If superadmin without a clinic tries to access anything other than /admin or /settings, redirect them
  const isSuperadminWithoutClinic = profile?.is_superadmin && !clinic;
  
  if (isSuperadminWithoutClinic && !location.pathname.startsWith('/admin') && !location.pathname.startsWith('/settings')) {
    return <Navigate to="/admin" replace />;
  }

  // Se o usuário for paciente e tentar acessar algo diferente do portal
  if (isPatient && !location.pathname.startsWith('/portal')) {
    return <Navigate to="/portal" replace />;
  }
  
  // Se for equipe tentando acessar o portal
  if (!isPatient && location.pathname.startsWith('/portal')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
