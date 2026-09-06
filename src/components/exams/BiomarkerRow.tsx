import React from 'react';
import { MessageSquare } from 'lucide-react';
import { BiomarkerNoteEditor } from './BiomarkerNoteEditor';
import type { EvolutionIndicator } from '../../utils/biomarkers';
import type { ExamBiomarker } from '../../types/clinical';

/**
 * Uma linha da "Lista Completa de Biomarcadores" (Onda 5 / DEBT-02 / PERF-11).
 * `React.memo`: só re-renderiza quando este biomarcador, sua evolução ou o
 * estado de edição da nota mudam — digitar em outra linha não a re-renderiza.
 */
interface Props {
  bio: ExamBiomarker;
  evo: EvolutionIndicator | null;
  isEditing: boolean;
  noteDraft: string;
  savingNote: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeNote: (v: string) => void;
  onSaveNote: () => void;
}

const BiomarkerRowBase: React.FC<Props> = ({
  bio, evo, isEditing, noteDraft, savingNote,
  onStartEdit, onCancelEdit, onChangeNote, onSaveNote,
}) => {
  const isAltered = bio.status === 'alterado';
  const hasNote = !!bio.nota_clinica;

  return (
    <div className="flex flex-col hover:bg-slate-50/30 transition-colors">
      <div className="p-3.5 grid grid-cols-12 items-center text-xs sm:text-sm font-normal">
        <div className="col-span-4 sm:col-span-5 flex items-center gap-2 min-w-0">
          <div className={`h-2 w-2 rounded-full shrink-0 ${isAltered ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
          <span className="text-slate-750 truncate max-w-[140px] sm:max-w-xs">{bio.marcador}</span>
        </div>

        <div className={`col-span-3 sm:col-span-2 text-right font-medium ${isAltered ? 'text-amber-600' : 'text-slate-900'}`}>
          {bio.valor}
        </div>

        <div className="col-span-3 sm:col-span-2 text-center flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 text-xs">
          {evo ? (
            <>
              <span className={`${evo.color} text-sm`}>{evo.text}</span>
              {evo.diffStr && <span className="text-[10px] text-slate-500 font-medium">({evo.diffStr})</span>}
            </>
          ) : (
            <span className="text-slate-400 font-medium">—</span>
          )}
        </div>

        <div className="hidden sm:block sm:col-span-2 pl-4 text-xs text-slate-455 truncate">{bio.referencia}</div>

        <div className="col-span-2 sm:col-span-1 text-center">
          <button
            type="button"
            onClick={isEditing ? onCancelEdit : onStartEdit}
            className={`p-1.5 rounded-lg border transition-all ${
              hasNote
                ? 'bg-teal-50 border-teal-200 text-teal-650 hover:bg-teal-100/55'
                : isEditing
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-650'
                  : 'bg-white border-slate-200 text-slate-400 hover:text-slate-650 hover:bg-slate-50'
            }`}
            title={hasNote ? 'Ver / Editar Observação Clínica' : 'Adicionar Observação Clínica'}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {(isEditing || hasNote) && (
        <div className="px-3.5 pb-3.5 pl-8 border-t border-slate-100/60 bg-slate-50/20 text-xs text-left animate-in slide-in-from-top duration-200">
          {isEditing ? (
            <BiomarkerNoteEditor
              value={noteDraft}
              hasNote={hasNote}
              saving={savingNote}
              onChange={onChangeNote}
              onCancel={onCancelEdit}
              onSave={onSaveNote}
            />
          ) : (
            <div className="mt-2 bg-emerald-50/20 border border-emerald-100/60 p-2.5 rounded-xl flex justify-between items-start gap-4">
              <div className="min-w-0">
                <p className="text-[9px] font-medium text-emerald-800 uppercase tracking-wider">Observação Clínica Registrada:</p>
                <p className="font-normal text-slate-700 leading-relaxed mt-1 whitespace-pre-line italic">"{bio.nota_clinica}"</p>
              </div>
              <button
                type="button"
                onClick={onStartEdit}
                className="text-[10px] font-medium text-emerald-700 hover:text-emerald-900 shrink-0 bg-white border border-emerald-200 px-2 py-1 rounded-lg transition-all hover:bg-emerald-50"
              >
                Editar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const BiomarkerRow = React.memo(BiomarkerRowBase);
