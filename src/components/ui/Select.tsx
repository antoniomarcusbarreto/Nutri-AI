import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { INPUT_BASE, FIELD_LABEL } from './Input';

/**
 * Select do sistema (design system — extract P1.4, onda 4).
 *
 * Mesmo "Golden Standard" do `<Input>` (a camada `!important` de `index.css`
 * já estiliza `main select` igual), com `appearance-none` + chevron próprio
 * para consistência entre navegadores.
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  wrapperClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, wrapperClassName, required, children, 'aria-describedby': ariaDescribedBy, ...rest },
  ref,
) {
  const reactId = useId();
  const selectId = id ?? reactId;
  const msgId = `${selectId}-msg`;
  const describedBy = [ariaDescribedBy, (hint || error) ? msgId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label != null && (
        <label htmlFor={selectId} className={FIELD_LABEL}>
          {label}
          {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(INPUT_BASE, 'appearance-none pr-9', className)}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      </div>
      {(error || hint) && (
        <p id={msgId} className={cn('mt-1 text-xs', error ? 'text-rose-600' : 'text-slate-500')}>
          {error || hint}
        </p>
      )}
    </div>
  );
});
