import React, { useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarClock, CalendarOff, Copy, Eye, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  DEFAULT_SCHEDULE_SETTINGS,
  useAvailability,
  useAvailabilityMutations,
  useStaffSlots,
  type AvailabilityRange,
  type NewTimeOff,
  type ScheduleSettings,
  type TimeOff,
} from '../../hooks/queries/usePortal';
import { Button, Card, DateInput, Input, Select } from '../ui';
import { cn } from '../../lib/cn';

/**
 * Agenda online do profissional logado (migrations 0032/0035):
 *   1. grade semanal (com atalho "aplicar a todos os dias úteis");
 *   2. regras: intervalo entre consultas, passo dos horários, antecedência, limite;
 *   3. bloqueios: toda semana, numa data com horário, ou dia inteiro/período;
 *   4. prévia dos horários que o paciente vê.
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
const WEEKDAY_LABEL = Object.fromEntries(WEEKDAYS.map((w) => [w.value, w.label.toLowerCase()]));
const BUSINESS_DAYS = [1, 2, 3, 4, 5];

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

const TIME_INPUT =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 tabular-nums focus:border-[#5024fc] focus:outline-none focus:ring-1 focus:ring-[#5024fc]';

const fmtDate = (d: string) => format(parseISO(d), "d 'de' MMM", { locale: ptBR });

/** Descrição legível de um bloqueio. */
function describeBlock(t: TimeOff): string {
  const hours = t.start_time && t.end_time ? `${t.start_time}–${t.end_time}` : '';
  if (t.weekday != null) {
    const validity = t.starts_on || t.ends_on
      ? ` (${t.starts_on ? `de ${fmtDate(t.starts_on)}` : ''}${t.starts_on && t.ends_on ? ' ' : ''}${t.ends_on ? `até ${fmtDate(t.ends_on)}` : ''})`
      : '';
    return `Toda ${WEEKDAY_LABEL[t.weekday]}, ${hours}${validity}`;
  }
  if (t.start_time && t.starts_on) return `${format(parseISO(t.starts_on), "EEEE, d 'de' MMMM", { locale: ptBR })}, ${hours}`;
  if (t.starts_on && t.ends_on && t.starts_on !== t.ends_on) return `${fmtDate(t.starts_on)} a ${fmtDate(t.ends_on)} (dia inteiro)`;
  return t.starts_on ? `${format(parseISO(t.starts_on), "d 'de' MMMM", { locale: ptBR })} (dia inteiro)` : '';
}

// ---------------------------------------------------------------------------

