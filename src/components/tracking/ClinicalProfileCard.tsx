import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardPlus, HeartPulse } from 'lucide-react';
import { Card } from '../ui';
import { cn } from '../../lib/cn';
import type { PatientRow } from '../../types/clinical';
import { SectionHeader } from './chartKit';

type Field = { label: string; value: string | null; highlight?: 'bad' | 'warn' };

const HIGHLIGHT = {
  bad: 'border-rose-100 bg-rose-50 text-rose-800',
  warn: 'border-amber-100 bg-amber-50 text-amber-800',
} as const;

const clean = (v: string | null | undefined) => {
  const s = v?.trim();
  return s && !/^(nenhum|nenhuma|não|nao|n\/a|-)$/i.test(s) ? s : null;
};

/**
 * Ficha clínica do paciente (preenchida em Pacientes, na pré-consulta ou na
 * consulta). Alergias e restrições vêm destacadas: são o que não pode
 * escapar ao revisar ou montar um plano.
 */
export const ClinicalProfileCard: React.FC<{ patient: PatientRow }> = ({ patient }) => {
  const navigate = useNavigate();
  const fields: Field[] = [
    { label: 'Alergias', value: clean(patient.allergies), highlight: 'bad' },
    { label: 'Restrições alimentares', value: clean(patient.dietary_restrictions), highlight: 'warn' },
    { label: 'Patologias', value: clean(patient.pathologies) },
    { label: 'Medicações', value: clean(patient.medications) },
    { label: 'Atividade física', value: clean(patient.physical_activity_level) },
    { label: 'Sono', value: clean(patient.sleep_quality) },
    { label: 'Profissão / rotina', value: clean(patient.profession) },
  ];
  const empty = fields.every((f) => !f.value);

  return (
    <Card as="section" aria-labelledby="profile-title" className="space-y-4">
      <SectionHeader
        id="profile-title"
        icon={<HeartPulse />}
        plate="bg-slate-700 text-white"
        title="Ficha clínica"
        subtitle="Dados do cadastro do paciente"
      />
      {empty ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-center">
          <p className="text-sm text-slate-600">Ficha clínica ainda não preenchida.</p>
          <button
            type="button"
            onClick={() => navigate('/pacientes')}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#5024fc] hover:underline cursor-pointer"
          >
            <ClipboardPlus className="h-4 w-4" aria-hidden="true" /> Completar ficha
          </button>
        </div>
      ) : (
        <dl className="space-y-2.5">
          {fields.map((f) => {
            const hl = f.value && f.highlight ? HIGHLIGHT[f.highlight] : null;
            return (
              <div key={f.label} className={cn(hl && 'rounded-xl border px-3 py-2', hl)}>
                <dt className={cn('text-xs font-medium', hl ? 'opacity-80' : 'text-slate-500')}>{f.label}</dt>
                <dd className={cn('mt-0.5 text-sm', f.value ? (hl ? 'font-medium' : 'text-slate-900') : 'text-slate-400')}>
                  {f.value ?? 'Não informado'}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </Card>
  );
};
