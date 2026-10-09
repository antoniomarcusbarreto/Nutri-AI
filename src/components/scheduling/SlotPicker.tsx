import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarX2 } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Escolha de horário livre: primeiro o dia (faixa rolável), depois a hora.
 * Recebe os horários já filtrados pelo banco (ISO) — só mostra dias com vaga.
 * Usado pelo paciente (remarcar / marcar retorno) e pela equipe (sugerir data).
 */

export interface SlotPickerProps {
  slots: string[] | undefined;
  loading: boolean;
  error?: boolean;
  value: string | null;
  onChange: (slot: string) => void;
  /** Mostrar mais datas (amplia a janela consultada). */
  onLoadMore?: () => void;
  canLoadMore?: boolean;
  emptyMessage?: React.ReactNode;
}

const dayKey = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

export const SlotPicker: React.FC<SlotPickerProps> = ({
  slots,
  loading,
  error,
  value,
  onChange,
  onLoadMore,
  canLoadMore,
  emptyMessage,
}) => {
  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots ?? []) {
      const k = dayKey(s);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [slots]);

  const days = [...byDay.keys()];
  const selectedDay = value ? dayKey(value) : days[0];
  const times = (selectedDay && byDay.get(selectedDay)) || [];

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando horários">
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return <p role="alert" className="text-sm text-rose-700">Não foi possível carregar os horários. Tente de novo em instantes.</p>;
  }

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center">
        <CalendarX2 className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
        <p className="mt-2 text-sm text-slate-600">{emptyMessage ?? 'Nenhum horário livre neste período.'}</p>
        {canLoadMore && onLoadMore && (
          <button type="button" onClick={onLoadMore} className="mt-2 rounded text-sm font-medium text-[#5024fc] hover:text-[#431cdb]">
            Ver datas seguintes
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Dia</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Dia">
          {days.map((d) => {
            const date = new Date(`${d}T12:00:00`);
            const active = d === selectedDay;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(byDay.get(d)![0])}
                className={cn(
                  'flex w-16 shrink-0 flex-col items-center rounded-xl py-2 ring-1 ring-inset transition-colors',
                  active ? 'bg-[#5024fc] text-white ring-[#5024fc]' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                )}
              >
                <span className={cn('text-[11px] font-medium uppercase', active ? 'text-white/80' : 'text-slate-500')}>
                  {format(date, 'EEE', { locale: ptBR }).replace('.', '').slice(0, 3)}
                </span>
                <span className="text-lg font-semibold leading-tight tabular-nums">{format(date, 'd')}</span>
                <span className={cn('text-[11px]', active ? 'text-white/80' : 'text-slate-500')}>
                  {format(date, 'MMM', { locale: ptBR }).replace('.', '')}
                </span>
              </button>
            );
          })}
          {canLoadMore && onLoadMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className="flex w-16 shrink-0 items-center justify-center rounded-xl px-1 text-center text-xs font-medium text-[#5024fc] border border-dashed border-slate-300 hover:bg-slate-50"
            >
              Mais datas
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Horário</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Horário">
          {times.map((t) => {
            const active = t === value;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(t)}
                className={cn(
                  'h-10 rounded-lg text-sm font-medium tabular-nums ring-1 ring-inset transition-colors',
                  active ? 'bg-[#5024fc] text-white ring-[#5024fc]' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                )}
              >
                {format(new Date(t), 'HH:mm')}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
