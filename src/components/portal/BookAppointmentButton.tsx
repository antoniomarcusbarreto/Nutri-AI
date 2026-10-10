import React, { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { usePortalAppointmentActions, usePortalRequests } from '../../hooks/queries/usePortal';
import { PickSlotModal } from './PickSlotModal';

/**
 * Ação principal "Marcar consulta" no topo das páginas do portal (como o
 * "Novo agendamento" do painel). Só aparece quando o paciente pode marcar:
 * acesso vigente, agenda online configurada e nenhum pedido de consulta aberto.
 */
const errText = (err: unknown) =>
  (err instanceof Error && err.message) || (err as { message?: string })?.message || 'Não foi possível concluir. Tente novamente.';

export const BookAppointmentButton: React.FC = () => {
  const { patientPortal: p } = useAuth();
  const { showToast } = useToast();
  const { data: requests = [] } = usePortalRequests(p?.patient_id);
  const { requestBooking } = usePortalAppointmentActions();
  const [open, setOpen] = useState(false);

  const hasOpenBooking = requests.some((r) => r.kind === 'booking' && (r.status === 'pendente' || r.status === 'proposto'));
  if (!p || !p.active || !p.booking_enabled || hasOpenBooking) return null;

  return (
    <>
      <Button variant="primary" leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
        Marcar consulta
      </Button>
      <PickSlotModal
        open={open}
        onClose={() => setOpen(false)}
        patientId={p.patient_id}
        appointmentId={null}
        title="Marcar consulta"
        description="Horários livres na agenda. A clínica confirma o pedido."
        submitLabel="Pedir este horário"
        submitting={requestBooking.isPending}
        clinicPhone={p.clinic.phone}
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
    </>
  );
};
