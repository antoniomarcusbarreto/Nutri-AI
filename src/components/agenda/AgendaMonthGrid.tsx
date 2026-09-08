import React from 'react';
import { format, isSameMonth, isToday, isSameDay } from 'date-fns';
import { AlertCircle } from 'lucide-react';

/** Compromisso mínimo que a grade precisa renderizar. Estruturalmente compatível
 *  com `AgendaAppointment` de `pages/Agenda.tsx`. */
export interface MonthGridAppointment {
  id: string;
  date_time: string;
  status: string;
  nutritionist_id?: string | null;
  patients?: { name?: string | null } | null;
  services?: { name?: string | null } | null;
}

export interface MonthGridProfessional {
  id: string;
  full_name?: string | null;
}

export interface AgendaMonthGridProps<T extends MonthGridAppointment = MonthGridAppointment> {
  days: Date[];
  selectedDate: Date;
  getAppointmentsForDay: (day: Date) => T[];
  professionals: MonthGridProfessional[];
  isAttention: (apt: T) => boolean;
  onSelectDay: (day: Date) => void;
  onAppointmentClick: (apt: T, e: React.MouseEvent) => void;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Quantos chips cabem antes do resumo "+N". */
const VISIBLE_CHIPS = 3;

const initialsOf = (name?: string | null) =>
  (name ?? '').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();

const firstName = (name?: string | null) => (name ?? 'Paciente').trim().split(' ')[0];

const toneFor = (attention: boolean, status: string) => {
  if (attention) return 'bg-amber-50 border-amber-300 text-amber-900 font-semibold';
  if (status === 'confirmado') return 'bg-emerald-50 border-emerald-200 text-emerald-800';
  if (status === 'pendente') return 'bg-amber-50 border-amber-200 text-amber-800';
  return 'bg-rose-50 border-rose-200 text-rose-800';
};

export function AgendaMonthGrid<T extends MonthGridAppointment>({
  days,
  selectedDate,
  getAppointmentsForDay,
  professionals,
  isAttention,
  onSelectDay,
  onAppointmentClick,
}: AgendaMonthGridProps<T>) {
  return (
  <div className="flex-1 flex flex-col min-w-[720px]">
    {/* Cabeçalho de dias da semana */}
    <div className="grid grid-cols-7 border-b border-slate-200 bg-white shrink-0">
      {WEEKDAYS.map((day) => (
        <div key={day} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {day}
        </div>
      ))}
    </div>

    {/* Grade de dias */}
    <div className="grid grid-cols-7 gap-px bg-slate-200/70 flex-1">
      {days.map((day, idx) => {
        const dayAppointments = getAppointmentsForDay(day);
        const isCurrentMonth = isSameMonth(day, selectedDate);
        const isTodayDay = isToday(day);
        const isSelected = isSameDay(day, selectedDate);
        const attentionCount = dayAppointments.filter(isAttention).length;

        return (
          <div
            key={idx}
            onClick={() => onSelectDay(day)}
            className={`bg-white min-h-[124px] p-2 flex flex-col gap-1.5 group hover:bg-slate-50/80 transition-colors relative cursor-pointer ${
              isCurrentMonth ? 'text-slate-700' : 'bg-slate-50/40 text-slate-300'
            } ${isSelected ? 'ring-2 ring-primary-500 ring-inset z-10' : ''}`}
          >
            {/* Linha do número do dia */}
            <div className="flex items-center justify-between">
              <span
                className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm font-semibold ${
                  isTodayDay ? 'bg-primary-600 text-white shadow-sm' : isCurrentMonth ? 'text-slate-600' : ''
                }`}
              >
                {format(day, 'd')}
              </span>
              <div className="flex items-center gap-1">
                {attentionCount > 0 && (
                  <span
                    className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700"
                    title={`${attentionCount} consulta(s) pendente(s) de prontuário`}
                  >
                    <AlertCircle className="h-3 w-3" />
                    {attentionCount}
                  </span>
                )}
                {dayAppointments.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500 tabular-nums">
                    {dayAppointments.length}
                  </span>
                )}
              </div>
            </div>

            {/* Compromissos do dia */}
            <div className="flex-1 space-y-1 overflow-y-auto pr-0.5 scrollbar-none">
              {dayAppointments.slice(0, VISIBLE_CHIPS).map((apt) => {
                const prof = professionals.find((p) => p.id === apt.nutritionist_id);
                const initials = initialsOf(prof?.full_name);
                const attention = isAttention(apt);
                return (
                  <button
                    key={apt.id}
                    type="button"
                    onClick={(e) => onAppointmentClick(apt, e)}
                    title={`${format(new Date(apt.date_time), 'HH:mm')} · ${apt.patients?.name || 'Paciente'}${
                      prof?.full_name ? ` · ${prof.full_name}` : ''
                    }${attention ? ' · pendente de prontuário' : ''}`}
                    className={`flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-xs transition-transform hover:translate-x-0.5 ${toneFor(
                      attention,
                      apt.status,
                    )}`}
                  >
                    {attention && <AlertCircle className="h-3 w-3 shrink-0 text-amber-600" />}
                    <span className="shrink-0 font-semibold tabular-nums">{format(new Date(apt.date_time), 'HH:mm')}</span>
                    <span className="truncate">{firstName(apt.patients?.name)}</span>
                    {initials && <span className="ml-auto shrink-0 font-medium opacity-60">{initials}</span>}
                  </button>
                );
              })}
              {dayAppointments.length > VISIBLE_CHIPS && (
                <div className="px-1.5 pt-0.5 text-xs font-semibold text-primary-600">
                  +{dayAppointments.length - VISIBLE_CHIPS} mais
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
