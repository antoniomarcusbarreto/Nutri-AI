import React, { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { usePortalAppointmentActions } from '../../hooks/queries/usePortal';
import type { PortalContext, PortalRequest } from '../../types/portal';
import { PickSlotModal } from './PickSlotModal';
import { PortalRequestNotice } from './PortalRequestNotice';

/**
 * Marcar retorno pelo app: o paciente escolhe um horário livre e a clínica
 * confirma. Mostra o pedido em aberto (ou a resposta recente) no lugar do botão.
 */

const errText = (err: unknown) =>
  (err instanceof Error && err.message) || (err as { message?: string })?.message || 'Não foi possível concluir. Tente novamente.';

export const PortalBookingSection: React.FC<{
  portal: PortalContext;
  requests: PortalRequest[];
  /** Esconde o convite para marcar quando já há consulta futura (só mostra pedidos). */
  hasUpcoming: boolean;
}> = ({ portal, requests, hasUpcoming }) => {
  const { showToast } = useToast();
  const { requestBooking } = usePortalAppointmentActions();
  const [open, setOpen] = useState(false);

  const bookings = requests.filter((r) => r.kind === 'booking');
  const openBooking = bookings.find((r) => r.status === 'pendente' || r.status === 'proposto');
  // Resposta recente da clínica (aceito / recusado) — só a mais nova, e só se não há pedido aberto.
  const recent = openBooking ? undefined : bookings.find((r) => r.status === 'aceito' || (r.status === 'recusado' && !r.declined_by_patient));

  const canBook = portal.active && portal.booking_enabled && !openBooking;
  if (!openBooking && !recent && (!canBook || hasUpcoming)) {
    return null;
  }

  return (
    <section aria-labelledby="booking-title" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 id="booking-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <CalendarPlus className="h-4 w-4 text-teal-700" aria-hidden="true" />
        {openBooking ? 'Seu pedido de consulta' : 'Marcar consulta'}
      </h2>

      {openBooking && <PortalRequestNotice request={openBooking} canAct={portal.active} />}
      {recent && <PortalRequestNotice request={recent} canAct={portal.active} />}

      {canBook && (
        <>
          {!recent && (
            <p className="text-sm text-slate-600">
              Escolha um horário livre na agenda de {portal.nutritionist_name || 'seu nutricionista'}. A clínica confirma em seguida.
            </p>
          )}
          <Button variant="primary" className="h-11 w-full sm:w-auto" leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Escolher horário
          </Button>
        </>
      )}

      <PickSlotModal
        open={open}
        onClose={() => setOpen(false)}
        patientId={portal.patient_id}
        appointmentId={null}
        title="Marcar consulta"
        description="Horários livres na agenda. A clínica confirma o pedido."
        submitLabel="Pedir este horário"
        submitting={requestBooking.isPending}
        clinicPhone={portal.clinic.phone}
        onSubmit={(slot, note) =>
          requestBooking.mutate(
            { slot, note },
            {
              onSuccess: () => {
                setOpen(false);
                showToast('Pedido enviado. A clínica confirma em breve.', 'success');
              },
              onError: (err) => showToast(errText(err), 'error'),
            },
          )
        }
      />
    </section>
  );
};
