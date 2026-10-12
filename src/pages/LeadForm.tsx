import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Apple, ArrowLeft, ArrowRight, Check, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { Button, DateInput, Input, Textarea } from '../components/ui';
import { cn } from '../lib/cn';
import { usePublicLeadForm, useSubmitLead } from '../hooks/queries/useLeads';
import {
  CONDITIONS, GOALS, MODALITIES, PERIODS, SOURCES, WEEKDAYS,
  type LeadCondition, type LeadGoal, type LeadModality, type LeadPeriod, type LeadPregnancy, type LeadSource,
} from '../lib/leads';

/**
 * Formulário público de triagem (migration 0042). A pessoa chega pelo link que
 * o nutricionista divulga nas redes (/n/<slug>) e o pedido cai na tela de
 * Triagem dele. Curto de propósito: o detalhe fica para a anamnese.
 */

interface FormState {
  name: string;
  phone: string;
  email: string;
  birth_date: string;
  biological_sex: 'F' | 'M' | '';
  modality: LeadModality | '';
  city: string;
  goal: LeadGoal | '';
  goal_details: string;
  deadline: string;
  had_nutritionist: boolean | null;
  conditions: LeadCondition[];
  no_conditions: boolean;
  medications: string;
  pregnancy: LeadPregnancy | '';
  allergies: string;
  restrictions: string;
  weight_kg: string;
  height_cm: string;
  health_notes: string;
  preferred_days: number[];
  preferred_periods: LeadPeriod[];
  source: LeadSource | '';
  consent_health: boolean;
  consent_whatsapp: boolean;
  website: string; // campo isca (robôs)
}

const EMPTY: FormState = {
  name: '', phone: '', email: '', birth_date: '', biological_sex: '', modality: '', city: '',
  goal: '', goal_details: '', deadline: '', had_nutritionist: null,
  conditions: [], no_conditions: false, medications: '', pregnancy: '', allergies: '', restrictions: '',
  weight_kg: '', height_cm: '', health_notes: '',
  preferred_days: [], preferred_periods: [], source: '', consent_health: false, consent_whatsapp: true, website: '',
};

const STEPS = [
  { label: 'Contato', title: 'Vamos começar seu acompanhamento', hint: 'Leva uns 3 minutos. Com isso, sua primeira conversa já começa de onde importa.' },
  { label: 'Objetivo', title: 'O que você busca', hint: 'Conte com suas palavras. Não existe resposta errada.' },
  { label: 'Saúde', title: 'Sua saúde', hint: 'Só o essencial para preparar o atendimento. Os detalhes ficam para a consulta.' },
  { label: 'Finalizar', title: 'Para finalizar', hint: 'Suas preferências ajudam a combinar o melhor horário.' },
] as const;

/** (11) 91234-5678 enquanto digita. */
const maskPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode; className?: string }> = ({ on, onClick, children, className }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={cn(
      'min-h-11 rounded-xl border px-3.5 py-2 text-left text-sm font-medium transition-colors cursor-pointer',
      on ? 'border-[#5024fc] bg-[#5024fc]/5 text-[#3a17c4]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
      className,
    )}
  >
    {children}
  </button>
);

