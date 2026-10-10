import React, { useMemo, useState } from 'react';
import { format, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalMealPlan } from '../../hooks/queries/usePortal';
import { useMealLogMutations, useMealLogs, useMealPhotoUrls } from '../../hooks/queries/useMealLogs';
import { PortalCard, PortalPageHeader } from '../../components/portal/PortalPageHeader';
import { MealScanner, MealReview } from '../../components/meals/MealScanner';
import { MacroTiles, MealCard } from '../../components/meals/MealCard';
import { ConfirmDialog } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import { addMacros, EMPTY_MACROS, type MealLog } from '../../lib/mealLog';
import { sortMealKeys } from '../../types/mealPlan';

/** Diário alimentar do paciente (migration 0036). */
export const PortalMealsPage: React.FC = () => {
  const { patientPortal: p } = useAuth();
  const { showToast } = useToast();
  const patientId = p?.patient_id;
  const clinicId = p?.clinic_id;
  const plan = usePortalMealPlan(patientId);
  const logs = useMealLogs(patientId, 30);
  const [now] = useState(() => Date.now());
  const [toDelete, setToDelete] = useState<MealLog | null>(null);
  const { remove } = useMealLogMutations(patientId, clinicId);

  const all = useMemo(() => logs.data ?? [], [logs.data]);
  const photos = useMealPhotoUrls(all.map((l) => l.photo_path ?? '').filter(Boolean));
  const url = (l: MealLog) => (l.photo_path ? photos.data?.[l.photo_path] : undefined);

  const open = all.filter((l) => l.status !== 'completed');
  const done = all.filter((l) => l.status === 'completed');
  const today = done.filter((l) => isToday(new Date(l.eaten_at)));
  const todayTotals = today.reduce((acc, l) => addMacros(acc, l.macros), EMPTY_MACROS);
  const goal = plan.data?.kcal ?? null;
  const progress = goal ? Math.min(100, Math.round((todayTotals.kcal / goal) * 100)) : null;

  // Histórico (sem hoje), agrupado por dia com o total do dia.
  const byDay = useMemo(() => {
    const map = new Map<string, MealLog[]>();
    for (const l of done) {
      if (isToday(new Date(l.eaten_at))) continue;
      const k = format(new Date(l.eaten_at), 'yyyy-MM-dd');
      map.set(k, [...(map.get(k) ?? []), l]);
    }
    return [...map.entries()];
  }, [done]);

  if (!p) return null;
  const canWrite = p.active && !!clinicId;
  const planKeys = plan.data ? sortMealKeys(plan.data.meals) : [];

  return (
    <>
      <PortalPageHeader
        title="Diário alimentar"
        description="Fotografe ou descreva o que comeu. A IA estima os nutrientes e compara com o seu plano."
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
          <PortalCard className="lg:col-span-3 lg:row-start-1" id="meal-new" title="Registrar refeição" hint="A IA estima — você confere antes de salvar">
            {canWrite ? (
              <MealScanner patientId={p.patient_id} clinicId={clinicId!} planMealKeys={planKeys} />
            ) : (
              <p className="text-sm text-slate-600">Seu acesso está somente leitura. Peça a renovação ao seu nutricionista para registrar refeições.</p>
            )}
            {open.length > 0 && (
              <div className="mt-5 space-y-3">
                {open.map((l) => (
                  <MealReview key={l.id + l.status} log={l} patientId={p.patient_id} clinicId={clinicId!} photoUrl={url(l)} now={now} />
                ))}
              </div>
            )}
          </PortalCard>

          <PortalCard
            className="lg:col-span-2 lg:col-start-4 lg:row-span-2 lg:row-start-1 lg:self-start"
            id="meal-today"
            title="Hoje"
            hint={today.length ? `${today.length} ${today.length === 1 ? 'refeição registrada' : 'refeições registradas'}` : 'Nenhuma refeição registrada hoje'}
          >
            <div className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <p className="text-3xl font-semibold tabular-nums text-slate-900">
                    {todayTotals.kcal}
                    <span className="ml-1 text-sm font-normal text-slate-500">kcal{goal ? ` de ${goal}` : ''}</span>
                  </p>
                  {progress != null && <span className="text-sm tabular-nums text-slate-500">{progress}%</span>}
                </div>
                {progress != null && (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Calorias do dia em relação ao plano">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
              <MacroTiles {...todayTotals} compact />
              {today.length > 0 ? (
                <div className="space-y-2">
                  {today.map((l) => (
                    <MealCard key={l.id} log={l} photoUrl={url(l)} onDelete={canWrite ? () => setToDelete(l) : undefined} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center">
                  <UtensilsCrossed className="h-6 w-6 text-slate-400" aria-hidden="true" />
                  <p className="mt-2 text-sm text-slate-600">Registre sua primeira refeição do dia.</p>
                </div>
              )}
            </div>
          </PortalCard>

          <PortalCard
            className="lg:col-span-3 lg:row-start-2"
            id="meal-history"
            title="Dias anteriores"
            hint={byDay.length ? 'Últimos 30 dias' : 'Seus registros aparecem aqui'}
          >
            {logs.isLoading ? (
              <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
            ) : byDay.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum registro nos dias anteriores.</p>
            ) : (
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
                          {total.kcal} kcal{goal ? ` de ${goal}` : ''} · {total.protein}g prot
                        </span>
                      </div>
                      <div className="space-y-2">
                        {list.map((l) => (
                          <MealCard key={l.id} log={l} photoUrl={url(l)} onDelete={canWrite ? () => setToDelete(l) : undefined} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </PortalCard>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete, {
          onSuccess: () => { setToDelete(null); showToast('Registro excluído.', 'success'); },
          onError: () => showToast('Não foi possível excluir. Tente novamente.', 'error'),
        })}
        confirming={remove.isPending}
        title="Excluir registro?"
        message="Os nutrientes dessa refeição saem do seu diário. Seu nutricionista também deixa de ver este registro."
        confirmLabel="Excluir"
      />
    </>
  );
};
