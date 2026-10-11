import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../lib/logger';
import { describeReminderResult, reminderQueryKey, requestWhatsAppReminders } from '../../lib/whatsappReminders';
import { Button } from '../ui';

interface DayAppointment {
  id: string;
  status: string;
  date_time: string;
}

/**
 * Lembrete em lote pelo WhatsApp para as consultas do dia que ainda não foram
 * confirmadas (só pendentes e futuras; o banco refaz a checagem).
 */
export const DayRemindersCard: React.FC<{ appointments: DayAppointment[]; disabled?: boolean }> = ({ appointments, disabled }) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);

  const now = new Date();
  const unconfirmed = appointments.filter((a) => a.status === 'pendente' && new Date(a.date_time) > now);
  if (unconfirmed.length === 0) return null;

  const send = async () => {
    setSending(true);
    try {
      const result = await requestWhatsAppReminders(unconfirmed.map((a) => a.id));
      const msg = describeReminderResult(result);
      showToast(msg.text, msg.type);
      await Promise.all(unconfirmed.map((a) => queryClient.invalidateQueries({ queryKey: reminderQueryKey(a.id) })));
    } catch (err) {
      logger.error(err);
      showToast('Não foi possível pedir os lembretes pelo WhatsApp.', 'error');
    } finally {
      setSending(false);
    }
  };

  const n = unconfirmed.length;
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
      <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-primary-600" aria-hidden="true" />
        Lembrete pelo WhatsApp
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        {n} consulta{n > 1 ? 's' : ''} ainda sem confirmação. Quem já confirmou não recebe.
      </p>
      <Button type="button" className="w-full" onClick={send} disabled={sending || disabled}>
        <Send className="w-4 h-4 shrink-0" aria-hidden="true" />
        {sending ? 'Pedindo lembretes…' : `Enviar aos não confirmados (${n})`}
      </Button>
    </div>
  );
};
