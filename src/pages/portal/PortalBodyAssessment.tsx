import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Camera, CheckCircle2, ImagePlus, Info, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  POSES,
  usePortalBodyAssessments,
  usePortalSubmitBody,
  type Pose,
  type PortalBodyAssessment,
} from '../../hooks/queries/useBodyAssessments';
import { inputsFromRow, PERIMETERS, type PerimeterKey } from '../../lib/bodyComposition';
import { prepareImage } from '../../lib/imageResize';
import { BodyReport } from '../../components/body/BodyReport';
import { Button, Input } from '../../components/ui';
import { PortalPageHeader } from '../../components/portal/PortalPageHeader';
import { cn } from '../../lib/cn';

/**
 * Avaliação corporal no portal (migration 0034). O paciente só envia quando o
 * nutricionista pediu; nunca dispara a IA nem vê o resultado dela. Vê apenas
 * avaliações que o nutricionista validou e compartilhou.
 */

const errText = (err: unknown) =>
  (err instanceof Error && err.message) || (err as { message?: string })?.message || 'Não foi possível enviar. Tente novamente.';
const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || Number.isNaN(n) ? null : n;
};

const PHOTO_TIPS = [
  'Roupa justa (top e short ou roupa de banho), cabelo preso.',
  'Fundo liso e boa luz, sem contraluz.',
  'Peça para alguém fotografar a uns 2 a 3 metros, com o celular na altura do seu quadril.',
  'Corpo inteiro na foto, da cabeça aos pés. O rosto pode ficar de fora.',
];

