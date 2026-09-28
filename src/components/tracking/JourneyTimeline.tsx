import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarClock, CalendarRange, ClipboardList, FileText, Salad, Stethoscope } from 'lucide-react';
import { Card, EmptyState } from '../ui';
import { cn } from '../../lib/cn';
import type { AppointmentRecord } from '../../types/clinical';
import { pickOne } from '../../types/clinical';
import { SectionHeader } from './chartKit';
import { DOMAIN, TONE_TILE, type Tone } from './trackingTheme';
import {
  APPOINTMENT_STATUS_UI,
  fmtMonthYear,
  type FlowStats,
  type JourneyEvent,
  type JourneyKind,
} from './trackingModel';

const PAGE_SIZE = 30;

const KIND_UI: Record<JourneyKind, { label: string; icon: React.ReactNode; domain: (typeof DOMAIN)[keyof typeof DOMAIN] }> = {
  appointment: { label: 'Consultas', icon: <Stethoscope className="h-4 w-4" />, domain: DOMAIN.consultation },
  exam: { label: 'Exames', icon: <FileText className="h-4 w-4" />, domain: DOMAIN.exam },
  mealplan: { label: 'Planos alimentares', icon: <Salad className="h-4 w-4" />, domain: DOMAIN.mealplan },
};

export interface JourneyTimelineProps {
  /** Eventos passados já recortados pelo período, do mais recente ao mais antigo. */
  events: JourneyEvent[];
  upcoming: AppointmentRecord[];
  stats: FlowStats;
  periodText: string;
  onShowAll: () => void;
  onOpenAppointment: (apt: AppointmentRecord) => void;
  onOpenEvent: (evt: JourneyEvent) => void;
}

/** Indicador de fluxo: o fundo assume o tom do resultado (sempre junto do número e do rótulo). */
const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }> = ({ label, value, hint, tone = 'neutral' }) => (
  <div className={cn('rounded-2xl border px-4 py-3', TONE_TILE[tone].tile)}>
    <p className="text-xs font-medium text-slate-600">{label}</p>
    <p className={cn('mt-1 text-2xl font-medium tabular-nums', TONE_TILE[tone].value)}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-slate-600">{hint}</p>}
  </div>
);

const attendanceTone = (rate: number | null): Tone =>
  rate == null ? 'neutral' : rate >= 0.8 ? 'good' : rate >= 0.6 ? 'warn' : 'bad';

const serviceName = (apt: AppointmentRecord) => pickOne(apt.services)?.name || 'Consulta';

/**
 * Linha do tempo única do paciente: consultas (com status de fluxo),
 * exames e planos alimentares, agrupados por mês. Substitui os antigos blocos
 * "Histórico e Fluxo de Consultas" e "Sinopse da Jornada", que repetiam as
 * mesmas consultas com datas diferentes.
 */
