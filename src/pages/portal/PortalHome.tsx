import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRight, CalendarX2, CheckCircle2, ChevronRight, Mail, Phone, UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAppointments, usePortalMealPlan, usePortalRequests } from '../../hooks/queries/usePortal';
import { latestRescheduleByAppointment } from '../../types/portal';
import { PortalAppointmentCard } from '../../components/portal/PortalAppointmentCard';
import { PortalCard, PortalPageHeader } from '../../components/portal/PortalPageHeader';
import { PortalRequestNotice } from '../../components/portal/PortalRequestNotice';
import { BookAppointmentButton } from '../../components/portal/BookAppointmentButton';
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
  <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded text-sm font-medium text-[#5024fc] hover:text-[#431cdb]">
    {children}
    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
  </Link>
);

const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className ?? ''}`} aria-hidden="true" />
);

/** Estado vazio dentro de card: ícone + frase, sem segunda moldura. */
const EmptyInCard: React.FC<{ icon: React.ReactNode; title: string; children?: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center">
    <span className="text-slate-400">{icon}</span>
    <p className="mt-2 text-sm font-medium text-slate-700">{title}</p>
    {children && <p className="mt-0.5 text-xs text-slate-500">{children}</p>}
  </div>
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
  const openBooking = requests.find((r) => r.kind === 'booking' && (r.status === 'pendente' || r.status === 'proposto'));

  const mealKey = plan.data ? currentMealKey(plan.data.meals) : null;
  const firstName = patientPortal?.name?.split(' ')[0] ?? '';
  const clinic = patientPortal?.clinic;
  const nutri = patientPortal?.nutritionist_name || 'seu nutricionista';

  const daysToNext = next ? differenceInCalendarDays(new Date(next.date_time), new Date(now)) : null;
  const nextHint = next
    ? daysToNext === 0 ? 'Hoje' : daysToNext === 1 ? 'Amanhã' : `Daqui a ${daysToNext} dias`
    : openBooking
      ? 'Seu pedido está com a clínica'
      : 'Nenhuma consulta marcada';

  return (
    <>
      <PortalPageHeader
        title={<>{greeting()}{firstName ? `, ${firstName}` : ''}</>}
        description={<span className="first-letter:uppercase">{format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}</span>}
        actions={<BookAppointmentButton />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <PortalCard
          id="home-next"
          title="Próxima consulta"
          hint={nextHint}
          action={<LinkMore to="/portal/agenda">Consultas</LinkMore>}
          className="lg:col-span-3"
        >
          {appointments.isLoading ? (
            <Skeleton className="h-36" />
          ) : appointments.isError ? (
            <p className="text-sm text-slate-600">Não foi possível carregar suas consultas. Tente de novo em instantes.</p>
          ) : next ? (
            <PortalAppointmentCard
              appointment={next}
              patientId={patientId!}
              canAct={!!patientPortal?.active}
              request={requestFor.get(next.id)}
              bookingEnabled={!!patientPortal?.booking_enabled}
              clinicPhone={clinic?.phone}
              featured
              bare
            />
          ) : openBooking ? (
            <PortalRequestNotice request={openBooking} canAct={!!patientPortal?.active} />
          ) : (
            <EmptyInCard icon={<CalendarX2 className="h-7 w-7" aria-hidden="true" />} title="Agenda livre">
              {patientPortal?.booking_enabled
                ? 'Use "Marcar consulta" no topo para escolher um horário.'
                : `Quando ${nutri} agendar, a consulta aparece aqui para você confirmar.`}
            </EmptyInCard>
          )}
        </PortalCard>

        <PortalCard
          id="home-tasks"
          title="Para fazer"
          hint={tasksLoading ? 'Carregando…' : tasks.length === 0 ? 'Nada pedindo sua atenção' : `${tasks.length} ${tasks.length === 1 ? 'item pede' : 'itens pedem'} sua atenção`}
          className="lg:col-span-2"
        >
          {tasksLoading ? (
            <Skeleton className="h-28" />
          ) : tasks.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-8 text-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-emerald-700">Tudo em dia</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.key}>
                  <Link
                    to={t.to}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300"
                  >
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
        </PortalCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <PortalCard
          id="home-meal"
          title={mealKey ? `Agora: ${MEAL_NAMES[mealKey] ?? mealKey}` : 'Seu plano alimentar'}
          hint={plan.data ? `Do seu plano${plan.data.kcal ? ` de ${plan.data.kcal} kcal/dia` : ''}` : undefined}
          action={<LinkMore to="/portal/plano">Plano completo</LinkMore>}
          className="lg:col-span-3"
        >
          {plan.isLoading ? (
            <Skeleton className="h-40" />
          ) : plan.isError ? (
            <p className="text-sm text-slate-600">Não foi possível carregar seu plano. Tente mais tarde.</p>
          ) : plan.data && mealKey ? (
            <MealPlanView meals={plan.data.meals} only={[mealKey]} plain />
          ) : (
            <EmptyInCard icon={<UtensilsCrossed className="h-7 w-7" aria-hidden="true" />} title="Plano ainda não publicado">
              Ele aparece aqui assim que {nutri} montar.
            </EmptyInCard>
          )}
        </PortalCard>

        {patientPortal && (
          <PortalCard id="home-care" title="Seu acompanhamento" hint="Quem cuida de você" className="lg:col-span-2">
            <div className="space-y-4">
              {patientPortal.nutritionist_name && (
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-50 text-sm font-semibold text-teal-800" aria-hidden="true">
                    {patientPortal.nutritionist_name.replace(/^(dra?\.?\s+)/i, '').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{patientPortal.nutritionist_name}</p>
                    <p className="text-xs text-slate-500">
                      Nutricionista{patientPortal.nutritionist_crn ? ` · CRN ${patientPortal.nutritionist_crn}` : ''}
                    </p>
                  </div>
                </div>
              )}
              {clinic?.name && (
                <div className="border-t border-slate-200/70 pt-4 text-sm">
                  <p className="font-medium text-slate-800">{clinic.name}</p>
                  <div className="mt-2 space-y-1.5">
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
                </div>
              )}
              {plan.data && (
                <p className="border-t border-slate-200/70 pt-4 text-xs text-slate-500">
                  Plano atualizado em {format(new Date(plan.data.created_at), 'dd/MM/yyyy')}
                </p>
              )}
            </div>
          </PortalCard>
        )}
      </div>
    </>
  );
};
