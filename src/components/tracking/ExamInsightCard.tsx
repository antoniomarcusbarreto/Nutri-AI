import React from 'react';
import { Sparkles } from 'lucide-react';
import { Card } from '../ui';
import { cn } from '../../lib/cn';
import type { ExamRecord } from '../../types/clinical';
import { examDate, fmtDate } from './trackingModel';

export interface ExamInsightCardProps {
  exam: ExamRecord | null;
  /** Na visão geral o texto vem resumido (line-clamp); na aba Exames, inteiro. */
  compact?: boolean;
  onOpenExam: (exam: ExamRecord) => void;
}

/** Parecer que a IA escreveu sobre o último laudo — antes só aparecia no modal. */
export const ExamInsightCard: React.FC<ExamInsightCardProps> = ({ exam, compact, onOpenExam }) => {
  const insights = exam?.ai_feedback?.insights?.trim();
  if (!exam || !insights) return null;
  return (
    <Card as="section" aria-labelledby="insight-title" padding={compact ? 'sm' : undefined} className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="insight-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          Parecer da IA · laudo de {fmtDate(examDate(exam))}
        </h2>
        <button
          type="button"
          onClick={() => onOpenExam(exam)}
          className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 cursor-pointer"
        >
          Ver laudo
        </button>
      </header>
      <p className={cn('whitespace-pre-line text-sm leading-relaxed text-slate-700', compact && 'line-clamp-5')}>{insights}</p>
    </Card>
  );
};
