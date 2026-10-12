// supabase/functions/_shared/digest-email.ts
// Modelo do resumo por e-mail (diário e semanal; nutricionista e secretária).
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
/** Lista possivelmente cortada: `total` é o tamanho real. */
export type DigestList<T> = { items: T[]; total: number };

type DigestBase = {
  audience: "nutri" | "secretary";
  recipientFirstName: string;
  dateLabel: string;       // "terça-feira, 13 de outubro"
  portalRequests: DigestList<DigestPortalRequest>;
  finance: {
    dueToday: DigestList<DigestCharge>;
    overdue: DigestList<DigestCharge>;
    overdueTotal: number;
  };
  newLeads?: DigestList<DigestPatientNote>;  // só nutricionista (triagem, migration 0042)
  clinical?: {             // só nutricionista
    newExams: DigestList<DigestPatientNote>;
    withoutPlan: DigestList<DigestPatientNote>;
    diaryInactive: DigestList<DigestPatientNote>;
  };
  returnsDue: DigestList<DigestPatientNote>;
  birthdays: DigestList<DigestPatientNote>;
  preferencesUrl: string;
};

export type DailyDigest = DigestBase & {
  agenda: DigestAgendaGroup[];
  receivedYesterday?: number;   // só nutricionista
};

export type WeeklyDigest = DigestBase & {
  weekLabel: string;            // "12 a 18 de outubro"
  days: { label: string; groups: DigestAgendaGroup[] }[];
  lastWeek: {
    held: number;               // concluídas
    noShow: number;
    cancelled: number;
    /** Concluídas ÷ marcadas (sem canceladas), como no Dashboard. */
    attendancePct: number | null;
    newPatients: number;
    revenue?: number;           // só nutricionista
    revenuePrev?: number;
  };
};

const C = {
  ink: "#0f172a", body: "#475569", muted: "#94a3b8", line: "#e2e8f0",
  soft: "#f8fafc", teal: "#0d9488", tealSoft: "#ccfbf1", action: "#5024fc",
  warn: "#b45309", warnSoft: "#fef3c7", danger: "#b91c1c", dangerSoft: "#fee2e2",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const badge = (label: string, fg: string, bg: string) =>
  `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;color:${fg};background:${bg};white-space:nowrap;">${escapeHtml(label)}</span>`;

function section(title: string, count: number | null, inner: string) {
  return `<tr><td style="padding:24px 32px 0;">
<p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.teal};">${escapeHtml(title)}${count !== null ? ` <span style="color:${C.muted};font-weight:600;">· ${count}</span>` : ""}</p>
${inner}
</td></tr>`;
}

/** Linhas numa caixa; `more` = itens que ficaram de fora da lista. */
function rows(items: string[], more = 0) {
  const all = more > 0 ? [...items, `<span style="color:${C.muted};">e mais ${more}…</span>`] : items;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px;border-collapse:separate;">
${all.map((it, i) => `<tr><td style="padding:12px 14px;${i ? `border-top:1px solid ${C.line};` : ""}font-size:14px;line-height:1.5;color:${C.body};">${it}</td></tr>`).join("")}
</table>`;
}
const more = <T>(l: DigestList<T>) => Math.max(0, l.total - l.items.length);

const noteRow = (n: DigestPatientNote) =>
  `<strong style="color:${C.ink};">${escapeHtml(n.patient)}</strong><br><span>${escapeHtml(n.note)}</span>`;

function agendaRows(group: DigestAgendaGroup) {
  return rows(group.appointments.map((a) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="56" valign="top" style="font-size:15px;font-weight:700;color:${C.ink};">${escapeHtml(a.time)}</td>
<td valign="top" style="font-size:14px;color:${C.body};"><strong style="color:${C.ink};">${escapeHtml(a.patient)}</strong><br>${escapeHtml(a.kind)}</td>
<td align="right" valign="top" style="font-size:13px;">${a.confirmed ? badge("Confirmada", C.teal, C.tealSoft) : badge("Sem confirmação", C.warn, C.warnSoft)}</td>
</tr></table>`));
}

