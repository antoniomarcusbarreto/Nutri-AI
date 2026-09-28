import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Activity, ClipboardList, ExternalLink, FileText, Salad, Sparkles } from 'lucide-react';
import { Button, Modal } from '../ui';
import { createExamSignedUrl } from '../../lib/storage';
import { logger } from '../../lib/logger';
import { useToast } from '../../contexts/ToastContext';
import { MEAL_NAMES, type MealOption } from '../../types/mealPlan';
import type { AnthropometryJson, AppointmentRecord, ExamBiomarker, ExamRecord, MealPlanRecord } from '../../types/clinical';
import { pickOne } from '../../types/clinical';
import { examDate, fmtDate } from './trackingModel';

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
    {icon} {children}
  </h4>
);

// --- Laudo -----------------------------------------------------------------

export const ExamDetailModal: React.FC<{ exam: ExamRecord | null; onClose: () => void }> = ({ exam, onClose }) => {
  const { showToast } = useToast();
  // Signed URL do PDF — `file_url` como chave refaz ao trocar de exame e
  // reaproveita o cache ao reabrir o mesmo (a URL vale 1h).
  const fileUrl = exam?.file_url;
  const { data: pdfUrl = null, isFetching, error } = useQuery({
    queryKey: ['exam-signed-url', fileUrl],
    enabled: !!fileUrl,
    staleTime: 50 * 60 * 1000,
    queryFn: () => createExamSignedUrl(fileUrl as string),
  });

  useEffect(() => {
    if (error) {
      logger.error('Erro ao gerar URL assinada para modal:', error);
      showToast('Não foi possível gerar link de acesso ao PDF.', 'error');
    }
  }, [error, showToast]);

  const biomarkers: ExamBiomarker[] = exam?.ai_feedback?.todos_biomarcadores ?? [];

  return (
    <Modal
      open={!!exam}
      onClose={onClose}
      size="xl"
      badge={<><FileText className="h-3 w-3" /> Exame laboratorial</>}
      title={exam ? `Laudo de ${fmtDate(examDate(exam))}` : ''}
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      {exam && (
        <div className="space-y-6 text-left">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Documento original</p>
              <p className="truncate text-sm font-medium text-slate-900">{exam.file_url.split('/').pop() || 'Laudo.pdf'}</p>
            </div>
            {isFetching ? (
              <span className="text-xs text-slate-500">Gerando link seguro…</span>
            ) : pdfUrl ? (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#5024fc] px-4 py-2 text-xs font-semibold text-white hover:bg-[#431cdb]"
              >
                <ExternalLink className="h-4 w-4" /> Abrir PDF
              </a>
            ) : (
              <span className="text-xs font-medium text-rose-600">Não foi possível carregar o PDF</span>
            )}
          </div>

          <div className="space-y-2">
            <SectionTitle icon={<Sparkles className="h-4 w-4 text-indigo-500" />}>Parecer da IA</SectionTitle>
            <p className="whitespace-pre-line rounded-2xl border border-indigo-100/60 bg-indigo-50/30 p-4 text-sm leading-relaxed text-slate-700">
              {exam.ai_feedback?.insights || 'Nenhum parecer gerado para este exame.'}
            </p>
          </div>

          <div className="space-y-2">
            <SectionTitle icon={<Activity className="h-4 w-4 text-[#5024fc]" />}>Biomarcadores</SectionTitle>
            <div className="relative overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Biomarcador</th>
                    <th className="px-4 py-2.5 font-medium">Resultado</th>
                    <th className="px-4 py-2.5 font-medium">Referência</th>
                    <th className="px-4 py-2.5 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {biomarkers.map((bio, idx) => {
                    const altered = bio.status?.toLowerCase() === 'alterado';
                    return (
                      <React.Fragment key={idx}>
                        <tr>
                          <td className="px-4 py-3 text-slate-900">{bio.marcador}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{bio.valor}</td>
                          <td className="px-4 py-3 text-slate-500">{bio.referencia}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-medium ${
                              altered ? 'border-rose-100 bg-rose-50/50 text-rose-700' : 'border-emerald-100 bg-emerald-50/50 text-emerald-700'
                            }`}>
                              {altered ? 'Alterado' : 'Normal'}
                            </span>
                          </td>
                        </tr>
                        {bio.nota_clinica && (
                          <tr>
                            <td colSpan={4} className="px-4 pb-3 pt-0">
                              <p className="flex items-start gap-1.5 rounded-xl border border-emerald-100/60 bg-emerald-50/30 p-2.5 text-xs leading-relaxed text-slate-600">
                                <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                <span><span className="font-medium text-emerald-700">Anotação nutricional: </span>{bio.nota_clinica}</span>
                              </p>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {biomarkers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">Nenhum biomarcador detalhado disponível.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// --- Atendimento -------------------------------------------------------------

export const AppointmentDetailModal: React.FC<{ appointment: AppointmentRecord | null; onClose: () => void }> = ({
  appointment,
  onClose,
}) => {
  const consultation = pickOne(appointment?.consultations);
  const ant: AnthropometryJson = consultation?.anthropometry_json ?? {};
  const fields = [
    { label: 'Peso', value: ant.weight, unit: ' kg' },
    { label: 'Altura', value: ant.height, unit: Number(String(ant.height).replace(',', '.')) > 3 ? ' cm' : ' m' },
    { label: 'Gordura', value: ant.body_fat, unit: '%' },
    { label: 'Massa muscular', value: ant.muscle_mass, unit: '%' },
  ].filter((f) => f.value != null && f.value !== '');

  return (
    <Modal
      open={!!appointment}
      onClose={onClose}
      size="lg"
      badge={<><ClipboardList className="h-3 w-3" /> Resumo do atendimento</>}
      title={appointment ? `${pickOne(appointment.services)?.name || 'Consulta'} · ${fmtDate(new Date(appointment.date_time))}` : ''}
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      <div className="space-y-6 text-left">
        {fields.length > 0 && (
          <div className="space-y-2">
            <SectionTitle icon={<Activity className="h-4 w-4 text-[#5024fc]" />}>Avaliação física</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {fields.map((f) => (
                <div key={f.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <p className="text-xs font-medium text-slate-500">{f.label}</p>
                  <p className="mt-1 text-lg font-medium text-slate-900">{f.value}{f.unit}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <SectionTitle icon={<FileText className="h-4 w-4 text-[#5024fc]" />}>Anamnese</SectionTitle>
          <p className="whitespace-pre-line rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
            {consultation?.anamnese_notes || 'Nenhuma anotação de anamnese registrada.'}
          </p>
        </div>
      </div>
    </Modal>
  );
};

// --- Plano alimentar ---------------------------------------------------------

export const MealPlanDetailModal: React.FC<{ plan: MealPlanRecord | null; onClose: () => void }> = ({ plan, onClose }) => {
  const navigate = useNavigate();
  const meals = (plan?.meals ?? {}) as Record<string, MealOption[] | undefined>;
  const keys = Object.keys(meals);

  return (
    <Modal
      open={!!plan}
      onClose={onClose}
      size="lg"
      badge={<><Salad className="h-3 w-3" /> Plano alimentar</>}
      title={plan ? `${plan.kcal} kcal · criado em ${fmtDate(new Date(plan.created_at))}` : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          <Button onClick={() => navigate('/planos')} leftIcon={<ExternalLink className="h-4 w-4" />}>Abrir em Planos</Button>
        </>
      }
    >
      {keys.length === 0 ? (
        <p className="text-sm text-slate-500">Este plano não tem refeições estruturadas.</p>
      ) : (
        <div className="space-y-3 text-left">
          {keys.map((key) => {
            const options = Array.isArray(meals[key]) ? meals[key]! : [];
            return (
              <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-900">{MEAL_NAMES[key] ?? key}</p>
                {options.map((opt, i) => (
                  <div key={i} className="mt-2 text-sm text-slate-600">
                    {options.length > 1 && <p className="text-xs font-medium text-slate-500">Opção {i + 1}{opt.kcal ? ` · ${opt.kcal} kcal` : ''}</p>}
                    {opt.description && <p>{opt.description}</p>}
                    <ul className="ml-4 list-disc">
                      {/* Planos antigos gravavam itens como `{ description }`. */}
                      {(opt.items ?? []).map((item: string | { description?: string }, j) => (
                        <li key={j}>{typeof item === 'string' ? item : item?.description}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
