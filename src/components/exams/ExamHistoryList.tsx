import React from 'react';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import type { ExamRecord } from '../../types/clinical';

/**
 * Lista de cards do histórico de exames (Onda 5 / DEBT-02).
 * Markup unificado sobre a variante de Exames; consumido por Exams e pela
 * aba de exames de Consultations.
 */
interface Props {
  exams: ExamRecord[];
  selectedExamId?: string | null;
  onSelect: (exam: ExamRecord) => void;
  onDelete: (exam: ExamRecord, e: React.MouseEvent) => void;
  emptyState?: React.ReactNode;
}

export const ExamHistoryList: React.FC<Props> = ({ exams, selectedExamId, onSelect, onDelete, emptyState }) => {
  if (!exams || exams.length === 0) {
    return <>{emptyState ?? (
      <div className="text-center py-8">
        <p className="text-sm font-medium text-slate-600">Nenhum exame enviado</p>
      </div>
    )}</>;
  }

  return (
    <div className="space-y-2">
      {exams.map((exam) => {
        const fileName = exam.file_url.split('/').pop()?.substring(13) || 'Exame_Laboratorial.pdf';
        const parsedDate = new Date(exam.created_at);
        const hasAI = !!exam.ai_feedback;
        const isSelected = selectedExamId === exam.id;

        return (
          <div
            key={exam.id}
            onClick={() => onSelect(exam)}
            className={`group flex items-center justify-between p-2.5 border rounded-xl cursor-pointer shadow-sm transition-all duration-200 ${
              isSelected
                ? 'bg-teal-50/40 border-teal-300'
                : 'bg-slate-50/50 hover:bg-teal-50/30 border-slate-200/60 hover:border-teal-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-xs font-semibold ${
                hasAI
                  ? 'bg-indigo-50 border border-indigo-100 text-indigo-650'
                  : 'bg-slate-100 border border-slate-200 text-slate-500'
              }`}>
                PDF
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate max-w-[150px] group-hover:text-teal-700 transition-colors" title={fileName}>
                  {fileName}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-slate-500 font-normal">{format(parsedDate, 'dd/MM/yyyy')}</span>
                  {hasAI && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded border border-indigo-100">
                      IA
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => onDelete(exam, e)}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100 opacity-0 group-hover:opacity-100"
              title="Excluir exame"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
