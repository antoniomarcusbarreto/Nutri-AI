import React from 'react';

/**
 * Rodapé de ações de formulário (1ª onda do design system — extract P1.4).
 *
 * Padroniza o bloco `flex justify-end gap-3 pt-6 mt-6 border-t` que a camada
 * `!important` de `index.css` hoje força via seletor de atributo frágil
 * (`form div[class*="justify-end"]`). Coloque o botão primário por último.
 */
export interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `start` alinha à esquerda (ex.: um único botão "Voltar"). */
  align?: 'end' | 'between' | 'start';
}

const ALIGN = {
  end: 'justify-end',
  between: 'justify-between',
  start: 'justify-start',
} as const;

export const FormActions: React.FC<FormActionsProps> = ({ align = 'end', className = '', children, ...rest }) => (
  <div
    className={`mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6 ${ALIGN[align]} ${className}`}
    {...rest}
  >
    {children}
  </div>
);
