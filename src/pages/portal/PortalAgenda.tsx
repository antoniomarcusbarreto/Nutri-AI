import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAppointments } from '../../hooks/queries/usePortal';
import { PortalAppointmentCard } from '../../components/portal/PortalAppointmentCard';

export const PortalAgenda: React.FC = () => {
  const { patientPortal } = useAuth();
  const patientId = patientPortal?.patient_id;
  const { data, isLoading, isError } = usePortalAppointments(patientId);

  // Instante da abertura da tela (render puro; a lista recarrega a cada visita).
  const [now] = useState(() => Date.now());
  const all = data ?? [];
  const upcoming = all
    .filter((a) => new Date(a.date_time).getTime() > now && a.status !== 'concluido')
    .sort((a, b) => a.date_time.localeCompare(b.date_time));
  const past = all.filter((a) => !upcoming.includes(a));

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Consultas</h1>
        <p className="mt-1 text-sm text-slate-500">Confirme sua presença, peça outro horário ou cancele.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200/60" />)}
        </div>
      ) : isError ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Não foi possível carregar suas consultas. Tente mais tarde.</p>
      ) : (
        <>
          <section aria-labelledby="agenda-upcoming" className="space-y-3">
            <h2 id="agenda-upcoming" className="text-sm font-medium text-slate-500">Próximas</h2>
            {upcoming.length ? (
              upcoming.map((a) => (
                <PortalAppointmentCard key={a.id} appointment={a} patientId={patientId!} canAct={!!patientPortal?.active} />
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                Nenhuma consulta marcada.
                {patientPortal?.clinic.phone ? <> Para agendar, fale com a clínica: <a className="font-medium text-[#5024fc]" href={`tel:${patientPortal.clinic.phone}`}>{patientPortal.clinic.phone}</a>.</> : null}
              </p>
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="agenda-past" className="space-y-3">
              <h2 id="agenda-past" className="text-sm font-medium text-slate-500">Histórico</h2>
              {past.map((a) => (
                <PortalAppointmentCard key={a.id} appointment={a} patientId={patientId!} canAct={false} />
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
};
