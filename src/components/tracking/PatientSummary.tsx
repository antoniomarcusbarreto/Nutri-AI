import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, FileUp, Salad } from 'lucide-react';
import { Button, Card } from '../ui';
import type { PatientRow } from '../../types/clinical';

export interface PatientSummaryProps {
  patient: PatientRow;
  age: number | null;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase();

/**
 * Cabeçalho de contexto do paciente: quem é e atalhos para as ações mais
 * comuns. A situação atual (última consulta, retorno, plano, exame) mora na
 * aba Visão geral.
 */
export const PatientSummary: React.FC<PatientSummaryProps> = ({ patient, age }) => {
  const navigate = useNavigate();
  const demographics = [
    age != null ? `${age} anos` : null,
    patient.biological_sex === 'F' ? 'Feminino' : patient.biological_sex === 'M' ? 'Masculino' : null,
    patient.main_goal ? `Objetivo: ${patient.main_goal}` : null,
  ].filter(Boolean);

  return (
    <Card as="section" aria-label="Resumo do paciente" padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-base font-semibold text-white shadow-md" aria-hidden="true">
            {initials(patient.name)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-900">{patient.name}</h2>
              {patient.status !== 'ativo' && (
                <span className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">Inativo</span>
              )}
            </div>
            {demographics.length > 0 && <p className="mt-0.5 text-sm text-slate-500">{demographics.join(' · ')}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => navigate('/agenda')}>
            Agendar retorno
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<FileUp className="h-4 w-4" />} onClick={() => navigate('/exames')}>
            Anexar exame
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<Salad className="h-4 w-4" />} onClick={() => navigate('/planos')}>
            Plano alimentar
          </Button>
        </div>
      </div>
    </Card>
  );
};
