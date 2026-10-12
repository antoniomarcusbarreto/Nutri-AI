import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Check, Copy, Info, RefreshCw, Sparkles, Stethoscope, Trash2, UserCheck, UserPlus, UserRound, X,
} from 'lucide-react';
import { Button, Card, ConfirmDialog, Textarea } from '../ui';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { cn } from '../../lib/cn';
import { useToast } from '../../contexts/ToastContext';
import { copyText, fmtAgo } from '../dashboard/dashboardFormat';
import { useLeadMutations, usePatientHistory } from '../../hooks/queries/useLeads';
import {
  LEAD_STATUS_STYLE, STATUS_LABEL, ageFrom, leadFlags, conditionLabel, goalLabel, modalityLabel, periodLabel, sourceLabel, weekdayShort, whatsappLink,
  type Lead, type LeadTriage,
} from '../../lib/leads';

const PRIORITY: Record<LeadTriage['prioridade'], { label: string; className: string }> = {
  alta: { label: 'Prioridade alta', className: 'bg-rose-50 text-rose-700 border-rose-100' },
  media: { label: 'Prioridade média', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  baixa: { label: 'Prioridade baixa', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const POINT: Record<LeadTriage['pontos_atencao'][number]['tipo'], { icon: React.ElementType; className: string; label: string }> = {
  encaminhamento: { icon: Stethoscope, className: 'text-rose-600', label: 'Considerar encaminhamento' },
  cuidado: { icon: AlertTriangle, className: 'text-amber-600', label: 'Investigar na consulta' },
  info: { icon: Info, className: 'text-slate-500', label: 'Contexto' },
};

/** Leads que já tiveram triagem automática nesta sessão (falha não fica tentando de novo). */
const autoTriaged = new Set<string>();

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const Pill: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', className)}>{children}</span>
);

interface Props {
  lead: Lead;
  services: { id: string; name: string }[];
  onBack: () => void;
  /** Depois de aceitar: abrir o convite do portal para este paciente. */
  onAccepted: (patientId: string) => void;
  onInvite: (patientId: string) => void;
  /** Limite de pacientes do plano atingido (só bloqueia cadastro novo). */
  limitReached: boolean;
  userId: string;
}

export const LeadDetail: React.FC<Props> = ({ lead, services, onBack, onAccepted, onInvite, limitReached, userId }) => {
  const { showToast } = useToast();
  const { setStatus, accept, remove, triage } = useLeadMutations(userId);
  const history = usePatientHistory(lead.matched_patient_id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now] = useState(() => new Date());
  const open = lead.status === 'novo' || lead.status === 'em_contato';

  // Triagem automática na primeira abertura de um pedido em aberto.
  const runTriage = triage.mutate;
  useEffect(() => {
    if (lead.ai_triage || !open || autoTriaged.has(lead.id)) return;
    autoTriaged.add(lead.id);
    runTriage(lead.id);
  }, [lead.id, lead.ai_triage, open, runTriage]);

  const t = lead.ai_triage;
  const [message, setMessage] = useState<string | null>(null);
  const whatsText = message ?? t?.mensagem_whatsapp ?? '';
  const service = t?.servico_sugerido_id ? services.find((s) => s.id === t.servico_sugerido_id) : null;
  const age = ageFrom(lead.birth_date, now);

  const onWhatsApp = () => {
    window.open(whatsappLink(lead.phone, whatsText || undefined), '_blank', 'noopener');
    if (lead.status === 'novo') setStatus.mutate({ id: lead.id, status: 'em_contato' });
  };

  const onAccept = (patientId?: string | null) => {
    accept.mutate({ id: lead.id, patientId }, {
      onSuccess: (pid) => {
        showToast(patientId ? 'Pedido ligado ao cadastro do paciente.' : 'Paciente cadastrado com a ficha de saúde preenchida.', 'success');
        onAccepted(pid);
      },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Não foi possível aceitar o pedido.', 'error'),
    });
  };

  const changeStatus = (status: Lead['status'], msg: string) =>
    setStatus.mutate({ id: lead.id, status }, {
      onSuccess: () => showToast(msg, 'success'),
      onError: () => showToast('Não foi possível atualizar o pedido.', 'error'),
    });

  const answers: [string, React.ReactNode][] = [
    ['WhatsApp', lead.phone],
    ['E-mail', lead.email],
    ['Nascimento', lead.birth_date ? `${fmtDate(`${lead.birth_date}T12:00:00`)}${age !== null ? ` (${age} anos)` : ''}` : null],
    ['Sexo biológico', lead.biological_sex === 'F' ? 'Feminino' : lead.biological_sex === 'M' ? 'Masculino' : null],
    ['Atendimento', [modalityLabel(lead.modality), lead.city].filter(Boolean).join(' · ') || null],
    ['Objetivo', goalLabel(lead.goal)],
    ['Nas palavras', lead.goal_details],
    ['Prazo ou evento', lead.deadline],
    ['Já teve nutricionista', lead.had_nutritionist === null ? null : lead.had_nutritionist ? 'Sim' : 'Não'],
    ['Condições', lead.conditions.length ? lead.conditions.map(conditionLabel).join(', ') : 'Nenhuma marcada'],
    ['Medicamentos', lead.medications],
    ['Gestação', lead.pregnancy === 'gestante' ? 'Gestante' : lead.pregnancy === 'amamentando' ? 'Amamentando' : null],
    ['Alergias', lead.allergies],
    ['Restrições', lead.restrictions],
    ['Peso / altura', lead.weight_kg || lead.height_cm ? `${lead.weight_kg ?? '?'} kg / ${lead.height_cm ?? '?'} cm` : null],
    ['Sobre a saúde', lead.health_notes],
    ['Dias', lead.preferred_days.length ? lead.preferred_days.map(weekdayShort).join(', ') : null],
    ['Períodos', lead.preferred_periods.length ? lead.preferred_periods.map(periodLabel).join(', ') : null],
    ['Conheceu por', [sourceLabel(lead.source), lead.source_detail ? `“${lead.source_detail}”` : null].filter(Boolean).join(' · ') || null],
    ['WhatsApp liberado', lead.consent_whatsapp ? 'Sim' : 'Não (não aceitou contato por WhatsApp)'],
  ];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 lg:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Todos os pedidos
      </button>

      {/* Cabeçalho + ações */}
      <Card padding="sm" radius="2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">{lead.name}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {[age !== null ? `${age} anos` : null, goalLabel(lead.goal), `recebido ${fmtAgo(lead.created_at)}`].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill className={LEAD_STATUS_STYLE[lead.status]}>{STATUS_LABEL[lead.status]}</Pill>
              {leadFlags(lead, now).map((f) => <Pill key={f.label} className={f.className}>{f.label}</Pill>)}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {open && (lead.matched_patient_id ? (
            <Button onClick={() => onAccept(lead.matched_patient_id)} loading={accept.isPending} leftIcon={<UserCheck className="h-4 w-4" />}>
              Aceitar e ligar ao cadastro
            </Button>
          ) : (
            <Button
              onClick={() => onAccept(null)}
              loading={accept.isPending}
              disabled={limitReached}
              title={limitReached ? 'Limite de pacientes do seu plano atingido' : undefined}
              leftIcon={<UserPlus className="h-4 w-4" />}
            >
              Aceitar como paciente
            </Button>
          ))}
          {lead.status === 'convertido' && lead.converted_patient_id && (
            <>
              <Button onClick={() => onInvite(lead.converted_patient_id!)} leftIcon={<UserRound className="h-4 w-4" />}>
                Convidar para o app
              </Button>
              <Link to={`/acompanhamento?paciente=${lead.converted_patient_id}`} className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Abrir paciente
              </Link>
            </>
          )}
          <Button
            variant="secondary"
            onClick={onWhatsApp}
            className="hover:bg-[#25D366]/10"
            leftIcon={<WhatsAppIcon className="h-4 w-4 text-[#25D366]" />}
          >
            WhatsApp
          </Button>
          {lead.status === 'novo' && (
            <Button variant="ghost" onClick={() => changeStatus('em_contato', 'Marcado como em contato.')}>Marcar em contato</Button>
          )}
          {open && (
            <Button variant="ghost" onClick={() => changeStatus('descartado', 'Pedido descartado.')} leftIcon={<X className="h-4 w-4" />}>
              Descartar
            </Button>
          )}
          {lead.status === 'descartado' && (
            <>
              <Button variant="ghost" onClick={() => changeStatus('novo', 'Pedido reaberto.')}>Reabrir</Button>
              <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => setConfirmDelete(true)} leftIcon={<Trash2 className="h-4 w-4" />}>
                Excluir dados
              </Button>
            </>
          )}
        </div>
        {open && !lead.matched_patient_id && limitReached && (
          <p className="mt-2 text-xs text-rose-600">Limite de pacientes do seu plano atingido. Libere espaço ou mude de plano para aceitar.</p>
        )}
        {open && (
          <p className="mt-2 text-xs text-slate-500">
            {lead.matched_patient_id
              ? 'Aceitar liga este pedido ao cadastro existente e completa só os campos vazios da ficha.'
              : 'Aceitar cadastra o paciente e já preenche a ficha de saúde com as respostas. Depois você pode convidar para o app, onde ele marca a consulta.'}
          </p>
        )}
      </Card>

      {/* Paciente existente */}
      {lead.matched_patient_id && (
        <Card padding="sm" radius="2xl" className="border-teal-100 bg-teal-50/40">
          <h3 className="text-sm font-semibold text-slate-900">Já está no seu cadastro</h3>
          {history.isPending ? (
            <div className="mt-2 h-10 animate-pulse rounded-lg bg-slate-100" />
          ) : history.data ? (
            <p className="mt-1 text-sm text-slate-600">
              <Link to={`/acompanhamento?paciente=${lead.matched_patient_id}`} className="font-medium text-[#5024fc] hover:underline">{history.data.name}</Link>
              {` · paciente desde ${fmtDate(history.data.since)} · ${history.data.status === 'ativo' ? 'ativo' : 'inativo'}. `}
              {history.data.doneCount === 0
                ? 'Nenhuma consulta concluída. '
                : `${history.data.doneCount} ${history.data.doneCount === 1 ? 'consulta concluída' : 'consultas concluídas'}, a última ${fmtAgo(history.data.lastVisit!)}. `}
              {history.data.nextVisit ? `Próxima consulta em ${fmtDate(history.data.nextVisit)}.` : 'Sem consulta marcada.'}
              {history.data.hasPortal ? ' Já usa o app.' : ''}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">Cadastro encontrado, mas sem acesso aos detalhes.</p>
          )}
        </Card>
      )}

      {/* Triagem da IA */}
      <Card padding="sm" radius="2xl" as="section" aria-labelledby={`triage-${lead.id}`}>
        <div className="flex items-center justify-between gap-3">
          <h3 id={`triage-${lead.id}`} className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-primary-600" aria-hidden="true" /> Triagem
          </h3>
          {t && (
            <button
              type="button"
              onClick={() => triage.mutate(lead.id)}
              disabled={triage.isPending}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', triage.isPending && 'animate-spin')} aria-hidden="true" /> Refazer
            </button>
          )}
        </div>

        {triage.isPending && !t ? (
          <div className="mt-3 space-y-2" aria-busy="true" aria-label="Fazendo a triagem">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : !t ? (
          <div className="mt-2 text-sm text-slate-500">
            {triage.isError ? (triage.error instanceof Error ? triage.error.message : 'Não foi possível fazer a triagem.') : 'Sem triagem para este pedido.'}{' '}
            <button type="button" onClick={() => triage.mutate(lead.id)} className="cursor-pointer font-medium text-[#5024fc] hover:underline">
              Fazer triagem agora
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <div>
              <Pill className={PRIORITY[t.prioridade].className}>{PRIORITY[t.prioridade].label}</Pill>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{t.resumo}</p>
              <p className="mt-1 text-xs text-slate-500">{t.prioridade_motivo}</p>
            </div>

            {t.pontos_atencao.length > 0 && (
              <ul className="space-y-2">
                {t.pontos_atencao.map((p, i) => {
                  const s = POINT[p.tipo] ?? POINT.info;
                  return (
                    <li key={i} className="flex gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
                      <s.icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.className)} aria-label={s.label} />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-slate-900">{p.titulo}</p>
                        <p className="text-slate-600">{p.detalhe}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {service && (
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-900">Serviço sugerido:</span> {service.name}
                {t.servico_motivo ? <span className="text-slate-500"> · {t.servico_motivo}</span> : null}
              </p>
            )}

            {t.perguntas_consulta.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-900">Para explorar na primeira conversa</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                  {t.perguntas_consulta.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}

            <div>
              <Textarea
                label="Primeira mensagem (WhatsApp)"
                rows={4}
                value={whatsText}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={onWhatsApp} leftIcon={<WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />}>
                  Enviar pelo WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Copy className="h-3.5 w-3.5" />}
                  onClick={async () => showToast((await copyText(whatsText)) ? 'Mensagem copiada.' : 'Não foi possível copiar.', 'info')}
                >
                  Copiar
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-400">Organizado pela IA a partir das respostas. Não substitui sua avaliação.</p>
          </div>
        )}
      </Card>

      {/* Respostas */}
      <Card padding="sm" radius="2xl" as="section" aria-labelledby={`answers-${lead.id}`}>
        <h3 id={`answers-${lead.id}`} className="text-sm font-semibold text-slate-900">Respostas</h3>
        <dl className="mt-2 divide-y divide-slate-100">
          {answers.filter(([, v]) => v !== null && v !== '').map(([k, v]) => (
            <div key={k} className="grid grid-cols-1 gap-0.5 py-2 text-sm sm:grid-cols-[10rem_1fr] sm:gap-3">
              <dt className="text-slate-500">{k}</dt>
              <dd className="whitespace-pre-line text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Consentimento para uso dos dados de saúde registrado no envio.
        </p>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir os dados deste pedido?"
        message="As respostas de saúde e o contato serão apagados de vez. Use quando a pessoa pedir ou para remover spam."
        confirmLabel="Excluir"
        tone="danger"
        confirming={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate(lead.id, {
          onSuccess: () => { setConfirmDelete(false); showToast('Dados excluídos.', 'success'); onBack(); },
          onError: () => showToast('Não foi possível excluir.', 'error'),
        })}
      />
    </div>
  );
};
