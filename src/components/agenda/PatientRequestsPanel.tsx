import React, { useState } from 'react';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarClock, CalendarPlus, Hourglass, Smartphone, XCircle } from 'lucide-react';
import { Button, DateInput, Input, Modal, Textarea } from '../ui';
import { SlotPicker } from '../scheduling/SlotPicker';
import { useStaffSlots } from '../../hooks/queries/usePortal';
import type { AppointmentChangeRequest } from '../../types/portal';

/**
 * Pedidos feitos pelo paciente no app (migrations 0031/0032):
 *   - remarcar / marcar retorno num horário escolhido: Aceitar (a consulta
 *     muda/nasce na hora), Sugerir outra data (vale quando o paciente aceitar)
 *     ou Recusar;
 *   - cancelamentos: só tomar ciência;
 *   - pedidos antigos sem horário escolhido: "Reagendar" abre a consulta.
 */

export interface PatientRequestAppointment {
  id: string;
  date_time: string;
  patients?: { name?: string | null } | null;
}

export interface PatientRequestsPanelProps {
  requests: AppointmentChangeRequest[];
  appointmentById: (id: string | null) => PatientRequestAppointment | undefined;
  /** Duração (min) do serviço — para achar horários livres ao sugerir data. */
  serviceMinutes: (serviceId: string | null) => number;
  onReschedule: (appointmentId: string) => void;
  onResolve: (requestId: string, status: 'aceito' | 'recusado') => void;
  onPropose: (requestId: string, proposedAt: string, note: string, done: () => void) => void;
  proposing: boolean;
  resolvingId: string | null;
  readOnly?: boolean;
}

const fmtWhen = (iso: string) => format(new Date(iso), "EEE, dd/MM 'às' HH:mm", { locale: ptBR });

