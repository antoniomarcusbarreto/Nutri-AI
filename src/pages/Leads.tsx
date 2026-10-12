import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/cn';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { LeadLinkCard } from '../components/leads/LeadLinkCard';
import { LeadDetail } from '../components/leads/LeadDetail';
import { PortalAccessModal } from '../components/patients/PortalAccessModal';
import { fmtAgo } from '../components/dashboard/dashboardFormat';
import { useLeads } from '../hooks/queries/useLeads';
import { usePatients } from '../hooks/queries/usePatients';
import { LEAD_STATUS_STYLE, STATUS_LABEL, goalLabel, leadFlags, type Lead } from '../lib/leads';

/**
 * Triagem de novos pacientes (migration 0042). Pedidos que chegam pelo link
 * público do nutricionista, organizados pela IA. Nada vira paciente sem o
 * clique de "Aceitar".
 */

type Tab = 'abertos' | 'convertido' | 'descartado';
const TABS: { id: Tab; label: string; match: (l: Lead) => boolean }[] = [
  { id: 'abertos', label: 'Em aberto', match: (l) => l.status === 'novo' || l.status === 'em_contato' },
  { id: 'convertido', label: 'Viraram paciente', match: (l) => l.status === 'convertido' },
  { id: 'descartado', label: 'Descartados', match: (l) => l.status === 'descartado' },
];

export const Leads: React.FC = () => {
  const { user, clinic, isTrialActive } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const leadsQuery = useLeads(user?.id);
  const { data: patients = [] } = usePatients(clinic?.id);
  const [tab, setTab] = useState<Tab>('abertos');
  const [invitePatientId, setInvitePatientId] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  const { data: services = [] } = useQuery({
    queryKey: ['services', 'names', clinic?.id ?? 'none'],
    enabled: !!clinic?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('id, name').eq('clinic_id', clinic!.id).order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const selectedId = searchParams.get('lead');
  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const visible = leads.filter(TABS.find((t) => t.id === tab)!.match);
  const invitePatient = patients.find((p) => p.id === invitePatientId) ?? null;

  // Mesma regra da tela de Pacientes.
  const limitReached = isTrialActive ? patients.length >= 5 : clinic?.plan_level === 'starter' && patients.length >= 50;

  const select = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('lead', id);
    else next.delete('lead');
    setSearchParams(next, { replace: !id });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title="Triagem"
        description="Pedidos de quem quer começar com você. A IA organiza as respostas; você decide quem vira paciente."
      />

      <LeadLinkCard />

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* Lista */}
        <div className={cn('space-y-3', selected && 'hidden lg:block')}>
          <div role="tablist" aria-label="Situação dos pedidos" className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map((t) => {
              const count = leads.filter(t.match).length;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                    tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  {t.label}{count > 0 && <span className="ml-1 tabular-nums text-slate-400">{count}</span>}
                </button>
              );
            })}
          </div>

          {leadsQuery.isPending ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          ) : leadsQuery.isError ? (
            <Card padding="sm" radius="2xl"><p className="text-sm text-rose-600">Não foi possível carregar os pedidos.</p></Card>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Inbox aria-hidden="true" />}
              title={tab === 'abertos' ? 'Nenhum pedido em aberto' : 'Nada por aqui'}
              description={tab === 'abertos' ? 'Quando alguém preencher o formulário do seu link, o pedido aparece aqui.' : undefined}
            />
          ) : (
            <ul className="space-y-2">
              {visible.map((l) => {
                const flags = leadFlags(l, now).filter((f) => f.label !== 'Paciente novo');
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => select(l.id)}
                      aria-current={l.id === selectedId ? 'true' : undefined}
                      className={cn(
                        'w-full cursor-pointer rounded-2xl border bg-white p-3.5 text-left transition-colors',
                        l.id === selectedId ? 'border-[#5024fc] ring-1 ring-[#5024fc]' : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{l.name}</span>
                        <span className="shrink-0 text-xs text-slate-400">{fmtAgo(l.created_at)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {[goalLabel(l.goal), l.ai_triage ? `prioridade ${l.ai_triage.prioridade === 'media' ? 'média' : l.ai_triage.prioridade}` : null].filter(Boolean).join(' · ')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', LEAD_STATUS_STYLE[l.status])}>{STATUS_LABEL[l.status]}</span>
                        {flags.map((f) => (
                          <span key={f.label} className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', f.className)}>{f.label}</span>
                        ))}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detalhe */}
        <div className={cn(!selected && 'hidden lg:block')}>
          {selected && user ? (
            <LeadDetail
              key={selected.id}
              lead={selected}
              services={services}
              userId={user.id}
              limitReached={!!limitReached}
              onBack={() => select(null)}
              onAccepted={(pid) => setInvitePatientId(pid)}
              onInvite={(pid) => setInvitePatientId(pid)}
            />
          ) : (
            <Card padding="md" radius="2xl" className="flex min-h-64 items-center justify-center text-center">
              <p className="max-w-xs text-sm text-slate-500">Escolha um pedido para ver a triagem, as respostas e as ações.</p>
            </Card>
          )}
        </div>
      </div>

      {invitePatient && (
        <PortalAccessModal open patient={invitePatient} onClose={() => setInvitePatientId(null)} />
      )}
    </div>
  );
};
