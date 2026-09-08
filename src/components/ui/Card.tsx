import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Contêiner de conteúdo do painel interno (design system — extract P1.4).
 *
 * Substitui o shell repetido `bg-white rounded-* p-* shadow-sm border
 * border-slate-200`. Mantém `bg-white` na marcação de propósito: a camada de
 * recalibração de `index.css` o renderiza como o slate-100 fosco ("Regra do
 * Branco Fosco" do DESIGN.md).
 *
 * Onda 4: `padding` e `radius` viraram escalas abertas e o `className` agora é
 * mesclado com `tailwind-merge`, então a chamada consegue sobrescrever o default
 * sem travar em `p-6.5 rounded-3xl` (as rotas reais usam `rounded-2xl`, `p-4`,
 * `p-5`, cards com `overflow-hidden`/`group`, etc.).
 */
export type CardPadding = 'md' | 'sm' | 'xs' | 'none';
export type CardRadius = '2xl' | '3xl';

const PADDING: Record<CardPadding, string> = {
  md: 'p-6.5',
  sm: 'p-5',
  xs: 'p-4',
  none: '',
};

const RADIUS: Record<CardRadius, string> = {
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Escala de padding interna. Default `md` (p-6.5, cards de conteúdo). */
  padding?: CardPadding;
  /** Raio do card. Default `3xl` (cards de conteúdo); `2xl` para blocos de formulário. */
  radius?: CardRadius;
  /** Adiciona a resposta de hover (`shadow-sm → shadow-md`). */
  interactive?: boolean;
  /** Renderiza como `<section>`/`<article>` quando a região tem um heading próprio. */
  as?: 'div' | 'section' | 'article';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'md', radius = '3xl', interactive = false, as: Tag = 'div', className, children, ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(
        'bg-white shadow-sm border border-slate-200',
        RADIUS[radius],
        PADDING[padding],
        interactive && 'transition-shadow hover:shadow-md',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
});
