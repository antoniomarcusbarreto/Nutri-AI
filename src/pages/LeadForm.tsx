import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Apple, ArrowLeft, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
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

const STEPS = ['Contato', 'Objetivo', 'Saúde', 'Finalizar'] as const;

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
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => {
    setErrors({});
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  // --- Estados de carregamento / link inválido / enviado ---------------------

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-lg">{children}</div>
      <p className="mt-10 flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <Apple className="h-3.5 w-3.5" aria-hidden="true" /> Formulário seguro via NutriAI
      </p>
    </div>
  );

  if (formQuery.isPending) {
    return shell(
      <div className="space-y-4" aria-busy="true" aria-label="Carregando formulário">
        <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-96 animate-pulse rounded-3xl bg-slate-200/70" />
      </div>,
    );
  }

  if (formQuery.isError || !info) {
    return shell(
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Link indisponível</h1>
        <p className="mt-2 text-sm text-slate-600">
          Este formulário não existe ou foi desativado. Fale com o(a) nutricionista pelo canal onde você encontrou o link.
        </p>
      </div>,
    );
  }

  if (done) {
    return shell(
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-teal-700">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Recebemos suas informações</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          {nutriFirst ? `${nutriFirst} vai` : 'O(a) nutricionista vai'} analisar com calma e entrar em contato pelo WhatsApp
          <strong className="font-medium text-slate-800"> {f.phone}</strong> para combinar sua consulta.
        </p>
      </div>,
    );
  }

  // --- Formulário -------------------------------------------------------------

  return shell(
    <>
      <header className="mb-6 flex items-center gap-3.5">
        {info.avatar_url ? (
          <img src={info.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-teal-50 text-lg font-semibold text-teal-700">
            {nutriFirst.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{info.nutritionist_name}</p>
          <p className="truncate text-sm text-slate-500">
            {['Nutricionista', info.crn ? `CRN ${info.crn}` : null, info.clinic_name].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>

      <form onSubmit={onSubmit} noValidate className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        {step === 0 && (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Vamos começar seu acompanhamento</h1>
            <p className="mt-1.5 text-sm text-slate-600">Leva uns 3 minutos. Com isso, sua primeira conversa já começa de onde importa.</p>
          </div>
        )}

        <ol className="mb-6 grid grid-cols-4 gap-1.5" aria-label="Etapas">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined}>
              <div className={cn('h-1.5 rounded-full', i <= step ? 'bg-[#5024fc]' : 'bg-slate-200')} />
              <span className={cn('mt-1.5 block text-xs', i === step ? 'font-medium text-slate-900' : 'text-slate-400')}>{label}</span>
            </li>
          ))}
        </ol>

        {/* Campo isca: invisível para pessoas, preenchido por robôs. */}
        <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
          <label>Site<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} /></label>
        </div>

        <div className="space-y-5">
          {step === 0 && (
            <>
              <Input label="Nome completo" required autoComplete="name" value={f.name} error={errors.name}
                onChange={(e) => set('name', e.target.value)} />
              <Input label="WhatsApp" required type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 91234-5678"
                value={f.phone} error={errors.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} />
              <Input label="E-mail" type="email" inputMode="email" autoComplete="email" value={f.email} error={errors.email}
                onChange={(e) => set('email', e.target.value)} />
              <DateInput label="Data de nascimento" value={f.birth_date} max={today} min="1900-01-01"
                onChange={(v) => set('birth_date', v)} />
              <Group label="Sexo biológico" hint="Muda as referências usadas na avaliação nutricional.">
                <Chip on={f.biological_sex === 'F'} onClick={() => set('biological_sex', f.biological_sex === 'F' ? '' : 'F')}>Feminino</Chip>
                <Chip on={f.biological_sex === 'M'} onClick={() => set('biological_sex', f.biological_sex === 'M' ? '' : 'M')}>Masculino</Chip>
              </Group>
              <Group label="Como prefere ser atendido(a)?">
                {MODALITIES.map((m) => (
                  <Chip key={m.value} on={f.modality === m.value} onClick={() => set('modality', f.modality === m.value ? '' : m.value)}>{m.label}</Chip>
                ))}
              </Group>
              <Input label="Cidade" autoComplete="address-level2" value={f.city} onChange={(e) => set('city', e.target.value)} />
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
              <Input label="Tem algum prazo ou evento?" placeholder="Ex.: casamento em março" maxLength={120}
                value={f.deadline} onChange={(e) => set('deadline', e.target.value)} />
              <Group label="Já fez acompanhamento com nutricionista antes?">
                <Chip on={f.had_nutritionist === true} onClick={() => set('had_nutritionist', f.had_nutritionist === true ? null : true)}>Sim</Chip>
                <Chip on={f.had_nutritionist === false} onClick={() => set('had_nutritionist', f.had_nutritionist === false ? null : false)}>Não</Chip>
              </Group>
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
              <Input label="Usa algum medicamento todos os dias?" placeholder="Nome dos medicamentos, se souber" maxLength={500}
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
              <div className="grid grid-cols-2 gap-3">
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
              <Group label="Quais dias costumam ser melhores?" hint="Ajuda a sugerir um horário. A consulta é combinada depois.">
                {WEEKDAYS.map((d) => (
                  <Chip key={d.value} className="min-w-[3.25rem] text-center" on={f.preferred_days.includes(d.value)}
                    onClick={() => set('preferred_days', toggle(f.preferred_days, d.value))}>{d.short}</Chip>
                ))}
              </Group>
              <Group label="E qual período?">
                {PERIODS.map((p) => (
                  <Chip key={p.value} on={f.preferred_periods.includes(p.value)}
                    onClick={() => set('preferred_periods', toggle(f.preferred_periods, p.value))}>{p.label}</Chip>
                ))}
              </Group>
              <Group label="Como você conheceu o trabalho?">
                {SOURCES.map((s) => (
                  <Chip key={s.value} on={f.source === s.value} onClick={() => set('source', f.source === s.value ? '' : s.value)}>{s.label}</Chip>
                ))}
              </Group>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-[#5024fc]"
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
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-[#5024fc]"
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

        <div className="mt-7 flex items-center gap-3">
          {step > 0 && (
            <Button variant="secondary" onClick={back} leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} className="h-11">
              Voltar
            </Button>
          )}
          <Button type="submit" fullWidth loading={submit.isPending} className="h-11 text-[15px]">
            {step < STEPS.length - 1 ? <>Continuar <ArrowRight className="h-4 w-4" aria-hidden="true" /></> : 'Enviar'}
          </Button>
        </div>
        {step === STEPS.length - 1 && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Só {nutriFirst || 'o(a) nutricionista'} vê suas respostas.
          </p>
        )}
      </form>
    </>,
  );
};
