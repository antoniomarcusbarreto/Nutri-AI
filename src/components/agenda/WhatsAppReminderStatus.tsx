import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/cn';

interface ReminderRow {
  status: 'queued' | 'sent' | 'failed';
  response: 'confirmado' | 'cancelado' | 'opt_out' | null;
  sent_at: string | null;
  responded_at: string | null;
}

/**
 * Situação do lembrete automático pelo WhatsApp de um agendamento (migration 0038).
 * Não renderiza nada se a consulta ainda não teve lembrete.
 */
export const WhatsAppReminderStatus: React.FC<{ appointmentId: string }> = ({ appointmentId }) => {
  const { data } = useQuery({
    queryKey: ['whatsapp-reminder', appointmentId],
    queryFn: async (): Promise<ReminderRow | null> => {
      const { data, error } = await supabase
        .from('appointment_whatsapp_messages')
        .select('status, response, sent_at, responded_at')
        .eq('appointment_id', appointmentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ReminderRow | null;
    },
  });

  if (!data) return null;

  const when = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM 'às' HH:mm") : '');
  let text: string;
  let tone = 'text-slate-600';
  if (data.response === 'confirmado') {
    text = `Paciente confirmou pelo WhatsApp em ${when(data.responded_at)}`;
    tone = 'text-emerald-700';
  } else if (data.response === 'cancelado') {
    text = `Paciente desmarcou pelo WhatsApp em ${when(data.responded_at)}`;
    tone = 'text-rose-700';
  } else if (data.response === 'opt_out') {
    text = 'Paciente pediu para não receber mais lembretes';
  } else if (data.status === 'sent') {
    text = `Lembrete enviado em ${when(data.sent_at)}, aguardando resposta`;
  } else if (data.status === 'failed') {
    text = 'Não foi possível enviar o lembrete. Use o link abaixo.';
    tone = 'text-amber-700';
  } else {
    text = 'Lembrete sendo enviado…';
  }

  return (
    <p className={cn('flex items-center gap-1.5 text-xs font-semibold', tone)}>
      <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {text}
    </p>
  );
};