const WeeklyGrid: React.FC<{ ranges: AvailabilityRange[]; loading: boolean }> = ({ ranges, loading }) => {
  const { clinic, profile, isReadOnly } = useAuth();
  const { showToast } = useToast();
  const { saveRanges } = useAvailabilityMutations(clinic?.id, profile?.id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const saved = useMemo(() => toDraft(ranges), [ranges]);
  const empty = !loading && ranges.length === 0;
  // Sem grade ainda: já sugere seg–sex 08–12 e 14–18 (o nutricionista confirma salvando).
  const current: Draft = draft ?? (empty ? Object.fromEntries(BUSINESS_DAYS.map((d) => [d, DEFAULT_RANGES.map((r) => ({ ...r }))])) : saved);
  const dirty = draft !== null || empty;

  const update = (weekday: number, list: { start_time: string; end_time: string }[]) => setDraft({ ...current, [weekday]: list });

  const copyToBusinessDays = (from: number) => {
    const list = current[from] ?? [];
    const next = { ...current };
    for (const d of BUSINESS_DAYS) next[d] = list.map((r) => ({ ...r }));
    setDraft(next);
  };

  const save = () => {
    const problem = validate(current);
    if (problem) return showToast(problem, 'error');
    const list: AvailabilityRange[] = Object.entries(current).flatMap(([weekday, l]) =>
      l.map((r) => ({ weekday: Number(weekday), start_time: r.start_time, end_time: r.end_time })),
    );
    saveRanges.mutate(list, {
      onSuccess: () => {
        setDraft(null);
        showToast('Horários salvos. Os pacientes já veem os horários livres no app.', 'success');
      },
      onError: (err) => showToast(errText(err), 'error'),
    });
  };

  return (
    <Card as="section" radius="2xl" aria-labelledby="availability-title">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
        <div>
          <h2 id="availability-title" className="text-lg font-semibold text-slate-800">Horários de atendimento</h2>
          <p className="mt-1 text-sm text-slate-600">
            Seu horário padrão por dia da semana. Para tirar um pedaço (ex.: segunda 14:00–15:30), use os bloqueios abaixo.
          </p>
          {empty && <p className="mt-2 text-sm text-amber-700">Sugestão inicial: segunda a sexta, 08:00–12:00 e 14:00–18:00. Ajuste e salve.</p>}
        </div>
      </div>

      {loading ? (
        <div className="mt-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : (
        <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {WEEKDAYS.map(({ value, label }) => {
            const list = current[value] ?? [];
            const on = list.length > 0;
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
                  {list.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        aria-label={`${label}: início da faixa ${i + 1}`}
                        value={r.start_time}
                        disabled={isReadOnly}
                        onChange={(e) => update(value, list.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))}
                        className={TIME_INPUT}
                      />
                      <span className="text-sm text-slate-500">às</span>
                      <input
                        type="time"
                        aria-label={`${label}: fim da faixa ${i + 1}`}
                        value={r.end_time}
                        disabled={isReadOnly}
                        onChange={(e) => update(value, list.map((x, j) => (j === i ? { ...x, end_time: e.target.value } : x)))}
                        className={TIME_INPUT}
                      />
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => update(value, list.filter((_, j) => j !== i))}
                        aria-label={`Remover faixa ${i + 1} de ${label}`}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  {on && !isReadOnly && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <button
                        type="button"
                        onClick={() => update(value, [...list, { start_time: list.at(-1)?.end_time ?? '08:00', end_time: '' }])}
                        className="inline-flex items-center gap-1 rounded text-sm font-medium text-[#5024fc] hover:text-[#431cdb]"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar faixa
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToBusinessDays(value)}
                        className="inline-flex items-center gap-1 rounded text-sm font-medium text-slate-500 hover:text-slate-800"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Aplicar a todos os dias úteis
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!isReadOnly && (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          {draft !== null && <span className="text-sm text-amber-700">Alterações não salvas</span>}
          {draft !== null && <Button variant="secondary" onClick={() => setDraft(null)}>Descartar</Button>}
          <Button variant="primary" disabled={!dirty} loading={saveRanges.isPending} onClick={save}>Salvar horários</Button>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const RULES: { key: keyof ScheduleSettings; label: string; hint: string; options: { value: number; label: string }[] }[] = [
  {
    key: 'buffer_minutes',
    label: 'Intervalo entre consultas',
    hint: 'Tempo livre depois de cada consulta (prontuário, atrasos).',
    options: [0, 10, 15, 30].map((v) => ({ value: v, label: v === 0 ? 'Sem intervalo' : `${v} min` })),
  },
  {
    key: 'slot_step_minutes',
    label: 'Oferecer horários a cada',
    hint: 'Ex.: 30 min → 08:00, 08:30, 09:00… (cabendo a duração inteira).',
    options: [15, 30, 60].map((v) => ({ value: v, label: `${v} min` })),
  },
  {
    key: 'min_notice_hours',
    label: 'Antecedência mínima',
    hint: 'O paciente não pede horários mais próximos que isso.',
    options: [2, 12, 24, 48].map((v) => ({ value: v, label: `${v} horas` })),
  },
  {
    key: 'max_days_ahead',
    label: 'Pacientes marcam até',
    hint: 'Quantos dias à frente aparecem no app.',
    options: [30, 60, 90].map((v) => ({ value: v, label: `${v} dias` })),
  },
];

const Rules: React.FC<{ settings: ScheduleSettings }> = ({ settings }) => {
  const { clinic, profile, isReadOnly } = useAuth();
  const { showToast } = useToast();
  const { saveSettings } = useAvailabilityMutations(clinic?.id, profile?.id);
  const [draft, setDraft] = useState<ScheduleSettings | null>(null);
  const current = draft ?? settings;

  return (
    <Card as="section" radius="2xl" aria-labelledby="rules-title">
      <div className="flex items-start gap-3">
        <SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
        <div>
          <h2 id="rules-title" className="text-lg font-semibold text-slate-800">Regras da agenda online</h2>
          <p className="mt-1 text-sm text-slate-600">
            Cada consulta usa a duração do serviço; você pode mudar a duração ao aceitar um pedido ou ao agendar pela Agenda.
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {RULES.map((r) => (
          <Select
            key={r.key}
            label={r.label}
            hint={r.hint}
            disabled={isReadOnly}
            value={String(current[r.key])}
            onChange={(e) => setDraft({ ...current, [r.key]: Number(e.target.value) })}
          >
            {/* Valor salvo fora da lista (ex.: configurado antes) continua visível. */}
            {!r.options.some((o) => o.value === current[r.key]) && <option value={current[r.key]}>{current[r.key]}</option>}
            {r.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        ))}
      </div>
      {!isReadOnly && (
        <div className="mt-5 flex justify-end gap-3">
          {draft && <Button variant="secondary" onClick={() => setDraft(null)}>Descartar</Button>}
          <Button
            variant="primary"
            disabled={!draft}
            loading={saveSettings.isPending}
            onClick={() => draft && saveSettings.mutate(draft, {
              onSuccess: () => { setDraft(null); showToast('Regras salvas.', 'success'); },
              onError: (err) => showToast(errText(err), 'error'),
            })}
          >
            Salvar regras
          </Button>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

type BlockKind = NewTimeOff['kind'];

const Blocks: React.FC<{ blocks: TimeOff[] }> = ({ blocks }) => {
  const { clinic, profile, isReadOnly } = useAuth();
  const { showToast } = useToast();
  const { addTimeOff, removeTimeOff } = useAvailabilityMutations(clinic?.id, profile?.id);
  const [kind, setKind] = useState<BlockKind>('weekly');
  const [weekday, setWeekday] = useState(1);
  const [date, setDate] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:30');
  const [reason, setReason] = useState('');

  const reset = () => {
    setDate('');
    setStartsOn('');
    setEndsOn('');
    setReason('');
  };

  const add = () => {
    let input: NewTimeOff;
    if (kind !== 'period' && (!startTime || !endTime || endTime <= startTime)) {
      return showToast('O fim do bloqueio precisa ser depois do início.', 'error');
    }
    if (kind === 'weekly') {
      if (startsOn && endsOn && endsOn < startsOn) return showToast('A validade termina antes de começar.', 'error');
      input = { kind, weekday, startTime, endTime, startsOn: startsOn || undefined, endsOn: endsOn || undefined, reason };
    } else if (kind === 'date') {
      if (!date) return showToast('Escolha a data.', 'error');
      input = { kind, date, startTime, endTime, reason };
    } else {
      if (!startsOn) return showToast('Escolha a data inicial.', 'error');
      const end = endsOn || startsOn;
      if (end < startsOn) return showToast('A data final precisa ser igual ou depois da inicial.', 'error');
      input = { kind, startsOn, endsOn: end, reason };
    }
    addTimeOff.mutate(input, {
      onSuccess: () => {
        reset();
        showToast('Bloqueio salvo. Esse horário some da agenda online.', 'success');
      },
      onError: (err) => showToast(errText(err), 'error'),
    });
  };

  const KINDS: { value: BlockKind; label: string }[] = [
    { value: 'weekly', label: 'Toda semana' },
    { value: 'date', label: 'Em uma data' },
    { value: 'period', label: 'Dia inteiro ou período' },
  ];

  return (
    <Card as="section" radius="2xl" aria-labelledby="blocks-title">
      <div className="flex items-start gap-3">
        <CalendarOff className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
        <div>
          <h2 id="blocks-title" className="text-lg font-semibold text-slate-800">Bloqueios de horário</h2>
          <p className="mt-1 text-sm text-slate-600">Horários dentro da sua grade em que você não atende: eles somem da agenda online.</p>
        </div>
      </div>

      {blocks.length > 0 && (
        <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {blocks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-slate-800 first-letter:uppercase">
                {describeBlock(t)}
                {t.reason && <span className="text-slate-500"> · {t.reason}</span>}
              </span>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => removeTimeOff.mutate(t.id, { onError: (err) => showToast(errText(err), 'error') })}
                  aria-label={`Remover bloqueio: ${describeBlock(t)}`}
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
        <div className="mt-5 space-y-4 rounded-xl bg-slate-50 p-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de bloqueio">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={cn(
                  'rounded-xl px-3.5 py-2 text-sm font-medium ring-1 ring-inset transition-colors',
                  kind === k.value ? 'bg-[#5024fc] text-white ring-[#5024fc]' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kind === 'weekly' && (
              <Select label="Dia da semana" value={String(weekday)} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </Select>
            )}
            {kind === 'date' && <DateInput label="Data" value={date} onChange={setDate} />}
            {kind === 'period' && (
              <>
                <DateInput label="De" value={startsOn} onChange={setStartsOn} />
                <DateInput label="Até (opcional)" value={endsOn} onChange={setEndsOn} />
              </>
            )}
            {kind !== 'period' && (
              <>
                <Input label="Das" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                <Input label="Até" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </>
            )}
            <Input label="Motivo (opcional)" value={reason} maxLength={80} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: reunião, congresso" />
          </div>

          {kind === 'weekly' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DateInput label="A partir de (opcional)" value={startsOn} onChange={setStartsOn} />
              <DateInput label="Até (opcional)" value={endsOn} onChange={setEndsOn} />
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} loading={addTimeOff.isPending} onClick={add}>
              Adicionar bloqueio
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const Preview: React.FC = () => {
  const { profile } = useAuth();
  const [today] = useState(() => new Date());
  const [minutes, setMinutes] = useState(60);
  const slots = useStaffSlots({
    nutritionistId: profile?.id ?? null,
    from: format(today, 'yyyy-MM-dd'),
    to: format(addDays(today, 6), 'yyyy-MM-dd'),
    minutes,
    excludeAppointmentId: null,
    excludeRequestId: null,
    enabled: !!profile?.id,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots.data ?? []) {
      const k = format(new Date(s), 'yyyy-MM-dd');
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [slots.data]);

  return (
    <Card as="section" radius="2xl" aria-labelledby="preview-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
          <div>
            <h2 id="preview-title" className="text-lg font-semibold text-slate-800">O que o paciente vê nos próximos 7 dias</h2>
            <p className="mt-1 text-sm text-slate-600">Horários livres com as regras e bloqueios já salvos.</p>
          </div>
        </div>
        <Select aria-label="Duração da consulta na prévia" value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))} wrapperClassName="sm:w-44">
          {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>Consulta de {m} min</option>)}
        </Select>
      </div>

      {slots.isLoading ? (
        <div className="mt-5 h-24 animate-pulse rounded-xl bg-slate-100" />
      ) : byDay.size === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Nenhum horário livre nos próximos 7 dias com essas regras.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {[...byDay.entries()].map(([day, list]) => (
            <li key={day} className="flex flex-col gap-2 sm:flex-row sm:items-baseline">
              <span className="w-36 shrink-0 text-sm font-medium text-slate-700 first-letter:uppercase">
                {format(parseISO(day), "EEE, d 'de' MMM", { locale: ptBR })}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {list.map((s) => (
                  <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-700">
                    {format(new Date(s), 'HH:mm')}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export const AvailabilityPanel: React.FC = () => {
  const { profile } = useAuth();
  const { data, isLoading } = useAvailability(profile?.id);

  return (
    <div className="space-y-6">
      <WeeklyGrid ranges={data?.ranges ?? []} loading={isLoading} />
      {data && <Rules key={JSON.stringify(data.settings)} settings={data.settings ?? DEFAULT_SCHEDULE_SETTINGS} />}
      {data && <Blocks blocks={data.timeOff} />}
      {data && data.ranges.length > 0 && <Preview />}
    </div>
  );
};
