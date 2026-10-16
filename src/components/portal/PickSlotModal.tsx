import React, { useState } from 'react';
import { addDays, format } from 'date-fns';
import { Button, Modal, Textarea } from '../ui';
import { SlotPicker } from '../scheduling/SlotPicker';
import { usePortalSlots } from '../../hooks/queries/usePortal';
import { ModalityToggle } from '../teleconsult/ModalityToggle';
import type { Modality } from '../../lib/teleconsult';

/**
 * Janela em que o paciente escolhe um horário livre da agenda do
 * nutricionista — para remarcar (`appointmentId`) ou marcar retorno (null).
 * Primeiro mostra 2 semanas; "mais datas" amplia até ~1 mês (limite do banco).
 */

const FIRST_WINDOW_DAYS = 13;
const MAX_WINDOW_DAYS = 31;

export interface PickSlotModalProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
  appointmentId: string | null;
  title: string;
  description: string;
  intro?: React.ReactNode;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (slot: string, note: string, modality: Modality) => void;
  clinicPhone?: string | null;
  /** Agendamento novo: o paciente escolhe presencial ou online (migration 0043). */
  askModality?: boolean;
}

export const PickSlotModal: React.FC<PickSlotModalProps> = ({
  open,
  onClose,
  patientId,
  appointmentId,
  title,
  description,
  intro,
  submitLabel,
  submitting,
  onSubmit,
  clinicPhone,
  askModality = false,
}) => {
  const [windowDays, setWindowDays] = useState(FIRST_WINDOW_DAYS);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [modality, setModality] = useState<Modality>('presencial');
  const [today] = useState(() => new Date());

  const from = format(today, 'yyyy-MM-dd');
  const to = format(addDays(today, windowDays), 'yyyy-MM-dd');
  const slots = usePortalSlots(patientId, from, to, appointmentId, open);

  const close = () => {
    setSlot(null);
    setNote('');
    setModality('presencial');
    setWindowDays(FIRST_WINDOW_DAYS);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>Voltar</Button>
          <Button variant="primary" disabled={!slot} loading={submitting} onClick={() => slot && onSubmit(slot, note, modality)}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {intro && <div className="text-sm text-slate-600">{intro}</div>}
        <SlotPicker
          slots={slots.data}
          loading={slots.isLoading}
          error={slots.isError}
          value={slot}
          onChange={setSlot}
          canLoadMore={windowDays < MAX_WINDOW_DAYS}
          onLoadMore={() => setWindowDays(MAX_WINDOW_DAYS)}
          emptyMessage={
            windowDays < MAX_WINDOW_DAYS ? (
              'Nenhum horário livre nas próximas duas semanas.'
            ) : (
              <>
                Nenhum horário livre no próximo mês.
                {clinicPhone ? <> Fale com a clínica: <a className="font-medium text-[#5024fc]" href={`tel:${clinicPhone}`}>{clinicPhone}</a>.</> : null}
              </>
            )
          }
        />
        {slot && askModality && (
          <ModalityToggle
            name="portal-booking-modality"
            label="Como prefere a consulta?"
            value={modality}
            onChange={setModality}
            large
          />
        )}
        {slot && (
          <Textarea
            label="Observação (opcional)"
            value={note}
            maxLength={500}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
};
