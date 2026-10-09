import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarPlus, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useAgendaWindow, useClinicStats, useDashboardActions } from '../hooks/queries/useDashboard';
import { PageHeader } from '../components/ui';
import { copyText, greeting } from '../components/dashboard/dashboardFormat';
import { TodayAgenda } from '../components/dashboard/TodayAgenda';
import { ActionQueue } from '../components/dashboard/ActionQueue';
import { MonthResults } from '../components/dashboard/MonthResults';
import { FinanceSnapshot } from '../components/dashboard/FinanceSnapshot';
import { RemindersCard } from '../components/dashboard/RemindersCard';
import { SetupChecklist } from '../components/dashboard/SetupChecklist';

/**
 * Painel inicial: responde "o que eu faço agora?" antes de "como foi o mês".
 * Ordem: primeiros passos (conta nova) → hoje + pendências → mês → caixa e lembretes.
 */
export const Dashboard: React.FC = () => {
  const { isReadOnly, clinic, profile, userRole } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());

  const isSecretary = userRole === 'secretary';
  const isClinical = userRole === 'owner' || userRole === 'nutritionist';

  // Queries independentes, disparadas em paralelo pelo TanStack Query.
  const agendaQuery = useAgendaWindow(clinic?.id);
  const actionsQuery = useDashboardActions(clinic?.id, profile?.id, isClinical);
  const statsQuery = useClinicStats(clinic?.id, selectedMonth, !isSecretary);

  useEffect(() => {
    if (profile?.is_superadmin) {
      navigate('/admin', { replace: true });
    }
  }, [profile, navigate]);

  const copyLink = async (path: string, ok: string) => {
    if (await copyText(`${window.location.origin}${path}`)) showToast(ok, 'success');
    else showToast('Não foi possível copiar o link. Verifique a permissão da área de transferência.', 'error');
  };

  const copyConfirmation = (token: string | null, patientName: string) => {
    if (!token) return showToast('Link indisponível. Recarregue a página.', 'error');
    void copyLink(`/confirmar/${token}`, `Link de confirmação de ${patientName} copiado. Envie pelo WhatsApp.`);
  };

  const now = new Date();
  const firstName = profile?.full_name?.split(' ')[0];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title={firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
        description={<span className="inline-block first-letter:uppercase">{now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>}
        actions={!isReadOnly && (
          <>
            <Link to="/pacientes?novo=1" className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Novo paciente
            </Link>
            <Link to="/agenda?novo=1" className="inline-flex items-center gap-2 rounded-xl bg-[#5024fc] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#431cdb]">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Novo agendamento
            </Link>
          </>
        )}
      />

      <SetupChecklist clinicId={clinic?.id} enabled={userRole === 'owner' && !isReadOnly} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TodayAgenda query={agendaQuery} userId={profile?.id} clinical={isClinical} canSchedule={!isReadOnly} onCopyConfirmation={copyConfirmation} />
        </div>
        <div className="lg:col-span-2">
          <ActionQueue query={actionsQuery} onCopyConfirmation={copyConfirmation} />
        </div>
      </div>

      <MonthResults query={statsQuery} month={selectedMonth} onMonthChange={setSelectedMonth} isSecretary={isSecretary} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FinanceSnapshot clinicId={clinic?.id} />
        <RemindersCard />
      </div>
    </div>
  );
};
