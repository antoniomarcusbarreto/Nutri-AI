import React from 'react';
import { MapPin, Video } from 'lucide-react';
import { cn } from '../../lib/cn';
import { MODALITY_LABEL, type Modality } from '../../lib/teleconsult';

/**
 * Presencial | Online (migration 0043). Grupo de rádio com cara de controle
 * segmentado: setas do teclado trocam a opção, como num radio nativo.
 */
interface Props {
  value: Modality;
  onChange: (value: Modality) => void;
  label?: string;
  name: string;
  disabled?: boolean;
  className?: string;
  /** Altura de toque do portal (h-11). */
  large?: boolean;
}

const OPTIONS: { value: Modality; icon: typeof Video }[] = [
  { value: 'presencial', icon: MapPin },
  { value: 'online', icon: Video },
];

export const ModalityToggle: React.FC<Props> = ({ value, onChange, label = 'Modalidade', name, disabled, className, large }) => (
  <fieldset className={cn('space-y-1.5', className)} disabled={disabled}>
    <legend className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</legend>
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-300/60 bg-slate-100 p-1">
      {OPTIONS.map(({ value: v, icon: Icon }) => {
        const active = value === v;
        return (
          <label
            key={v}
            className={cn(
              'flex cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#5024fc]',
              large ? 'h-11' : 'h-9',
              active ? 'bg-white text-[#5024fc] shadow-sm' : 'text-slate-600 hover:text-slate-900',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={name}
              value={v}
              checked={active}
              onChange={() => onChange(v)}
              className="sr-only"
            />
            <Icon className="h-4 w-4" aria-hidden="true" />
            {MODALITY_LABEL[v]}
          </label>
        );
      })}
    </div>
  </fieldset>
);
