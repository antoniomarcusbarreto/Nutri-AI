import React, { useState } from 'react';
import { Bug, CheckCircle2, Mail, Phone, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { reportToSupport } from '../../lib/support';
import { Button, Textarea } from '../ui';

/**
 * Relato de problema no app pelo paciente — vai direto pro mesmo webhook de
 * suporte da equipe (`reportToSupport`), marcado como `userRole: 'paciente'`.
 *
 * De propósito só existe "problema": dúvidas sobre plano/consulta são da
 * clínica (contato logo abaixo), e a IA de suporte não deve responder
 * pergunta clínica. A mensagem sai para um serviço externo, por isso o aviso
 * para não incluir dados de saúde.
 */
export const ReportProblemCard: React.FC = () => {
  const { patientPortal: p, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sent' | 'failed'>('idle');

  if (!p) return null;
  const clinic = p.clinic;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 10) return;
    setSending(true);
    const enviado = await reportToSupport({
      type: 'problema',
      userRole: 'paciente',
      message: message.trim(),
      userId: user?.id ?? null,
      userName: p.name,
      userEmail: p.email ?? user?.email ?? null,
      extra: { patientId: p.patient_id, clinicId: p.clinic_id },
    });
    setSending(false);
    setStatus(enviado ? 'sent' : 'failed');
    if (enviado) setMessage('');
  };

  return (
    <section className="rounded-3xl border border-slate-300/50 bg-white p-6 shadow-sm" aria-labelledby="profile-report">
      <h2 id="profile-report" className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Bug className="h-4 w-4 text-teal-700" aria-hidden="true" /> Problema no app?
      </h2>

      {status === 'sent' ? (
        <div role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Recebemos seu relato, obrigado. Nossa equipe técnica vai analisar.{' '}
            <button type="button" onClick={() => { setStatus('idle'); setOpen(true); }} className="font-medium underline underline-offset-2">
              Relatar outro
            </button>
          </p>
        </div>
      ) : !open ? (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Algo travou, não carregou ou não funcionou como deveria? Conte pra gente.
          </p>
          <Button variant="secondary" className="mt-4 h-10" leftIcon={<Bug className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Relatar um problema
          </Button>
        </>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <Textarea
            label="O que aconteceu?"
            required
            rows={4}
            minLength={10}
            maxLength={2000}
            autoFocus
            placeholder="Ex.: na tela de Diário, toquei em enviar foto e nada aconteceu."
            hint="Não inclua informações de saúde (medidas, exames, medicamentos). Já anexamos a tela em que você está e o seu aparelho."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {status === 'failed' && (
            <p role="alert" className="text-sm text-rose-600">
              Não foi possível enviar agora. Verifique sua conexão e tente de novo.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="primary"
              className="h-10"
              loading={sending}
              disabled={message.trim().length < 10}
              leftIcon={<Send className="h-4 w-4" />}
            >
              Enviar relato
            </Button>
            <Button type="button" variant="ghost" className="h-10" onClick={() => { setOpen(false); setStatus('idle'); }}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
        Dúvidas sobre seu plano, consultas ou alimentação são com a sua clínica
        {clinic.phone || clinic.email ? ':' : '.'}
        {clinic.phone && (
          <a href={`tel:${clinic.phone}`} className="ml-2 inline-flex items-center gap-1 font-medium text-[#5024fc] hover:text-[#431cdb]">
            <Phone className="h-3 w-3" aria-hidden="true" /> {clinic.phone}
          </a>
        )}
        {clinic.email && (
          <a href={`mailto:${clinic.email}`} className="ml-2 inline-flex items-center gap-1 font-medium text-[#5024fc] hover:text-[#431cdb]">
            <Mail className="h-3 w-3" aria-hidden="true" /> {clinic.email}
          </a>
        )}
      </p>
    </section>
  );
};