export const JourneyTimeline: React.FC<JourneyTimelineProps> = ({
  events,
  upcoming,
  stats,
  periodText,
  onShowAll,
  onOpenAppointment,
  onOpenEvent,
}) => {
  const [hidden, setHidden] = useState<Record<JourneyKind, boolean>>({ appointment: false, exam: false, mealplan: false });
  const [limit, setLimit] = useState(PAGE_SIZE);

  const counts = useMemo(() => {
    const c: Record<JourneyKind, number> = { appointment: 0, exam: 0, mealplan: 0 };
    events.forEach((e) => { c[e.kind]++; });
    return c;
  }, [events]);

  const visible = useMemo(() => events.filter((e) => !hidden[e.kind]), [events, hidden]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: JourneyEvent[] }[] = [];
    visible.slice(0, limit).forEach((evt) => {
      const key = format(evt.date, 'yyyy-MM');
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: fmtMonthYear(evt.date), items: [] };
        out.push(g);
      }
      g.items.push(evt);
    });
    return out;
  }, [visible, limit]);

  return (
    <Card as="section" aria-labelledby="journey-title" className="space-y-5">
      <SectionHeader
        id="journey-title"
        icon={<CalendarRange />}
        plate={DOMAIN.consultation.dot}
        title="Linha do tempo do paciente"
        subtitle={`Consultas, exames e planos alimentares ${periodText}`}
      />

      {/* Indicadores de fluxo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Comparecimento"
          tone={attendanceTone(stats.attendanceRate)}
          value={stats.attendanceRate == null ? '—' : `${Math.round(stats.attendanceRate * 100)}%`}
          hint={stats.done + stats.missed > 0
            ? `${stats.done} de ${stats.done + stats.missed} consultas`
            : 'Sem consultas no período'}
        />
        <Stat
          label="Intervalo médio entre consultas"
          tone={stats.avgIntervalDays == null ? 'neutral' : 'info'}
          value={stats.avgIntervalDays == null ? '—' : `${stats.avgIntervalDays} dias`}
          hint={stats.avgIntervalDays == null ? 'Precisa de 2 consultas realizadas' : 'Consultas realizadas no período'}
        />
        <Stat
          label="Faltas"
          tone={stats.missed > 0 ? 'bad' : 'neutral'}
          value={stats.missed}
          hint="Horário passou sem atendimento"
        />
        <Stat label="Cancelamentos" tone={stats.cancelled > 0 ? 'warn' : 'neutral'} value={stats.cancelled} hint={periodText.replace(/^\w/, (c) => c.toUpperCase())} />
      </div>

      {/* Próximos agendamentos (sempre visíveis, independente do período) */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-teal-700">
            <CalendarClock className="h-4 w-4" aria-hidden="true" /> Próximos agendamentos
          </h3>
          <ul className="divide-y divide-teal-100 rounded-2xl border border-teal-100 bg-teal-50">
            {upcoming.map((apt) => {
              const status = APPOINTMENT_STATUS_UI[apt.status === 'confirmado' ? 'confirmado' : 'pendente'];
              const d = new Date(apt.date_time);
              return (
                <li key={apt.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="font-medium text-teal-800 tabular-nums">{format(d, "dd/MM/yyyy 'às' HH:mm")}</span>
                  <span className="text-slate-600">{serviceName(apt)}</span>
                  <span className="text-slate-500">{pickOne(apt.services)?.modality || 'Presencial'}</span>
                  <span className={cn('ml-auto rounded-lg border px-2 py-0.5 text-xs font-medium', status.badge)}>{status.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Filtros por tipo */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar tipos de evento">
        {(Object.keys(KIND_UI) as JourneyKind[]).map((kind) => {
          const on = !hidden[kind];
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() => setHidden((h) => ({ ...h, [kind]: !h[kind] }))}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                on ? KIND_UI[kind].domain.chipOn : 'border-slate-200 bg-transparent text-slate-400 line-through',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', on ? KIND_UI[kind].domain.dot : 'bg-slate-300')} aria-hidden="true" />
              {KIND_UI[kind].label}
              <span className="tabular-nums opacity-70">{counts[kind]}</span>
            </button>
          );
        })}
      </div>

      {/* Eventos por mês */}
      {visible.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<ClipboardList />}
          title={`Nenhum registro ${periodText}`}
          action={
            <button type="button" onClick={onShowAll} className="text-sm font-medium text-[#5024fc] hover:underline cursor-pointer">
              Ver todo o histórico
            </button>
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key}>
              <h3 className="mb-2 flex items-baseline justify-between border-b border-slate-200/70 py-1 text-sm font-medium text-slate-800">
                {g.label}
                <span className="text-xs font-normal text-slate-500">{g.items.length} registro(s)</span>
              </h3>
              <ol className="relative space-y-2 border-l border-slate-200 pl-5">
                {g.items.map((evt) => (
                  <JourneyRow key={evt.id} evt={evt} onOpenAppointment={onOpenAppointment} onOpenEvent={onOpenEvent} />
                ))}
              </ol>
            </div>
          ))}
          {visible.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Mostrar mais ({visible.length - limit} restantes)
            </button>
          )}
        </div>
      )}
    </Card>
  );
};

