import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRight, CheckCircle2, ChevronRight, Mail, Phone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAppointments, usePortalMealPlan, usePortalRequests } from '../../hooks/queries/usePortal';
import { PortalBookingSection } from '../../components/portal/PortalBookingSection';
import { latestRescheduleByAppointment } from '../../types/portal';
import { PortalAppointmentCard } from '../../components/portal/PortalAppointmentCard';
import { PortalPageHeader, PortalSection } from '../../components/portal/PortalPageHeader';
import { usePortalTasks } from '../../components/portal/usePortalTasks';
import { MealPlanView } from '../../components/mealplan/MealPlanView';
import { MEAL_NAMES, sortMealKeys } from '../../types/mealPlan';

/** Refeição do horário atual (minutos desde 00:00 → chave do plano). */
const MEAL_WINDOWS: [number, string][] = [
  [9 * 60 + 30, 'breakfast'],
  [11 * 60 + 30, 'morning_snack'],
  [14 * 60 + 30, 'lunch'],
  [17 * 60 + 30, 'afternoon_snack'],
  [20 * 60 + 30, 'dinner'],
  [24 * 60, 'supper'],
];

function currentMealKey(meals: Record<string, unknown>, now = new Date()): string | null {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const target = (MEAL_WINDOWS.find(([limit]) => minutes < limit) ?? MEAL_WINDOWS[0])[1];
  const keys = sortMealKeys(meals);
  if (keys.includes(target)) return target;
  // Plano sem essa refeição: a próxima do dia, senão a primeira.
  const order = Object.keys(MEAL_NAMES);
  return keys.find((k) => order.indexOf(k) > order.indexOf(target)) ?? keys[0] ?? null;
}

const greeting = (now = new Date()) => {
  const h = now.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

const LinkMore: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="inline-flex items-center gap-1 rounded text-sm font-medium text-[#5024fc] hover:text-[#431cdb]">
    {children}
    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
  </Link>
);

const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-2xl bg-slate-200/60 ${className ?? ''}`} />
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">{children}</p>
);

export const PortalHome: React.FC = () => {
  const { patientPortal } = useAuth();
  const patientId = patientPortal?.patient_id;
  const appointments = usePortalAppointments(patientId);
  const plan = usePortalMealPlan(patientId);
  const { data: requests = [] } = usePortalRequests(patientId);
  const { tasks, loading: tasksLoading } = usePortalTasks();
  const requestFor = latestRescheduleByAppointment(requests);
  const [now] = useState(() => Date.now());

  const next = (appointments.data ?? [])
    .filter((a) => new Date(a.date_time).getTime() > now && a.status !== 'cancelado' && a.status !== 'concluido')
    .sort((a, b) => a.date_time.localeCompare(b.date_time))[0];

  const mealKey = plan.data ? currentMealKey(plan.data.meals) : null;
  const firstName = patientPortal?.name?.split(' ')[0] ?? '';
  const clinic = patientPortal?.clinic;

  return (
    <>
      <PortalPageHeader
        title={<>{greeting()}{firstName ? `, ${firstName}` : ''}</>}
        description={<span className="first-letter:uppercase">{format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}</span>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
        {/* Para fazer: primeiro no DOM (no celular vem antes); no desktop vai para a coluna lateral. */}
        <PortalSection id="home-tasks" title="Para fazer" className="lg:col-start-2 lg:row-start-1">
          {tasksLoading ? (
            <Skeleton className="h-24" />
          ) : tasks.length === 0 ? (
            <p className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              Tudo em dia por aqui.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {tasks.map((t) => (
                <li key={t.key}>
                  <Link to={t.to} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#5024fc]" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">{t.title}</span>
                      <span className="block text-xs text-slate-500">{t.detail}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PortalSection>

        <div className="space-y-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <PortalSection id="home-next" title="Próxima consulta" action={<LinkMore to="/portal/agenda">Todas</LinkMore>}>
            {appointments.isLoading ? (
              <Skeleton className="h-40" />
            ) : appointments.isError ? (
              <Empty>Não foi possível carregar suas consultas. Tente de novo em instantes.</Empty>
            ) : next ? (
              <PortalAppointmentCard
                appointment={next}
                patientId={patientId!}
                canAct={!!patientPortal?.active}
                request={requestFor.get(next.id)}
                bookingEnabled={!!patientPortal?.booking_enabled}
                clinicPhone={clinic?.phone}
                featured
              />
            ) : (
              <Empty>
                Nenhuma consulta marcada.{patientPortal?.booking_enabled ? '' : ' Quando a clínica agendar, ela aparece aqui para você confirmar.'}
              </Empty>
            )}
          </PortalSection>

          {patientPortal && !appointments.isLoading && (
            <PortalBookingSection portal={patientPortal} requests={requests} hasUpcoming={!!next} />
          )}

          <PortalSection
            id="home-meal"
            title={mealKey ? `Agora: ${MEAL_NAMES[mealKey] ?? mealKey}` : 'Seu plano'}
            action={<LinkMore to="/portal/plano">Plano completo</LinkMore>}
          >
            {plan.isLoading ? (
              <Skeleton className="h-48" />
            ) : plan.isError ? (
              <Empty>Não foi possível carregar seu plano. Tente mais tarde.</Empty>
            ) : plan.data && mealKey ? (
              <MealPlanView meals={plan.data.meals} only={[mealKey]} />
            ) : (
              <Empty>Seu plano alimentar aparece aqui assim que {patientPortal?.nutritionist_name || 'seu nutricionista'} publicar.</Empty>
            )}
          </PortalSection>
        </div>

        {patientPortal && (
          <PortalSection id="home-care" title="Seu acompanhamento" className="lg:col-start-2 lg:row-start-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              {patientPortal.nutritionist_name && (
                <div>
                  <p className="text-sm font-semibold text-slate-900">{patientPortal.nutritionist_name}</p>
                  <p className="text-xs text-slate-500">
                    Nutricionista{patientPortal.nutritionist_crn ? ` · CRN ${patientPortal.nutritionist_crn}` : ''}
                  </p>
                </div>
              )}
              {clinic?.name && <p className="mt-3 text-sm text-slate-700">{clinic.name}</p>}
              {(clinic?.phone || clinic?.email) && (
                <div className="mt-3 space-y-1.5 text-sm">
                  {clinic.phone && (
                    <a href={`tel:${clinic.phone}`} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
                      <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /> {clinic.phone}
                    </a>
                  )}
                  {clinic.email && (
                    <a href={`mailto:${clinic.email}`} className="flex min-w-0 items-center gap-2 text-slate-600 hover:text-slate-900">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" /> <span className="truncate">{clinic.email}</span>
                    </a>
                  )}
                </div>
              )}
              {plan.data && (
                <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  Plano atualizado em {format(new Date(plan.data.created_at), 'dd/MM/yyyy')}
                  {plan.data.kcal ? <> · <span className="tabular-nums">{plan.data.kcal}</span> kcal/dia</> : null}
                </p>
              )}
            </div>
          </PortalSection>
        )}
      </div>
    </>
  );
};
