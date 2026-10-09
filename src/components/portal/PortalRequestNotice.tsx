import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarCheck2, CalendarClock, CalendarX2 } from 'lucide-react';
import { Button } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { usePortalAppointmentActions } from '../../hooks/queries/usePortal';
import type { PortalRequest } from '../../types/portal';

/**
 * Situação de um pedido do paciente (remarcar ou retorno):
 *   pendente  → "aguardando a clínica" + desistir
 *   proposto  → a clínica sugeriu outra data: aceitar / recusar
 *   recusado  → a clínica não pôde atender (aviso por 14 dias)
 */

const when = (iso: string) => format(new Date(iso), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR });
const errText = (err: unknown) =>
  (err instanceof Error && err.message) || (err as { message?: string })?.message || 'Não foi possível concluir. Tente novamente.';

export const PortalRequestNotice: React.FC<{ request: PortalRequest; canAct: boolean }> = ({ request: r, canAct }) => {
  const { showToast } = useToast();
  const { respondProposal, cancelRequest } = usePortalAppointmentActions();
  const what = r.kind === 'booking' ? 'consulta' : 'novo horário';

  if (r.status === 'proposto' && r.proposed_at) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-blue-900">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          A clínica sugeriu outra data
        </p>
        <p className="mt-1 text-slate-700 first-letter:uppercase">{when(r.proposed_at)}</p>
        {r.response_note && <p className="mt-1 text-slate-600">&ldquo;{r.response_note}&rdquo;</p>}
        {canAct && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="primary"
              className="h-11 sm:h-auto"
              loading={respondProposal.isPending && respondProposal.variables?.accept === true}
              disabled={respondProposal.isPending}
              onClick={() =>
                respondProposal.mutate(
                  { requestId: r.id, accept: true },
                  {
                    onSuccess: () => showToast('Combinado! Sua consulta está confirmada.', 'success'),
                    onError: (err) => showToast(errText(err), 'error'),
                  },
                )
              }
            >
              Aceitar esta data
            </Button>
            <Button
              variant="secondary"
              className="h-11 sm:h-auto"
              loading={respondProposal.isPending && respondProposal.variables?.accept === false}
              disabled={respondProposal.isPending}
              onClick={() =>
                respondProposal.mutate(
                  { requestId: r.id, accept: false },
                  {
                    onSuccess: () => showToast('Sugestão recusada. Você pode escolher outro horário.', 'success'),
                    onError: (err) => showToast(errText(err), 'error'),
                  },
                )
              }
            >
              Não posso
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (r.status === 'pendente') {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-slate-800">
          <CalendarClock className="h-4 w-4 text-slate-500" aria-hidden="true" />
          Pedido de {what} enviado
        </p>
        {r.requested_at && <p className="mt-1 text-slate-700 first-letter:uppercase">{when(r.requested_at)}</p>}
        <p className="mt-1 text-slate-500">Aguardando a clínica confirmar.</p>
        <button
          type="button"
          disabled={cancelRequest.isPending}
          onClick={() =>
            cancelRequest.mutate(r.id, {
              onSuccess: () => showToast('Pedido retirado.', 'success'),
              onError: (err) => showToast(errText(err), 'error'),
            })
          }
          className="mt-2 rounded text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          Desistir do pedido
        </button>
      </div>
    );
  }

  if (r.status === 'aceito' && r.kind === 'booking') {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
        Consulta marcada. Ela aparece em &ldquo;Próximas&rdquo;.
      </p>
    );
  }

  if (r.status === 'recusado' && !r.declined_by_patient) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="flex items-center gap-2 font-semibold">
          <CalendarX2 className="h-4 w-4" aria-hidden="true" />
          A clínica não conseguiu atender {r.kind === 'booking' ? 'o pedido de consulta' : 'o pedido de remarcação'}
        </p>
        {r.response_note && <p className="mt-1">&ldquo;{r.response_note}&rdquo;</p>}
        <p className="mt-1">Escolha outro horário ou fale com a clínica.</p>
      </div>
    );
  }

  return null;
};
