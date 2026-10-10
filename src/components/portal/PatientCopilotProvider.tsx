import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { askPatientCopilot } from '../../lib/patientCopilot';
import { GeminiError } from '../../lib/gemini';
import type { CopilotMessage } from '../copilot/CopilotProvider';

/**
 * Conversa do assistente do paciente. Fica no `PortalLayout`: sobrevive à
 * troca de página do portal (o paciente abre o plano por um link da resposta
 * e volta) e some ao recarregar — não persistimos conversas.
 */

interface PatientCopilotValue {
  messages: CopilotMessage[];
  pending: boolean;
  send: (text: string) => void;
  reset: () => void;
}

const PatientCopilotContext = createContext<PatientCopilotValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- hook coabita com o provider por convenção
export const usePatientCopilot = () => {
  const ctx = useContext(PatientCopilotContext);
  if (!ctx) throw new Error('usePatientCopilot fora do PatientCopilotProvider');
  return ctx;
};

export const PatientCopilotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);
  // Descarta respostas de uma conversa que já foi reiniciada.
  const generation = useRef(0);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || pending) return;
    const userMsg: CopilotMessage = { id: nextId.current++, role: 'user', text };
    const history = [...messages, userMsg]
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, text: m.text }));
    const gen = generation.current;

    setMessages((prev) => [...prev, userMsg]);
    setPending(true);
    askPatientCopilot(history)
      .then((reply) => {
        if (gen !== generation.current) return;
        setMessages((prev) => [...prev, { id: nextId.current++, role: 'model', text: reply }]);
      })
      .catch((err: unknown) => {
        if (gen !== generation.current) return;
        const message = err instanceof GeminiError ? err.message : 'Não foi possível falar com o assistente.';
        setMessages((prev) => [...prev, { id: nextId.current++, role: 'model', text: message, error: true }]);
      })
      .finally(() => {
        if (gen === generation.current) setPending(false);
      });
  }, [messages, pending]);

  const reset = useCallback(() => {
    generation.current++;
    setMessages([]);
    setPending(false);
  }, []);

  const value = useMemo(() => ({ messages, pending, send, reset }), [messages, pending, send, reset]);
  return <PatientCopilotContext.Provider value={value}>{children}</PatientCopilotContext.Provider>;
};