function agendaGroups(groups: DigestAgendaGroup[]) {
  return groups.filter((g) => g.appointments.length).map((g) =>
    (g.nutritionist ? `<p style="margin:14px 0 8px;font-size:14px;font-weight:700;color:${C.ink};">${escapeHtml(g.nutritionist)} <span style="color:${C.muted};font-weight:500;">· ${plural(g.appointments.length, "consulta", "consultas")}</span></p>` : "") +
    agendaRows(g)).join("");
}

function chargeRows(list: DigestCharge[]) {
  return list.map((c) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:14px;color:${C.body};"><strong style="color:${C.ink};">${escapeHtml(c.patient)}</strong>${c.detail ? `<br>${escapeHtml(c.detail)}` : ""}</td>
<td align="right" style="font-size:14px;font-weight:700;color:${C.ink};white-space:nowrap;">${brl(c.amount)}</td>
</tr></table>`);
}

function statsRow(stats: [string, string][]) {
  const w = Math.floor(100 / stats.length);
  return `<tr><td style="padding:20px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border-radius:12px;"><tr>
${stats.map(([v, l]) => `<td width="${w}%" align="center" valign="top" style="padding:14px 6px;"><div style="font-size:20px;font-weight:800;color:${C.ink};">${escapeHtml(v)}</div><div style="font-size:12px;color:${C.body};margin-top:2px;">${escapeHtml(l)}</div></td>`).join("")}
</tr></table></td></tr>`;
}

/** Seções comuns ao diário e ao semanal (depois da agenda). */
function commonSections(d: DigestBase, opts: { financeTodayTitle: string; birthdaysTitle: string }) {
  const parts: string[] = [];

  if (d.newLeads?.total) {
    parts.push(section("Novos pedidos na triagem", d.newLeads.total,
      rows(d.newLeads.items.map(noteRow), more(d.newLeads)) +
      `<p style="margin:8px 0 0;font-size:14px;"><a href="${APP_URL}/triagem" style="color:${C.action};font-weight:600;text-decoration:none;">Abrir a triagem →</a></p>`,
    ));
  }

  if (d.portalRequests.total) {
    parts.push(section("Pedidos do portal aguardando resposta", d.portalRequests.total, rows(
      d.portalRequests.items.map((r) => `<strong style="color:${C.ink};">${escapeHtml(r.patient)}</strong> ${badge(r.what, C.action, "#ede9fe")}<br>${escapeHtml(r.when)}`),
      more(d.portalRequests),
    )));
  }

  const f = d.finance;
  if (f.dueToday.total || f.overdue.total) {
    let inner = "";
    if (f.dueToday.total) {
      inner += `<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${C.ink};">${escapeHtml(opts.financeTodayTitle)}</p>${rows(chargeRows(f.dueToday.items), more(f.dueToday))}`;
    }
    if (f.overdue.total) {
      inner += `<p style="margin:${f.dueToday.total ? "16px" : "0"} 0 8px;font-size:14px;font-weight:600;color:${C.danger};">Em atraso · ${plural(f.overdue.total, "cobrança", "cobranças")} · ${brl(f.overdueTotal)}</p>${rows(chargeRows(f.overdue.items), more(f.overdue))}`;
    }
    parts.push(section("Cobranças", null, inner));
  }

  if (d.audience === "nutri" && d.clinical) {
    const c = d.clinical;
    const total = c.newExams.total + c.withoutPlan.total + c.diaryInactive.total;
    const items = [
      ...c.newExams.items.map((n) => `${badge("Exame sem análise", C.teal, C.tealSoft)}<br>${noteRow(n)}`),
      ...c.withoutPlan.items.map((n) => `${badge("Sem plano alimentar", C.warn, C.warnSoft)}<br>${noteRow(n)}`),
      ...c.diaryInactive.items.map((n) => `${badge("Diário parado", "#475569", "#e2e8f0")}<br>${noteRow(n)}`),
    ];
    if (total) parts.push(section("Seus pacientes", total, rows(items, total - items.length)));
  }

  if (d.returnsDue.total) {
    parts.push(section("Retornos para agendar", d.returnsDue.total, rows(d.returnsDue.items.map(noteRow), more(d.returnsDue))));
  }

  if (d.birthdays.total) {
    parts.push(section(opts.birthdaysTitle, d.birthdays.total, rows(d.birthdays.items.map((b) => `🎂 ${noteRow(b)}`), more(d.birthdays))));
  }
  return parts;
}

