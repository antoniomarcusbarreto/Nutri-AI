import React, { useState } from 'react';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, Copy, Mail, MessageCircle } from 'lucide-react';
import { Button, ConfirmDialog, Modal } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { usePortalAccessMutations, usePortalInviteStatus } from '../../hooks/queries/usePortal';
import { portalAccessState } from '../../types/portal';
import { cn } from '../../lib/cn';
import type { PatientRow } from '../../types/clinical';

/**
 * Acesso do paciente ao app (migration 0031): o nutricionista escolhe o prazo,
 * gera um link de convite de uso único (72h) e envia pelo canal que preferir.
 * O link só aparece uma vez — o banco guarda apenas o hash.
 */

const PRESETS = [30, 60, 90, 180] as const;

const errText = (err: unknown) =>
  (err instanceof Error && err.message) || (err as { message?: string })?.message || 'Não foi possível concluir. Tente novamente.';

const fmt = (d: Date | string) => format(new Date(d), "d 'de' MMMM 'de' yyyy", { locale: ptBR });

/** Fim do dia escolhido (o acesso vale até 23:59 daquela data). */
const endOfDayFromInput = (value: string) => new Date(`${value}T23:59:59`);

function whatsappUrl(phone: string | null, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '');
  const target = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
}

export interface PortalAccessModalProps {
  patient: Pick<PatientRow, 'id' | 'name' | 'email' | 'phone' | 'user_id' | 'portal_access_until'>;
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
}

