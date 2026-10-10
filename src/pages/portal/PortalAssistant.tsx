import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUp, Mic, MicOff, RotateCcw, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { PortalPageHeader } from '../../components/portal/PortalPageHeader';
import { usePatientCopilot } from '../../components/portal/PatientCopilotProvider';
import { CopilotMessage } from '../../components/copilot/CopilotMessage';
import { Card } from '../../components/ui';

/**
 * Assistente do paciente (Edge Function `patient-copilot`): receitas e trocas
 * a partir do plano, lista de compras, comer fora e "como estou indo" pelo
 * diário. Só consulta; com o acesso vencido o campo de mensagem some.
 */

/** Próxima refeição pelo horário, para a sugestão de receita. */
function nextMealLabel(hour: number): string {
  if (hour < 10) return 'café da manhã';
  if (hour < 15) return 'almoço';
  if (hour < 18) return 'lanche da tarde';
  return 'jantar';
}

export const PortalAssistant: React.FC = () => {
  const { patientPortal } = useAuth();
  const { messages, pending, send, reset } = usePatientCopilot();
  const { showToast } = useToast();
  // `?q=` (atalhos do Início) só preenche o campo: enviar fica com o paciente.
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(() => (params.get('q') ?? '').slice(0, 300));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canAsk = !!patientPortal?.active;
  const nutri = patientPortal?.nutritionist_name || 'seu nutricionista';

  const speech = useSpeechRecognition({
    onFinalTranscript: (t) => setInput((prev) => (prev ? `${prev.trimEnd()} ${t}` : t)),
    onError: (m) => showToast(m, 'error'),
  });

  useEffect(() => {
    if (!params.has('q')) return;
    setParams({}, { replace: true });
    inputRef.current?.focus();
  }, [params, setParams]);

  // Rola só a área da conversa (não a página inteira).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending]);

  // Textarea cresce com o conteúdo até ~5 linhas.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  const submit = (text = input) => {
    if (!text.trim() || pending || !canAsk) return;
    if (speech.isRecording) speech.stop();
    send(text);
    setInput('');
  };

  const suggestions = [
    `Me dá uma receita para o ${nextMealLabel(new Date().getHours())} de hoje`,
    'Não tenho um ingrediente do almoço. Por qual posso trocar?',
    'Monte minha lista de compras da semana',
    'Como estou indo esta semana?',
    'Vou comer fora hoje. O que eu escolho?',
  ];

  return (
    <>
      <PortalPageHeader
        title="Assistente"
        description={`Receitas, trocas e dicas a partir do plano que ${nutri} montou para você.`}
        actions={messages.length > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Nova conversa
          </button>
        ) : undefined}
      />

      <Card padding="none" className="flex h-[calc(100dvh-17rem)] min-h-[26rem] flex-col overflow-hidden lg:h-[calc(100dvh-15rem)]">
        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-xl space-y-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <p className="text-[15px] font-medium text-slate-900">Como posso ajudar com a sua alimentação hoje?</p>
                  <p className="text-sm text-slate-500">
                    Eu conheço seu plano, sua ficha e o que você registrou no diário. Mudanças no plano continuam sendo com {nutri}.
                  </p>
                </div>
              </div>
              {canAsk && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {suggestions.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => submit(s)}
                        className="h-full w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:border-[#5024fc]/40 hover:bg-slate-50"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-5">
              {messages.map((m) => <CopilotMessage key={m.id} message={m} />)}
            </div>
          )}
          {pending && (
            <div className="mx-auto flex max-w-2xl items-center gap-2 text-sm text-slate-500" role="status">
              <span className="flex gap-1" aria-hidden="true">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5024fc]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5024fc] [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5024fc] [animation-delay:300ms]" />
              </span>
              Pensando…
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 px-4 pt-3 pb-4 sm:px-6">
          {canAsk ? (
            <div className="mx-auto max-w-2xl">
              <form
                onSubmit={(e) => { e.preventDefault(); submit(); }}
                className="flex items-end gap-2"
              >
                <label htmlFor="assistant-input" className="sr-only">Mensagem para o assistente</label>
                <textarea
                  id="assistant-input"
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
                  placeholder="Pergunte sobre receitas, trocas, compras…"
                  maxLength={1500}
                  className="max-h-32 min-w-0 flex-1 resize-none placeholder:text-slate-400"
                />
                {speech.supported && (
                  <button
                    type="button"
                    onClick={speech.toggle}
                    className={`rounded-lg p-2 ${speech.isRecording ? 'bg-rose-50 text-rose-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                    aria-label={speech.isRecording ? 'Parar ditado' : 'Ditar mensagem'}
                    aria-pressed={speech.isRecording}
                  >
                    {speech.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!input.trim() || pending}
                  className="rounded-lg bg-[#5024fc] p-2 text-white hover:bg-[#431cdb] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Enviar mensagem"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </form>
              <p className="mt-2 text-xs leading-snug text-slate-400">
                Respostas geradas por IA. Não substituem a orientação de {nutri}.
              </p>
            </div>
          ) : (
            <p className="mx-auto max-w-2xl text-sm text-slate-600">
              O assistente fica disponível enquanto seu acesso estiver ativo. Para renovar, fale com {nutri}.
            </p>
          )}
        </div>
      </Card>
    </>
  );
};