function shell(subject: string, d: DigestBase, headerRight: string, intro: string, stats: string, parts: string[]) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 8px;"><tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="width:720px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:${FONT};">
<tr><td style="background:${C.ink};padding:22px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><span style="font-size:22px;font-weight:800;color:#ffffff;">Nutri<span style="color:#14b8a6;">-AI</span></span></td>
<td align="right" style="font-size:13px;color:#cbd5e1;">${escapeHtml(headerRight)}</td>
</tr></table></td></tr>
<tr><td style="padding:28px 32px 0;">
<p style="margin:0 0 6px;font-size:20px;font-weight:700;color:${C.ink};">Bom dia, ${escapeHtml(d.recipientFirstName)}!</p>
<p style="margin:0;font-size:15px;line-height:1.6;color:${C.body};">${escapeHtml(intro)}</p>
</td></tr>
${stats}
${parts.join("\n")}
<tr><td style="height:32px;line-height:32px;">&nbsp;</td></tr>
<tr><td style="padding:18px 32px;background:${C.soft};border-top:1px solid ${C.line};">
<p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};">Você recebe este resumo porque ativou os resumos por e-mail no Nutri-AI. <a href="${d.preferencesUrl}" style="color:${C.muted};">Alterar dias, horário ou desativar</a>.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------------------------------------------------------------------------
// Versão texto (clientes sem HTML)
// ---------------------------------------------------------------------------
function textAgenda(t: string[], groups: DigestAgendaGroup[]) {
  for (const g of groups) {
    if (!g.appointments.length) continue;
    if (g.nutritionist) t.push(`- ${g.nutritionist}`);
    for (const a of g.appointments) t.push(`  ${a.time}  ${a.patient} · ${a.kind}${a.confirmed ? "" : " · SEM CONFIRMAÇÃO"}`);
  }
}
function textCommon(t: string[], d: DigestBase, financeTodayTitle: string, birthdaysTitle: string) {
  const listMore = <T>(l: DigestList<T>) => { if (more(l)) t.push(`  e mais ${more(l)}…`); };
  if (d.newLeads?.total) {
    t.push("", `NOVOS PEDIDOS NA TRIAGEM (${d.newLeads.total})`);
    d.newLeads.items.forEach((n) => t.push(`  ${n.patient}: ${n.note}`));
    listMore(d.newLeads);
    t.push(`  ${APP_URL}/triagem`);
  }
  if (d.portalRequests.total) {
    t.push("", `PEDIDOS DO PORTAL (${d.portalRequests.total})`);
    d.portalRequests.items.forEach((r) => t.push(`  ${r.patient}: ${r.what} · ${r.when}`));
    listMore(d.portalRequests);
  }
  const f = d.finance;
  if (f.dueToday.total || f.overdue.total) {
    t.push("", "COBRANÇAS");
    f.dueToday.items.forEach((c) => t.push(`  ${financeTodayTitle}: ${c.patient} · ${brl(c.amount)}`));
    listMore(f.dueToday);
    if (f.overdue.total) t.push(`  Em atraso: ${f.overdue.total} · ${brl(f.overdueTotal)}`);
    f.overdue.items.forEach((c) => t.push(`  Atraso: ${c.patient} · ${brl(c.amount)}${c.detail ? ` · ${c.detail}` : ""}`));
    listMore(f.overdue);
  }
  if (d.audience === "nutri" && d.clinical) {
    const c = d.clinical;
    if (c.newExams.total + c.withoutPlan.total + c.diaryInactive.total) {
      t.push("", "SEUS PACIENTES");
      c.newExams.items.forEach((n) => t.push(`  Exame sem análise: ${n.patient} · ${n.note}`));
      c.withoutPlan.items.forEach((n) => t.push(`  Sem plano alimentar: ${n.patient} · ${n.note}`));
      c.diaryInactive.items.forEach((n) => t.push(`  Diário parado: ${n.patient} · ${n.note}`));
      const hidden = more(c.newExams) + more(c.withoutPlan) + more(c.diaryInactive);
      if (hidden) t.push(`  e mais ${hidden}…`);
    }
  }
  if (d.returnsDue.total) { t.push("", "RETORNOS PARA AGENDAR"); d.returnsDue.items.forEach((n) => t.push(`  ${n.patient} · ${n.note}`)); listMore(d.returnsDue); }
  if (d.birthdays.total) { t.push("", birthdaysTitle.toUpperCase()); d.birthdays.items.forEach((n) => t.push(`  ${n.patient} · ${n.note}`)); listMore(d.birthdays); }
  t.push("", `Alterar ou desativar: ${d.preferencesUrl}`);
}

