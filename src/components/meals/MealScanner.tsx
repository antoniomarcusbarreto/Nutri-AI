import React, { useRef, useState } from 'react';
import { format } from 'date-fns';
import { Camera, Check, ImagePlus, PencilLine, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Button, Select, Textarea } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { useMealLogMutations } from '../../hooks/queries/useMealLogs';
import { prepareImage } from '../../lib/imageResize';
import { ADHERENCE, CONSUMPTION, mealKeyForTime, mealLabel, sumItems, type MealItem, type MealLog } from '../../lib/mealLog';
import { MEAL_NAMES } from '../../types/mealPlan';
import { MacroTiles, MealThumb } from './MealCard';
import { cn } from '../../lib/cn';

/**
 * Registro de refeição no portal — mesmo fluxo do DoseCerta-AI:
 *   1. escolher a refeição (sugerida pelo horário) e enviar foto (câmera/galeria) ou texto;
 *   2. a IA identifica alimentos e macros e compara com o plano;
 *   3. o paciente revisa/edita os itens e diz quanto comeu → vai para o diário.
 */

const errText = (err: unknown) =>
  (err instanceof Error && err.message) || (err as { message?: string })?.message || 'Não foi possível concluir. Tente novamente.';

/** Análise que ficou presa (app fechado no meio) vira erro depois disso. */
const STALE_MS = 90_000;

