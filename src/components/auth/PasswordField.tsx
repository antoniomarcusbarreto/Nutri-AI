import React, { useId, useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { INPUT_BASE, FIELD_LABEL } from '../ui';
import { PASSWORD_RULES } from './passwordRules';

/** Checklist que vai marcando cada regra enquanto a pessoa digita. */
export const PasswordRules: React.FC<{ password: string; id?: string }> = ({ password, id }) => (
  <ul id={id} className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label="Requisitos da senha">
    {PASSWORD_RULES.map((rule) => {
      const ok = rule.test(password);
      return (
        <li
          key={rule.id}
          className={cn('flex items-center gap-1.5 transition-colors', ok ? 'text-emerald-700' : 'text-slate-500')}
        >
          <span
            className={cn(
              'grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors',
              ok ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white',
            )}
            aria-hidden="true"
          >
            {ok && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
          </span>
          {rule.label}
          <span className="sr-only">{ok ? '(atendido)' : '(pendente)'}</span>
        </li>
      );
    })}
  </ul>
);

export interface PasswordFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  error?: React.ReactNode;
  /** Conteúdo à direita do label (ex.: "Esqueceu sua senha?"). */
  labelAction?: React.ReactNode;
  /** Conteúdo abaixo do campo (ex.: checklist de requisitos). */
  footer?: React.ReactNode;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({
  label,
  error,
  labelAction,
  footer,
  id,
  className,
  onKeyUp,
  onBlur,
  ...rest
}) => {
  const reactId = useId();
  const inputId = id ?? reactId;
  const msgId = `${inputId}-msg`;
  const capsId = `${inputId}-caps`;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const describedBy = [error ? msgId : null, capsLock ? capsId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className={FIELD_LABEL}>
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(INPUT_BASE, 'h-11 pr-11 text-[15px]', className)}
          onKeyUp={(e) => {
            setCapsLock(e.getModifierState('CapsLock'));
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCapsLock(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          aria-controls={inputId}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-slate-400 transition-colors hover:text-slate-700"
        >
          {visible ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
        </button>
      </div>
      {capsLock && (
        <p id={capsId} className="mt-1 text-xs font-medium text-amber-700">
          Caps Lock está ativado.
        </p>
      )}
      {error && (
        <p id={msgId} className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
      {footer}
    </div>
  );
};