// ---------------------------------------------------------------------------
// Diário
// ---------------------------------------------------------------------------
export function renderDailyDigest(d: DailyDigest): { subject: string; html: string; text: string } {
  const isNutri = d.audience === "nutri";
  const appts = d.agenda.flatMap((g) => g.appointments);
  const unconfirmed = appts.filter((a) => !a.confirmed).length;
  const requests = d.portalRequests.total;

  const subject = appts.length
    ? `Seu dia: ${plural(appts.length, "consulta", "consultas")}${unconfirmed ? `, ${unconfirmed} sem confirmação` : ""}${requests ? ` e ${plural(requests, "pedido", "pedidos")} no portal` : ""}`
    : requests ? `Seu dia: ${plural(requests, "pedido", "pedidos")} no portal` : "Seu dia: agenda livre";

  const stats: [string, string][] = [
    [String(appts.length), appts.length === 1 ? "consulta hoje" : "consultas hoje"],
    [String(unconfirmed), "sem confirmação"],
    [String(requests), requests === 1 ? "pedido no portal" : "pedidos no portal"],
    isNutri && d.receivedYesterday !== undefined
      ? [brl(d.receivedYesterday), "recebido ontem"]
      : [String(d.finance.overdue.total), "cobranças atrasadas"],
  ];

  const parts = [
    section("Agenda de hoje", appts.length || null, appts.length
      ? agendaGroups(d.agenda)
      : `<p style="margin:0;font-size:14px;color:${C.body};">Nenhuma consulta marcada para hoje.</p>`),
    ...commonSections(d, { financeTodayTitle: "Para receber hoje", birthdaysTitle: "Aniversariantes de hoje" }),
  ];

  const intro = isNutri ? "Aqui está o resumo do seu dia no Nutri-AI." : "Aqui está o resumo do dia da clínica no Nutri-AI.";
  const html = shell(subject, d, d.dateLabel, intro, statsRow(stats), parts);

  const t: string[] = [`Bom dia, ${d.recipientFirstName}! ${intro}`, d.dateLabel, "", `AGENDA DE HOJE (${appts.length})`];
  textAgenda(t, d.agenda);
  textCommon(t, d, "Hoje", "Aniversariantes de hoje");
  return { subject, html, text: t.join("\n") };
}

