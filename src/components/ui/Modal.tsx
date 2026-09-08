import React, { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Modal do sistema (harden P3).
 *
 * Os ~16 modais do app eram `<div className="fixed inset-0 z-50">` sem
 * `role="dialog"`, sem trava de foco, sem Escape, sem restaurar o foco. Isso
 * quebra teclado e leitor de tela — e, de quebra, sem `[role="dialog"]` a
 * camada de recalibração de `index.css` nem aplicava o estilo do sistema.
 *
 * Este primitivo resolve: portal, `role="dialog"` + `aria-modal` +
 * `aria-labelledby`, armadilha de foco (Tab cicla dentro), Escape, restauração
 * do foco ao fechar, trava de scroll do body, clique no backdrop.
 */
const FOCUSABLE =
  'a[href],area[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  /** Ações do rodapé (botões). Se omitido, não renderiza rodapé. */
  footer?: React.ReactNode;
  /** Largura máxima do painel. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Clique no backdrop / botão X fecham. Padrão: true. Desligue para fluxos que exigem decisão. */
  dismissible?: boolean;
  /** Descrição curta lida pelo leitor de tela junto do título. */
  description?: string;
  /** Chip/etiqueta acima do título (ex.: "Laudo de Exame PDF"). */
  badge?: React.ReactNode;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl' } as const;

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissible = true,
  description,
  badge,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const requestClose = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foca o painel (ou o primeiro focável dentro dele) ao abrir.
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = bodyOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, requestClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`bg-white bg-white-pure w-full ${SIZES[size]} rounded-3xl border border-slate-200 shadow-xl outline-none animate-in fade-in zoom-in-95 duration-200`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/50 p-5">
          <div className="min-w-0">
            {badge && (
              <span className="mb-1 inline-flex w-fit items-center gap-1 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
                {badge}
              </span>
            )}
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-slate-500">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="max-h-[calc(100vh-16rem)] overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 p-5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
};
