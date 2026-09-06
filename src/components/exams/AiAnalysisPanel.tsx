import React, { useMemo, useState } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { BiomarkerRow } from './BiomarkerRow';
import { getPreviousExamBiomarker, getEvolutionIndicator } from '../../utils/biomarkers';
import type { AiFeedback, ExamBiomarker, ExamRecord } from '../../types/clinical';

/**
 * Painel do "Assistente de IA Nutricional" — estado vazio + parecer + tabela de
 * biomarcadores + edição de nota (Onda 5 / DEBT-02).
 *
 * Renderiza só a ÁREA ROLÁVEL de conteúdo; cada página mantém seu próprio card
 * externo e cabeçalho. O design foi unificado sobre a variante de Exames
 * (com controle de tamanho de fonte via `textSize`).
 */

export type AiTextSize = 'sm' | 'base' | 'lg' | 'xl';

interface Props {
  analysis: AiFeedback | null;
  exams: ExamRecord[];
  selectedExam: ExamRecord | null;
  analyzing: boolean;
  onAnalyze: () => void;
  onSaveNote: (idx: number, text: string) => Promise<void> | void;
  textSize?: AiTextSize;
}

const alertTitleSize = (t: AiTextSize) =>
  t === 'sm' ? 'text-xs' : t === 'base' ? 'text-sm' : t === 'lg' ? 'text-base' : 'text-lg';
const alertRefSize = (t: AiTextSize) =>
  t === 'sm' ? 'text-[9px]' : t === 'base' ? 'text-[11px]' : t === 'lg' ? 'text-xs' : 'text-sm';
const insightsClass = (t: AiTextSize) =>
  t === 'sm' ? 'text-xs leading-normal'
    : t === 'base' ? 'text-sm leading-relaxed'
      : t === 'lg' ? 'text-base leading-relaxed font-semibold'
        : 'text-lg leading-loose font-semibold';

export const AiAnalysisPanel: React.FC<Props> = ({
  analysis, exams, selectedExam, analyzing, onAnalyze, onSaveNote, textSize = 'base',
}) => {
  const alertas = analysis?.alertas ?? null;
  const parecer = analysis?.insights ?? null;
  const biomarcadores = analysis?.todos_biomarcadores ?? null;

  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  // Pré-computa a evolução de cada biomarcador uma vez (PERF-09).
  const evolutions = useMemo(() => {
    if (!biomarcadores) return [];
    return biomarcadores.map((bio) => {
      const prev = getPreviousExamBiomarker(exams, selectedExam, bio.marcador);
      return prev ? getEvolutionIndicator(bio.valor, prev.valor) : null;
    });
  }, [biomarcadores, exams, selectedExam]);

  if (!alertas && !parecer && !biomarcadores) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 max-w-sm mx-auto space-y-4">
        <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-indigo-50 to-primary-50 text-indigo-600 flex items-center justify-center shadow border border-indigo-100/50 animate-bounce">
          <Sparkles className="w-8 h-8" />
        </div>
        <div>
          <h5 className="text-base font-semibold text-slate-900">Pronto para Análise Clínica</h5>
          <p className="text-sm font-normal text-slate-500 leading-relaxed mt-1.5">
            A inteligência artificial lê biomarcadores em PDFs, identifica o que está fora dos valores de referência e constrói insights dietéticos personalizados de forma instantânea.
          </p>
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing}
          className="w-full bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-500 hover:to-indigo-500 text-white font-semibold text-sm py-4 rounded-xl shadow transition-all flex items-center justify-center gap-2 disabled:opacity-75"
        >
          {analyzing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent animate-bounce" />
              <span>Analisando PDF...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-indigo-200" />
              <span>✨ Analisar Exame com IA</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Alertas */}
      <div className="space-y-3">
        <h5 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 bg-indigo-500 rounded-sm" />
          Alterações Críticas Detectadas
        </h5>
        {alertas && alertas.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5">
            {alertas.map((alerta: ExamBiomarker, idx: number) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border flex justify-between items-center shadow-sm transition-all duration-200 ${
                  alerta.gravidade === 'alta' ? 'bg-rose-50/30 border-rose-100' : 'bg-amber-50/20 border-amber-100'
                }`}
              >
                <div>
                  <p className={`font-semibold text-slate-900 transition-all ${alertTitleSize(textSize)}`}>{alerta.marcador}</p>
                  <p className={`text-slate-500 mt-1 font-normal tracking-wide transition-all ${alertRefSize(textSize)}`}>
                    Referência: <span className="text-slate-600 font-medium">{alerta.referencia}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold text-slate-900 transition-all ${alertTitleSize(textSize)}`}>{alerta.valor}</p>
                  <span className={`inline-block text-[10px] font-medium uppercase px-2.5 py-0.5 rounded-lg border mt-1 ${
                    alerta.gravidade === 'alta'
                      ? 'bg-rose-50/50 border-rose-200 text-rose-600'
                      : 'bg-amber-50 border-amber-250 text-amber-700'
                  }`}>
                    {alerta.gravidade === 'alta' ? 'Alta' : 'Média'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-emerald-50/50 border border-emerald-100/50 rounded-xl text-emerald-600 text-sm font-medium flex items-center gap-2">
            <Check className="w-4.5 h-4.5 text-emerald-650 shrink-0" />
            Todos os biomarcadores analisados parecem estar dentro das referências do laboratório!
          </div>
        )}
      </div>

      {/* Parecer */}
      <div className="space-y-3 pt-1">
        <h5 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 bg-emerald-500 rounded-sm" />
          Parecer Clínico Nutricional
        </h5>
        <div className={`font-medium text-slate-700 border-l-4 border-emerald-500 bg-emerald-50/10 px-5 py-4 rounded-r-xl shadow-inner whitespace-pre-line transition-all duration-300 ${insightsClass(textSize)}`}>
          {parecer}
        </div>
      </div>

      {/* Tabela de biomarcadores */}
      {biomarcadores && (
        <div className="space-y-3 pt-2">
          <h5 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-3.5 bg-slate-400 rounded-sm" />
            Lista Completa de Biomarcadores ({biomarcadores.length})
          </h5>
          <div className="bg-card-premium rounded-xl border border-slate-300/50 overflow-hidden shadow-sm animate-in fade-in duration-200">
            <div className="p-3 bg-slate-50/50 grid grid-cols-12 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-300/50">
              <span className="col-span-4 sm:col-span-5">Biomarcador</span>
              <span className="col-span-3 sm:col-span-2 text-right">Resultado</span>
              <span className="col-span-3 sm:col-span-2 text-center">Evolução</span>
              <span className="hidden sm:block sm:col-span-2 pl-4">Referência</span>
              <span className="col-span-2 sm:col-span-1 text-center">Ações</span>
            </div>
            <div className="divide-y divide-slate-100">
              {biomarcadores.map((bio: ExamBiomarker, idx: number) => (
                <BiomarkerRow
                  key={idx}
                  bio={bio}
                  evo={evolutions[idx]}
                  isEditing={editIdx === idx}
                  noteDraft={editIdx === idx ? noteDraft : ''}
                  savingNote={savingIdx === idx}
                  onStartEdit={() => { setEditIdx(idx); setNoteDraft(bio.nota_clinica || ''); }}
                  onCancelEdit={() => { setEditIdx(null); setNoteDraft(''); }}
                  onChangeNote={setNoteDraft}
                  onSaveNote={async () => {
                    setSavingIdx(idx);
                    try {
                      await onSaveNote(idx, noteDraft);
                      setEditIdx(null);
                      setNoteDraft('');
                    } finally {
                      setSavingIdx(null);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