// ---------------------------------------------------------------------------
// Semanal (segunda-feira, substitui o diário)
// ---------------------------------------------------------------------------
export function renderWeeklyDigest(d: WeeklyDigest): { subject: string; html: string; text: string } {
  const isNutri = d.audience === "nutri";
  const appts = d.days.flatMap((day) => day.groups.flatMap((g) => g.appointments));
  const unconfirmed = appts.filter((a) => !a.confirmed).length;
  const lw = d.lastWeek;
  const attendance = lw.attendancePct;

  const subject = `Sua semana: ${plural(appts.length, "consulta", "consultas")} de ${d.weekLabel}${unconfirmed ? `, ${unconfirmed} sem confirmação` : ""}`;

  const stats: [string, string][] = [
    [String(appts.length), appts.length === 1 ? "consulta na semana" : "consultas na semana"],
    [String(unconfirmed), "sem confirmação"],
    [String(d.portalRequests.total), d.portalRequests.total === 1 ? "pedido no portal" : "pedidos no portal"],
    [String(d.finance.overdue.total), "cobranças atrasadas"],
  ];

  // Agenda por dia
  const agendaInner = appts.length
    ? d.days.map((day) => {
      const n = day.groups.reduce((s, g) => s + g.appointments.length, 0);
      return `<p style="margin:16px 0 8px;font-size:15px;font-weight:700;color:${C.ink};">${escapeHtml(day.label)} <span style="color:${C.muted};font-weight:500;">· ${n ? plural(n, "consulta", "consultas") : "livre"}</span></p>` +
        (n ? agendaGroups(day.groups) : "");
    }).join("")
    : `<p style="margin:0;font-size:14px;color:${C.body};">Nenhuma consulta marcada para esta semana.</p>`;

  // Semana passada
  const lwCells: [string, string][] = [
    [String(lw.held), lw.held === 1 ? "consulta realizada" : "consultas realizadas"],
    [attendance !== null ? `${attendance}%` : "—", "comparecimento"],
    [String(lw.noShow), lw.noShow === 1 ? "falta" : "faltas"],
    [String(lw.newPatients), lw.newPatients === 1 ? "paciente novo" : "pacientes novos"],
  ];
  let lwInner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px;border-collapse:separate;"><tr>
${lwCells.map(([v, l]) => `<td width="25%" align="center" valign="top" style="padding:14px 6px;"><div style="font-size:18px;font-weight:800;color:${C.ink};">${escapeHtml(v)}</div><div style="font-size:12px;color:${C.body};margin-top:2px;">${escapeHtml(l)}</div></td>`).join("")}
</tr></table>`;
  if (isNutri && lw.revenue !== undefined) {
    const prev = lw.revenuePrev ?? 0;
    const diff = prev ? Math.round(((lw.revenue - prev) / prev) * 100) : null;
    const diffLabel = diff === null ? "" : diff === 0 ? " · igual à semana anterior" : ` · ${diff > 0 ? "+" : ""}${diff}% em relação à semana anterior`;
    lwInner += `<p style="margin:12px 0 0;font-size:14px;color:${C.body};">Recebido: <strong style="color:${C.ink};">${brl(lw.revenue)}</strong>${escapeHtml(diffLabel)}</p>`;
  }
  if (lw.cancelled) lwInner += `<p style="margin:6px 0 0;font-size:13px;color:${C.muted};">${plural(lw.cancelled, "consulta cancelada", "consultas canceladas")}.</p>`;

  const parts = [
    section("Agenda da semana", appts.length || null, agendaInner),
    section("Como foi a semana passada", null, lwInner),
    ...commonSections(d, { financeTodayTitle: "Para receber nesta semana", birthdaysTitle: "Aniversariantes da semana" }),
  ];

  const intro = isNutri
    ? `Aqui está o resumo da sua semana (${d.weekLabel}) no Nutri-AI.`
    : `Aqui está o resumo da semana da clínica (${d.weekLabel}) no Nutri-AI.`;
  const html = shell(subject, d, d.dateLabel, intro, statsRow(stats), parts);

  const t: string[] = [`Bom dia, ${d.recipientFirstName}! ${intro}`, d.dateLabel, "", `AGENDA DA SEMANA (${appts.length})`];
  for (const day of d.days) {
    const n = day.groups.reduce((s, g) => s + g.appointments.length, 0);
    t.push(`${day.label}${n ? "" : " · livre"}`);
    textAgenda(t, day.groups);
  }
  t.push("", "SEMANA PASSADA", `  ${plural(lw.held, "realizada", "realizadas")} · ${plural(lw.noShow, "falta", "faltas")} · ${plural(lw.cancelled, "cancelada", "canceladas")} · ${plural(lw.newPatients, "paciente novo", "pacientes novos")}${attendance !== null ? ` · comparecimento ${attendance}%` : ""}`);
  if (isNutri && lw.revenue !== undefined) t.push(`  Recebido: ${brl(lw.revenue)} (semana anterior: ${brl(lw.revenuePrev ?? 0)})`);
  textCommon(t, d, "Nesta semana", "Aniversariantes da semana");
  return { subject, html, text: t.join("\n") };
}
