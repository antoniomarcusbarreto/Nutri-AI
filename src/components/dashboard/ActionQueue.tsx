import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Copy, FlaskConical, MessageCircle, Smartphone, UserRoundX, Utensils } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { DashboardActions } from '../../hooks/queries/useDashboard';
import { cn } from '../../lib/cn';
import { Card } from '../ui';
import { ListSkeleton, LoadError, SectionTitle } from './dashboardUi';
import { fmtAgo, fmtWhen } from './dashboardFormat';

const VISIBLE = 3;

type Tone = 'amber' | 'blue' | 'rose';
const TONE: Record<Tone, { icon: string; count: string }> = {
  amber: { icon: 'bg-amber-50 text-amber-700', count: 'bg-amber-50 text-amber-700 border-amber-100' },
  blue: { icon: 'bg-blue-50 text-blue-700', count: 'bg-blue-50 text-blue-700 border-blue-100' },
  rose: { icon: 'bg-rose-50 text-rose-700', count: 'bg-rose-50 text-rose-700 border-rose-100' },
};

interface Row { key: string; primary: string; secondary: string; to?: string; action?: React.ReactNode }

interface GroupProps {
  icon: React.ElementType;
  tone: Tone;
  title: string;
  rows: Row[];
  more?: { to: string; label: string };
}

const Group: React.FC<GroupProps> = ({ icon: Icon, tone, title, rows, more }) => {
  if (rows.length === 0) return null;
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="mb-2 flex items-center gap-2.5">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', TONE[tone].icon)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="flex-1 text-sm font-medium text-slate-900">{title}</h3>
        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums', TONE[tone].count)}>{rows.length}</span>
      </div>
      <ul className="space-y-1">
        {rows.slice(0, VISIBLE).map((r) => (
          <li key={r.key} className="flex items-center gap-2 pl-[42px] text-sm">
            <span className="min-w-0 flex-1 truncate text-slate-700">
              {r.to
                ? <Link to={r.to} className="text-slate-900 underline-offset-2 hover:text-[#5024fc] hover:underline">{r.primary}</Link>
                : r.primary}
              <span className="text-slate-500"> · {r.secondary}</span>
            </span>
            {r.action}
          </li>
        ))}
      </ul>
      {more && (
        <Link to={more.to} className="mt-1.5 ml-[42px] inline-block text-xs font-medium text-[#5024fc] hover:underline">
          {rows.length > VISIBLE ? `+${rows.length - VISIBLE} · ${more.label}` : more.label}
        </Link>
      )}
    </li>
  );
};

const CopyButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
  >
    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
  </button>
);

export interface ActionQueueProps {
  query: UseQueryResult<DashboardActions>;
  onCopyConfirmation: (token: string | null, patientName: string) => void;
}

/** "O que precisa da minha atenção" — cada grupo leva direto à ação. */
export const ActionQueue: React.FC<ActionQueueProps> = ({ query, onCopyConfirmation }) => {
  const a = query.data;
  const total = a
    ? a.patientRequests.length + a.confirmations.length + a.missingForms.length + a.pendingExams.length + a.withoutPlan.length + a.withoutReturn.length
    : 0;

  return (
    <Card as="section" aria-labelledby="actions-title" className="flex h-full flex-col">
      <SectionTitle
        id="actions-title"
        title="Pendências"
        hint={query.isPending ? 'Carregando…' : total === 0 ? 'Nada pedindo sua atenção' : `${total} ${total === 1 ? 'item pede' : 'itens pedem'} sua atenção`}
      />

      {query.isPending ? (
        <ListSkeleton rows={3} height="h-20" />
      ) : query.isError ? (
        <LoadError message="Não foi possível carregar as pendências." onRetry={() => query.refetch()} />
      ) : !a || total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-8 text-center">
          <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-600" aria-hidden="true" />
          <p className="text-sm font-medium text-emerald-700">Tudo em dia</p>
          <p className="mt-0.5 text-xs text-slate-500">Confirmações, fichas, exames e retornos sem pendência.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          <Group
            icon={Smartphone}
            tone="rose"
            title="Pedidos de pacientes pelo app"
            rows={a.patientRequests.map((r) => ({
              key: r.id,
              primary: r.patientName,
              secondary: `${r.kind === 'cancel' ? 'cancelou' : r.kind === 'booking' ? 'pediu consulta' : 'quer remarcar'}${r.dateTime ? ` ${fmtWhen(r.dateTime)}` : ''}`,
              to: r.appointmentId ? `/agenda?agendamento=${r.appointmentId}` : '/agenda',
            }))}
            more={{ to: '/agenda', label: 'Abrir agenda' }}
          />
          <Group
            icon={MessageCircle}
            tone="amber"
            title="Confirmar presença (próximas 48h)"
            rows={a.confirmations.map((c) => ({
              key: c.id,
              primary: c.patientName,
              secondary: fmtWhen(c.dateTime),
              action: <CopyButton label={`Copiar link de confirmação de ${c.patientName}`} onClick={() => onCopyConfirmation(c.token, c.patientName)} />,
            }))}
            more={{ to: '/agenda', label: 'Abrir agenda' }}
          />
          <Group
            icon={ClipboardList}
            tone="blue"
            title="Ficha de saúde não preenchida"
            rows={a.missingForms.map((f) => ({
              key: f.patientId,
              primary: f.patientName,
              // A ficha é preenchida no app do paciente; sem app, libere o acesso em Pacientes.
              secondary: `consulta ${fmtWhen(f.dateTime)}${f.hasApp ? ' · aguardando no app' : ' · sem acesso ao app'}`,
              to: '/pacientes',
            }))}
          />
          <Group
            icon={FlaskConical}
            tone="blue"
            title="Exames aguardando análise"
            rows={a.pendingExams.map((e) => ({
              key: e.id,
              primary: e.patientName,
              secondary: `enviado ${fmtAgo(e.uploadedAt)}`,
              to: `/acompanhamento?paciente=${e.patientId}&aba=exames`,
            }))}
            more={{ to: '/exames', label: 'Abrir exames' }}
          />
          <Group
            icon={Utensils}
            tone="amber"
            title="Atendidos sem plano alimentar"
            rows={a.withoutPlan.map((p) => ({
              key: p.patientId,
              primary: p.patientName,
              secondary: `consulta ${fmtAgo(p.since)}`,
              to: `/acompanhamento?paciente=${p.patientId}`,
            }))}
            more={{ to: '/planos', label: 'Criar plano' }}
          />
          <Group
            icon={UserRoundX}
            tone="rose"
            title="Sem retorno marcado"
            rows={a.withoutReturn.map((p) => ({
              key: p.patientId,
              primary: p.patientName,
              secondary: `última consulta ${fmtAgo(p.since)}`,
              to: `/acompanhamento?paciente=${p.patientId}`,
            }))}
            more={{ to: '/agenda?novo=1', label: 'Agendar retorno' }}
          />
        </ul>
      )}
    </Card>
  );
};
