import React, { useState } from 'react';
import { CalendarClock, CheckCircle2, Clock, MapPin, Video, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button, Modal, Textarea } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { usePortalAppointmentActions } from '../../hooks/queries/usePortal';
import { isActionable, type AppointmentStatus, type PortalAppointment, type PortalRequest } from '../../types/portal';
import { PickSlotModal } from './PickSlotModal';
import { PortalRequestNotice } from './PortalRequestNotice';
import { cn } from '../../lib/cn';

const STATUS: Record<AppointmentStatus, { label: string; className: string }> = {
  pendente: { label: 'Aguardando sua confirmação', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  confirmado: { label: 'Confirmada', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  concluido: { label: 'Realizada', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  cancelado: { label: 'Cancelada', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

const errText = (err: unknown) => (err instanceof Error && err.message) || (err as { message?: string })?.message || 'Não foi possível concluir. Tente novamente.';

export interface PortalAppointmentCardProps {
  appointment: PortalAppointment;
  patientId: string;
  /** Prazo de acesso vigente: sem isso, só leitura. */
  canAct: boolean;
  /** Destaque maior (próxima consulta na tela inicial). */
  featured?: boolean;
  /** Sem moldura própria: o cartão vive dentro de um card de seção. */
  bare?: boolean;
  /** Pedido de remarcação desta consulta (aberto ou respondido há pouco). */
  request?: PortalRequest;
  /** O nutricionista tem grade configurada: dá para escolher horário pelo app. */
  bookingEnabled?: boolean;
  clinicPhone?: string | null;
}

export const PortalAppointmentCard: React.FC<PortalAppointmentCardProps> = ({ appointment: a, patientId, canAct, featured, bare, request, bookingEnabled, clinicPhone }) => {
  const { showToast } = useToast();
  const { confirm, cancel, requestReschedule } = usePortalAppointmentActions();
  const [dialog, setDialog] = useState<'cancel' | 'reschedule' | null>(null);
  const [note, setNote] = useState('');

  const date = new Date(a.date_time);
  const status = STATUS[a.status] ?? STATUS.pendente;
  const actionable = canAct && isActionable(a);
  const openRequest = request && (request.status === 'pendente' || request.status === 'proposto') ? request : undefined;
  const hasPendingReschedule = !!openRequest || a.pending_request_kind === 'reschedule';
  const online = (a.modality ?? '').toLowerCase().includes('online');

  const closeDialog = () => {
    setDialog(null);
    setNote('');
  };

  const onConfirm = () =>
    confirm.mutate(a.id, {
      onSuccess: () => showToast('Presença confirmada. Até lá!', 'success'),
      onError: (err) => showToast(errText(err), 'error'),
    });

  const onCancel = () =>
    cancel.mutate(
      { appointmentId: a.id, note },
      {
        onSuccess: () => {
          closeDialog();
          showToast('Consulta cancelada. A clínica foi avisada.', 'success');
        },
        onError: (err) => showToast(errText(err), 'error'),
      },
    );

  const onReschedule = (slot: string, slotNote: string) =>
    requestReschedule.mutate(
      { appointmentId: a.id, slot, note: slotNote },
      {
        onSuccess: () => {
          closeDialog();
          showToast('Pedido enviado. A clínica confirma o novo horário em breve.', 'success');
        },
        onError: (err) => showToast(errText(err), 'error'),
      },
    );

  return (
    <article className={cn(!bare && 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', !bare && featured && 'sm:p-6')}>
      <div className="flex items-start gap-4">
        <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-teal-50 py-2 text-teal-800">
          <span className="text-[11px] font-medium uppercase tracking-wide">{format(date, 'MMM', { locale: ptBR })}</span>
          <span className="text-2xl font-semibold leading-none tabular-nums">{format(date, 'd')}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('font-semibold text-slate-900 first-letter:uppercase', featured ? 'text-lg' : 'text-base')}>
            {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {format(date, 'HH:mm')}
              {a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}
            </span>
            {a.modality && (
              <span className="inline-flex items-center gap-1.5">
                {online ? <Video className="h-3.5 w-3.5" aria-hidden="true" /> : <MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="capitalize">{a.modality}</span>
              </span>
            )}
          </p>
          {(a.service_name || a.nutritionist_name) && (
            <p className="mt-1 truncate text-sm text-slate-500">
              {[a.service_name, a.nutritionist_name].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', status.className)}>
              {status.label}
            </span>
            {hasPendingReschedule && a.status !== 'cancelado' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                {openRequest?.status === 'proposto' ? 'Nova data sugerida' : 'Remarcação pedida'}
              </span>
            )}
          </div>
        </div>
      </div>

      {request && a.status !== 'cancelado' && (
        <div className="mt-4">
          <PortalRequestNotice request={request} canAct={canAct} />
        </div>
      )}

      {actionable && (
        <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap">
          {a.status === 'pendente' && (
            <Button
              variant="primary"
              className="h-11 sm:h-auto"
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
              loading={confirm.isPending}
              onClick={onConfirm}
            >
              Confirmar presença
            </Button>
          )}
          {!hasPendingReschedule && bookingEnabled && (
            <Button
              variant="secondary"
              className="h-11 sm:h-auto"
              leftIcon={<CalendarClock className="h-4 w-4" />}
              onClick={() => setDialog('reschedule')}
            >
              Pedir outro horário
            </Button>
          )}
          <Button
            variant="ghost"
            className="h-11 text-rose-700 hover:bg-rose-50 sm:h-auto"
            leftIcon={<XCircle className="h-4 w-4" />}
            onClick={() => setDialog('cancel')}
          >
            Cancelar consulta
          </Button>
          {!hasPendingReschedule && !bookingEnabled && (
            <p className="text-center text-sm text-slate-500 sm:basis-full sm:text-left">
              {clinicPhone
                ? <>Para remarcar, fale com a clínica: <a className="font-medium text-[#5024fc]" href={`tel:${clinicPhone}`}>{clinicPhone}</a></>
                : 'Para remarcar, fale com a clínica.'}
            </p>
          )}
        </div>
      )}

      <PickSlotModal
        open={dialog === 'reschedule'}
        onClose={closeDialog}
        patientId={patientId}
        appointmentId={a.id}
        title="Escolher outro horário"
        description="Horários livres na agenda. A clínica confirma a troca."
        intro={<>Sua consulta de <strong className="font-semibold text-slate-900">{format(date, "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}</strong> continua marcada até a clínica confirmar.</>}
        submitLabel="Pedir este horário"
        submitting={requestReschedule.isPending}
        onSubmit={onReschedule}
        clinicPhone={clinicPhone}
      />

      <Modal
        open={dialog === 'cancel'}
        onClose={closeDialog}
        title="Cancelar esta consulta?"
        description="A clínica é avisada na hora."
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>Manter consulta</Button>
            <Button variant="danger" loading={cancel.isPending} onClick={onCancel}>Cancelar consulta</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {format(date, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}. {bookingEnabled ? <>Se preferir só mudar o horário, use &ldquo;Pedir outro horário&rdquo;.</> : null}
          </p>
          <Textarea
            label="Quer contar o motivo? (opcional)"
            value={note}
            maxLength={500}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Modal>
    </article>
  );
};
