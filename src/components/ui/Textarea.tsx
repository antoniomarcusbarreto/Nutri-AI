import React, { useId } from 'react';
import { cn } from '../../lib/cn';
import { INPUT_BASE, FIELD_LABEL } from './Input';

/**
 * Área de texto do sistema (design system — extract P1.4, onda 4).
 *
 * Mesmo "Golden Standard" do `<Input>` (a camada `!important` de `index.css`
 * também estiliza `main textarea`), com altura mínima confortável e
 * `resize-y`.
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  wrapperClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className, wrapperClassName, required, rows = 3, 'aria-describedby': ariaDescribedBy, ...rest },
  ref,
) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const msgId = `${fieldId}-msg`;
  const describedBy = [ariaDescribedBy, (hint || error) ? msgId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label != null && (
        <label htmlFor={fieldId} className={FIELD_LABEL}>
          {label}
          {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(INPUT_BASE, 'min-h-[80px] resize-y leading-relaxed', className)}
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
