import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ClipboardList, UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isHealthComplete, usePortalAppointments, usePortalHealth, usePortalMealPlan, usePortalRequests } from '../../hooks/queries/usePortal';
import { PortalBookingSection } from '../../components/portal/PortalBookingSection';
import { latestRescheduleByAppointment } from '../../types/portal';
import { PortalAppointmentCard } from '../../components/portal/PortalAppointmentCard';
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

const SectionTitle: React.FC<{ id: string; icon: React.ReactNode; title: string; to: string; linkLabel: string }> = ({ id, icon, title, to, linkLabel }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h2 id={id} className="flex items-center gap-2 text-base font-semibold text-slate-900">
      <span className="text-teal-700">{icon}</span>
      {title}
    </h2>
    <Link to={to} className="inline-flex items-center gap-1 rounded text-sm font-medium text-[#5024fc] hover:text-[#431cdb]">
      {linkLabel}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  </div>
);

const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-2xl bg-slate-200/60 ${className ?? ''}`} />
);

export const PortalHome: React.FC = () => {
  const { patientPortal } = useAuth();
  const patientId = patientPortal?.patient_id;
  const appointments = usePortalAppointments(patientId);
  const plan = usePortalMealPlan(patientId);
  const { data: requests = [] } = usePortalRequests(patientId);
  const health = usePortalHealth(patientId);
  const needsHealthForm = health.isSuccess && !isHealthComplete(health.data) && !!patientPortal?.active;
  const requestFor = latestRescheduleByAppointment(requests);
  const [now] = useState(() => Date.now());

  const next = (appointments.data ?? [])
    .filter((a) => new Date(a.date_time).getTime() > now && a.status !== 'cancelado' && a.status !== 'concluido')
    .sort((a, b) => a.date_time.localeCompare(b.date_time))[0];

  const mealKey = plan.data ? currentMealKey(plan.data.meals) : null;
  const firstName = patientPortal?.name?.split(' ')[0] ?? '';

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {greeting()}{firstName ? `, ${firstName}` : ''}
        </h1>
        {patientPortal?.nutritionist_name && (
          <p className="mt-1 text-sm text-slate-500">Acompanhamento com {patientPortal.nutritionist_name}</p>
        )}
      </div>

      {needsHealthForm && (
        <Link
          to="/portal/ficha"
          className="flex items-center gap-4 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 transition-colors hover:bg-teal-50"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-teal-700 ring-1 ring-teal-200">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-teal-900">Preencha sua ficha de saúde</span>
            <span className="block text-sm text-teal-800">Ajuda a preparar sua consulta. Leva uns 3 minutos.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
        </Link>
      )}

      <section aria-labelledby="home-next">
        <SectionTitle id="home-next" icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />} title="Próxima consulta" to="/portal/agenda" linkLabel="Todas" />
        {appointments.isLoading ? (
          <Skeleton className="h-36" />
        ) : appointments.isError ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Não foi possível carregar suas consultas. Tente de novo em instantes.</p>
        ) : next ? (
          <PortalAppointmentCard
            appointment={next}
            patientId={patientId!}
            canAct={!!patientPortal?.active}
            request={requestFor.get(next.id)}
            bookingEnabled={!!patientPortal?.booking_enabled}
            clinicPhone={patientPortal?.clinic.phone}
            featured
          />
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            Nenhuma consulta marcada.{patientPortal?.booking_enabled ? '' : ' Quando a clínica agendar, ela aparece aqui para você confirmar.'}
          </p>
        )}
      </section>

      {patientPortal && !appointments.isLoading && (
        <PortalBookingSection portal={patientPortal} requests={requests} hasUpcoming={!!next} />
      )}

      <section aria-labelledby="home-meal">
        <SectionTitle
          id="home-meal"
          icon={<UtensilsCrossed className="h-4 w-4" aria-hidden="true" />}
          title={mealKey ? `Agora: ${MEAL_NAMES[mealKey] ?? mealKey}` : 'Seu plano'}
          to="/portal/plano"
          linkLabel="Plano completo"
        />
        {plan.isLoading ? (
          <Skeleton className="h-48" />
        ) : plan.isError ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Não foi possível carregar seu plano. Tente mais tarde.</p>
        ) : plan.data && mealKey ? (
          <MealPlanView meals={plan.data.meals} only={[mealKey]} />
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            Seu plano alimentar aparece aqui assim que {patientPortal?.nutritionist_name || 'seu nutricionista'} publicar.
          </p>
        )}
      </section>
    </>
  );
};
