import React, { useMemo, useState } from 'react';
import { format, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { KeyRound, Inbox, Send, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  useAccessGrants,
  useAccessGrantMutations,
  useClinicProfessionals,
  useRequestablePatients,
  type AccessGrant,
  type AccessGrantStatus,
} from '../../hooks/queries/useAccessGrants';
import { Card, Button, Select, Textarea, EmptyState } from '../ui';

const errMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return '';
};

const fmt = (iso: string | null) => (iso ? format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }) : '');

const STATUS_LABEL: Record<AccessGrantStatus, { label: string; cls: string }> = {
  pending: { label: 'Aguardando', cls: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  approved: { label: 'Ativo', cls: 'bg-green-50 text-green-700 ring-green-600/20' },
  denied: { label: 'Negado', cls: 'bg-slate-50 text-slate-600 ring-slate-500/20' },
  revoked: { label: 'Encerrado', cls: 'bg-slate-50 text-slate-600 ring-slate-500/20' },
  expired: { label: 'Expirado', cls: 'bg-slate-50 text-slate-600 ring-slate-500/20' },
};

const VALIDITY_OPTIONS = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: 'none', label: 'Sem prazo (até revogar)' },
];

const StatusBadge: React.FC<{ status: AccessGrantStatus }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_LABEL[status].cls}`}>
    {STATUS_LABEL[status].label}
  </span>
);

const scopeOf = (g: AccessGrant) =>
  g.patient_id ? `Paciente: ${g.patient_name ?? 'paciente específico'}` : 'Todos os pacientes';

/**
 * Configurações › Compartilhamento (migration 0029).
 *
 * Cada nutricionista só vê os próprios pacientes. Aqui ele pede acesso aos de
 * um colega, decide os pedidos que recebe e encerra acessos. O Master também
 * pode conceder pelo Painel Master. Secretárias não usam esta aba.
 */
export const AccessSharingPanel: React.FC = () => {
  const { clinic, profile, isReadOnly } = useAuth();
  const { showToast } = useToast();
  const { data: grants = [], isLoading } = useAccessGrants();
  const { data: professionals = [] } = useClinicProfessionals(clinic?.id);
  const { data: requestable = [] } = useRequestablePatients();
  const { request, decide, revoke } = useAccessGrantMutations();

  const colleagues = professionals.filter((p) => p.id !== profile?.id);
  const [ownerId, setOwnerId] = useState('');
  const [patientId, setPatientId] = useState('');
  const [reason, setReason] = useState('');
  const [validity, setValidity] = useState<Record<string, string>>({});

  const received = useMemo(() => grants.filter((g) => g.owner_nutritionist_id === profile?.id), [grants, profile?.id]);
  const sent = useMemo(() => grants.filter((g) => g.grantee_id === profile?.id), [grants, profile?.id]);
  const pendingReceived = received.filter((g) => g.status === 'pending');
  const activeOrPastReceived = received.filter((g) => g.status !== 'pending');
  const patientsOfOwner = requestable.filter((p) => p.owner_nutritionist_id === ownerId);

  const onError = (fallback: string) => (err: unknown) => showToast(errMessage(err) || fallback, 'error');

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId) return;
    request.mutate(
      { ownerId, patientId: patientId || null, reason },
      {
        onSuccess: () => {
          showToast('Pedido enviado. Você terá acesso assim que o colega aprovar.', 'success');
          setPatientId('');
          setReason('');
        },
        onError: onError('Não foi possível enviar o pedido.'),
      },
    );
  };

  const handleDecide = (g: AccessGrant, approve: boolean) => {
    const v = validity[g.id] ?? '30';
    const expiresAt = approve && v !== 'none' ? addDays(new Date(), Number(v)).toISOString() : null;
    decide.mutate(
      { grantId: g.id, approve, expiresAt },
      {
        onSuccess: () => showToast(approve ? `Acesso liberado para ${g.grantee_name}.` : 'Pedido negado.', 'success'),
        onError: onError('Não foi possível registrar a decisão.'),
      },
    );
  };

  const handleRevoke = (g: AccessGrant, mine: boolean) => {
    revoke.mutate(g.id, {
      onSuccess: () => showToast(mine ? 'Você abriu mão deste acesso.' : 'Acesso encerrado.', 'success'),
      onError: onError('Não foi possível encerrar o acesso.'),
    });
  };

  if (!clinic) return null;

  return (
    <div className="space-y-6">
      <Card as="section" radius="2xl">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary-600 mt-0.5 shrink-0" />
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-900">Cada nutricionista vê apenas os próprios pacientes.</p>
            <p className="mt-1">
              Para acompanhar um paciente de um colega, peça acesso — ele aprova, define a validade e pode encerrar
              quando quiser. A secretária nunca vê prontuários.
            </p>
          </div>
        </div>
      </Card>

      {/* Pedidos recebidos */}
      <Card as="section" radius="2xl">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Inbox className="h-4 w-4 text-slate-400" /> Pedidos para os seus pacientes
        </h3>
        {pendingReceived.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">Nenhum pedido aguardando sua decisão.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {pendingReceived.map((g) => (
              <li key={g.id} className="py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  <p className="font-medium text-slate-900">{g.grantee_name}</p>
                  <p className="text-slate-500">{scopeOf(g)} · pedido em {fmt(g.created_at)}</p>
                  {g.reason && <p className="text-slate-600 mt-1">“{g.reason}”</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label="Validade do acesso"
                    wrapperClassName="w-auto"
                    value={validity[g.id] ?? '30'}
                    onChange={(e) => setValidity({ ...validity, [g.id]: e.target.value })}
                  >
                    {VALIDITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                  <Button size="sm" disabled={isReadOnly || decide.isPending} onClick={() => handleDecide(g, true)}>
                    Aprovar
                  </Button>
                  <Button size="sm" variant="secondary" disabled={isReadOnly || decide.isPending} onClick={() => handleDecide(g, false)}>
                    Negar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {activeOrPastReceived.length > 0 && (
          <>
            <h4 className="text-sm font-semibold text-slate-700 mt-6">Acessos que você concedeu</h4>
            <ul className="mt-2 divide-y divide-slate-100">
              {activeOrPastReceived.map((g) => (
                <li key={g.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900 flex items-center gap-2">
                      {g.grantee_name} <StatusBadge status={g.status} />
                    </p>
                    <p className="text-slate-500">
                      {scopeOf(g)}
                      {g.status === 'approved' && (g.expires_at ? ` · até ${fmt(g.expires_at)}` : ' · sem prazo')}
                    </p>
                  </div>
                  {g.status === 'approved' && (
                    <Button size="sm" variant="danger" disabled={isReadOnly || revoke.isPending} onClick={() => handleRevoke(g, false)}>
                      Encerrar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Solicitar */}
      <Card as="section" radius="2xl">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Send className="h-4 w-4 text-slate-400" /> Pedir acesso a um colega
        </h3>
        {colleagues.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">Não há outros nutricionistas ativos na clínica.</p>
        ) : (
          <form onSubmit={handleRequest} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Nutricionista" required value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setPatientId(''); }}>
              <option value="" disabled>Selecione…</option>
              {colleagues.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
            <Select
              label="Pacientes"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              hint={ownerId && patientsOfOwner.length === 0 ? 'Pacientes específicos aparecem aqui quando têm consulta agendada com você.' : undefined}
            >
              <option value="">Todos os pacientes do colega</option>
              {patientsOfOwner.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_name}</option>)}
            </Select>
            <Textarea
              label="Motivo"
              wrapperClassName="md:col-span-2"
              rows={2}
              placeholder="Ex.: cobertura de férias, interconsulta…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" leftIcon={<KeyRound className="h-4 w-4" />} disabled={isReadOnly || !ownerId} loading={request.isPending}>
                Enviar pedido
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Meus pedidos */}
      <Card as="section" radius="2xl">
        <h3 className="text-base font-semibold text-slate-900">Seus pedidos e acessos</h3>
        {isLoading ? (
          <p className="text-sm text-slate-500 mt-3">Carregando…</p>
        ) : sent.length === 0 ? (
          <EmptyState size="sm" className="mt-4" title="Você ainda não pediu acesso a nenhum colega." />
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {sent.map((g) => (
              <li key={g.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900 flex items-center gap-2">
                    {g.owner_name} <StatusBadge status={g.status} />
                  </p>
                  <p className="text-slate-500">
                    {scopeOf(g)}
                    {g.status === 'approved' && (g.expires_at ? ` · até ${fmt(g.expires_at)}` : ' · sem prazo')}
                  </p>
                </div>
                {(g.status === 'approved' || g.status === 'pending') && (
                  <Button size="sm" variant="ghost" disabled={isReadOnly || revoke.isPending} onClick={() => handleRevoke(g, true)}>
                    {g.status === 'pending' ? 'Cancelar pedido' : 'Abrir mão'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