export const MealScanner: React.FC<{ patientId: string; clinicId: string; planMealKeys: string[]; disabled?: boolean }> = ({
  patientId,
  clinicId,
  planMealKeys,
  disabled,
}) => {
  const { showToast } = useToast();
  const { create } = useMealLogMutations(patientId, clinicId);
  const keys = planMealKeys.length ? planMealKeys : Object.keys(MEAL_NAMES);
  const [mealKey, setMealKey] = useState(() => mealKeyForTime(new Date(), planMealKeys));
  const [time, setTime] = useState(() => format(new Date(), 'HH:mm'));
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [preparing, setPreparing] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const eatenAt = () => {
    const [h, m] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  };

  const send = (input: { photo?: Blob; description?: string }) =>
    create.mutate(
      { mealKey, eatenAt: eatenAt(), ...input },
      {
        onSuccess: () => {
          setText('');
          setTyping(false);
        },
        onError: (err) => showToast(errText(err), 'error'),
      },
    );

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPreparing(true);
    try {
      send({ photo: await prepareImage(file, 1280, 0.82) });
    } catch (err) {
      showToast(errText(err), 'error');
    } finally {
      setPreparing(false);
    }
  };

  const busy = create.isPending || preparing;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Select label="Refeição" value={mealKey} disabled={disabled || busy} onChange={(e) => setMealKey(e.target.value)}>
          {keys.map((k) => <option key={k} value={k}>{mealLabel(k)}</option>)}
        </Select>
        <div>
          <label htmlFor="meal-time" className="mb-1 block text-sm font-medium text-slate-700">Horário</label>
          <input
            id="meal-time"
            type="time"
            value={time}
            disabled={disabled || busy}
            onChange={(e) => setTime(e.target.value)}
            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm tabular-nums focus:border-[#5024fc] focus:outline-none focus:ring-1 focus:ring-[#5024fc]"
          />
        </div>
      </div>

      {typing ? (
        <div className="space-y-3">
          <Textarea
            label="O que você comeu?"
            rows={3}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: 150g de frango grelhado, 4 colheres de arroz e salada de alface e tomate"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => { setTyping(false); setText(''); }}>Cancelar</Button>
            <Button variant="primary" leftIcon={<Sparkles className="h-4 w-4" />} disabled={!text.trim()} loading={busy} onClick={() => send({ description: text })}>
              Analisar descrição
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {/* Inputs escondidos acionados por botões (label dentro de <main> herda o estilo de rótulo do painel). */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true" onChange={onFile} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true" onChange={onFile} />
          <Button variant="primary" className="py-3" disabled={disabled} loading={busy} leftIcon={<Camera className="h-4 w-4" />} onClick={() => cameraRef.current?.click()}>
            Fotografar prato
          </Button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => galleryRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            Foto da galeria
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => setTyping(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            Digitar refeição
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

/** Registro ainda não confirmado: analisando, com erro, ou aguardando revisão. */
export const MealReview: React.FC<{ log: MealLog; patientId: string; clinicId: string; photoUrl?: string; now: number }> = ({
  log,
  patientId,
  clinicId,
  photoUrl,
  now,
}) => {
  const { showToast } = useToast();
  const { updateItems, confirm, remove } = useMealLogMutations(patientId, clinicId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MealItem[]>(log.items);

  const discard = () => remove.mutate(log, { onError: (err) => showToast(errText(err), 'error') });
  const stale = log.status === 'analyzing' && now - new Date(log.created_at).getTime() > STALE_MS;

  if (log.status === 'analyzing' && !stale) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-200/70" role="status">
        <MealThumb url={photoUrl} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-slate-800">Analisando {mealLabel(log.meal_key).toLowerCase()}…</p>
          <p className="text-xs text-slate-500">A IA está identificando os alimentos e comparando com seu plano.</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-teal-500" />
          </div>
        </div>
      </div>
    );
  }

  if (log.status === 'error' || stale) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <MealThumb url={photoUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-rose-900">
            Não foi possível analisar {log.source === 'foto' ? 'a foto' : 'a descrição'}
          </p>
          <p className="mt-0.5 text-sm text-rose-800">
            {stale ? 'A análise foi interrompida (o app foi fechado ou recarregado).' : log.analysis_error}
          </p>
          <Button variant="secondary" size="sm" className="mt-3" leftIcon={<Trash2 className="h-4 w-4" />} loading={remove.isPending} onClick={discard}>
            Descartar e tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  // pending
  const items = editing ? draft : log.items;
  const base = sumItems(items);
  const adherence = log.adherence ? ADHERENCE[log.adherence] : null;
  const setItem = (i: number, patch: Partial<MealItem>) => setDraft((d) => d.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-inset ring-teal-200">
      <div className="flex items-start gap-3">
        <MealThumb url={photoUrl} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{mealLabel(log.meal_key)} identificado</p>
          <p className="text-xs text-slate-500">Confira os itens. Se algo estiver errado, edite antes de salvar.</p>
          {adherence && (
            <span className={cn('mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', adherence.className)}>{adherence.label}</span>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => { setDraft(log.items); setEditing(true); }} aria-label="Editar itens" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <PencilLine className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={discard} aria-label="Descartar" className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          {draft.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr]">
                <input aria-label="Alimento" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} className="col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm sm:col-span-1" />
                <input aria-label="Quantidade" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} className="col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm sm:col-span-1" />
                <div className="col-span-2 grid grid-cols-4 gap-2">
                  {(['calories', 'protein', 'carbs', 'fat'] as const).map((k) => (
                    <label key={k} className="text-[11px] text-slate-500">
                      {k === 'calories' ? 'Kcal' : k === 'protein' ? 'Prot (g)' : k === 'carbs' ? 'Carb (g)' : 'Gord (g)'}
                      <input
                        inputMode="decimal"
                        value={String(it[k])}
                        onChange={(e) => setItem(i, { [k]: Number(e.target.value.replace(',', '.')) || 0 })}
                        className="mt-0.5 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm tabular-nums text-slate-800"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} aria-label={`Remover ${it.name}`} className="self-start rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setDraft((d) => [...d, { name: '', quantity: '', calories: 0, protein: 0, carbs: 0, fat: 0 }])}>
              Adicionar item
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Check className="h-4 w-4" />}
                loading={updateItems.isPending}
                onClick={() => updateItems.mutate(
                  { id: log.id, items: draft.filter((d) => d.name.trim()) },
                  { onSuccess: () => setEditing(false), onError: (err) => showToast(errText(err), 'error') },
                )}
              >
                Concluir edição
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between gap-3 text-sm">
              <span className="text-slate-700">{it.name} <span className="text-slate-400">({it.quantity})</span></span>
              <span className="shrink-0 tabular-nums text-slate-500">{it.calories} kcal</span>
            </li>
          ))}
        </ul>
      )}

      <MacroTiles {...base} />

      {log.ai_feedback && (
        <p className="flex gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
          {log.ai_feedback}
        </p>
      )}

      {!editing && (
        <div>
          <p className="text-sm font-medium text-slate-800">Quanto você comeu?</p>
          <p className="text-xs text-slate-500">Ao escolher, a refeição é salva no seu diário.</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {CONSUMPTION.map((c) => (
              <button
                key={c.pct}
                type="button"
                disabled={confirm.isPending}
                onClick={() => confirm.mutate(
                  { log, pct: c.pct },
                  {
                    onSuccess: () => showToast('Refeição salva no seu diário.', 'success'),
                    onError: (err) => showToast(errText(err), 'error'),
                  },
                )}
                className={cn(
                  'rounded-xl px-2 py-2.5 text-sm font-medium ring-1 ring-inset transition-colors disabled:opacity-50',
                  c.pct === 1 ? 'bg-[#5024fc] text-white ring-[#5024fc] hover:bg-[#431cdb]' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                )}
              >
                {c.label}
                <span className={cn('block text-xs', c.pct === 1 ? 'text-white/80' : 'text-slate-500')}>{c.short}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