const ProposeModal: React.FC<{
  request: AppointmentChangeRequest | null;
  minutes: number;
  onClose: () => void;
  onSubmit: (proposedAt: string, note: string) => void;
  submitting: boolean;
}> = ({ request, minutes, onClose, onSubmit, submitting }) => {
  const [today] = useState(() => new Date());
  const [windowDays, setWindowDays] = useState(13);
  const [slot, setSlot] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [note, setNote] = useState('');

  const slots = useStaffSlots({
    nutritionistId: request?.nutritionist_id ?? null,
    from: format(today, 'yyyy-MM-dd'),
    to: format(addDays(today, windowDays), 'yyyy-MM-dd'),
    minutes,
    excludeAppointmentId: request?.appointment_id ?? null,
    excludeRequestId: request?.id ?? null,
    enabled: !!request && !manual,
  });

  const manualIso = manual && manualDate && manualTime ? new Date(`${manualDate}T${manualTime}:00`).toISOString() : null;
  const chosen = manual ? manualIso : slot;

  const close = () => {
    setSlot(null);
    setManual(false);
    setManualDate('');
    setManualTime('');
    setNote('');
    setWindowDays(13);
    onClose();
  };

  return (
    <Modal
      open={!!request}
      onClose={close}
      title="Sugerir outra data"
      description="O paciente recebe a sugestão no app e confirma por lá."
      footer={
        <>
          <Button variant="secondary" onClick={close}>Voltar</Button>
          <Button variant="primary" disabled={!chosen} loading={submitting} onClick={() => chosen && onSubmit(chosen, note)}>
            Enviar sugestão
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {request?.requested_at && (
          <p className="text-sm text-slate-600">
            {request.patients?.name ?? 'O paciente'} pediu <strong className="font-semibold text-slate-900">{fmtWhen(request.requested_at)}</strong>.
          </p>
        )}
        {manual ? (
          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Data" value={manualDate} onChange={setManualDate} />
            <Input label="Horário" type="time" value={manualTime} onChange={(e) => setManualTime(e.target.value)} />
          </div>
        ) : (
          <SlotPicker
            slots={slots.data}
            loading={slots.isLoading}
            error={slots.isError}
            value={slot}
            onChange={setSlot}
            canLoadMore={windowDays < 31}
            onLoadMore={() => setWindowDays(31)}
            emptyMessage="Nenhum horário livre na sua grade neste período."
          />
        )}
        <button
          type="button"
          onClick={() => setManual((m) => !m)}
          className="rounded text-sm font-medium text-[#5024fc] hover:text-[#431cdb]"
        >
          {manual ? 'Escolher entre os horários livres' : 'Escolher data e hora fora da grade'}
        </button>
        <Textarea
          label="Mensagem para o paciente (opcional)"
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
};

export const PatientRequestsPanel: React.FC<PatientRequestsPanelProps> = ({
  requests,
  appointmentById,
  serviceMinutes,
  onReschedule,
  onResolve,
  onPropose,
  proposing,
  resolvingId,
  readOnly,
}) => {
  const [proposeFor, setProposeFor] = useState<AppointmentChangeRequest | null>(null);
  if (requests.length === 0) return null;

  const actionable = requests.filter((r) => r.status === 'pendente').length;

  return (
    <section aria-labelledby="patient-requests-title" className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
      <h2 id="patient-requests-title" className="flex items-center gap-2 text-sm font-semibold text-blue-900">
        <Smartphone className="h-4 w-4" aria-hidden="true" />
        Pedidos de pacientes pelo app
        {actionable > 0 && (
          <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">{actionable}</span>
        )}
      </h2>

      <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-blue-100 bg-white">
        {requests.map((r) => {
          const apt = appointmentById(r.appointment_id);
          const name = r.patients?.name ?? apt?.patients?.name ?? 'Paciente';
          const busy = resolvingId === r.id;
          const waitingPatient = r.status === 'proposto';

          let Icon = CalendarClock;
          let verb = 'quer remarcar';
          if (r.kind === 'cancel') { Icon = XCircle; verb = 'cancelou a consulta'; }
          if (r.kind === 'booking') { Icon = CalendarPlus; verb = 'pediu uma consulta'; }

          return (
            <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-slate-900">
                  <Icon className={`h-4 w-4 ${r.kind === 'cancel' ? 'text-rose-600' : 'text-blue-700'}`} aria-hidden="true" />
                  {name}
                  <span className="font-normal text-slate-500">
                    {verb}
                    {r.kind !== 'booking' && apt ? ` (consulta de ${fmtWhen(apt.date_time)})` : ''}
                  </span>
                </p>
                {r.requested_at && !waitingPatient && (
                  <p className="text-sm text-slate-700">
                    <span className="text-slate-500">Horário escolhido:</span> <span className="font-medium">{fmtWhen(r.requested_at)}</span>
                  </p>
                )}
                {r.preferred_times && (
                  <p className="text-sm text-slate-700"><span className="text-slate-500">Prefere:</span> {r.preferred_times}</p>
                )}
                {waitingPatient && r.proposed_at && (
                  <p className="flex items-center gap-1.5 text-sm text-slate-600">
                    <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
                    Você sugeriu {fmtWhen(r.proposed_at)}. Aguardando o paciente.
                  </p>
                )}
                {r.note && <p className="text-sm text-slate-600">&ldquo;{r.note}&rdquo;</p>}
                <p className="text-xs text-slate-400">Pedido em {format(new Date(r.created_at), "dd/MM 'às' HH:mm")}</p>
              </div>

              {!readOnly && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {r.kind === 'cancel' ? (
                    <Button size="sm" variant="secondary" loading={busy} onClick={() => onResolve(r.id, 'aceito')}>
                      Ciente
                    </Button>
                  ) : waitingPatient ? (
                    <Button size="sm" variant="ghost" loading={busy} onClick={() => onResolve(r.id, 'recusado')}>
                      Retirar sugestão
                    </Button>
                  ) : r.requested_at ? (
                    <>
                      <Button size="sm" variant="primary" loading={busy} onClick={() => onResolve(r.id, 'aceito')}>
                        Aceitar
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setProposeFor(r)}>
                        Sugerir outra data
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onResolve(r.id, 'recusado')}>
                        Recusar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="primary" disabled={!apt || busy} onClick={() => r.appointment_id && onReschedule(r.appointment_id)}>
                        Reagendar
                      </Button>
                      <Button size="sm" variant="ghost" loading={busy} onClick={() => onResolve(r.id, 'recusado')}>
                        Recusar
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ProposeModal
        request={proposeFor}
        minutes={serviceMinutes(proposeFor?.service_id ?? null)}
        onClose={() => setProposeFor(null)}
        submitting={proposing}
        onSubmit={(at, note) => proposeFor && onPropose(proposeFor.id, at, note, () => setProposeFor(null))}
      />
    </section>
  );
};