export const PortalAccessModal: React.FC<PortalAccessModalProps> = ({ patient, open, onClose, readOnly }) => {
  const { showToast } = useToast();
  const { createInvite, setAccess } = usePortalAccessMutations(patient.id);
  const inviteStatus = usePortalInviteStatus(open ? patient.id : undefined);

  const [preset, setPreset] = useState<number | 'custom'>(90);
  const [customDate, setCustomDate] = useState(() => format(addDays(new Date(), 90), 'yyyy-MM-dd'));
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const state = portalAccessState(patient.portal_access_until);
  const hasAccount = !!patient.user_id && !!inviteStatus.data?.last_used_at;
  const pendingInvite = inviteStatus.data?.pending_expires_at;

  const accessUntil = (): Date | null => {
    if (preset !== 'custom') return endOfDayFromInput(format(addDays(new Date(), preset), 'yyyy-MM-dd'));
    if (!customDate) return null;
    const d = endOfDayFromInput(customDate);
    return d.getTime() > openedAt ? d : null;
  };

  const handleClose = () => {
    setLink(null);
    setCopied(false);
    onClose();
  };

  const generate = () => {
    const until = accessUntil();
    if (!until) {
      showToast('Escolha uma data futura para o fim do acesso.', 'error');
      return;
    }
    createInvite.mutate(until, {
      onSuccess: (token) => {
        setLink(`${window.location.origin}/convite/${token}`);
        setCopied(false);
      },
      onError: (err) => showToast(errText(err), 'error'),
    });
  };

  const updateDeadline = () => {
    const until = accessUntil();
    if (!until) {
      showToast('Escolha uma data futura para o fim do acesso.', 'error');
      return;
    }
    setAccess.mutate(until, {
      onSuccess: () => showToast(`Acesso de ${patient.name.split(' ')[0]} vale até ${fmt(until)}.`, 'success'),
      onError: (err) => showToast(errText(err), 'error'),
    });
  };

  const endAccess = () =>
    setAccess.mutate(null, {
      onSuccess: () => {
        setConfirmEnd(false);
        setLink(null);
        showToast('Acesso ao app encerrado.', 'success');
      },
      onError: (err) => showToast(errText(err), 'error'),
    });

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const firstName = patient.name.split(' ')[0];
  const message = link
    ? `Olá, ${firstName}! Liberei seu acesso ao app de acompanhamento, com seu plano alimentar e suas consultas. Abra o link para criar sua senha (vale por 3 dias): ${link}`
    : '';

  const statusLine = (() => {
    if (state === 'active') return { tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200', text: `Ativo até ${fmt(patient.portal_access_until!)}` };
    if (state === 'expired') return { tone: 'text-amber-800 bg-amber-50 ring-amber-200', text: `Somente leitura desde ${fmt(patient.portal_access_until!)}` };
    return { tone: 'text-slate-600 bg-slate-100 ring-slate-200', text: 'Sem acesso' };
  })();

  return (
    <>
      <Modal
        open={open && !confirmEnd}
        onClose={handleClose}
        title={`Acesso ao app — ${patient.name}`}
        footer={<Button variant="secondary" onClick={handleClose}>Fechar</Button>}
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', statusLine.tone)}>
              {statusLine.text}
            </span>
            <p className="text-sm text-slate-600">
              {hasAccount
                ? 'O paciente já criou a senha e entra com o e-mail cadastrado.'
                : pendingInvite
                  ? `Convite enviado e ainda não usado (vale até ${format(new Date(pendingInvite), "dd/MM 'às' HH:mm")}).`
                  : 'O paciente ainda não criou a senha.'}
              {state === 'expired' && ' Com o prazo vencido, ele vê o plano e as consultas, mas não confirma nem remarca.'}
            </p>
            {!patient.email && (
              <p className="text-sm text-rose-700">Cadastre o e-mail do paciente para gerar o convite.</p>
            )}
          </div>

          {link ? (
            <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
              <p className="text-sm font-semibold text-teal-900">Convite pronto — envie agora</p>
              <p className="text-xs text-teal-800">
                Este link só aparece uma vez e vale por 72 horas. Quem abrir recebe um código no e-mail{' '}
                <strong>{patient.email}</strong>, então só o paciente consegue entrar.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-white px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-xs text-slate-700">{link}</code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy}>
                  {copied ? 'Copiado' : 'Copiar link'}
                </Button>
                <a
                  href={whatsappUrl(patient.phone, message)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
                </a>
                <a
                  href={`mailto:${patient.email ?? ''}?subject=${encodeURIComponent('Seu acesso ao app de acompanhamento')}&body=${encodeURIComponent(message)}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" /> E-mail
                </a>
              </div>
            </div>
          ) : null}

          {!readOnly && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-900">
                {state === 'active' ? 'Mudar o prazo' : 'Por quanto tempo?'}
              </legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Duração do acesso">
                {PRESETS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    role="radio"
                    aria-checked={preset === days}
                    onClick={() => setPreset(days)}
                    className={cn(
                      'rounded-xl px-3.5 py-2 text-sm font-medium ring-1 ring-inset transition-colors',
                      preset === days ? 'bg-[#5024fc] text-white ring-[#5024fc]' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                    )}
                  >
                    {days} dias
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={preset === 'custom'}
                  onClick={() => setPreset('custom')}
                  className={cn(
                    'rounded-xl px-3.5 py-2 text-sm font-medium ring-1 ring-inset transition-colors',
                    preset === 'custom' ? 'bg-[#5024fc] text-white ring-[#5024fc]' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  Até uma data
                </button>
              </div>
              {preset === 'custom' && (
                <input
                  type="date"
                  aria-label="Acesso válido até"
                  value={customDate}
                  min={format(addDays(new Date(), 1), 'yyyy-MM-dd')}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[#5024fc] focus:outline-none focus:ring-1 focus:ring-[#5024fc]"
                />
              )}
              {accessUntil() && (
                <p className="text-xs text-slate-500">Acesso completo até {fmt(accessUntil()!)}. Depois, somente leitura.</p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant={hasAccount && state !== 'none' ? 'secondary' : 'primary'}
                  loading={createInvite.isPending}
                  disabled={!patient.email}
                  onClick={generate}
                >
                  {hasAccount || pendingInvite ? 'Gerar novo convite' : 'Gerar convite'}
                </Button>
                {hasAccount && state !== 'none' && (
                  <Button variant="primary" loading={setAccess.isPending} onClick={updateDeadline}>
                    {state === 'active' ? 'Salvar novo prazo' : 'Renovar acesso'}
                  </Button>
                )}
              </div>
              {hasAccount && (
                <p className="text-xs text-slate-500">
                  Para quem já tem senha, basta renovar o prazo. Gere um novo convite só se o paciente não conseguir entrar.
                </p>
              )}
            </fieldset>
          )}

          {!readOnly && state !== 'none' && (
            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setConfirmEnd(true)}
                className="rounded text-sm font-medium text-rose-700 hover:text-rose-800"
              >
                Encerrar acesso ao app
              </button>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmEnd}
        onCancel={() => setConfirmEnd(false)}
        onConfirm={endAccess}
        confirming={setAccess.isPending}
        title="Encerrar o acesso ao app?"
        message={`${firstName} deixa de ver o plano e as consultas no app. Convites ainda não usados também param de funcionar. Você pode liberar de novo quando quiser.`}
        confirmLabel="Encerrar acesso"
      />
    </>
  );
};
