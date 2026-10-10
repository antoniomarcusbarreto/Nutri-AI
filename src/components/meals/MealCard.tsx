import React, { useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, PencilLine, Sparkles, Trash2 } from 'lucide-react';
import { ADHERENCE, mealLabel, type MealLog } from '../../lib/mealLog';
import { cn } from '../../lib/cn';

/**
 * Registro do diário (já confirmado). Mostra o CONSUMIDO (`macros`) direto —
 * nunca reescala —, e os itens do prato inteiro com a anotação "comeu 50%".
 */

export const MacroTiles: React.FC<{ kcal: number; protein: number; carbs: number; fat: number; compact?: boolean }> = ({ kcal, protein, carbs, fat, compact }) => (
  <div className={cn('grid grid-cols-4 gap-2', compact && 'gap-1.5')}>
    {[
      { label: 'Kcal', value: kcal, unit: '' },
      { label: compact ? 'Prot.' : 'Proteínas', value: protein, unit: 'g' },
      { label: compact ? 'Carb.' : 'Carboidratos', value: carbs, unit: 'g' },
      { label: compact ? 'Gord.' : 'Gorduras', value: fat, unit: 'g' },
    ].map((m) => (
      <div key={m.label} className="rounded-xl bg-white px-2 py-2.5 text-center ring-1 ring-inset ring-slate-200/70">
        <p className={cn('font-semibold tabular-nums text-slate-900', compact ? 'text-sm' : 'text-base')}>
          {Math.round(m.value)}
          {m.unit && <span className="text-xs font-normal text-slate-500">{m.unit}</span>}
        </p>
        <p className="truncate text-[11px] text-slate-500">{m.label}</p>
      </div>
    ))}
  </div>
);

export const MealThumb: React.FC<{ url?: string; className?: string }> = ({ url, className }) =>
  url ? (
    <img src={url} alt="" className={cn('h-12 w-12 shrink-0 rounded-xl object-cover', className)} />
  ) : (
    <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-200/70 text-slate-500', className)} aria-hidden="true">
      <PencilLine className="h-5 w-5" />
    </span>
  );

export const MealCard: React.FC<{ log: MealLog; photoUrl?: string; onDelete?: () => void; showDate?: boolean }> = ({ log, photoUrl, onDelete, showDate }) => {
  const [open, setOpen] = useState(false);
  const m = log.macros;
  const pct = Math.round((log.consumed_pct ?? 1) * 100);
  const adherence = log.adherence ? ADHERENCE[log.adherence] : null;
  const names = log.items.map((i) => i.name).join(', ') || log.description || 'Refeição';

  return (
    <article className="rounded-2xl bg-white ring-1 ring-inset ring-slate-200/70">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <MealThumb url={photoUrl} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-slate-900">
              {mealLabel(log.meal_key)}
              <span className="font-normal tabular-nums text-slate-500">
                {format(new Date(log.eaten_at), showDate ? "dd/MM 'às' HH:mm" : 'HH:mm')}
              </span>
            </span>
            <span className="block truncate text-sm text-slate-600">{names}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="tabular-nums">{m ? `${m.kcal} kcal` : '—'}</span>
              {pct !== 100 && <span>· comeu {pct}%</span>}
              {adherence && (
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', adherence.className)}>{adherence.label}</span>
              )}
            </span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Excluir registro"
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          {photoUrl && <img src={photoUrl} alt="Foto da refeição" className="max-h-72 w-full rounded-xl object-cover" />}
          {m && <MacroTiles {...m} compact />}
          {log.items.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-slate-500">
                Itens do prato{pct !== 100 ? ` (prato inteiro — comeu ${pct}%)` : ''}
              </p>
              <ul className="space-y-1">
                {log.items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-3 text-sm">
                    <span className="text-slate-700">{it.name} <span className="text-slate-400">({it.quantity})</span></span>
                    <span className="shrink-0 tabular-nums text-slate-500">{it.calories} kcal</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {log.ai_feedback && (
            <p className="flex gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
              {log.ai_feedback}
            </p>
          )}
        </div>
      )}
    </article>
  );
};
