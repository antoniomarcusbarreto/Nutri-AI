// supabase/functions/_shared/digest-email.ts
// Modelo do resumo diário por e-mail (nutricionista e secretária).
//
// Só monta o HTML/texto a partir de dados já buscados e filtrados — quem chama
// é responsável pelo isolamento (a versão da secretária nunca recebe a parte
// clínica nem valores recebidos). Seções sem conteúdo não aparecem.

export const APP_URL = "https://nutri-ai.io";

export type DigestAppointment = {
  time: string;            // "08:00"
  patient: string;
  kind: string;            // "Primeira consulta", "Retorno"...
  confirmed: boolean;
};
export type DigestAgendaGroup = { nutritionist?: string; appointments: DigestAppointment[] };
export type DigestPortalRequest = { patient: string; what: string; when: string };
export type DigestCharge = { patient: string; amount: number; detail?: string };
export type DigestPatientNote = { patient: string; note: string };

export type DigestData = {
  audience: "nutri" | "secretary";
  recipientFirstName: string;
  dateLabel: string;       // "terça-feira, 13 de outubro"
  agenda: DigestAgendaGroup[];
  portalRequests: DigestPortalRequest[];
  problemReports: DigestPatientNote[];
  finance: {
    receivedYesterday?: number;   // só nutricionista
    dueToday: DigestCharge[];
    overdue: DigestCharge[];
  };
  clinical?: {                    // só nutricionista
    attention: DigestPatientNote[];
    newExams: DigestPatientNote[];
    diaryInactive: DigestPatientNote[];
  };
  returnsDue: DigestPatientNote[];
  birthdays: DigestPatientNote[];
  preferencesUrl: string;
};

const C = {
  ink: "#0f172a", body: "#475569", muted: "#94a3b8", line: "#e2e8f0",
  soft: "#f8fafc", teal: "#0d9488", tealSoft: "#ccfbf1", action: "#5024fc",
  warn: "#b45309", warnSoft: "#fef3c7", danger: "#b91c1c", dangerSoft: "#fee2e2",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const badge = (label: string, fg: string, bg: string) =>
  `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;color:${fg};background:${bg};white-space:nowrap;">${escapeHtml(label)}</span>`;

function section(title: string, count: number | null, inner: string) {
  return `<tr><td style="padding:24px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.teal};">${escapeHtml(title)}${count !== null ? ` <span style="color:${C.muted};font-weight:600;">· ${count}</span>` : ""}</td>
</tr></table>
<div style="height:10px;line-height:10px;">&nbsp;</div>
${inner}
</td></tr>`;
}

function rows(items: string[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px;border-collapse:separate;">
${items.map((it, i) => `<tr><td style="padding:12px 14px;${i ? `border-top:1px solid ${C.line};` : ""}font-size:14px;line-height:1.5;color:${C.body};">${it}</td></tr>`).join("")}
</table>`;
}

const noteRow = (n: DigestPatientNote) =>
  `<strong style="color:${C.ink};">${escapeHtml(n.patient)}</strong><br><span>${escapeHtml(n.note)}</span>`;

function agendaRows(group: DigestAgendaGroup) {
  return rows(group.appointments.map((a) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="56" valign="top" style="font-size:15px;font-weight:700;color:${C.ink};">${escapeHtml(a.time)}</td>
<td valign="top" style="font-size:14px;color:${C.body};"><strong style="color:${C.ink};">${escapeHtml(a.patient)}</strong><br>${escapeHtml(a.kind)}</td>
<td align="right" valign="top" style="font-size:13px;">${a.confirmed
    ? badge("Confirmada", C.teal, C.tealSoft)
    : badge("Sem confirmação", C.warn, C.warnSoft)}</td>
</tr></table>`));
}

