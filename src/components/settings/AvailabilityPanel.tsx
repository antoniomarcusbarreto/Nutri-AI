import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarClock, CalendarOff, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useAvailability, useAvailabilityMutations, type AvailabilityRange } from '../../hooks/queries/usePortal';
import { Button, Card, DateInput, Input } from '../ui';
import { cn } from '../../lib/cn';

/**
 * Grade semanal de atendimento do profissional logado (migration 0032).
 * O paciente vê, no app, só os horários livres desta grade.
 */

// Segunda primeiro; `weekday` segue o Postgres (0 = domingo).
const WEEKDAYS = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

const DEFAULT_RANGES = [
  { start_time: '08:00', end_time: '12:00' },
  { start_time: '14:00', end_time: '18:00' },
];

const errText = (err: unknown) =>
  (err instanceof Error && err.message) || (err as { message?: string })?.message || 'Não foi possível salvar.';

type Draft = Record<number, { start_time: string; end_time: string }[]>;

const toDraft = (ranges: AvailabilityRange[]): Draft => {
  const d: Draft = {};
  for (const r of ranges) (d[r.weekday] ??= []).push({ start_time: r.start_time, end_time: r.end_time });
  return d;
};

const validate = (draft: Draft): string | null => {
  for (const { value, label } of WEEKDAYS) {
    const list = [...(draft[value] ?? [])].sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (let i = 0; i < list.length; i++) {
      if (!list[i].start_time || !list[i].end_time || list[i].end_time <= list[i].start_time) {
        return `${label}: o fim de cada faixa precisa ser depois do início.`;
      }
      if (i > 0 && list[i].start_time < list[i - 1].end_time) {
        return `${label}: há faixas de horário sobrepostas.`;
      }
    }
  }
  return null;
};

