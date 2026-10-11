import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { MessageCircle } from 'lucide-react';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/cn';
import { logger } from '../../lib/logger';
import { useToast } from '../../contexts/ToastContext';
import { describeReminderResult, reminderQueryKey, requestWhatsAppReminders } from '../../lib/whatsappReminders';

interface ReminderRow {
  kind: 'reminder' | 'manual';
  status: 'requested' | 'queued' | 'sent' | 'failed' | 'skipped';
  response: 'confirmado' | 'cancelado' | 'opt_out' | null;
  error: string | null;
  sent_at: string | null;
  responded_at: string | null;
}

interface Props {
  appointmentId: string;
  status: string;
  dateTime: string;
  canSend: boolean;
}

/**
 * Situação do lembrete pelo WhatsApp de um agendamento (migrations 0038/0039)
 * e o botão de envio manual. O botão só aparece para consulta pendente e
 * futura: quem já confirmou não recebe pedido de confirmação de novo.
 */
export const WhatsAppReminderStatus: React.FC<Props> = ({ appointmentId, status, dateTime, canSend }) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);

  const { data } = useQuery({
    queryKey: reminderQueryKey(appointmentId),
    queryFn: async (): Promise<ReminderRow | null> => {
      const { data, error } = await supabase
        .from('appointment_whatsapp_messages')
        .select('kind, status, response, error, sent_at, responded_at')
        .eq('appointment_id', appointmentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ReminderRow | null;
    },
  });

  const inQueue = data?.status === 'requested' || data?.status === 'queued';
  const showButton = canSend && status === 'pendente' && new Date(dateTime) > new Date() && !inQueue;

  const send = async () => {
    setSending(true);
    try {
      const result = await requestWhatsAppReminders([appointmentId]);
      const msg = describeReminderResult(result);
      showToast(msg.text, msg.type);
      await queryClient.invalidateQueries({ queryKey: reminderQueryKey(appointmentId) });
    } catch (err) {
      logger.error(err);
      showToast('Não foi possível pedir o lembrete pelo WhatsApp.', 'error');
    } finally {
      setSending(false);
    }
  };

  const when = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM 'às' HH:mm") : '');
  let text: string | null = null;
  let tone = 'text-slate-600';
  if (data) {
    if (data.response === 'confirmado') {
      text = `Paciente confirmou pelo WhatsApp em ${when(data.responded_at)}`;
      tone = 'text-emerald-700';
    } else if (data.response === 'cancelado') {
      text = `Paciente desmarcou pelo WhatsApp em ${when(data.responded_at)}`;
      tone = 'text-rose-700';
    } else if (data.response === 'opt_out') {
      text = 'Paciente pediu para não receber mais lembretes';
    } else if (inQueue) {
      text = 'Lembrete na fila, sai em alguns minutos';
    } else if (data.status === 'sent') {
      text = `Lembrete ${data.kind === 'manual' ? 'enviado pela equipe' : 'automático enviado'} em ${when(data.sent_at)}`;
    } else if (data.status === 'failed') {
      text = 'Não foi possível enviar o lembrete.';
      tone = 'text-amber-700';
    } else if (data.status === 'skipped') {
      text = `Lembrete não enviado: ${data.error ?? 'consulta mudou antes do envio'}.`;
    }
  } else if (status === 'confirmado') {
    text = 'Consulta confirmada: não precisa de lembrete.';
    tone = 'text-emerald-700';
  }

  if (!text && !showButton) return null;

  return (
    <div className="flex flex-col gap-2">
      {text && (
        <p className={cn('flex items-center gap-1.5 text-xs font-semibold', tone)}>
          <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {text}
        </p>
      )}
      {showButton && (
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="w-full bg-white hover:bg-primary-50 border border-primary-200 hover:border-primary-300 text-primary-750 font-extrabold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-60 cursor-pointer"
        >
          <WhatsAppIcon className="w-4 h-4 shrink-0 text-[#25D366]" />
          {sending ? 'Pedindo lembrete…' : data?.status === 'sent' ? 'Reenviar lembrete pelo WhatsApp' : 'Enviar lembrete pelo WhatsApp'}
        </button>
      )}
    </div>
  );
};
