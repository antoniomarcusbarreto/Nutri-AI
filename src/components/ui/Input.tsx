import React, { useId } from 'react';
import { cn } from '../../lib/cn';

/**
 * Campo de texto do sistema (design system — extract P1.4, onda 4).
 *
 * Encapsula o "Golden Standard" que hoje a camada `!important` de `index.css`
 * força em `main input, .modal input, [role=dialog] input` (linhas ~291–340):
 * `py-2 px-3 text-sm rounded-lg border-slate-200 bg-white text-slate-700
 * shadow-sm`, e o anel de foco de 2px com offset branco (`0 0 0 2px #fff,
 * 0 0 0 4px #5024fc` — WCAG 2.4.11).
 *
 * Enquanto a camada `!important` existir, ela e este componente renderizam
 * idêntico; quando ela for removida, estas classes assumem.
 */
export const INPUT_BASE =
  'block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-tight text-slate-700 shadow-sm ' +
  'transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-slate-400 ' +
  'focus:border-[#5024fc] focus:shadow-[0_0_0_2px_#ffffff,0_0_0_4px_#5024fc] focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ' +
  'aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:shadow-[0_0_0_2px_#ffffff,0_0_0_4px_#e11d48]';

export const FIELD_LABEL = 'mb-1 block text-sm font-medium text-slate-700';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label acima do campo. Quando presente, o `htmlFor`/`id` são ligados automaticamente. */
  label?: React.ReactNode;
  /** Texto de apoio abaixo do campo (some quando há `error`). */
  hint?: React.ReactNode;
  /** Mensagem de erro; marca o campo como `aria-invalid` e liga `aria-describedby`. */
  error?: React.ReactNode;
  /** Classe do `<div>` externo (o `className` vai para o `<input>`). */
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, wrapperClassName, required, 'aria-describedby': ariaDescribedBy, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const msgId = `${inputId}-msg`;
  const describedBy = [ariaDescribedBy, (hint || error) ? msgId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label != null && (
        <label htmlFor={inputId} className={FIELD_LABEL}>
          {label}
          {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(INPUT_BASE, className)}
        {...rest}
      />
      {(error || hint) && (
        <p id={msgId} className={cn('mt-1 text-xs', error ? 'text-rose-600' : 'text-slate-500')}>
          {error || hint}
        </p>
      )}
    </div>
  );
});
