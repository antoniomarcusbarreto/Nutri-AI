import { useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { openReceipt } from './receipt';
import type { PaymentRecord } from './financeModel';

/** Emite o recibo com os dados da clínica; assina o profissional do atendimento (ou quem emite). */
export function useIssueReceipt() {
  const { clinic, profile } = useAuth();
  const { showToast } = useToast();

  return useCallback((payment: PaymentRecord) => {
    const address = [clinic?.address, clinic?.complement, clinic?.neighborhood].filter(Boolean).join(', ');
    const city = [clinic?.city, clinic?.state].filter(Boolean).join('/');
    const ok = openReceipt(payment, {
      clinicName: clinic?.name ?? 'Consultório',
      clinicAddress: [address, city].filter(Boolean).join(' — ') || null,
      clinicCity: clinic?.city ?? null,
      clinicPhone: clinic?.phone ?? null,
      clinicEmail: clinic?.email ?? null,
      professionalName: payment.profiles?.full_name ?? profile?.full_name ?? '',
      professionalCrn: payment.profiles?.crn ?? (payment.profiles ? null : profile?.crn ?? null),
    });
    if (!ok) showToast('O navegador bloqueou a janela do recibo. Libere pop-ups para este site.', 'error');
  }, [clinic, profile, showToast]);
}
