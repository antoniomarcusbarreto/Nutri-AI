/**
 * Primitivos de UI do NutriAI — 1ª onda (extract P1.4).
 *
 * Objetivo: mover a identidade visual da camada `!important` de `index.css`
 * para componentes com API tipada e acessibilidade embutida. Ondas seguintes
 * migram o restante das telas e então aposentam as regras globais redundantes.
 */
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { Card } from './Card';
export type { CardProps, CardPadding, CardRadius } from './Card';
export { Input, INPUT_BASE, FIELD_LABEL } from './Input';
export type { InputProps } from './Input';
export { Select } from './Select';
export type { SelectProps } from './Select';
export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';
export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';
export { FormActions } from './FormActions';
export type { FormActionsProps } from './FormActions';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateSize } from './EmptyState';
export { Modal } from './Modal';
export type { ModalProps } from './Modal';
export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';
