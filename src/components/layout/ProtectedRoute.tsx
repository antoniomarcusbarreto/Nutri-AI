import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Stethoscope } from 'lucide-react';

type StaffRole = 'owner' | 'nutritionist' | 'secretary';

/**
 * Guarda de rota. `roles` restringe a papéis da clínica; `superadminOnly`, ao
 * Master. O menu já esconde esses itens, mas sem a guarda a URL direta abria
 * a tela (o RLS ainda bloqueava os dados — isto evita a tela quebrada).
 */
export const RequireRole: React.FC<{ roles?: StaffRole[]; superadminOnly?: boolean; children: React.ReactNode }> = ({
  roles,
  superadminOnly,
  children,
}) => {
  const { profile, userRole, loading } = useAuth();
  if (loading) return null;
  if (superadminOnly && !profile?.is_superadmin) return <Navigate to="/dashboard" replace />;
  if (roles && (!userRole || !roles.includes(userRole))) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

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

  // Master sem clínica só usa o Painel Master (sem Configurações: tema e dados
  // de clínica não se aplicam a ele).
  const isSuperadminWithoutClinic = profile?.is_superadmin && !clinic;

  if (isSuperadminWithoutClinic && !location.pathname.startsWith('/admin')) {
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
