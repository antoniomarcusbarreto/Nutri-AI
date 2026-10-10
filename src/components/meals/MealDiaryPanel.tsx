import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Camera } from 'lucide-react';
import { Card } from '../ui';
import { useMealLogs, useMealPhotoUrls } from '../../hooks/queries/useMealLogs';
import { addMacros, ADHERENCE, EMPTY_MACROS, type Adherence, type MealLog } from '../../lib/mealLog';
import { MealCard } from './MealCard';
import { cn } from '../../lib/cn';

/**
 * Diário alimentar do paciente na visão do nutricionista (Acompanhamento →
 * Diário). Só leitura: médias, aderência ao plano e os registros por dia.
 */
export const MealDiaryPanel: React.FC<{ patientId: string; planKcal: number | null; patientName: string }> = ({ patientId, planKcal, patientName }) => {
  const logs = useMealLogs(patientId, 30);
  const done = useMemo(() => (logs.data ?? []).filter((l) => l.status === 'completed'), [logs.data]);
  const photos = useMealPhotoUrls(done.map((l) => l.photo_path ?? '').filter(Boolean));

  const byDay = useMemo(() => {
    const map = new Map<string, MealLog[]>();
    for (const l of done) {
      const k = format(new Date(l.eaten_at), 'yyyy-MM-dd');
      map.set(k, [...(map.get(k) ?? []), l]);
    }
    return [...map.entries()];
  }, [done]);

  const days = byDay.length;
  const totalAll = done.reduce((acc, l) => addMacros(acc, l.macros), EMPTY_MACROS);
  const avg = days ? { kcal: Math.round(totalAll.kcal / days), protein: Math.round(totalAll.protein / days) } : null;
  const adherenceCount = done.reduce<Partial<Record<Adherence, number>>>((acc, l) => {
    if (l.adherence) acc[l.adherence] = (acc[l.adherence] ?? 0) + 1;
    return acc;
  }, {});
  const rated = done.filter((l) => l.adherence && l.adherence !== 'sem_plano').length;
  const onPlanPct = rated ? Math.round(((adherenceCount.segue_o_plano ?? 0) / rated) * 100) : null;

  return (
    <Card as="section" aria-labelledby="diary-title">
      <div className="mb-5">
        <h2 id="diary-title" className="text-lg font-semibold text-slate-800">Diário alimentar</h2>
        <p className="text-sm text-slate-500">
          Registros feitos por {patientName.split(' ')[0]} no app nos últimos 30 dias. Valores estimados por IA e revisados pelo paciente.
        </p>
      </div>

      {logs.isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-slate-200/70" />
      ) : done.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center">
          <Camera className="h-7 w-7 text-slate-400" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-700">Nenhuma refeição registrada</p>
          <p className="mt-0.5 text-xs text-slate-500">Quando o paciente usar o Diário alimentar no app, os registros aparecem aqui.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200/70">
              <p className="text-xs text-slate-500">Dias com registro</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{days}<span className="text-sm font-normal text-slate-500"> / 30</span></p>
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200/70">
              <p className="text-xs text-slate-500">Média por dia registrado</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{avg?.kcal}<span className="text-sm font-normal text-slate-500"> kcal</span></p>
              {planKcal ? <p className="text-xs text-slate-500">Plano: {planKcal} kcal</p> : null}
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200/70">
              <p className="text-xs text-slate-500">Proteína média</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{avg?.protein}<span className="text-sm font-normal text-slate-500"> g</span></p>
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200/70">
              <p className="text-xs text-slate-500">Refeições no plano</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{onPlanPct != null ? `${onPlanPct}%` : '—'}</p>
              <p className="text-xs text-slate-500">{rated} avaliadas pela IA</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(ADHERENCE) as Adherence[]).filter((k) => adherenceCount[k]).map((k) => (
              <span key={k} className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', ADHERENCE[k].className)}>
                {ADHERENCE[k].label}: {adherenceCount[k]}
              </span>
            ))}
          </div>

          <div className="space-y-5">
            {byDay.map(([day, list]) => {
              const total = list.reduce((acc, l) => addMacros(acc, l.macros), EMPTY_MACROS);
              return (
                <section key={day} aria-label={day}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-800 first-letter:uppercase">
                      {format(parseISO(day), "EEEE, d 'de' MMMM", { locale: ptBR })}
                    </h3>
                    <span className="text-xs tabular-nums text-slate-500">
                      {total.kcal} kcal{planKcal ? ` de ${planKcal}` : ''} · P {total.protein}g · C {total.carbs}g · G {total.fat}g
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {list.map((l) => (
                      <MealCard key={l.id} log={l} photoUrl={l.photo_path ? photos.data?.[l.photo_path] : undefined} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};
