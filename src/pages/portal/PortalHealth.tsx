import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { usePortalHealth, useSavePortalHealth, type PortalHealth } from '../../hooks/queries/usePortal';
import { Button, Input, Select, Textarea } from '../../components/ui';
import { PortalPageHeader } from '../../components/portal/PortalPageHeader';

/**
 * Ficha de saúde (pré-consulta) preenchida pelo paciente dentro do portal —
 * substitui o antigo link público /ficha/:token (migration 0033).
 */

type Fields = Omit<PortalHealth, 'updated_at'>;

const ACTIVITY = [
  { value: 'Sedentário', label: 'Sedentário (nenhuma atividade física)' },
  { value: 'Levemente Ativo', label: 'Levemente ativo (exercício leve 1–3 dias/semana)' },
  { value: 'Moderadamente Ativo', label: 'Moderadamente ativo (exercício moderado 3–5 dias/semana)' },
  { value: 'Muito Ativo', label: 'Muito ativo (exercício intenso 6–7 dias/semana)' },
];

const errText = (err: unknown) =>
  (err instanceof Error && err.message) || (err as { message?: string })?.message || 'Não foi possível salvar. Tente novamente.';

const HealthForm: React.FC<{ initial: PortalHealth; canEdit: boolean; patientId: string }> = ({ initial, canEdit, patientId }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const save = useSavePortalHealth(patientId);
  const [form, setForm] = useState<Fields>({
    allergies: initial.allergies,
    dietary_restrictions: initial.dietary_restrictions,
    pathologies: initial.pathologies,
    medications: initial.medications,
    physical_activity_level: initial.physical_activity_level,
    profession: initial.profession,
    sleep_quality: initial.sleep_quality,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!form.physical_activity_level) errs.physical_activity_level = 'Escolha uma opção.';
    if (!form.profession.trim()) errs.profession = 'Conte um pouco da sua rotina.';
    if (!form.sleep_quality.trim()) errs.sleep_quality = 'Conte como está seu sono.';
    setErrors(errs);
    const first = (['physical_activity_level', 'profession', 'sleep_quality'] as const).find((k) => errs[k]);
    if (first) {
      document.getElementById(`health-${first}`)?.focus();
      return;
    }
    save.mutate(form, {
      onSuccess: () => {
        showToast('Ficha enviada. Seu nutricionista já pode ver.', 'success');
        navigate('/portal');
      },
      onError: (err) => showToast(errText(err), 'error'),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset disabled={!canEdit} className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="health-clinical">
          <h2 id="health-clinical" className="text-base font-semibold text-slate-900">Saúde e restrições</h2>
          <Textarea
            id="health-allergies"
            label="Alergias e intolerâncias alimentares"
            hint="Ex.: glúten, lactose, oleaginosas, frutos do mar. Se não tiver, deixe em branco."
            rows={2}
            value={form.allergies}
            onChange={set('allergies')}
          />
          <Input
            id="health-dietary_restrictions"
            label="Restrições ou escolhas alimentares"
            hint="Ex.: vegano, vegetariano, kosher, halal."
            value={form.dietary_restrictions}
            onChange={set('dietary_restrictions')}
          />
          <Textarea
            id="health-pathologies"
            label="Doenças ou condições de saúde"
            hint="Ex.: diabetes, hipertensão, gastrite, intestino irritável."
            rows={2}
            value={form.pathologies}
            onChange={set('pathologies')}
          />
          <Textarea
            id="health-medications"
            label="Medicamentos e suplementos que usa hoje"
            rows={2}
            value={form.medications}
            onChange={set('medications')}
          />
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="health-habits">
          <h2 id="health-habits" className="text-base font-semibold text-slate-900">Rotina</h2>
          <Select
            id="health-physical_activity_level"
            label="Atividade física"
            required
            value={form.physical_activity_level}
            error={errors.physical_activity_level}
            onChange={set('physical_activity_level')}
          >
            <option value="" disabled>Selecione…</option>
            {ACTIVITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
          <Input
            id="health-profession"
            label="Profissão e rotina de trabalho"
            hint="Passa mais tempo sentado, em pé ou caminhando?"
            required
            value={form.profession}
            error={errors.profession}
            onChange={set('profession')}
          />
          <Input
            id="health-sleep_quality"
            label="Sono"
            hint="Quantas horas por noite? Acorda descansado?"
            placeholder="Ex.: 6h por noite, acordo cansado"
            required
            value={form.sleep_quality}
            error={errors.sleep_quality}
            onChange={set('sleep_quality')}
          />
        </section>
      </fieldset>

      {canEdit && (
        <Button type="submit" variant="primary" fullWidth className="h-11 sm:w-auto" loading={save.isPending}>
          {initial.updated_at ? 'Salvar alterações' : 'Enviar ficha'}
        </Button>
      )}
    </form>
  );
};

export const PortalHealthPage: React.FC = () => {
  const { patientPortal } = useAuth();
  const health = usePortalHealth(patientPortal?.patient_id);
  const canEdit = !!patientPortal?.active;

  return (
    <>
      <PortalPageHeader
        title="Ficha de saúde"
        description={health.data?.updated_at
          ? `Atualizada em ${format(new Date(health.data.updated_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}. Mudou algo? Atualize aqui.`
          : 'Essas informações ajudam a preparar sua consulta. Leva uns 3 minutos.'}
      />

      {health.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />)}
        </div>
      ) : health.isError || !health.data || !patientPortal ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Não foi possível carregar sua ficha. Tente mais tarde.</p>
      ) : (
        <HealthForm initial={health.data} canEdit={canEdit} patientId={patientPortal.patient_id} />
      )}
    </>
  );
};
