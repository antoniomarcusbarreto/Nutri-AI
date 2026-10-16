import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Captions, ChevronDown, PencilLine, Share2, X } from 'lucide-react';
import { Button, Card, EmptyState, Modal, Select } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useClinicProfessionals } from '../../hooks/queries/useAccessGrants';
import {
  usePatientTeleconsults, useShareTranscript, useTranscriptSegments, useTranscriptShares,
} from '../../hooks/queries/useTeleconsults';
import { teleconsultReviewPath, type TeleconsultTranscript } from '../../lib/teleconsult';
import { SummaryView } from '../teleconsult/SummaryView';
import { TranscriptView } from '../teleconsult/TranscriptView';

/**
 * Aba "Teleconsultas" do acompanhamento (migration 0044): resumos salvos das
 * teleconsultas transcritas, rascunhos pendentes de revisão (só o dono vê) e
 * compartilhamento de uma transcrição com outro nutricionista da clínica.
 */
export const TeleconsultsTab: React.FC<{ patientId: string }> = ({ patientId }) => {
  const { data = [], isPending, isError, refetch } = usePatientTeleconsults(patientId);

  if (isPending) return <p className="text-sm text-slate-500">Carregando teleconsultas…</p>;
  if (isError) {
    return (
      <Card className="text-sm text-slate-600">
        Não foi possível carregar as teleconsultas.{' '}
        <button type="button" className="font-medium text-[#5024fc]" onClick={() => refetch()}>Tentar de novo</button>
      </Card>
    );
  }
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Captions className="h-6 w-6" />}
        title="Nenhuma teleconsulta transcrita"
        description="Quando o paciente aceita o termo e você transcreve uma consulta online, o resumo revisado aparece aqui."
      />
    );
  }

  return (
    <ol className="space-y-4">
      {data.map((t) => <TranscriptCard key={t.id} transcript={t} />)}
    </ol>
  );
};

const TranscriptCard: React.FC<{ transcript: TeleconsultTranscript }> = ({ transcript: t }) => {
  const { profile } = useAuth();
  const isOwner = t.nutritionist_id === profile?.id;
  const [showText, setShowText] = useState(false);
  const [sharing, setSharing] = useState(false);
  const segments = useTranscriptSegments(t.id, showText);
  const draft = t.status !== 'salva';
  const minutes = t.ended_at ? Math.max(1, Math.round((new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 60_000)) : null;

  return (
    <li>
      <Card as="article" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 first-letter:uppercase">
              {format(new Date(t.started_at), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {format(new Date(t.started_at), 'HH:mm')}
              {minutes ? ` · ${minutes} min transcritos` : ''}
              {!isOwner ? ' · compartilhada com você' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {draft ? (
              <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                Revisão pendente
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                No histórico
              </span>
            )}
            {isOwner && (
              <Link
                to={teleconsultReviewPath(t.appointment_id)}
                className={draft
                  ? 'inline-flex items-center gap-1.5 rounded-xl bg-[#5024fc] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#431cdb]'
                  : 'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100'}
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden="true" /> {draft ? 'Revisar' : 'Editar'}
              </Link>
            )}
            {isOwner && !draft && (
              <Button variant="ghost" size="sm" leftIcon={<Share2 className="h-3.5 w-3.5" />} onClick={() => setSharing(true)}>
                Compartilhar
              </Button>
            )}
          </div>
        </div>

        {t.summary && !draft ? (
          <SummaryView summary={t.summary} />
        ) : draft ? (
          <p className="text-sm text-slate-600">Este rascunho ainda não foi revisado e não faz parte do histórico do paciente.</p>
        ) : (
          <p className="text-sm text-slate-500">Sem resumo.</p>
        )}

        <div className="border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowText((v) => !v)}
            aria-expanded={showText}
            className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showText ? 'rotate-180' : ''}`} aria-hidden="true" />
            {showText ? 'Esconder transcrição' : 'Ver transcrição completa'}
          </button>
          {showText && (
            <div className="mt-3 max-h-96 overflow-y-auto rounded-2xl bg-white p-4">
              {segments.isPending ? <p className="text-sm text-slate-500">Carregando…</p>
                : segments.isError ? <p className="text-sm text-rose-600">Não foi possível carregar a transcrição.</p>
                : <TranscriptView segments={segments.data ?? []} />}
            </div>
          )}
        </div>
      </Card>

      {isOwner && <ShareModal open={sharing} onClose={() => setSharing(false)} transcript={t} />}
    </li>
  );
};

const ShareModal: React.FC<{ open: boolean; onClose: () => void; transcript: TeleconsultTranscript }> = ({ open, onClose, transcript }) => {
  const { clinic, profile } = useAuth();
  const { showToast } = useToast();
  const professionals = useClinicProfessionals(open ? clinic?.id : undefined);
  const shares = useTranscriptShares(transcript.id, open);
  const { share, revoke } = useShareTranscript(transcript.id);
  const [grantee, setGrantee] = useState('');

  const sharedIds = new Set((shares.data ?? []).map((s) => s.grantee_id));
  const options = (professionals.data ?? []).filter((p) => p.id !== profile?.id && !sharedIds.has(p.id));
  const errText = (err: unknown) => (err as { message?: string })?.message || 'Não foi possível concluir.';

  const onShare = () => {
    if (!grantee) return;
    share.mutate(grantee, {
      onSuccess: () => { setGrantee(''); showToast('Transcrição compartilhada.', 'success'); },
      onError: (err) => showToast(errText(err), 'error'),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compartilhar transcrição"
      description="Só nutricionistas da clínica. Quem recebe lê o resumo e a transcrição desta consulta; a secretaria nunca vê."
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Select
            label="Compartilhar com"
            value={grantee}
            onChange={(e) => setGrantee(e.target.value)}
            wrapperClassName="flex-1"
          >
            <option value="">{options.length ? 'Escolha um nutricionista' : 'Nenhum outro nutricionista disponível'}</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
          <Button disabled={!grantee} loading={share.isPending} onClick={onShare}>Compartilhar</Button>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700">Quem já tem acesso</p>
          {(shares.data ?? []).length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">Só você.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {(shares.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-slate-800">{s.profiles?.full_name ?? 'Nutricionista'}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<X className="h-3.5 w-3.5" />}
                    loading={revoke.isPending && revoke.variables === s.id}
                    onClick={() => revoke.mutate(s.id, {
                      onSuccess: () => showToast('Acesso removido.', 'success'),
                      onError: (err) => showToast(errText(err), 'error'),
                    })}
                  >
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};
