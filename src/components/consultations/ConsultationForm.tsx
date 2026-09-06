import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { format } from 'date-fns';
import {
  Scale, Clipboard, Mic, MicOff, Volume2, Sparkles, Activity, Info, RotateCcw, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import { structureConsultationNotes, GeminiError } from '../../lib/gemini';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useDebouncedDraft } from '../../hooks/useDebouncedDraft';
import { logger } from '../../lib/logger';
import type { ConsultationAppointment } from '../../types/clinical';

/**
 * Aba "Registrar Atendimento" (Onda 5.3 / PERF-11).
 *
 * TODO o estado do formulário clínico (anamnese, antropometria, modo de
 * gravação) vive AQUI, não no componente-pai. Digitar na anamnese re-renderiza
 * apenas este componente — nunca o grid de agendamentos, o cabeçalho do
 * workspace, a barra de abas ou a aba de exames.
 *
 * Fica sempre montado (visibilidade via `hidden`) para preservar o rascunho ao
 * alternar de aba.
 */

interface Props {
  active: boolean;
  appointment: ConsultationAppointment | null;
  clinicId: string | undefined;
  isReadOnly: boolean;
  /** Chamado após finalizar: o pai atualiza a lista, o status e o histórico. */
  onFinalized: () => void | Promise<void>;
}

const emptyForm = { anamneseNotes: '', weight: '', height: '', bodyFat: '', muscleMass: '' };

/** API imperativa para o pai injetar texto na anamnese (botão "Copiar para Consulta"). */
export interface ConsultationFormHandle {
  appendAnamnese: (text: string) => void;
}

