/**
 * Peças compartilhadas do Dashboard. Status seguem o vocabulário do DESIGN.md:
 * concluído = positivo (emerald), confirmado = informação (blue),
 * pendente = âmbar, falta/sem registro = crítico (rose).
 */
export const APPOINTMENT_STATUS: Record<string, { label: string; className: string }> = {
  concluido: { label: 'Concluída', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  confirmado: { label: 'Confirmada', className: 'bg-blue-50 text-blue-700 border-blue-100' },
  pendente: { label: 'A confirmar', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  nao_compareceu: { label: 'Faltou', className: 'bg-rose-50 text-rose-700 border-rose-100' },
  sem_registro: { label: 'Sem registro', className: 'bg-rose-50 text-rose-700 border-rose-100' },
};

export const greeting = (d: Date) => (d.getHours() < 12 ? 'Bom dia' : d.getHours() < 18 ? 'Boa tarde' : 'Boa noite');

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "hoje 14:00", "amanhã 09:30", "qua., 08/10 14:00". */
export const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  const day = diff === 0 ? 'hoje' : diff === 1 ? 'amanhã'
    : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${day} ${fmtTime(iso)}`;
};

/** "há 3 dias", "há 2 meses". */
export const fmtAgo = (iso: string) => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 60) return `há ${days} dias`;
  return `há ${Math.floor(days / 30)} meses`;
};

/** Copia texto e devolve se deu certo (a permissão da área de transferência pode falhar). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
