import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Camera, CheckCircle2, ClipboardPlus, Ruler, Sparkles, Trash2 } from 'lucide-react';
import { Button, Card, ConfirmDialog, Input, Modal, Textarea } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  KIND_LABEL,
  POSES,
  useBodyAssessmentMutations,
  useBodyAssessments,
  useBodyPhotoUrls,
  type BodyAssessment,
  type BodyKind,
  type Pose,
} from '../../hooks/queries/useBodyAssessments';
import { inputsFromRow, PERIMETERS, rfm, type PerimeterKey, type Sex } from '../../lib/bodyComposition';
import { BodyReport } from './BodyReport';
import { cn } from '../../lib/cn';

/**
 * Avaliação corporal na visão do nutricionista (aba Corpo do Acompanhamento):
 * pedir ao paciente, ver fotos lado a lado com a anterior, rodar a IA (só aqui,
 * nunca pelo paciente), corrigir os valores, validar e decidir se compartilha.
 */

const errText = (err: unknown) =>
  (err instanceof Error && err.message) || (err as { message?: string })?.message || 'Não foi possível concluir.';

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  solicitada: { label: 'Aguardando paciente', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  enviada: { label: 'Para validar', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  validada: { label: 'Validada', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
};

type FormKey = 'height_cm' | 'weight_kg' | 'body_fat_pct' | PerimeterKey;
type Form = Record<FormKey, string>;

const toForm = (a?: Partial<BodyAssessment>): Form => {
  const v = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
  return {
    height_cm: v(a?.height_cm), weight_kg: v(a?.weight_kg), body_fat_pct: v(a?.body_fat_pct),
    arm_cm: v(a?.arm_cm), forearm_cm: v(a?.forearm_cm), waist_cm: v(a?.waist_cm),
    hip_cm: v(a?.hip_cm), thigh_cm: v(a?.thigh_cm), calf_cm: v(a?.calf_cm),
  };
};
const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || Number.isNaN(n) ? null : n;
};
const fromForm = (f: Form) =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, num(v)])) as Record<FormKey, number | null>;

const dateOf = (a: BodyAssessment) => format(new Date(a.assessed_at ?? a.created_at), "dd/MM/yyyy", { locale: ptBR });