const Group: React.FC<{ label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode }> = ({ label, hint, required, error, children }) => (
  <fieldset>
    <legend className="mb-1 block text-sm font-medium text-slate-700">
      {label}
      {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
    </legend>
    {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
    <div className={cn('flex flex-wrap gap-2', !hint && 'mt-1.5')}>{children}</div>
    {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
  </fieldset>
);

export const LeadForm: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const formQuery = usePublicLeadForm(slug);
  const submit = useSubmitLead(slug);

  const [f, setF] = useState<FormState>(EMPTY);
  const [step, setStep] = useState(0);
  // Etapa mais adiantada já liberada (dá para voltar a ela pela lateral).
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const info = formQuery.data;
  const nutriFirst = info?.nutritionist_name.trim().split(/\s+/)[0] ?? '';

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (f.name.trim().length < 2) e.name = 'Informe seu nome.';
      const digits = f.phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) e.phone = 'Informe o WhatsApp com DDD.';
      if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = 'E-mail inválido.';
    }
    if (s === 1 && !f.goal) e.goal = 'Escolha o que mais se aproxima do seu objetivo.';
    if (s === 3 && !f.consent_health) e.consent_health = 'Para enviar, autorize o uso dessas informações.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(step)) return;
    setStep(step + 1);
    setReached((r) => Math.max(r, step + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goTo = (target: number) => {
    // Avançar exige a etapa atual válida; voltar é livre.
    if (target === step || target > reached || (target > step && !validate(step))) return;
    setErrors({});
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => goTo(step - 1);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    if (!validate(step)) return;
    submit.mutate({
      name: f.name.trim(),
      phone: f.phone,
      email: f.email.trim() || null,
      birth_date: f.birth_date || null,
      biological_sex: f.biological_sex || null,
      modality: f.modality || null,
      city: f.city.trim() || null,
      goal: f.goal,
      goal_details: f.goal_details.trim() || null,
      deadline: f.deadline.trim() || null,
      had_nutritionist: f.had_nutritionist,
      conditions: f.no_conditions ? [] : f.conditions,
      medications: f.medications.trim() || null,
      pregnancy: f.biological_sex === 'M' ? null : f.pregnancy || null,
      allergies: f.allergies.trim() || null,
      restrictions: f.restrictions.trim() || null,
      weight_kg: f.weight_kg.trim() || null,
      height_cm: f.height_cm.trim() || null,
      health_notes: f.health_notes.trim() || null,
      preferred_days: f.preferred_days,
      preferred_periods: f.preferred_periods,
      source: f.source || null,
      source_detail: searchParams.get('origem'),
      consent_health: f.consent_health,
      consent_whatsapp: f.consent_whatsapp,
      website: f.website,
    }, {
      onSuccess: () => {
        setDone(true);
        window.scrollTo({ top: 0 });
      },
    });
  };

  // --- Moldura (mesma do Portal do Paciente) ----------------------------------
  // Fora de <main> de propósito (landmark via role="main"): a camada global de
  // index.css re-estiliza `main label`/`main input`.

  const brand = (
    <span className="flex items-center">
      <Apple className="h-7 w-7 text-teal-200" aria-hidden="true" />
      <span className="ml-2.5 text-lg font-semibold tracking-tight text-white">NutriAI</span>
    </span>
  );

  // withSidebar: no desktop a marca já está na lateral.
  const topBar = (withSidebar: boolean) => (
    <header className={cn(
      'sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-teal-700/20 bg-sidebar-teal px-4 text-white shadow-sm sm:px-6 lg:px-8',
      withSidebar && 'lg:justify-end',
    )}>
      <span className={cn(withSidebar && 'lg:hidden')}>{brand}</span>
      <span className="flex items-center gap-1.5 text-xs font-medium text-teal-100">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Formulário seguro
      </span>
    </header>
  );

  const centered = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col bg-slate-200 font-sans text-slate-800 antialiased">
      {topBar(false)}
      <div role="main" className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">{children}</div>
      </div>
    </div>
  );

  if (formQuery.isPending) {
    return centered(
      <div className="space-y-4" aria-busy="true" aria-label="Carregando formulário">
        <div className="h-12 w-12 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
      </div>,
    );
  }

  if (formQuery.isError || !info) {
    return centered(
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Link indisponível</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          Este formulário não existe ou foi desativado. Fale com o(a) nutricionista pelo canal onde você encontrou o link.
        </p>
      </>,
    );
  }

  if (done) {
    return centered(
      <>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Recebemos suas informações</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          {nutriFirst ? `${nutriFirst} vai` : 'O(a) nutricionista vai'} analisar com calma e entrar em contato pelo WhatsApp
          <strong className="font-medium text-slate-800"> {f.phone}</strong> para combinar sua consulta.
        </p>
        <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-500">
          {info.nutritionist_name} · {info.clinic_name}
        </p>
      </>,
    );
  }

  const place = [info.clinic_city, info.clinic_state].filter(Boolean).join(' / ');
  const avatar = (size: string, tone: string) => info.avatar_url ? (
    <img src={info.avatar_url} alt="" className={cn(size, 'shrink-0 rounded-2xl object-cover')} />
  ) : (
    <div className={cn(size, tone, 'grid shrink-0 place-items-center rounded-2xl text-lg font-semibold')}>
      {nutriFirst.slice(0, 1).toUpperCase()}
    </div>
  );
  const current = STEPS[step];

  return (
    <div className="min-h-screen bg-slate-200 font-sans text-slate-800 antialiased selection:bg-teal-500/20 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      {/* Lateral (desktop): quem atende + etapas, no padrão do portal. */}
      <aside className="sticky top-0 hidden h-screen flex-col bg-sidebar-teal text-white lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-teal-700/20 px-6">{brand}</div>

        <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4 pt-6">
          <div className="flex items-center gap-3 rounded-2xl bg-teal-700/40 p-3">
            {avatar('h-12 w-12', 'bg-white/15 text-white ring-1 ring-white/30')}
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold text-white">{info.nutritionist_name}</p>
              <p className="truncate text-xs text-teal-100">{['Nutricionista', info.crn ? `CRN ${info.crn}` : null].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <p className="mt-3 px-3 text-xs leading-relaxed text-teal-100/80">
            {info.clinic_name}{place ? ` · ${place}` : ''}
          </p>

          <nav aria-label="Etapas" className="mt-6">
            <ol className="space-y-1">
              {STEPS.map((s, i) => {
                const doneStep = i < step;
                const active = i === step;
                const enabled = i <= reached;
                return (
                  <li key={s.label}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      disabled={!enabled}
                      aria-current={active ? 'step' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md p-3 text-left text-sm font-medium leading-6 transition-colors duration-200',
                        active ? 'bg-teal-700/60 text-white' : enabled ? 'cursor-pointer text-teal-100 hover:bg-teal-700/40 hover:text-white' : 'cursor-default text-teal-100/50',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
                          active ? 'bg-white text-teal-900' : doneStep ? 'bg-teal-300/30 text-white' : 'ring-1 ring-teal-300/40',
                        )}
                      >
                        {doneStep ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                      </span>
                      {s.label}
                      {doneStep && <span className="sr-only"> (preenchida)</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="mt-auto border-t border-teal-700/30 px-3 pt-4 text-xs leading-relaxed text-teal-100/80">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-200" aria-hidden="true" />
              Só {nutriFirst || 'o(a) nutricionista'} vê suas respostas. Dados tratados conforme a LGPD.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {topBar(true)}

        <div role="main" className="flex-1">
          <div className="mx-auto max-w-3xl px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-10">
            {/* Celular/tablet: quem atende + progresso. */}
            <div className="mb-5 flex items-center gap-3.5 lg:hidden">
              {avatar('h-12 w-12', 'bg-teal-50 text-teal-700')}
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-900">{info.nutritionist_name}</p>
                <p className="truncate text-sm text-slate-500">
                  {['Nutricionista', info.crn ? `CRN ${info.crn}` : null, info.clinic_name].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Etapa {step + 1} de {STEPS.length}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 lg:text-3xl">{current.title}</h1>
              <p className="mt-1 text-sm text-slate-500">{current.hint}</p>
              <ol className="mt-4 grid grid-cols-4 gap-1.5 lg:hidden" aria-hidden="true">
                {STEPS.map((s, i) => (
                  <li key={s.label} className={cn('h-1.5 rounded-full', i <= step ? 'bg-[#5024fc]' : 'bg-slate-300')} />
                ))}
              </ol>
            </div>

            <form onSubmit={onSubmit} noValidate className="relative rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:p-8">
              {/* Campo isca: invisível para pessoas, preenchido por robôs. */}
              <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                <label>Site<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} /></label>
              </div>

              <div className="space-y-6">
                {step === 0 && (
                  <>
                    <Input label="Nome completo" required autoComplete="name" value={f.name} error={errors.name}
                      onChange={(e) => set('name', e.target.value)} />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Input label="WhatsApp" required type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 91234-5678"
                        value={f.phone} error={errors.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} />
                      <Input label="E-mail" type="email" inputMode="email" autoComplete="email" value={f.email} error={errors.email}
                        onChange={(e) => set('email', e.target.value)} />
                      <DateInput label="Data de nascimento" value={f.birth_date} max={today} min="1900-01-01"
                        onChange={(v) => set('birth_date', v)} />
                      <Input label="Cidade" autoComplete="address-level2" value={f.city} onChange={(e) => set('city', e.target.value)} />
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Group label="Sexo biológico" hint="Muda as referências usadas na avaliação nutricional.">
                        <Chip on={f.biological_sex === 'F'} onClick={() => set('biological_sex', f.biological_sex === 'F' ? '' : 'F')}>Feminino</Chip>
                        <Chip on={f.biological_sex === 'M'} onClick={() => set('biological_sex', f.biological_sex === 'M' ? '' : 'M')}>Masculino</Chip>
                      </Group>
                      <Group label="Como prefere ser atendido(a)?" hint="Presencial no consultório ou por vídeo.">
                        {MODALITIES.map((m) => (
                          <Chip key={m.value} on={f.modality === m.value} onClick={() => set('modality', f.modality === m.value ? '' : m.value)}>{m.label}</Chip>
                        ))}
                      </Group>
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <Group label="Qual é o seu objetivo principal?" required error={errors.goal}>
                      {GOALS.map((g) => (
                        <Chip key={g.value} on={f.goal === g.value} onClick={() => set('goal', g.value)}>{g.label}</Chip>
                      ))}
                    </Group>
                    <Textarea label="Conte em poucas palavras o que você busca" rows={4} maxLength={1000}
                      placeholder="Ex.: quero perder uns 8 kg sem dieta radical, tenho muita fome à noite…"
                      value={f.goal_details} onChange={(e) => set('goal_details', e.target.value)} />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Input label="Tem algum prazo ou evento?" placeholder="Ex.: casamento em março" maxLength={120}
                        value={f.deadline} onChange={(e) => set('deadline', e.target.value)} />
                      <Group label="Já fez acompanhamento com nutricionista antes?">
                        <Chip on={f.had_nutritionist === true} onClick={() => set('had_nutritionist', f.had_nutritionist === true ? null : true)}>Sim</Chip>
                        <Chip on={f.had_nutritionist === false} onClick={() => set('had_nutritionist', f.had_nutritionist === false ? null : false)}>Não</Chip>
                      </Group>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Group label="Tem alguma dessas condições diagnosticadas?" hint="Marque todas que se aplicam.">
                      {CONDITIONS.map((c) => (
                        <Chip key={c.value} on={!f.no_conditions && f.conditions.includes(c.value)}
                          onClick={() => setF((s) => ({ ...s, no_conditions: false, conditions: toggle(s.conditions, c.value) }))}>
                          {c.label}
                        </Chip>
                      ))}
                      <Chip on={f.no_conditions} onClick={() => setF((s) => ({ ...s, no_conditions: !s.no_conditions, conditions: [] }))}>Nenhuma</Chip>
                    </Group>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Input label="Usa algum medicamento todos os dias?" placeholder="Nome dos medicamentos, se souber" maxLength={500}
                        wrapperClassName={f.biological_sex === 'M' ? 'sm:col-span-2' : undefined}
                        value={f.medications} onChange={(e) => set('medications', e.target.value)} />
                      {f.biological_sex !== 'M' && (
                        <Group label="Está gestante ou amamentando?">
                          <Chip on={f.pregnancy === 'nao'} onClick={() => set('pregnancy', f.pregnancy === 'nao' ? '' : 'nao')}>Não</Chip>
                          <Chip on={f.pregnancy === 'gestante'} onClick={() => set('pregnancy', f.pregnancy === 'gestante' ? '' : 'gestante')}>Gestante</Chip>
                          <Chip on={f.pregnancy === 'amamentando'} onClick={() => set('pregnancy', f.pregnancy === 'amamentando' ? '' : 'amamentando')}>Amamentando</Chip>
                        </Group>
                      )}
                      <Input label="Alergias ou intolerâncias" placeholder="Ex.: lactose, camarão" maxLength={500}
                        value={f.allergies} onChange={(e) => set('allergies', e.target.value)} />
                      <Input label="Restrições ou escolhas alimentares" placeholder="Ex.: vegetariano, não como carne vermelha" maxLength={500}
                        value={f.restrictions} onChange={(e) => set('restrictions', e.target.value)} />
                      <Input label="Peso aproximado (kg)" inputMode="decimal" placeholder="Ex.: 72" maxLength={5}
                        value={f.weight_kg} onChange={(e) => set('weight_kg', e.target.value.replace(/[^\d.,]/g, ''))} />
                      <Input label="Altura (cm)" inputMode="decimal" placeholder="Ex.: 165" maxLength={5}
                        value={f.height_cm} onChange={(e) => set('height_cm', e.target.value.replace(/[^\d.,]/g, ''))} />
                    </div>
                    <Textarea label="Há algo sobre sua saúde ou sua relação com a comida que seja importante saber antes?" rows={3} maxLength={1000}
                      hint="Opcional. Ex.: cirurgias, episódios de compulsão, dietas muito restritivas no passado."
                      value={f.health_notes} onChange={(e) => set('health_notes', e.target.value)} />
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <Group label="Quais dias costumam ser melhores?" hint="A consulta é combinada depois.">
                        {WEEKDAYS.map((d) => (
                          <Chip key={d.value} className="min-w-[3.25rem] text-center" on={f.preferred_days.includes(d.value)}
                            onClick={() => set('preferred_days', toggle(f.preferred_days, d.value))}>{d.short}</Chip>
                        ))}
                      </Group>
                      <Group label="E qual período?" hint="Marque quantos quiser.">
                        {PERIODS.map((p) => (
                          <Chip key={p.value} on={f.preferred_periods.includes(p.value)}
                            onClick={() => set('preferred_periods', toggle(f.preferred_periods, p.value))}>{p.label}</Chip>
                        ))}
                      </Group>
                    </div>
                    <Group label="Como você conheceu o trabalho?">
                      {SOURCES.map((s) => (
                        <Chip key={s.value} on={f.source === s.value} onClick={() => set('source', f.source === s.value ? '' : s.value)}>{s.label}</Chip>
                      ))}
                    </Group>

                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <label className="flex items-start gap-3">
                        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[#5024fc]"
                          checked={f.consent_health} onChange={(e) => set('consent_health', e.target.checked)}
                          aria-invalid={errors.consent_health ? true : undefined} />
                        <span className="text-sm text-slate-700">
                          Autorizo {info.nutritionist_name} a usar as informações de saúde que enviei para avaliar meu caso e
                          preparar meu atendimento. <span className="text-rose-500" aria-hidden="true">*</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            Seus dados ficam visíveis só para o(a) nutricionista e são tratados conforme a LGPD.{' '}
                            <a href="/privacidade" target="_blank" rel="noreferrer" className="underline hover:text-slate-700">Política de privacidade</a>
                          </span>
                        </span>
                      </label>
                      {errors.consent_health && <p className="text-xs text-rose-600">{errors.consent_health}</p>}
                      <label className="flex items-start gap-3">
                        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[#5024fc]"
                          checked={f.consent_whatsapp} onChange={(e) => set('consent_whatsapp', e.target.checked)} />
                        <span className="text-sm text-slate-700">Aceito receber contato e lembretes de consulta pelo WhatsApp.</span>
                      </label>
                    </div>
                  </>
                )}
              </div>

              {submit.isError && (
                <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                  {submit.error instanceof Error ? submit.error.message : 'Não foi possível enviar agora.'}
                </p>
              )}

              <div className="mt-8 flex items-center gap-3 border-t border-slate-100 pt-6 sm:justify-between">
                {step > 0 ? (
                  <Button variant="secondary" onClick={back} leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} className="h-11">
                    Voltar
                  </Button>
                ) : <span className="hidden sm:block" />}
                <Button type="submit" loading={submit.isPending} className="h-11 flex-1 text-[15px] sm:min-w-44 sm:flex-none">
                  {step < STEPS.length - 1 ? <>Continuar <ArrowRight className="h-4 w-4" aria-hidden="true" /></> : 'Enviar'}
                </Button>
              </div>
            </form>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500 lg:hidden">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Só {nutriFirst || 'o(a) nutricionista'} vê suas respostas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
