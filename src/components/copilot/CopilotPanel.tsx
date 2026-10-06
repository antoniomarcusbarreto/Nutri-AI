import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Mic, MicOff, RotateCcw, Sparkles, X } from 'lucide-react';
import { useCopilot } from './CopilotProvider';
import { CopilotMessage } from './CopilotMessage';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useToast } from '../../contexts/ToastContext';

const GENERAL_SUGGESTIONS = [
  'Quem eu atendo hoje?',
  'Como está o financeiro deste mês?',
  'Quais recebimentos estão vencidos?',
  'Quais são meus lembretes pendentes?',
];

const patientSuggestions = (name: string) => [
  `Resumo de ${name}`,
  `Como evoluiu o peso de ${name}?`,
  `Há alertas nos exames de ${name}?`,
  `Qual é o plano alimentar atual de ${name}?`,
];

const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

/** Painel lateral do co-piloto (carregado sob demanda pelo Layout). */
export default function CopilotPanel() {
  const { open, setOpen, messages, pending, send, reset, focusPatient, dismissFocus } = useCopilot();
  const { showToast } = useToast();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const speech = useSpeechRecognition({
    onFinalTranscript: (t) => setInput((prev) => (prev ? `${prev.trimEnd()} ${t}` : t)),
    onError: (m) => showToast(m, 'error'),
  });

  // Foco no campo ao abrir; Escape fecha; no celular trava o scroll do fundo.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const lock = !isDesktop();
    if (lock) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      if (lock) document.body.style.overflow = '';
    };
  }, [open, setOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending]);

  // Textarea cresce com o conteúdo até ~5 linhas.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  const submit = (text = input) => {
    if (!text.trim() || pending) return;
    if (speech.isRecording) speech.stop();
    send(text);
    setInput('');
  };

  // No celular o painel cobre a tela: fecha ao seguir um link da resposta.
  const onNavigate = () => { if (!isDesktop()) setOpen(false); };

  const suggestions = focusPatient ? patientSuggestions(focusPatient.name.split(' ')[0]) : GENERAL_SUGGESTIONS;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden print:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out sm:w-[420px] print:hidden ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
        role="dialog"
        aria-modal="false"
        aria-label="Co-piloto"
        aria-hidden={!open}
        inert={!open}
      >
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 px-4">
          <Sparkles className="h-5 w-5 text-[#5024fc]" aria-hidden="true" />
          <h2 className="flex-1 text-base font-semibold text-slate-900">Co-piloto</h2>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Nova conversa
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar co-piloto"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5" aria-live="polite">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">Pergunte sobre seus dados.</p>
                <p className="text-sm text-slate-500">
                  Pacientes, consultas, medidas, planos alimentares, exames, agenda e financeiro. Eu só consulto: nada é alterado.
                </p>
              </div>
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => submit(s)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:border-[#5024fc]/40 hover:bg-slate-50"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            messages.map((m) => <CopilotMessage key={m.id} message={m} onNavigate={onNavigate} />)
          )}
          {pending && (
            <div className="flex items-center gap-2 text-sm text-slate-500" role="status">
              <span className="flex gap-1" aria-hidden="true">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5024fc]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5024fc] [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5024fc] [animation-delay:300ms]" />
              </span>
              Consultando seus dados…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="shrink-0 border-t border-slate-200 px-4 pt-3 pb-4">
          {focusPatient && (
            <div className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-xs text-slate-600">
              <span className="truncate">Sobre: <span className="font-medium text-slate-800">{focusPatient.name}</span></span>
              <button
                type="button"
                onClick={dismissFocus}
                className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                aria-label={`Não perguntar sobre ${focusPatient.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-1.5 focus-within:border-[#5024fc]/60"
          >
            <label htmlFor="copilot-input" className="sr-only">Pergunta para o co-piloto</label>
            <textarea
              id="copilot-input"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Pergunte algo…"
              maxLength={2000}
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            {speech.supported && (
              <button
                type="button"
                onClick={speech.toggle}
                className={`rounded-lg p-2 ${speech.isRecording ? 'bg-rose-50 text-rose-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                aria-label={speech.isRecording ? 'Parar ditado' : 'Ditar pergunta'}
                aria-pressed={speech.isRecording}
              >
                {speech.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || pending}
              className="rounded-lg bg-[#5024fc] p-2 text-white hover:bg-[#431cdb] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Enviar pergunta"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-2 text-xs leading-snug text-slate-400">
            Respostas geradas por IA a partir dos seus dados. Confira antes de decidir.
          </p>
        </div>
      </aside>
    </>
  );
}