const Photos: React.FC<{ a: BodyAssessment; label: string }> = ({ a, label }) => {
  const urls = useBodyPhotoUrls(a.photo_paths);
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {POSES.map((p) => (
          <div key={p.key} className="aspect-[3/4] overflow-hidden rounded-lg bg-slate-100">
            {urls.data?.[p.key as Pose] ? (
              <a href={urls.data[p.key as Pose]} target="_blank" rel="noreferrer">
                <img src={urls.data[p.key as Pose]} alt={`${p.label} — ${label}`} className="h-full w-full object-cover" />
              </a>
            ) : (
              <div className="grid h-full place-items-center text-xs text-slate-400">{urls.isLoading ? '…' : p.label}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const Review: React.FC<{ a: BodyAssessment; previous: BodyAssessment | undefined; sex: Sex; patientId: string }> = ({ a, previous, sex, patientId }) => {
  const { showToast } = useToast();
  const { save, analyze, removePhotos } = useBodyAssessmentMutations(patientId);
  const [form, setForm] = useState<Form>(() => toForm(a));
  const [note, setNote] = useState(a.nutritionist_note ?? '');
  const [share, setShare] = useState(a.shared_with_patient);
  const [fatSource, setFatSource] = useState(a.body_fat_source);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasPhotos = POSES.every((p) => a.photo_paths?.[p.key]);
  const ai = a.ai_estimate;

  const values = fromForm(form);
  const set = (k: FormKey, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const applyAi = (k: FormKey) => {
    const v = ai?.estimated?.[k as keyof typeof ai.estimated];
    if (v == null) return;
    set(k, String(v).replace('.', ','));
    if (k === 'body_fat_pct') setFatSource('ia');
  };

  const rfmValue = values.waist_cm && values.height_cm ? rfm(sex, values.height_cm, values.waist_cm) : null;
  const inputs = inputsFromRow({ ...values }, sex);
  const prevInputs = previous ? inputsFromRow(previous as unknown as Record<string, unknown> & { height_cm: number | null; weight_kg: number | null }, sex) : null;

  const persist = (validate: boolean) =>
    save.mutate(
      {
        id: a.id,
        validate,
        ...values,
        body_fat_source: values.body_fat_pct != null ? fatSource ?? 'informado' : null,
        nutritionist_note: note.trim() || null,
        shared_with_patient: share,
      },
      {
        onSuccess: () => showToast(validate ? 'Avaliação validada.' : 'Alterações salvas.', 'success'),
        onError: (err) => showToast(errText(err), 'error'),
      },
    );

  const fields: { key: FormKey; label: string; unit: string }[] = [
    { key: 'height_cm', label: 'Altura', unit: 'cm' },
    { key: 'weight_kg', label: 'Peso', unit: 'kg' },
    ...PERIMETERS.map((p) => ({ key: p.key as FormKey, label: p.label, unit: 'cm' })),
    { key: 'body_fat_pct', label: '% de gordura', unit: '%' },
  ];

  return (
    <div className="space-y-6">
      {a.request_note && <p className="text-sm text-slate-600"><span className="text-slate-500">Seu pedido:</span> {a.request_note}</p>}

      {hasPhotos && (
        <div className="space-y-3">
          <div className={cn('grid gap-4', previous && POSES.every((p) => previous.photo_paths?.[p.key]) && 'lg:grid-cols-2')}>
            <Photos a={a} label={`Atual · ${dateOf(a)}`} />
            {previous && POSES.every((p) => previous.photo_paths?.[p.key]) && <Photos a={previous} label={`Anterior · ${dateOf(previous)}`} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={ai ? 'secondary' : 'primary'}
              size="sm"
              leftIcon={<Sparkles className="h-4 w-4" />}
              loading={analyze.isPending}
              onClick={() => analyze.mutate(a.id, { onError: (err) => showToast(errText(err), 'error') })}
            >
              {ai ? 'Analisar de novo' : 'Analisar fotos com IA'}
            </Button>
            <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 rounded text-xs font-medium text-slate-500 hover:text-rose-700">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Apagar fotos
            </button>
          </div>
        </div>
      )}

      {ai && (
        <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-blue-900">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Análise da IA (estimativa, só você vê)
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-blue-800 ring-1 ring-blue-200">confiança {ai.confidence}</span>
          </p>
          {!ai.photo_quality_ok && ai.photo_issues?.length > 0 && (
            <p className="text-amber-800"><span className="font-medium">Fotos:</span> {ai.photo_issues.join('; ')}</p>
          )}
          {ai.body_shape && <p className="text-slate-700"><span className="text-slate-500">Formato:</span> {ai.body_shape}</p>}
          {ai.comparison && <p className="text-slate-700"><span className="text-slate-500">Evolução:</span> {ai.comparison}</p>}
          <p className="text-slate-700">{ai.observations}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-2 pr-3 font-medium">Medida</th>
              <th className="py-2 pr-3 font-medium">Valor</th>
              {ai && <th className="py-2 pr-3 font-medium">IA</th>}
              {previous && <th className="py-2 font-medium">Anterior</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fields.map((f) => {
              const aiValue = ai?.estimated?.[f.key as keyof typeof ai.estimated];
              const prev = previous?.[f.key as keyof BodyAssessment] as number | null | undefined;
              return (
                <tr key={f.key}>
                  <td className="py-2 pr-3 text-slate-700">{f.label}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        inputMode="decimal"
                        aria-label={`${f.label} (${f.unit})`}
                        value={form[f.key]}
                        onChange={(e) => {
                          set(f.key, e.target.value);
                          if (f.key === 'body_fat_pct') setFatSource('informado');
                        }}
                        placeholder={f.key === 'body_fat_pct' && rfmValue != null ? `RFM ${String(rfmValue).replace('.', ',')}` : ''}
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums focus:border-[#5024fc] focus:outline-none focus:ring-1 focus:ring-[#5024fc]"
                      />
                      <span className="text-xs text-slate-500">{f.unit}</span>
                    </div>
                  </td>
                  {ai && (
                    <td className="py-2 pr-3">
                      {aiValue != null ? (
                        <button type="button" onClick={() => applyAi(f.key)} className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium tabular-nums text-blue-800 hover:bg-blue-100" title="Usar o valor da IA">
                          {String(aiValue).replace('.', ',')} · usar
                        </button>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                  )}
                  {previous && <td className="py-2 text-xs tabular-nums text-slate-500">{prev != null ? String(prev).replace('.', ',') : '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">
          % de gordura vazio = calculado pela fórmula RFM (cintura e altura). Valores enviados pelo paciente vêm preenchidos; corrija o que precisar.
        </p>
      </div>

      {inputs ? (
        <Card radius="2xl" padding="sm" className="bg-slate-50/60">
          <p className="mb-3 text-sm font-semibold text-slate-800">Prévia do relatório</p>
          <BodyReport inputs={inputs} previous={prevInputs} estimated={a.kind !== 'fita' || a.body_fat_source === 'ia'} />
        </Card>
      ) : (
        <p className="text-sm text-slate-500">Informe altura e peso para ver o relatório.</p>
      )}

      <div className="space-y-3">
        <Textarea label="Comentário para o paciente (opcional)" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#5024fc]" />
          <span>Mostrar ao paciente no app (valores validados e o seu comentário; a análise da IA nunca aparece para ele)</span>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={save.isPending && save.variables?.validate === false} onClick={() => persist(false)}>Salvar</Button>
          <Button variant="primary" leftIcon={<CheckCircle2 className="h-4 w-4" />} loading={save.isPending && save.variables?.validate === true} disabled={!inputs} onClick={() => persist(true)}>
            {a.status === 'validada' ? 'Salvar e manter validada' : 'Validar avaliação'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => removePhotos.mutate(a, {
          onSuccess: () => { setConfirmDelete(false); showToast('Fotos apagadas.', 'success'); },
          onError: (err) => showToast(errText(err), 'error'),
        })}
        confirming={removePhotos.isPending}
        title="Apagar as fotos desta avaliação?"
        message="As fotos são removidas de vez. Os valores e a análise já salvos continuam."
        confirmLabel="Apagar fotos"
      />
    </div>
  );
};

export const BodyAssessmentPanel: React.FC<{ patient: { id: string; clinic_id: string; name: string; biological_sex?: string | null } }> = ({ patient }) => {
  const { isReadOnly } = useAuth();
  const { showToast } = useToast();
  const { data = [], isLoading } = useBodyAssessments(patient.id);
  const { request, cancel, createInOffice } = useBodyAssessmentMutations(patient.id);
  const sex: Sex = patient.biological_sex === 'M' ? 'M' : 'F';

  const open = data.find((a) => a.status === 'solicitada');
  const done = useMemo(() => data.filter((a) => a.status === 'enviada' || a.status === 'validada'), [data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = done.find((a) => a.id === selectedId) ?? done[0];
  const previous = selected ? done.find((a) => a.created_at < selected.created_at) : undefined;

  const [requestOpen, setRequestOpen] = useState(false);
  const [kind, setKind] = useState<BodyKind>('completa');
  const [requestNote, setRequestNote] = useState('');
  const [officeOpen, setOfficeOpen] = useState(false);
  const [officeForm, setOfficeForm] = useState<Form>(() => toForm());

  return (
    <Card as="section" radius="2xl" aria-labelledby="body-assessment-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="body-assessment-title" className="text-lg font-semibold text-slate-800">Avaliação corporal</h2>
          <p className="mt-1 text-sm text-slate-500">Medidas com fita e fotos enviadas pelo paciente, com estimativa por IA para você validar.</p>
        </div>
        {!isReadOnly && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant="secondary" leftIcon={<Ruler className="h-4 w-4" />} onClick={() => setOfficeOpen(true)}>Registrar no consultório</Button>
            <Button size="sm" variant="primary" leftIcon={<ClipboardPlus className="h-4 w-4" />} onClick={() => setRequestOpen(true)}>Solicitar ao paciente</Button>
          </div>
        )}
      </div>

      {open && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <span className="text-slate-700">
            <Camera className="mr-1.5 inline h-4 w-4 text-slate-500" aria-hidden="true" />
            {KIND_LABEL[open.kind]} solicitada em {format(new Date(open.created_at), 'dd/MM')} — aguardando {patient.name.split(' ')[0]} enviar pelo app.
          </span>
          {!isReadOnly && (
            <button type="button" onClick={() => cancel.mutate(open.id)} className="rounded text-xs font-medium text-slate-500 hover:text-slate-800">Cancelar pedido</button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="mt-5 h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : done.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
          Nenhuma avaliação ainda. Solicite ao paciente ou registre no consultório.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Avaliações">
            {done.map((a) => {
              const active = a.id === selected?.id;
              const chip = STATUS_CHIP[a.status];
              return (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedId(a.id)}
                  className={cn('shrink-0 rounded-xl px-3 py-2 text-left ring-1 ring-inset transition-colors', active ? 'bg-white ring-[#5024fc]' : 'bg-slate-50 ring-slate-200 hover:bg-white')}
                >
                  <span className="block text-sm font-medium tabular-nums text-slate-800">{dateOf(a)}</span>
                  <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', chip.cls)}>{chip.label}</span>
                </button>
              );
            })}
          </div>
          {selected && <Review key={selected.id} a={selected} previous={previous} sex={sex} patientId={patient.id} />}
        </div>
      )}

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Solicitar avaliação ao paciente"
        description="O paciente recebe a tarefa no app e envia por lá."
        footer={<>
          <Button variant="secondary" onClick={() => setRequestOpen(false)}>Cancelar</Button>
          <Button variant="primary" loading={request.isPending} onClick={() => request.mutate({ kind, note: requestNote }, {
            onSuccess: () => { setRequestOpen(false); setRequestNote(''); showToast('Avaliação solicitada. O paciente vê no app.', 'success'); },
            onError: (err) => showToast(errText(err), 'error'),
          })}>Solicitar</Button>
        </>}
      >
        <div className="space-y-4">
          <div className="space-y-2" role="radiogroup" aria-label="O que pedir">
            {(['completa', 'fita', 'fotos'] as BodyKind[]).map((k) => (
              <label key={k} className={cn('flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-inset', kind === k ? 'bg-[#5024fc]/5 ring-[#5024fc]' : 'ring-slate-200')}>
                <input type="radio" name="body-kind" checked={kind === k} onChange={() => setKind(k)} className="mt-0.5 accent-[#5024fc]" />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{KIND_LABEL[k]}</span>
                  <span className="block text-xs text-slate-500">
                    {k === 'fita' && 'Peso, altura e 6 perímetros medidos pelo paciente, com instruções.'}
                    {k === 'fotos' && 'Peso, altura e fotos de frente, lado e costas para a estimativa por IA.'}
                    {k === 'completa' && 'Tudo: medidas com fita e fotos. Melhor para comparar a IA com a fita.'}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Textarea label="Recado para o paciente (opcional)" rows={2} value={requestNote} maxLength={500} onChange={(e) => setRequestNote(e.target.value)} placeholder="Ex.: faça pela manhã, em jejum, com roupa justa." />
          {open && <p className="text-xs text-amber-700">A solicitação aberta atual será substituída por esta.</p>}
        </div>
      </Modal>

      <Modal
        open={officeOpen}
        onClose={() => setOfficeOpen(false)}
        title="Registrar avaliação no consultório"
        footer={<>
          <Button variant="secondary" onClick={() => setOfficeOpen(false)}>Cancelar</Button>
          <Button variant="primary" loading={createInOffice.isPending} onClick={() => {
            const v = fromForm(officeForm);
            if (!v.height_cm || !v.weight_kg) { showToast('Informe altura e peso.', 'error'); return; }
            createInOffice.mutate({ clinicId: patient.clinic_id, ...v, body_fat_source: v.body_fat_pct != null ? 'informado' : null }, {
              onSuccess: () => { setOfficeOpen(false); setOfficeForm(toForm()); showToast('Avaliação registrada.', 'success'); },
              onError: (err) => showToast(errText(err), 'error'),
            });
          }}>Salvar avaliação</Button>
        </>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([['height_cm', 'Altura (cm)'], ['weight_kg', 'Peso (kg)'], ['body_fat_pct', '% gordura (bioimpedância)']] as [FormKey, string][])
            .concat(PERIMETERS.map((p) => [p.key as FormKey, `${p.label} (cm)`]))
            .map(([k, label]) => (
              <Input key={k} label={label} inputMode="decimal" value={officeForm[k]} onChange={(e) => setOfficeForm((f) => ({ ...f, [k]: e.target.value }))} />
            ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Sem % de gordura, o relatório usa a fórmula RFM (cintura e altura).</p>
      </Modal>
    </Card>
  );
};
