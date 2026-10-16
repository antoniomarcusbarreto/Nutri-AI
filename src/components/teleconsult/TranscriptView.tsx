import React from 'react';
import { format } from 'date-fns';
import { cn } from '../../lib/cn';
import type { TranscriptSegment } from '../../lib/teleconsult';

const WHO: Record<TranscriptSegment['speaker'], string> = {
  nutricionista: 'Nutricionista',
  paciente: 'Paciente',
  outro: 'Outro participante',
};

/** Transcrição completa, com falas seguidas da mesma pessoa agrupadas. */
export const TranscriptView: React.FC<{ segments: TranscriptSegment[]; className?: string }> = ({ segments, className }) => {
  const groups: { key: string; speaker: TranscriptSegment['speaker']; at: string; text: string }[] = [];
  for (const s of segments) {
    const last = groups[groups.length - 1];
    if (last && last.speaker === s.speaker) last.text += ` ${s.text}`;
    else groups.push({ key: s.id, speaker: s.speaker, at: s.spoken_at, text: s.text });
  }

  if (groups.length === 0) return <p className="text-sm text-slate-500">Nenhum trecho foi transcrito.</p>;

  return (
    <ol className={cn('space-y-3', className)}>
      {groups.map((g) => (
        <li key={g.key} className="text-sm leading-relaxed text-slate-700">
          <p className="flex items-baseline gap-2">
            <span className={cn('font-medium', g.speaker === 'nutricionista' ? 'text-[#5024fc]' : 'text-slate-900')}>
              {WHO[g.speaker]}
            </span>
            <span className="text-xs tabular-nums text-slate-400">{format(new Date(g.at), 'HH:mm')}</span>
          </p>
          <p className="mt-0.5">{g.text}</p>
        </li>
      ))}
    </ol>
  );
};