export const AvailabilityPanel: React.FC = () => {
  const { clinic, profile, isReadOnly } = useAuth();
  const { showToast } = useToast();
  const { data, isLoading } = useAvailability(profile?.id);
  const { saveRanges, addTimeOff, removeTimeOff } = useAvailabilityMutations(clinic?.id, profile?.id);

  // Rascunho local da grade; nasce dos dados do banco na primeira carga.
  const [draft, setDraft] = useState<Draft | null>(null);
  const current: Draft = draft ?? (data ? toDraft(data.ranges) : {});
  const dirty = draft !== null;

  const [offStart, setOffStart] = useState('');
  const [offEnd, setOffEnd] = useState('');
  const [offReason, setOffReason] = useState('');

  const update = (weekday: number, ranges: { start_time: string; end_time: string }[]) =>
    setDraft({ ...current, [weekday]: ranges });

  const save = () => {
    const problem = validate(current);
    if (problem) {
      showToast(problem, 'error');
      return;
    }
    const ranges: AvailabilityRange[] = Object.entries(current).flatMap(([weekday, list]) =>
      list.map((r) => ({ weekday: Number(weekday), start_time: r.start_time, end_time: r.end_time })),
    );
    saveRanges.mutate(ranges, {
      onSuccess: () => {
        setDraft(null);
        showToast('Horários salvos. Os pacientes já veem os horários livres no app.', 'success');
      },
      onError: (err) => showToast(errText(err), 'error'),
    });
  };

  const addOff = () => {
    if (!offStart) {
      showToast('Escolha a data inicial.', 'error');
      return;
    }
    const end = offEnd || offStart;
    if (end < offStart) {
      showToast('A data final precisa ser igual ou depois da inicial.', 'error');
      return;
    }
    addTimeOff.mutate(
      { startsOn: offStart, endsOn: end, reason: offReason },
      {
        onSuccess: () => {
          setOffStart('');
          setOffEnd('');
          setOffReason('');
          showToast('Folga registrada. Esses dias somem da agenda online.', 'success');
        },
        onError: (err) => showToast(errText(err), 'error'),
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card as="section" radius="2xl" aria-labelledby="availability-title">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
          <div>
            <h2 id="availability-title" className="text-lg font-semibold text-slate-800">Horários de atendimento</h2>
            <p className="mt-1 text-sm text-slate-600">
              Os pacientes escolhem, pelo app, horários livres desta grade (em blocos da duração do serviço e com pelo
              menos 12h de antecedência). Você aceita, recusa ou sugere outra data na Agenda.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}</div>
        ) : (
          <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {WEEKDAYS.map(({ value, label }) => {
              const ranges = current[value] ?? [];
              const on = ranges.length > 0;
              return (
                <li key={value} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                  <label className="flex w-36 shrink-0 items-center gap-3 pt-2 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={isReadOnly}
                      onChange={(e) => update(value, e.target.checked ? DEFAULT_RANGES.map((r) => ({ ...r })) : [])}
                      className="h-4 w-4 rounded border-slate-300 accent-[#5024fc]"
                    />
                    {label}
                  </label>
                  <div className={cn('flex-1 space-y-2', !on && 'pt-2')}>
                    {!on && <p className="text-sm text-slate-400">Não atende</p>}
                    {ranges.map((r, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          aria-label={`${label}: início da faixa ${i + 1}`}
                          value={r.start_time}
                          disabled={isReadOnly}
                          onChange={(e) => update(value, ranges.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 tabular-nums focus:border-[#5024fc] focus:outline-none focus:ring-1 focus:ring-[#5024fc]"
                        />
                        <span className="text-sm text-slate-500">às</span>
                        <input
                          type="time"
                          aria-label={`${label}: fim da faixa ${i + 1}`}
                          value={r.end_time}
                          disabled={isReadOnly}
                          onChange={(e) => update(value, ranges.map((x, j) => (j === i ? { ...x, end_time: e.target.value } : x)))}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 tabular-nums focus:border-[#5024fc] focus:outline-none focus:ring-1 focus:ring-[#5024fc]"
                        />
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => update(value, ranges.filter((_, j) => j !== i))}
                          aria-label={`Remover faixa ${i + 1} de ${label}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    {on && !isReadOnly && (
                      <button
                        type="button"
                        onClick={() => update(value, [...ranges, { start_time: ranges.at(-1)?.end_time ?? '08:00', end_time: '' }])}
                        className="inline-flex items-center gap-1 rounded text-sm font-medium text-[#5024fc] hover:text-[#431cdb]"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar faixa
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!isReadOnly && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {dirty && <span className="text-sm text-amber-700">Alterações não salvas</span>}
            {dirty && <Button variant="secondary" onClick={() => setDraft(null)}>Descartar</Button>}
            <Button variant="primary" disabled={!dirty} loading={saveRanges.isPending} onClick={save}>Salvar horários</Button>
          </div>
        )}
      </Card>

      <Card as="section" radius="2xl" aria-labelledby="timeoff-title">
        <div className="flex items-start gap-3">
          <CalendarOff className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
          <div>
            <h2 id="timeoff-title" className="text-lg font-semibold text-slate-800">Folgas e férias</h2>
            <p className="mt-1 text-sm text-slate-600">Dias em que você não atende: eles somem da agenda online.</p>
          </div>
        </div>

        {(data?.timeOff.length ?? 0) > 0 && (
          <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {data!.timeOff.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-slate-800">
                  {t.starts_on === t.ends_on
                    ? format(parseISO(t.starts_on), "d 'de' MMMM", { locale: ptBR })
                    : `${format(parseISO(t.starts_on), "d 'de' MMM", { locale: ptBR })} a ${format(parseISO(t.ends_on), "d 'de' MMM", { locale: ptBR })}`}
                  {t.reason && <span className="text-slate-500"> · {t.reason}</span>}
                </span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => removeTimeOff.mutate(t.id, { onError: (err) => showToast(errText(err), 'error') })}
                    aria-label="Remover folga"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!isReadOnly && (
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end">
            <DateInput label="De" value={offStart} onChange={setOffStart} />
            <DateInput label="Até (opcional)" value={offEnd} onChange={setOffEnd} />
            <Input label="Motivo (opcional)" value={offReason} maxLength={80} onChange={(e) => setOffReason(e.target.value)} placeholder="Ex.: férias, congresso" />
            <Button variant="secondary" loading={addTimeOff.isPending} onClick={addOff}>Adicionar</Button>
          </div>
        )}
      </Card>
    </div>
  );
};
