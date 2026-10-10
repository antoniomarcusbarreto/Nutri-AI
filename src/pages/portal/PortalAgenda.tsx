import React, { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarX2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAppointments, usePortalRequests } from '../../hooks/queries/usePortal';
import { PortalAppointmentCard } from '../../components/portal/PortalAppointmentCard';
import { PortalRequestNotice } from '../../components/portal/PortalRequestNotice';
import { BookAppointmentButton } from '../../components/portal/BookAppointmentButton';
import { PortalCard, PortalPageHeader } from '../../components/portal/PortalPageHeader';
import { latestRescheduleByAppointment, type AppointmentStatus } from '../../types/portal';
import { cn } from '../../lib/cn';

const PAST_STATUS: Record<AppointmentStatus, { label: string; className: string }> = {
  pendente: { label: 'Não confirmada', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  confirmado: { label: 'Confirmada', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  concluido: { label: 'Realizada', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  cancelado: { label: 'Cancelada', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export const PortalAgenda: React.FC = () => {
  const { patientPortal } = useAuth();
  const patientId = patientPortal?.patient_id;
  const { data, isLoading, isError } = usePortalAppointments(patientId);
  const { data: requests = [] } = usePortalRequests(patientId);
  const requestFor = latestRescheduleByAppointment(requests);

  // Instante da abertura da tela (render puro; a lista recarrega a cada visita).
  const [now] = useState(() => Date.now());
  const all = data ?? [];
  const upcoming = all
    .filter((a) => new Date(a.date_time).getTime() > now && a.status !== 'concluido')
    .sort((a, b) => a.date_time.localeCompare(b.date_time));
  const past = all.filter((a) => !upcoming.includes(a));

  const bookings = requests.filter((r) => r.kind === 'booking');
  const openBooking = bookings.find((r) => r.status === 'pendente' || r.status === 'proposto');
  const recentBooking = openBooking ? undefined : bookings.find((r) => r.status === 'aceito' || (r.status === 'recusado' && !r.declined_by_patient));
  const bookingNotice = openBooking ?? recentBooking;
  const phone = patientPortal?.clinic.phone;

  return (
    <>
      <PortalPageHeader
        title="Consultas"
        description="Confirme sua presença, peça outro horário, cancele ou marque um retorno."
        actions={<BookAppointmentButton />}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <PortalCard
          id="agenda-upcoming"
          title="Próximas"
          hint={isLoading ? 'Carregando…' : upcoming.length ? `${upcoming.length} ${upcoming.length === 1 ? 'consulta' : 'consultas'}` : 'Nenhuma consulta marcada'}
          className="lg:col-span-3"
        >
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200/70" />)}
            </div>
          ) : isError ? (
            <p className="text-sm text-slate-600">Não foi possível carregar suas consultas. Tente mais tarde.</p>
          ) : upcoming.length ? (
            <ul className="divide-y divide-slate-200/70">
              {upcoming.map((a) => (
                <li key={a.id} className="py-5 first:pt-0 last:pb-0">
                  <PortalAppointmentCard
                    appointment={a}
                    patientId={patientId!}
                    canAct={!!patientPortal?.active}
                    request={requestFor.get(a.id)}
                    bookingEnabled={!!patientPortal?.booking_enabled}
                    clinicPhone={phone}
                    bare
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center">
              <CalendarX2 className="h-7 w-7 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-slate-700">Nenhuma consulta marcada</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {patientPortal?.booking_enabled
                  ? 'Use "Marcar consulta" no topo para escolher um horário.'
                  : phone
                    ? <>Para agendar, fale com a clínica: <a className="font-medium text-[#5024fc]" href={`tel:${phone}`}>{phone}</a></>
                    : 'Para agendar, fale com a clínica.'}
              </p>
            </div>
          )}
        </PortalCard>

        <div className="space-y-6 lg:col-span-2">
          {bookingNotice && (
            <PortalCard id="agenda-booking" title="Seu pedido de consulta" hint="Pedido feito pelo app">
              <PortalRequestNotice request={bookingNotice} canAct={!!patientPortal?.active} />
            </PortalCard>
          )}

          <PortalCard id="agenda-past" title="Histórico" hint={past.length ? `${past.length} ${past.length === 1 ? 'consulta' : 'consultas'}` : 'Ainda sem consultas anteriores'}>
            {past.length ? (
              <ul className="divide-y divide-slate-200/70">
                {past.slice(0, 12).map((a) => {
                  const st = PAST_STATUS[a.status] ?? PAST_STATUS.concluido;
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800 first-letter:uppercase">
                          {format(new Date(a.date_time), "EEE, d 'de' MMM 'de' yyyy", { locale: ptBR })}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {[format(new Date(a.date_time), 'HH:mm'), a.service_name].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', st.className)}>{st.label}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Suas consultas anteriores aparecem aqui.</p>
            )}
          </PortalCard>
        </div>
      </div>
    </>
  );
};
