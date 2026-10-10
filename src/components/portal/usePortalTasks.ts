import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isHealthComplete, usePortalAppointments, usePortalHealth, usePortalRequests } from '../../hooks/queries/usePortal';
import { usePortalBodyAssessments } from '../../hooks/queries/useBodyAssessments';

/**
 * O que o paciente precisa fazer agora no portal. Alimenta a lista "Para
 * fazer" da tela inicial e os contadores da navegação. Só conta o que ele
 * consegue fazer (acesso vigente).
 */
export interface PortalTask {
  key: string;
  title: string;
  detail: string;
  to: string;
  /** Rota da navegação onde a tarefa aparece como contador. */
  section: '/portal/agenda' | '/portal/ficha' | '/portal/avaliacao';
}

export function usePortalTasks(): { tasks: PortalTask[]; loading: boolean; countFor: (section: string) => number } {
  const { patientPortal } = useAuth();
  const id = patientPortal?.patient_id;
  const active = !!patientPortal?.active;
  const appointments = usePortalAppointments(id);
  const requests = usePortalRequests(id);
  const health = usePortalHealth(id);
  const body = usePortalBodyAssessments(id);
  const [now] = useState(() => Date.now());

  const tasks: PortalTask[] = [];
  if (active) {
    const toConfirm = (appointments.data ?? []).filter((a) => a.status === 'pendente' && new Date(a.date_time).getTime() > now);
    if (toConfirm.length) {
      tasks.push({
        key: 'confirm',
        title: toConfirm.length === 1 ? 'Confirmar sua próxima consulta' : `Confirmar ${toConfirm.length} consultas`,
        detail: 'A clínica aguarda sua confirmação de presença.',
        to: '/portal/agenda',
        section: '/portal/agenda',
      });
    }
    const proposals = (requests.data ?? []).filter((r) => r.status === 'proposto');
    if (proposals.length) {
      tasks.push({
        key: 'proposal',
        title: 'Responder à nova data sugerida',
        detail: 'A clínica sugeriu outro horário para você.',
        to: '/portal/agenda',
        section: '/portal/agenda',
      });
    }
    if ((body.data ?? []).some((a) => a.status === 'solicitada')) {
      tasks.push({
        key: 'body',
        title: 'Enviar avaliação corporal',
        detail: 'Seu nutricionista pediu medidas e/ou fotos.',
        to: '/portal/avaliacao',
        section: '/portal/avaliacao',
      });
    }
    if (health.isSuccess && !isHealthComplete(health.data)) {
      tasks.push({
        key: 'health',
        title: 'Preencher a ficha de saúde',
        detail: 'Ajuda a preparar sua consulta. Leva uns 3 minutos.',
        to: '/portal/ficha',
        section: '/portal/ficha',
      });
    }
  }

  return {
    tasks,
    loading: appointments.isLoading || health.isLoading || body.isLoading,
    countFor: (section) => tasks.filter((t) => t.section === section).length,
  };
}
