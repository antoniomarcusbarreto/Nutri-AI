import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarClock, Smartphone, XCircle } from 'lucide-react';
import { Button } from '../ui';
import type { AppointmentChangeRequest } from '../../types/portal';

/**
 * Pedidos feitos pelo paciente no app (migration 0031): reagendamento a
 * atender e cancelamentos a tomar ciência. O reagendamento em si segue o fluxo
 * de sempre da Agenda — aceitar só abre a consulta já no modo "Reagendar".
 */

export interface PatientRequestAppointment {
  id: string;
  date_time: string;
  patients?: { name?: string | null } | null;
}

export interface PatientRequestsPanelProps {
  requests: AppointmentChangeRequest[];
  appointmentById: (id: string) => PatientRequestAppointment | undefined;
  onReschedule: (appointmentId: string) => void;
  onResolve: (requestId: string, status: 'aceito' | 'recusado') => void;
  resolvingId: string | null;
  readOnly?: boolean;
}

export const PatientRequestsPanel: React.FC<PatientRequestsPanelProps> = ({
  requests,
  appointmentById,
  onReschedule,
  onResolve,
  resolvingId,
  readOnly,
}) => {
  if (requests.length === 0) return null;

  return (
    <section aria-labelledby="patient-requests-title" className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
      <h2 id="patient-requests-title" className="flex items-center gap-2 text-sm font-semibold text-blue-900">
        <Smartphone className="h-4 w-4" aria-hidden="true" />
        Pedidos de pacientes pelo app
        <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">{requests.length}</span>
      </h2>

      <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-blue-100 bg-white">
        {requests.map((r) => {
          const apt = appointmentById(r.appointment_id);
          const name = apt?.patients?.name ?? 'Paciente';
          const when = apt ? format(new Date(apt.date_time), "EEE, dd/MM 'às' HH:mm", { locale: ptBR }) : '';
          const busy = resolvingId === r.id;
          const isCancel = r.kind === 'cancel';

          return (
            <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                  {isCancel ? (
                    <XCircle className="h-4 w-4 text-rose-600" aria-hidden="true" />
                  ) : (
                    <CalendarClock className="h-4 w-4 text-blue-700" aria-hidden="true" />
                  )}
                  {name}
                  <span className="font-normal text-slate-500">
                    {isCancel ? 'cancelou a consulta' : 'pediu outro horário'}
                    {when ? ` de ${when}` : ''}
                  </span>
                </p>
                {r.preferred_times && (
                  <p className="text-sm text-slate-700">
                    <span className="text-slate-500">Prefere:</span> {r.preferred_times}
                  </p>
                )}
                {r.note && <p className="text-sm text-slate-600">&ldquo;{r.note}&rdquo;</p>}
                <p className="text-xs text-slate-400">
                  Pedido em {format(new Date(r.created_at), "dd/MM 'às' HH:mm")}
                </p>
              </div>

              {!readOnly && (
                <div className="flex shrink-0 gap-2">
                  {isCancel ? (
                    <Button size="sm" variant="secondary" loading={busy} onClick={() => onResolve(r.id, 'aceito')}>
                      Ciente
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="primary" disabled={!apt || busy} onClick={() => onReschedule(r.appointment_id)}>
                        Reagendar
                      </Button>
                      <Button size="sm" variant="ghost" loading={busy} onClick={() => onResolve(r.id, 'recusado')}>
                        Recusar
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