export const ConsultationForm = forwardRef<ConsultationFormHandle, Props>(function ConsultationForm(
  { active, appointment, clinicId, isReadOnly, onFinalized }, ref,
) {
  const { showToast } = useToast();

  const [anamneseNotes, setAnamneseNotes] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [muscleMass, setMuscleMass] = useState('');
  const [recordingMode, setRecordingMode] = useState<'append' | 'replace'>('append');
  const [saving, setSaving] = useState(false);
  const [optimizingAI, setOptimizingAI] = useState(false);

  const status = appointment?.status;
  const isDone = status === 'concluido';
  const patientId = appointment?.patient_id || appointment?.patients?.id || null;

  // Carrega a consulta salva (se concluída) ou o rascunho — por agendamento.
  useEffect(() => {
    if (!appointment?.id) return;
    let cancelled = false;
    const apply = (v: typeof emptyForm) => {
      if (cancelled) return;
      setAnamneseNotes(v.anamneseNotes);
      setWeight(v.weight);
      setHeight(v.height);
      setBodyFat(v.bodyFat);
      setMuscleMass(v.muscleMass);
    };

    if (isDone) {
      (async () => {
        try {
          const { data, error } = await supabase
            .from('consultations')
            .select('*')
            .eq('appointment_id', appointment.id)
            .maybeSingle();
          if (error) throw error;
          const ant = data?.anthropometry_json || {};
          apply({
            anamneseNotes: data?.anamnese_notes || '',
            weight: ant.weight != null ? String(ant.weight) : '',
            height: ant.height != null ? String(ant.height) : '',
            bodyFat: ant.body_fat != null ? String(ant.body_fat) : '',
            muscleMass: ant.muscle_mass != null ? String(ant.muscle_mass) : '',
          });
        } catch (err) {
          logger.error('Erro ao buscar consulta concluída:', err);
        }
      })();
      return () => { cancelled = true; };
    }

    const draftStr = patientId ? localStorage.getItem(`nutriai_draft_consulta_${patientId}`) : null;
    if (draftStr) {
      try {
        const d = JSON.parse(draftStr);
        apply({
          anamneseNotes: d.anamneseNotes || '',
          weight: d.weight || '',
          height: d.height || '',
          bodyFat: d.bodyFat || '',
          muscleMass: d.muscleMass || '',
        });
      } catch {
        apply(emptyForm);
      }
    } else {
      apply(emptyForm);
    }
    return () => { cancelled = true; };
  }, [appointment?.id, isDone, patientId]);

  // Auto-save de rascunho com debounce (PERF-10)
  useDebouncedDraft(
    patientId && !isDone ? `nutriai_draft_consulta_${patientId}` : null,
    { anamneseNotes, weight, height, bodyFat, muscleMass },
    { isEmpty: (v) => !v.anamneseNotes && !v.weight && !v.height && !v.bodyFat && !v.muscleMass },
  );

  useImperativeHandle(ref, () => ({
    appendAnamnese: (text: string) =>
      setAnamneseNotes((prev) => (prev ? `${prev}\n\n${text}` : text)),
  }), []);

  const { isRecording, volume: speechVolume, toggle: toggleRecording } = useSpeechRecognition({
    onFinalTranscript: (text) =>
      setAnamneseNotes((prev) => (recordingMode === 'replace' ? text : (prev ? `${prev.trim()}\n${text}` : text))),
    onError: (msg) => showToast(msg, 'error'),
  });

  const handleOptimizeAI = async () => {
    if (!anamneseNotes.trim()) {
      showToast('Digite ou faça uma gravação de áudio primeiro para formatar.', 'error');
      return;
    }
    setOptimizingAI(true);
    showToast('Processando transcrição e estruturando prontuário com Inteligência Artificial...', 'success');
    try {
      const { resumo_caso, queixas_paciente, conduta_nutricionista, metas_pactuadas } =
        await structureConsultationNotes(anamneseNotes);
      const todayDateStr = format(new Date(), 'dd/MM/yyyy');
      const md = `### 🌟 REGISTRO DE ATENDIMENTO INTEGRADO (S.O.A.P.) — ${todayDateStr}

#### 📋 S (SUBJETIVO) - Resumo Clínico do Caso:
${resumo_caso}

#### 🔍 QUEIXAS E DIFICULDADES (PACIENTE):
${queixas_paciente.length > 0 ? queixas_paciente.map((q) => `- ${q}`).join('\n') : '- Nenhuma queixa registrada explicitamente.'}

#### 📊 O (OBJETIVO) - Dados Antropométricos:
- **Peso:** ${weight ? `${weight} kg` : 'Medição pendente'} | **Altura:** ${height ? `${height} m` : 'Medição pendente'}
- **Composição Corporal:** ${bodyFat ? `% Gordura: ${bodyFat}%` : ''} ${muscleMass ? `| % Massa Muscular: ${muscleMass}%` : ''} (Aferido em bioimpedância).

#### 🔍 A (AVALIAÇÃO) - Condutas e Prescrições (NUTRICIONISTA):
${conduta_nutricionista.length > 0 ? conduta_nutricionista.map((c) => `- ${c}`).join('\n') : '- Nenhuma conduta prescrita registrada.'}

#### 🎯 P (PLANO) - Metas Pactuadas:
${metas_pactuadas.length > 0 ? metas_pactuadas.map((m) => `- ${m}`).join('\n') : '- Nenhuma meta acordada registrada.'}`;
      setAnamneseNotes(md);
      showToast('Transcrição diarizada e estruturada em prontuário com sucesso!', 'success');
    } catch (err) {
      logger.error('Erro ao estruturar notas:', err);
      showToast(err instanceof GeminiError ? err.message : 'Falha ao estruturar o prontuário.', 'error');
    } finally {
      setOptimizingAI(false);
    }
  };

  const handleSaveConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      showToast('O sistema está em modo de somente leitura.', 'error');
      return;
    }
    if (!appointment || !clinicId) return;
    if (!anamneseNotes.trim()) {
      showToast('Por favor, preencha as anotações/anamnese da consulta.', 'error');
      return;
    }
    setSaving(true);
    try {
      const anthropometry = {
        weight: weight ? parseFloat(weight) : null,
        height: height ? parseFloat(height) : null,
        body_fat: bodyFat ? parseFloat(bodyFat) : null,
        muscle_mass: muscleMass ? parseFloat(muscleMass) : null,
      };
      const { data: existing } = await supabase
        .from('consultations').select('id').eq('appointment_id', appointment.id).maybeSingle();

      if (existing?.id) {
        const { error } = await supabase.from('consultations')
          .update({ anamnese_notes: anamneseNotes, anthropometry_json: anthropometry })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('consultations').insert([{
          clinic_id: clinicId,
          appointment_id: appointment.id,
          patient_id: appointment.patient_id,
          anamnese_notes: anamneseNotes,
          anthropometry_json: anthropometry,
        }]);
        if (error) throw error;
      }

      const { error: apptError } = await supabase
        .from('appointments').update({ status: 'concluido' }).eq('id', appointment.id);
      if (apptError) throw apptError;

      if (patientId) localStorage.removeItem(`nutriai_draft_consulta_${patientId}`);
      showToast('Atendimento finalizado e prontuário registrado com sucesso!', 'success');
      await onFinalized();
    } catch (err) {
      logger.error('Erro ao finalizar consulta:', err);
      showToast((err instanceof Error && err.message) || 'Erro ao registrar a consulta no banco de dados.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'block w-full rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-primary-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all';

  return (
    <div className={active ? '' : 'hidden'}>
      <form onSubmit={handleSaveConsultation} className="space-y-6 animate-in fade-in duration-200 max-w-5xl mx-auto">

        {/* Antropometria */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Scale className="w-4 h-4 text-primary-600" />
            <h3 className="text-sm font-extrabold text-slate-800">Antropometria (Composição Corporal)</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Peso (kg)', v: weight, set: setWeight, step: '0.01', ph: 'ex: 75.5' },
              { label: 'Altura (m)', v: height, set: setHeight, step: '0.01', ph: 'ex: 1.78' },
              { label: 'Gordura Corporal (%)', v: bodyFat, set: setBodyFat, step: '0.1', ph: 'ex: 18.4' },
              { label: 'Massa Muscular (%)', v: muscleMass, set: setMuscleMass, step: '0.1', ph: 'ex: 35.2' },
            ].map((f) => (
              <div key={f.label}>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-1.5">{f.label}</label>
                <input
                  type="number" step={f.step} placeholder={f.ph} value={f.v}
                  onChange={(e) => f.set(e.target.value)} disabled={isDone} className={inputClass}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Áudio + Anamnese */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
            <div className="flex items-center gap-2">
              <Clipboard className="w-4 h-4 text-primary-600" />
              <h3 className="text-sm font-extrabold text-slate-800">Anotações Gerais &amp; Anamnese</h3>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl">
              <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-[10px] font-bold text-slate-500">
                {isRecording ? 'Captura de áudio ativa' : 'Gravador pronto'}
              </span>
            </div>
          </div>

          {!isDone && (
            <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-sm flex flex-col sm:flex-row items-center gap-5 justify-between relative overflow-hidden">
              {isRecording && <div className="absolute inset-0 bg-red-950/20 opacity-40 animate-pulse z-0 pointer-events-none" />}
              <div className="flex items-center gap-4 z-10 text-center sm:text-left flex-col sm:flex-row">
                <button
                  type="button" onClick={toggleRecording}
                  className={`h-16 w-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-500 ring-4 ring-red-500/30 ring-offset-4 ring-offset-slate-900 scale-105 animate-pulse'
                      : 'bg-gradient-to-tr from-primary-600 to-indigo-500 hover:from-primary-500 hover:to-indigo-400'
                  }`}
                  title={isRecording ? 'Pausar gravação' : 'Iniciar gravação'}
                >
                  {isRecording ? <MicOff className="h-6 w-6 text-white stroke-[2]" /> : <Mic className="h-6 w-6 text-white stroke-[2]" />}
                </button>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 justify-center sm:justify-start">
                    <Volume2 className={`w-4 h-4 ${isRecording ? 'text-red-400 animate-bounce' : 'text-slate-400'}`} />
                    {isRecording ? 'Ouvindo o atendimento...' : 'Registrar com Áudio'}
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-1 max-w-sm leading-relaxed">
                    {isRecording
                      ? 'Fale normalmente. As palavras ditadas são adicionadas instantaneamente abaixo.'
                      : 'Escreva livremente ou utilize nosso gravador de voz para ditar a anamnese do paciente.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto z-10">
                <div className="flex items-center bg-slate-800/80 px-2 py-1.5 rounded-xl border border-slate-700/60 justify-between gap-3">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1">Inserir:</span>
                  <div className="flex p-0.5 bg-slate-900 rounded-lg">
                    {(['append', 'replace'] as const).map((m) => (
                      <button
                        key={m} type="button" onClick={() => setRecordingMode(m)}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                          recordingMode === m ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {m === 'append' ? 'Anexar' : 'Substituir'}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button" onClick={handleOptimizeAI} disabled={optimizingAI}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-[10px] px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow disabled:opacity-60"
                >
                  {optimizingAI ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-primary-400 border-t-transparent" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-primary-400" />
                      Estruturar Anotações (IA)
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {isRecording && !isDone && (
            <div className="bg-slate-900/5 px-4 py-2 border border-slate-100 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-300">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-red-500 animate-pulse" /> Nível de Voz
              </span>
              <div className="flex items-center gap-0.5 h-4 flex-1 max-w-[200px] justify-end">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((barIdx) => (
                  <span
                    key={barIdx}
                    className={`w-1 rounded-full transition-all duration-100 ${
                      speechVolume > barIdx * 8 ? 'bg-red-500 h-full' : 'bg-slate-200 h-1.5'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-extrabold text-slate-600 uppercase tracking-wider mb-1.5">Anotações da Consulta *</label>
            <textarea
              rows={12} required value={anamneseNotes}
              onChange={(e) => setAnamneseNotes(e.target.value)}
              placeholder={isDone ? 'Nenhuma nota registrada nesta consulta.' : 'Digite aqui ou ative a gravação de áudio no painel acima...'}
              disabled={isDone}
              className="block w-full rounded-xl border border-slate-300 px-5 py-4 text-base focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 font-normal leading-relaxed shadow-sm bg-slate-50/10 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Finalização */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm shrink-0">
          <div className="flex items-start gap-2.5 text-left">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-400 max-w-sm leading-relaxed">
              {isDone
                ? <span>Este atendimento já foi finalizado e os dados do prontuário estão salvos de forma definitiva.</span>
                : <span>Ao finalizar, as anotações e medições físicas serão inseridas no prontuário definitivo deste paciente e o status deste agendamento passará para <strong>Concluído</strong>.</span>}
            </p>
          </div>
          {!isDone && (
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => { setAnamneseNotes(''); setWeight(''); setHeight(''); setBodyFat(''); setMuscleMass(''); }}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Limpar Campos
              </button>
              <button
                type="submit" disabled={saving || isReadOnly}
                className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" /> Finalizando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Finalizar Consulta
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
});
