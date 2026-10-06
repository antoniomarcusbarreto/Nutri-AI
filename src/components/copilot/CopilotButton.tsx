import React from 'react';
import { Sparkles } from 'lucide-react';
import { useCopilot } from './CopilotProvider';

/** Botão do header que abre o co-piloto (só para owner/nutricionista). */
export const CopilotButton: React.FC<{ textClass: string }> = ({ textClass }) => {
  const { enabled, open, setOpen } = useCopilot();
  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-keyshortcuts="Control+K"
      title="Co-piloto (Ctrl+K)"
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-slate-500/10 ${textClass}`}
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Co-piloto</span>
      <span className="sr-only sm:hidden">Abrir co-piloto</span>
    </button>
  );
};