function chargeRows(list: DigestCharge[]) {
  return list.map((c) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:14px;color:${C.body};"><strong style="color:${C.ink};">${escapeHtml(c.patient)}</strong>${c.detail ? `<br>${escapeHtml(c.detail)}` : ""}</td>
<td align="right" style="font-size:14px;font-weight:700;color:${C.ink};white-space:nowrap;">${brl(c.amount)}</td>
</tr></table>`);
}

export function renderDailyDigest(d: DigestData): { subject: string; html: string; text: string } {
  const isNutri = d.audience === "nutri";
  const appts = d.agenda.flatMap((g) => g.appointments);
  const unconfirmed = appts.filter((a) => !a.confirmed).length;
  const pendingCount = d.portalRequests.length + d.problemReports.length;
  const overdueTotal = d.finance.overdue.reduce((s, c) => s + c.amount, 0);

  const subject = appts.length
    ? `Seu dia: ${plural(appts.length, "consulta", "consultas")}${unconfirmed ? `, ${unconfirmed} sem confirmação` : ""}${pendingCount ? ` e ${plural(pendingCount, "pendência", "pendências")}` : ""}`
    : pendingCount ? `Seu dia: ${plural(pendingCount, "pendência", "pendências")}` : "Seu dia: agenda livre";

  // Resumo em números no topo
  const stats: [string, string][] = [
    [String(appts.length), appts.length === 1 ? "consulta hoje" : "consultas hoje"],
    [String(unconfirmed), "sem confirmação"],
    [String(pendingCount), pendingCount === 1 ? "pendência" : "pendências"],
  ];
  if (isNutri && d.finance.receivedYesterday !== undefined) stats.push([brl(d.finance.receivedYesterday), "recebido ontem"]);
  else stats.push([String(d.finance.overdue.length), "cobranças atrasadas"]);

  const statsHtml = `<tr><td style="padding:20px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border-radius:12px;"><tr>
${stats.map(([v, l]) => `<td width="25%" align="center" valign="top" style="padding:14px 6px;"><div style="font-size:20px;font-weight:800;color:${C.ink};">${escapeHtml(v)}</div><div style="font-size:12px;color:${C.body};margin-top:2px;">${escapeHtml(l)}</div></td>`).join("")}
</tr></table></td></tr>`;

  const parts: string[] = [];

  // Agenda
  if (appts.length) {
    const inner = d.agenda.filter((g) => g.appointments.length).map((g) =>
      (g.nutritionist ? `<p style="margin:14px 0 8px;font-size:14px;font-weight:700;color:${C.ink};">${escapeHtml(g.nutritionist)} <span style="color:${C.muted};font-weight:500;">· ${plural(g.appointments.length, "consulta", "consultas")}</span></p>` : "") +
      agendaRows(g)).join("");
    parts.push(section("Agenda de hoje", appts.length, inner));
  } else {
    parts.push(section("Agenda de hoje", null, `<p style="margin:0;font-size:14px;color:${C.body};">Nenhuma consulta marcada para hoje.</p>`));
  }

  // Pendências
  if (pendingCount) {
    const items = [
      ...d.portalRequests.map((r) => `<strong style="color:${C.ink};">${escapeHtml(r.patient)}</strong> ${badge(r.what, C.action, "#ede9fe")}<br>${escapeHtml(r.when)}`),
      ...d.problemReports.map((r) => `<strong style="color:${C.ink};">${escapeHtml(r.patient)}</strong> ${badge("Relatou um problema", C.danger, C.dangerSoft)}<br>"${escapeHtml(r.note)}"`),
    ];
    parts.push(section("Aguardando resposta", pendingCount, rows(items)));
  }

  // Financeiro
  if (d.finance.dueToday.length || d.finance.overdue.length) {
    let inner = "";
    if (d.finance.dueToday.length) {
      inner += `<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${C.ink};">Para receber hoje</p>${rows(chargeRows(d.finance.dueToday))}`;
    }
    if (d.finance.overdue.length) {
      inner += `<p style="margin:${d.finance.dueToday.length ? "16px" : "0"} 0 8px;font-size:14px;font-weight:600;color:${C.danger};">Em atraso · ${brl(overdueTotal)}</p>${rows(chargeRows(d.finance.overdue))}`;
    }
    parts.push(section("Cobranças", null, inner));
  }

  // Clínico (só nutricionista)
  if (isNutri && d.clinical) {
    const c = d.clinical;
    const items = [
      ...c.attention.map((n) => `${badge("Ponto de atenção", C.warn, C.warnSoft)}<br>${noteRow(n)}`),
      ...c.newExams.map((n) => `${badge("Exame novo", C.teal, C.tealSoft)}<br>${noteRow(n)}`),
      ...c.diaryInactive.map((n) => `${badge("Diário parado", "#475569", "#e2e8f0")}<br>${noteRow(n)}`),
    ];
    if (items.length) parts.push(section("Seus pacientes", items.length, rows(items)));
  }

  // Retornos vencidos
  if (d.returnsDue.length) {
    parts.push(section("Retornos para agendar", d.returnsDue.length, rows(d.returnsDue.map(noteRow))));
  }

  // Aniversariantes
  if (d.birthdays.length) {
    parts.push(section("Aniversariantes de hoje", d.birthdays.length, rows(d.birthdays.map((b) => `🎂 ${noteRow(b)}`))));
  }

  const intro = isNutri
    ? "Aqui está o resumo do seu dia no Nutri-AI."
    : "Aqui está o resumo do dia da clínica no Nutri-AI.";

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 8px;"><tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="width:720px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:${FONT};">
<tr><td style="background:${C.ink};padding:22px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><span style="font-size:22px;font-weight:800;color:#ffffff;">Nutri<span style="color:#14b8a6;">-AI</span></span></td>
<td align="right" style="font-size:13px;color:#cbd5e1;">${escapeHtml(d.dateLabel)}</td>
</tr></table></td></tr>
<tr><td style="padding:28px 32px 0;">
<p style="margin:0 0 6px;font-size:20px;font-weight:700;color:${C.ink};">Bom dia, ${escapeHtml(d.recipientFirstName)}!</p>
<p style="margin:0;font-size:15px;line-height:1.6;color:${C.body};">${intro}</p>
</td></tr>
${statsHtml}
${parts.join("\n")}
<tr><td style="height:32px;line-height:32px;">&nbsp;</td></tr>
<tr><td style="padding:18px 32px;background:${C.soft};border-top:1px solid ${C.line};">
<p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};">Você recebe este resumo porque ativou os resumos por e-mail no Nutri-AI. <a href="${d.preferencesUrl}" style="color:${C.muted};">Alterar dias, horário ou desativar</a>.</p>
</td></tr>
</table></td></tr></table></body></html>`;

  // Versão texto (clientes sem HTML)
  const t: string[] = [`Bom dia, ${d.recipientFirstName}! ${intro}`, d.dateLabel, ""];
  t.push(`AGENDA DE HOJE (${appts.length})`);
  for (const g of d.agenda) {
    if (g.nutritionist && g.appointments.length) t.push(`- ${g.nutritionist}`);
    for (const a of g.appointments) t.push(`  ${a.time}  ${a.patient} · ${a.kind}${a.confirmed ? "" : " · SEM CONFIRMAÇÃO"}`);
  }
  if (pendingCount) {
    t.push("", `AGUARDANDO RESPOSTA (${pendingCount})`);
    d.portalRequests.forEach((r) => t.push(`  ${r.patient}: ${r.what} · ${r.when}`));
    d.problemReports.forEach((r) => t.push(`  ${r.patient}: relatou um problema · "${r.note}"`));
  }
  if (d.finance.dueToday.length || d.finance.overdue.length) {
    t.push("", "COBRANÇAS");
    d.finance.dueToday.forEach((c) => t.push(`  Hoje: ${c.patient} · ${brl(c.amount)}`));
    d.finance.overdue.forEach((c) => t.push(`  Atraso: ${c.patient} · ${brl(c.amount)}${c.detail ? ` · ${c.detail}` : ""}`));
  }
  if (isNutri && d.clinical) {
    const c = d.clinical;
    if (c.attention.length + c.newExams.length + c.diaryInactive.length) {
      t.push("", "SEUS PACIENTES");
      c.attention.forEach((n) => t.push(`  Atenção: ${n.patient} · ${n.note}`));
      c.newExams.forEach((n) => t.push(`  Exame novo: ${n.patient} · ${n.note}`));
      c.diaryInactive.forEach((n) => t.push(`  Diário parado: ${n.patient} · ${n.note}`));
    }
  }
  if (d.returnsDue.length) { t.push("", "RETORNOS PARA AGENDAR"); d.returnsDue.forEach((n) => t.push(`  ${n.patient} · ${n.note}`)); }
  if (d.birthdays.length) { t.push("", "ANIVERSARIANTES"); d.birthdays.forEach((n) => t.push(`  ${n.patient} · ${n.note}`)); }
  t.push("", `Alterar ou desativar: ${d.preferencesUrl}`);

  return { subject, html, text: t.join("\n") };
}
