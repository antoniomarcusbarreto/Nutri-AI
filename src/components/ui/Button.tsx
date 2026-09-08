import React from 'react';

/**
 * Botão do sistema (1ª onda do design system — extract P1.4).
 *
 * Consolida os botões que hoje são re-estilizados pela camada `!important` de
 * `index.css` (`form button[type="submit"]`, `button.bg-slate-100`, etc.).
 * A marcação segue o "Golden Standard" do DESIGN.md > Components > Buttons, para
 * renderizar idêntico ao que a camada global já produzia.
 *
 * - `primary`   ação primária / submit — Azul de Ação `#5024fc`
 * - `secondary` cancelar / fechar — slate-100
 * - `danger`    ação destrutiva — rose-600
 * - `ghost`     ação terciária sem preenchimento
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'sm' | 'icon';

const BASE =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-xl shadow-sm ' +
  'transition-[background-color,opacity] duration-200 cursor-pointer select-none ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[#5024fc] text-white hover:bg-[#431cdb] hover:opacity-90',
  secondary: 'bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 shadow-none',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'bg-transparent text-slate-600 font-medium shadow-none hover:bg-slate-100',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'text-sm px-5 py-2.5',
  sm: 'text-xs px-3 py-1.5',
  icon: 'p-2.5',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mostra spinner, seta `aria-busy` e desabilita o clique. */
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth = false, leftIcon, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          className="h-4 w-4 shrink-0 rounded-full border-2 border-current/40 border-t-current animate-spin"
          aria-hidden="true"
        />
      ) : (
        leftIcon
      )}
      {children}
    </button>
  );
});
