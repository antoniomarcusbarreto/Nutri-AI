import React from 'react';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { Select } from '../ui';
import { useScheduleConflict } from '../../hooks/queries/usePortal';
import { fmtDuration } from '../../lib/duration';

/**
 * Campos de agenda compartilhados (migration 0035): duração da consulta
 * (padrão = a do serviço) e aviso de conflito com consultas, bloqueios ou a
 * grade. O aviso não impede salvar — encaixe é decisão da equipe.
 */

const DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180];

export const DurationSelect: React.FC<{
  value: string;
  serviceMinutes: number | null;
  onChange: (value: string) => void;
  label?: string;
}> = ({ value, serviceMinutes, onChange, label = 'Duração' }) => (
  <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{serviceMinutes ? `Padrão do serviço (${fmtDuration(serviceMinutes)})` : 'Padrão do serviço'}</option>
    {value && !DURATIONS.includes(Number(value)) && <option value={value}>{fmtDuration(Number(value))}</option>}
    {DURATIONS.map((m) => <option key={m} value={String(m)}>{fmtDuration(m)}</option>)}
  </Select>
);

const MESSAGES = {
  bloqueio: 'Este horário está num bloqueio da agenda do profissional.',
  fora_da_grade: 'Fora do horário de atendimento configurado do profissional.',
} as const;

export const ConflictNotice: React.FC<{
  nutritionistId: string | null | undefined;
  start: Date | null;
  minutes: number | null;
  excludeAppointmentId?: string | null;
}> = (props) => {
  const { data } = useScheduleConflict(props);
  if (!data?.conflict) return null;
  const text =
    data.conflict === 'consulta'
      ? `Bate com outra consulta${data.withTime ? ` (às ${format(new Date(data.withTime), 'HH:mm')})` : ''}, contando o intervalo entre consultas.`
      : MESSAGES[data.conflict];
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <span>{text} Você ainda pode salvar, se for um encaixe.</span>
    </p>
  );
};
