import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert } from 'lucide-react';

/**
 * Diálogo de confirmação (harden). Para a decisão destrutiva recorrente
 * "ícone + pergunta + Cancelar/Confirmar" que aparecia como `<div fixed inset-0>`
 * sem semântica em Exames, Agenda, etc.
 *
 * `role="alertdialog"` + foco inicial no **Cancelar** (opção segura) + Escape
 * cancela + restauração de foco + trava de scroll.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo do botão de ação. `danger` (padrão) para exclusão irreversível. */
  tone?: 'danger' | 'primary';
  /** Desabilita o botão de confirmação enquanto a ação corre. */
  confirming?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  confirming = false,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => cancelRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
      if (e.key === 'Tab') {
        // dois botões só — mantém o foco entre eles
        e.preventDefault();
        const active = document.activeElement;
        const [a, b] = [cancelRef.current, cancelRef.current?.nextElementSibling as HTMLElement | null];
        (active === a ? b : a)?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = bodyOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 text-white'
      : 'bg-[#5024fc] hover:bg-[#431cdb] text-white';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="bg-white bg-white-pure flex w-full max-w-md flex-col items-center rounded-3xl border border-slate-200 p-6 text-center shadow-xl animate-in zoom-in-95 duration-200"
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-600">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 id="confirm-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p id="confirm-message" className="mt-2.5 text-sm leading-relaxed text-slate-500">
          {message}
        </p>
        <div className="mt-6 grid w-full grid-cols-2 gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-md transition-colors disabled:opacity-60 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
