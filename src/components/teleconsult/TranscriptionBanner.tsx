import React from 'react';
import { Captions } from 'lucide-react';

/**
 * Faixa de transparência sobre a chamada enquanto a transcrição está ligada.
 * Azul informativo (DESIGN.md: não há quinta cor de status).
 */
export const TranscriptionBanner: React.FC<{ action?: React.ReactNode }> = ({ action }) => (
  <div
    role="status"
    className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800"
  >
    <Captions className="h-4 w-4 shrink-0" aria-hidden="true" />
    <span className="min-w-0 flex-1">Transcrição ativa: a conversa está sendo convertida em texto.</span>
    {action}
  </div>
);