const JourneyRow: React.FC<{
  evt: JourneyEvent;
  onOpenAppointment: (apt: AppointmentRecord) => void;
  onOpenEvent: (evt: JourneyEvent) => void;
}> = ({ evt, onOpenAppointment, onOpenEvent }) => {
  const ui = KIND_UI[evt.kind];
  const muted = evt.kind === 'appointment'
    ? evt.status === 'nao_compareceu' ? 'missed' : evt.status === 'cancelado' ? 'cancelled' : null
    : null;
  let title: string;
  let meta: React.ReactNode;
  let action: { label: string; run: () => void } | null = null;

  if (evt.kind === 'appointment') {
    const apt = evt.appointment;
    const status = APPOINTMENT_STATUS_UI[evt.status];
    const consultation = pickOne(apt.consultations);
    const ant = consultation?.anthropometry_json ?? {};
    title = serviceName(apt);
    meta = (
      <>
        <span className={cn('rounded-lg border px-2 py-0.5 text-xs font-medium', status.badge)}>{status.label}</span>
        <span>{format(evt.date, 'HH:mm')}</span>
        <span>{pickOne(apt.services)?.modality || 'Presencial'}</span>
        {ant.weight && <span>Peso {ant.weight} kg</span>}
        {ant.body_fat && <span>Gordura {ant.body_fat}%</span>}
        {ant.muscle_mass && <span>Músculo {ant.muscle_mass}%</span>}
      </>
    );
    if (evt.status === 'concluido' && consultation) action = { label: 'Ver atendimento', run: () => onOpenAppointment(apt) };
  } else if (evt.kind === 'exam') {
    const all = evt.exam.ai_feedback?.todos_biomarcadores ?? [];
    const altered = all.filter((b) => b.status?.toLowerCase() === 'alterado').length;
    title = 'Exame laboratorial';
    meta = (
      <>
        <span>{all.length} biomarcador(es)</span>
        {altered > 0
          ? <span className="rounded-lg bg-rose-600 px-2 py-0.5 text-xs font-medium text-white">{altered} alterado(s)</span>
          : all.length > 0 && <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">todos dentro da referência</span>}
      </>
    );
    action = { label: 'Ver laudo', run: () => onOpenEvent(evt) };
  } else {
    const meals = Object.keys(evt.plan.meals ?? {}).length;
    title = 'Plano alimentar';
    meta = (
      <>
        <span className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">{evt.plan.kcal} kcal</span>
        {meals > 0 && <span>{meals} refeição(ões)</span>}
      </>
    );
    action = { label: 'Ver plano', run: () => onOpenEvent(evt) };
  }

  return (
    <li className="relative">
      <span
        className={cn('absolute -left-[34px] top-3 flex h-7 w-7 items-center justify-center rounded-full shadow-sm', ui.domain.dot)}
        aria-hidden="true"
      >
        {ui.icon}
      </span>
      <div className={cn(
        'flex flex-col gap-2 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center',
        muted === 'missed' ? 'border-rose-100 bg-rose-50' : 'border-slate-200 bg-white',
        muted === 'cancelled' && 'opacity-70',
      )}>
        <div className="flex w-14 shrink-0 items-baseline gap-1 sm:flex-col sm:items-start sm:gap-0">
          <span className={cn('text-xl font-medium leading-none tabular-nums', ui.domain.text)}>{format(evt.date, 'dd')}</span>
          <span className="text-xs uppercase tracking-wider text-slate-500">{format(evt.date, 'MMM', { locale: ptBR })}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">{meta}</div>
        </div>
        {action && (
          <button
            type="button"
            onClick={action.run}
            className={cn('shrink-0 self-start rounded-xl border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors sm:self-center', ui.domain.plate, 'hover:brightness-95')}
          >
            {action.label}
          </button>
        )}
      </div>
    </li>
  );
};
