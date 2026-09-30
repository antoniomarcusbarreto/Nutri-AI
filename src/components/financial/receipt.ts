import { amountInWords, brl, fmtDay, METHOD_LABEL, type PaymentRecord } from './financeModel';

interface ReceiptIssuer {
  clinicName: string;
  clinicAddress?: string | null;
  clinicCity?: string | null;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
  /** Profissional que assina (o do atendimento; senão quem emite). */
  professionalName: string;
  professionalCrn?: string | null;
}

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const formatCpf = (cpf: string | null | undefined) => {
  const d = (cpf ?? '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf ?? '';
};

/**
 * Abre o recibo numa janela própria e dispara a impressão (o navegador
 * oferece "Salvar como PDF"). Documento isolado: não herda o CSS do painel,
 * então sai igual em qualquer tema. Retorna false se o pop-up foi bloqueado.
 */
export function openReceipt(payment: PaymentRecord, issuer: ReceiptIssuer): boolean {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return false;

  const patient = payment.patients;
  const cpf = formatCpf(patient?.cpf);
  const paidAt = payment.paid_at ?? payment.due_date;
  const place = issuer.clinicCity ? `${esc(issuer.clinicCity)}, ` : '';
  const number = payment.id.slice(0, 8).toUpperCase();
  const contact = [issuer.clinicPhone, issuer.clinicEmail].filter(Boolean).map(esc).join(' · ');

  win.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Recibo ${number} — ${esc(patient?.name)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Inter,Roboto,Arial,sans-serif;color:#0f172a;margin:0;padding:48px;background:#fff}
  .sheet{max-width:680px;margin:0 auto;border:1px solid #cbd5e1;border-radius:16px;padding:40px}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:1px solid #e2e8f0;padding-bottom:20px}
  h1{font-size:22px;font-weight:600;margin:0;letter-spacing:.02em}
  .muted{color:#64748b;font-size:12px;line-height:1.5}
  .amount{font-size:22px;font-weight:600;color:#0f172a;white-space:nowrap;border:1px solid #cbd5e1;border-radius:10px;padding:8px 14px}
  .body{font-size:15px;line-height:1.8;margin:28px 0}
  dl{display:grid;grid-template-columns:140px 1fr;gap:6px 12px;font-size:13px;margin:0 0 28px}
  dt{color:#64748b} dd{margin:0}
  .sign{margin-top:64px;text-align:center}
  .line{border-top:1px solid #0f172a;width:320px;margin:0 auto 6px}
  .actions{max-width:680px;margin:0 auto 16px;text-align:right}
  .actions button{font:inherit;font-size:14px;border:0;border-radius:10px;padding:10px 18px;background:#5024fc;color:#fff;cursor:pointer}
  @media print{body{padding:0}.actions{display:none}.sheet{border:0}}
</style></head>
<body>
  <div class="actions"><button onclick="window.print()">Imprimir / salvar PDF</button></div>
  <div class="sheet">
    <header>
      <div>
        <h1>RECIBO</h1>
        <div class="muted">Nº ${number}</div>
        <div class="muted" style="margin-top:8px">${esc(issuer.clinicName)}${issuer.clinicAddress ? `<br>${esc(issuer.clinicAddress)}` : ''}${contact ? `<br>${contact}` : ''}</div>
      </div>
      <div class="amount">${brl(payment.net_amount)}</div>
    </header>
    <p class="body">
      Recebi de <strong>${esc(patient?.name)}</strong>${cpf ? `, CPF ${esc(cpf)},` : ''}
      a importância de <strong>${brl(payment.net_amount)}</strong> (${esc(amountInWords(payment.net_amount))}),
      referente a <strong>${esc(payment.description)}</strong>.
    </p>
    <dl>
      <dt>Data do atendimento</dt><dd>${fmtDay(payment.due_date)}</dd>
      <dt>Data do pagamento</dt><dd>${fmtDay(paidAt)}</dd>
      <dt>Forma de pagamento</dt><dd>${payment.method ? METHOD_LABEL[payment.method] : '—'}</dd>
      ${payment.discount > 0 ? `<dt>Valor original</dt><dd>${brl(payment.amount)} (desconto de ${brl(payment.discount)})</dd>` : ''}
    </dl>
    <p class="muted">${place}${fmtDay(paidAt, "dd 'de' MMMM 'de' yyyy")}.</p>
    <div class="sign">
      <div class="line"></div>
      <div>${esc(issuer.professionalName)}</div>
      ${issuer.professionalCrn ? `<div class="muted">Nutricionista · CRN ${esc(issuer.professionalCrn)}</div>` : '<div class="muted">Nutricionista</div>'}
    </div>
  </div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},250)})</script>
</body></html>`);
  win.document.close();
  return true;
}
