import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePatients } from '../../hooks/queries/usePatients';
import { askCopilot, type CopilotTurn } from '../../lib/copilot';
import { GeminiError } from '../../lib/gemini';

/**
 * Estado do co-piloto. Fica no `Layout`, então a conversa sobrevive à troca
 * de rota e some ao recarregar — de propósito: não persistimos conversas
 * (nem em localStorage) para não criar mais um depósito de dado clínico.
 */

export interface CopilotMessage {
  id: number;
  role: 'user' | 'model';
  text: string;
  steps?: string[];
  /** Resposta que falhou: aparece na tela, mas não volta no histórico. */
  error?: boolean;
}

interface CopilotContextValue {
  enabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: CopilotMessage[];
  pending: boolean;
  send: (text: string) => void;
  reset: () => void;
  /** Paciente aberto no Acompanhamento (contexto implícito das perguntas). */
  focusPatient: { id: string; name: string } | null;
  dismissFocus: () => void;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- hook coabita com o provider por convenção
export const useCopilot = () => {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error('useCopilot fora do CopilotProvider');
  return ctx;
};

export const CopilotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userRole, isPatient, clinic } = useAuth();
  const enabled = !isPatient && (userRole === 'owner' || userRole === 'nutritionist');

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);
  // Descarta respostas de uma conversa que já foi reiniciada.
  const generation = useRef(0);

  // Paciente em foco: `?paciente=` do Acompanhamento.
  const location = useLocation();
  const urlPatientId = location.pathname === '/acompanhamento'
    ? new URLSearchParams(location.search).get('paciente')
    : null;
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const { data: patients } = usePatients(clinic?.id, { enabled: enabled && !!urlPatientId });
  const focusPatient = useMemo(() => {
    if (!urlPatientId || urlPatientId === dismissedId) return null;
    const p = patients?.find((x) => x.id === urlPatientId);
    return p ? { id: p.id, name: p.name } : null;
  }, [urlPatientId, dismissedId, patients]);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || pending) return;
    const userMsg: CopilotMessage = { id: nextId.current++, role: 'user', text };
    const history: CopilotTurn[] = [...messages, userMsg]
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, text: m.text }));
    const gen = generation.current;

    setMessages((prev) => [...prev, userMsg]);
    setPending(true);
    askCopilot(history, { patientId: focusPatient?.id })
      .then((reply) => {
        if (gen !== generation.current) return;
        setMessages((prev) => [...prev, { id: nextId.current++, role: 'model', text: reply.text, steps: reply.steps }]);
      })
      .catch((err: unknown) => {
        if (gen !== generation.current) return;
        const message = err instanceof GeminiError ? err.message : 'Erro ao falar com o co-piloto.';
        setMessages((prev) => [...prev, { id: nextId.current++, role: 'model', text: message, error: true }]);
      })
      .finally(() => {
        if (gen === generation.current) setPending(false);
      });
  }, [messages, pending, focusPatient?.id]);

  const reset = useCallback(() => {
    generation.current++;
    setMessages([]);
    setPending(false);
  }, []);

  // Ctrl/Cmd+K abre e fecha o painel.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  const value = useMemo<CopilotContextValue>(() => ({
    enabled,
    open: enabled && open,
    setOpen,
    messages,
    pending,
    send,
    reset,
    focusPatient,
    dismissFocus: () => setDismissedId(urlPatientId),
  }), [enabled, open, messages, pending, send, reset, focusPatient, urlPatientId]);

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
};
