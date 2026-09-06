import React from 'react';

/**
 * Editor inline da anotação clínica de um biomarcador (Onda 5 / DEBT-02).
 * Markup verbatim do bloco duplicado em Exams.tsx e Consultations.tsx.
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
  hasNote: boolean;
  saving?: boolean;
}

export const BiomarkerNoteEditor: React.FC<Props> = ({ value, onChange, onCancel, onSave, hasNote, saving }) => (
  <div className="space-y-2 mt-2">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
        Anotação Clínica do Nutricionista
      </span>
      {hasNote && (
        <span className="text-[9px] bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded font-medium">
          Nota Salva
        </span>
      )}
    </div>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Escreva sua percepção ou conduta clínica sobre este biomarcador (ex: ajustar suplementação, focar em micronutrientes)..."
      rows={2}
      className="w-full bg-white px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 font-normal text-sm text-slate-700 placeholder-slate-400 transition-all shadow-sm"
    />
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-650 font-semibold text-xs rounded-lg transition-all"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="px-3 py-2 bg-teal-600 hover:bg-teal-500 border border-teal-600 text-white font-semibold text-xs rounded-lg transition-all shadow-sm disabled:opacity-60"
      >
        Salvar Nota
      </button>
    </div>
  </div>
);