const PhotoSlot: React.FC<{ pose: (typeof POSES)[number]; blob: Blob | null; onPick: (b: Blob) => void }> = ({ pose, blob, onPick }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return (
    <label className="block cursor-pointer">
      <span className="sr-only">Foto de {pose.label}</span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            onPick(await prepareImage(file));
          } catch (err) {
            showToast(errText(err), 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
      <div className={cn('relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-inset', blob ? 'ring-emerald-300' : 'bg-slate-50 ring-slate-300')}>
        {preview && blob ? (
          <>
            <img src={preview} alt={`Foto de ${pose.label}`} className="h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-slate-900/60 py-1 text-[11px] font-medium text-white">
              <RefreshCw className="h-3 w-3" aria-hidden="true" /> Trocar
            </span>
          </>
        ) : (
          <div className="grid h-full place-items-center p-2 text-center">
            <div>
              {busy ? <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-400" aria-hidden="true" /> : <ImagePlus className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />}
              <p className="mt-1 text-sm font-medium text-slate-700">{pose.label}</p>
            </div>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{pose.how}</p>
    </label>
  );
};

const SubmitForm: React.FC<{ request: PortalBodyAssessment; patientId: string }> = ({ request, patientId }) => {
  const { showToast } = useToast();
  const submit = usePortalSubmitBody(patientId);
  const wantsTape = request.kind !== 'fotos';
  const wantsPhotos = request.kind !== 'fita';

  const [height, setHeight] = useState(request.suggested_height_cm ? String(request.suggested_height_cm).replace('.', ',') : '');
  const [weight, setWeight] = useState('');
  const [measures, setMeasures] = useState<Record<PerimeterKey, string>>({ arm_cm: '', forearm_cm: '', waist_cm: '', hip_cm: '', thigh_cm: '', calf_cm: '' });
  const [photos, setPhotos] = useState<Partial<Record<Pose, Blob>>>({});
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    setError(null);
    const h = num(height);
    const w = num(weight);
    if (!h || !w) return setError('Informe seu peso e sua altura.');
    if (wantsTape && (!num(measures.waist_cm) || !num(measures.hip_cm))) return setError('Informe pelo menos a cintura e o quadril.');
    if (wantsPhotos && POSES.some((p) => !photos[p.key])) return setError('Tire as três fotos: frente, lado e costas.');
    if (wantsPhotos && !consent) return setError('Para enviar as fotos, marque a autorização.');
    submit.mutate(
      {
        assessmentId: request.id,
        heightCm: h,
        weightKg: w,
        measures: Object.fromEntries(Object.entries(measures).map(([k, v]) => [k, num(v)])),
        photos: wantsPhotos ? photos : {},
      },
      {
        onSuccess: () => showToast('Avaliação enviada. Seu nutricionista vai analisar.', 'success'),
        onError: (err) => setError(errText(err)),
      },
    );
  };

  return (
    <div className={cn('grid grid-cols-1 items-start gap-5', wantsPhotos && 'lg:grid-cols-2')}>
      <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="body-basic">
        <h2 id="body-basic" className="text-base font-semibold text-slate-900">Peso e altura</h2>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Peso (kg)" inputMode="decimal" placeholder="72,5" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <Input label="Altura (cm)" inputMode="decimal" placeholder="165" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <p className="text-xs text-slate-500">Pese-se de manhã, em jejum, depois de ir ao banheiro.</p>
      </section>

      {wantsTape && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="body-tape">
          <h2 id="body-tape" className="text-base font-semibold text-slate-900">Medidas com fita</h2>
          <p className="flex gap-2 text-sm text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            Use fita métrica de costura, rente à pele sem apertar. Cintura e quadril são obrigatórios; as outras ajudam.
          </p>
          <div className="space-y-4">
            {PERIMETERS.map((p) => (
              <Input
                key={p.key}
                label={`${p.label} (cm)${p.key === 'waist_cm' || p.key === 'hip_cm' ? '' : ' — opcional'}`}
                hint={p.how}
                inputMode="decimal"
                value={measures[p.key]}
                onChange={(e) => setMeasures((m) => ({ ...m, [p.key]: e.target.value }))}
              />
            ))}
          </div>
        </section>
      )}

      </div>

      <div className="space-y-5">
      {wantsPhotos && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="body-photos">
          <h2 id="body-photos" className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Camera className="h-4 w-4 text-teal-700" aria-hidden="true" /> Fotos
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            {PHOTO_TIPS.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <div className="grid grid-cols-3 gap-3">
            {POSES.map((p) => (
              <PhotoSlot key={p.key} pose={p} blob={photos[p.key] ?? null} onPick={(b) => setPhotos((ph) => ({ ...ph, [p.key]: b }))} />
            ))}
          </div>
          <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-600">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#5024fc]" />
            <span>
              Autorizo o envio destas fotos do meu corpo para avaliação pelo meu nutricionista, que pode usar inteligência
              artificial para apoiar a análise. As fotos ficam guardadas com segurança e só ele tem acesso.
            </span>
          </label>
        </section>
      )}
      </div>

      {error && <p role="alert" className="lg:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <Button variant="primary" fullWidth className="h-11 sm:w-auto lg:col-span-2 lg:justify-self-start" loading={submit.isPending} onClick={send}>
        Enviar avaliação
      </Button>
    </div>
  );
};

export const PortalBodyAssessmentPage: React.FC = () => {
  const { patientPortal } = useAuth();
  const { data = [], isLoading, isError } = usePortalBodyAssessments(patientPortal?.patient_id);
  const sex = patientPortal?.biological_sex === 'M' ? 'M' : 'F';

  const open = data.find((a) => a.status === 'solicitada');
  const waiting = data.find((a) => a.status === 'enviada');
  const shared = data.filter((a) => a.status === 'validada');
  const latest = shared[0];
  const latestInputs = latest ? inputsFromRow(latest as unknown as Parameters<typeof inputsFromRow>[0], sex) : null;
  const prevInputs = shared[1] ? inputsFromRow(shared[1] as unknown as Parameters<typeof inputsFromRow>[0], sex) : null;

  return (
    <>
      <PortalPageHeader title="Avaliação corporal" description="Medidas e fotos pedidas pelo seu nutricionista, e os resultados que ele liberar." />

      {isLoading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-slate-200/60" />
      ) : isError ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Não foi possível carregar. Tente mais tarde.</p>
      ) : (
        <>
          {open && patientPortal && (
            patientPortal.active ? (
              <>
                {open.request_note && (
                  <p className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 text-sm text-teal-900">
                    <span className="font-semibold">Recado de {patientPortal.nutritionist_name || 'seu nutricionista'}:</span> {open.request_note}
                  </p>
                )}
                <SubmitForm request={open} patientId={patientPortal.patient_id} />
              </>
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Há uma avaliação pedida, mas seu acesso está somente leitura. Peça a renovação ao seu nutricionista.</p>
            )
          )}

          {!open && waiting && (
            <p className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Avaliação enviada em {format(new Date(waiting.assessed_at ?? waiting.created_at), "d 'de' MMMM", { locale: ptBR })}. Seu nutricionista vai analisar e conversar com você.
            </p>
          )}

          {latest && latestInputs && (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="body-result">
              <div>
                <h2 id="body-result" className="text-base font-semibold text-slate-900">Seu resultado</h2>
                <p className="text-sm text-slate-500">Avaliação de {format(new Date(latest.assessed_at ?? latest.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
              </div>
              {latest.nutritionist_note && (
                <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="font-medium">{patientPortal?.nutritionist_name || 'Nutricionista'}:</span> {latest.nutritionist_note}
                </p>
              )}
              <BodyReport inputs={latestInputs} previous={prevInputs} />
            </section>
          )}

          {!open && !waiting && !latest && (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              Quando seu nutricionista pedir uma avaliação, ela aparece aqui com o passo a passo.
            </p>
          )}
        </>
      )}
    </>
  );
};
