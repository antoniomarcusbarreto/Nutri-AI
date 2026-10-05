import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Copy } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { AgendaAppointment, AgendaWindow } from '../../hooks/queries/useDashboard';
import { pickOne } from '../../types/clinical';
import { cn } from '../../lib/cn';
import { Card } from '../ui';
import { ListSkeleton, LoadError, SectionTitle, StatusPill } from './dashboardUi';
import { fmtTime, fmtWhen } from './dashboardFormat';

export interface TodayAgendaProps {
  query: UseQueryResult<AgendaWindow>;
  userId?: string;
  /** owner/nutritionist: mostra "Atender" nas próprias consultas. */
  clinical: boolean;
  /** Fora do modo somente leitura: mostra o atalho de agendar no dia vazio. */
  canSchedule: boolean;
  onCopyConfirmation: (token: string | null, patientName: string) => void;
}

/** Consulta que já passou sem ser concluída: provavelmente atendida sem registro (ou falta). */
const displayStatus = (apt: AgendaAppointment, now: Date) =>
  (apt.status === 'pendente' || apt.status === 'confirmado') && new Date(apt.date_time) < now ? 'sem_registro' : apt.status;

const names = (apt: AgendaAppointment) => ({
  patient: pickOne(apt.patients)?.name || 'Paciente',
  service: pickOne(apt.services)?.name,
  prof: pickOne(apt.profiles)?.full_name?.split(' ')[0],
});

export const TodayAgenda: React.FC<TodayAgendaProps> = ({ query, userId, clinical, canSchedule, onCopyConfirmation }) => {
  const now = new Date();
  const today = query.data?.today ?? [];
  const later = query.data?.later ?? [];
  const nextId = today.find((a) => new Date(a.date_time) >= now && a.status !== 'concluido')?.id;
  const remaining = today.filter((a) => a.status !== 'concluido' && displayStatus(a, now) !== 'sem_registro').length;

  const hint = query.isPending ? 'Carregando…'
    : today.length === 0 ? 'Nenhuma consulta marcada para hoje'
    : `${today.length} ${today.length === 1 ? 'consulta' : 'consultas'} · ${remaining === 0 ? 'nenhuma restante' : `${remaining} ${remaining === 1 ? 'restante' : 'restantes'}`}`;

  return (
    <Card as="section" aria-labelledby="today-title" className="flex h-full flex-col">
      <SectionTitle
        id="today-title"
        title="Agenda de hoje"
        hint={hint}
        action={
          <Link to="/agenda" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-[#5024fc] hover:bg-slate-100">
            Abrir agenda <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />

      {query.isPending ? (
        <ListSkeleton rows={3} />
      ) : query.isError ? (
        <LoadError message="Não foi possível carregar a agenda." onRetry={() => query.refetch()} />
      ) : (
        <>
          {today.length === 0 ? (
            <div className={cn(
              'flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 text-center',
              later.length > 0 ? 'py-6' : 'flex-1 py-10',
            )}>
              <CalendarCheck className="mb-2 h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-900">Dia livre</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {later.length > 0 ? 'As próximas consultas estão logo abaixo.' : 'Nenhuma consulta nos próximos dias também.'}
              </p>
              {canSchedule && later.length === 0 && (
                <Link to="/agenda?novo=1" className="mt-4 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200">
                  Agendar consulta
                </Link>
              )}
            </div>
          ) : (
            <ol className="space-y-2.5">
              {today.map((apt) => {
                const { patient, service, prof } = names(apt);
                const status = displayStatus(apt, now);
                const isNext = apt.id === nextId;
                const isMine = clinical && apt.nutritionist_id === userId;
                return (
                  <li
                    key={apt.id}
                    className={cn(
                      'flex items-center gap-4 rounded-2xl border bg-white p-3.5',
                      isNext ? 'border-[#5024fc]/40 ring-1 ring-[#5024fc]/20' : 'border-slate-200',
                    )}
                  >
                    <div className="w-14 shrink-0 text-center">
                      <p className={cn('text-lg font-semibold tabular-nums', status === 'concluido' ? 'text-slate-400' : 'text-[#5024fc]')}>
                        {fmtTime(apt.date_time)}
                      </p>
                      {isNext && <p className="text-[11px] font-medium uppercase tracking-wider text-[#5024fc]">Próxima</p>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-slate-900">{patient}</p>
                      <p className="truncate text-sm text-slate-500">
                        {[service, prof && `Dr(a). ${prof}`].filter(Boolean).join(' · ') || 'Consulta'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <StatusPill status={status} />
                      {apt.status === 'pendente' && status !== 'sem_registro' && (
                        <button
                          type="button"
                          onClick={() => onCopyConfirmation(apt.public_token, patient)}
                          aria-label={`Copiar link de confirmação de ${patient}`}
                          title="Copiar link de confirmação para WhatsApp"
                          className="cursor-pointer rounded-xl border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      {isMine && status !== 'concluido' && (
                        <Link
                          to={`/consultas?agendamento=${apt.id}`}
                          className="rounded-xl bg-[#5024fc] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#431cdb]"
                        >
                          {status === 'sem_registro' ? 'Registrar' : 'Atender'}
                        </Link>
                      )}
                      {isMine && status === 'concluido' && apt.patient_id && (
                        <Link
                          to={`/acompanhamento?paciente=${apt.patient_id}`}
                          className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                        >
                          Evolução
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {later.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Próximos dias</h3>
              <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                {later.map((apt) => {
                  const { patient, service } = names(apt);
                  return (
                    <li key={apt.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                      <span className="w-28 shrink-0 tabular-nums text-slate-600 first-letter:uppercase">{fmtWhen(apt.date_time)}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-900">
                        {patient}
                        {service && <span className="text-slate-500"> · {service}</span>}
                      </span>
                      <StatusPill status={apt.status} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
};
