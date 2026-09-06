import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, User, Clock, Building2, Activity, CheckCircle2, XCircle, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { logger } from '../lib/logger';

interface AppointmentPublicDetails {
  date_time: string;
  status: 'pendente' | 'confirmado' | 'concluido' | 'cancelado';
  patient_name: string;
  service_name: string;
  professional_name: string;
  clinic_name: string;
}

const APPT_KEY = (token: string | undefined) => ['appointment-public', token] as const;

export const ConfirmAppointment: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Detalhes públicos via TanStack Query (antes: useEffect + 4 setState).
  const {
    data: appointment = null,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: APPT_KEY(token),
    enabled: !!token,
    retry: false,
    queryFn: async (): Promise<AppointmentPublicDetails> => {
      const { data, error: rpcError } = await supabase.rpc('get_appointment_details_public', {
        p_token: token,
      });
      if (rpcError) {
        logger.error('Erro ao buscar detalhes da consulta:', rpcError);
        throw new Error('NOT_FOUND');
      }
      if (!data || data.length === 0) throw new Error('EXPIRED');
      return data[0] as AppointmentPublicDetails;
    },
  });

  const error: string | null = !token
    ? 'Link de confirmação inválido.'
    : queryError
      ? queryError instanceof Error && queryError.message === 'EXPIRED'
        ? 'Este link de confirmação é inválido ou já expirou. Fale com a sua clínica.'
        : 'Não foi possível encontrar as informações desta consulta.'
      : null;

  const handleUpdateStatus = async (newStatus: 'confirmado' | 'cancelado') => {
    if (!token || submitting) return;

    try {
      setSubmitting(true);
      const { data, error: rpcError } = await supabase.rpc('confirm_appointment_public', {
        p_token: token,
        p_status: newStatus,
      });

      if (rpcError || !data) {
        showToast('Não foi possível atualizar o agendamento. O link pode ter expirado.', 'error');
      } else {
        // Success — atualiza o cache da query (sem estado local).
        queryClient.setQueryData<AppointmentPublicDetails>(
          APPT_KEY(token),
          (prev) => (prev ? { ...prev, status: newStatus } : prev),
        );
        if (newStatus === 'confirmado') {
          showToast('Presença confirmada com sucesso!', 'success');
        } else {
          showToast('Sua consulta foi desmarcada.', 'info');
        }
      }
    } catch (err) {
      logger.error(err);
      showToast('Ocorreu um erro ao processar sua solicitação.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-primary-50/20 to-teal-50/30 flex flex-col items-center justify-center p-6 font-sans">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto" />
          <h2 className="text-xl font-bold text-slate-800">Carregando detalhes da consulta...</h2>
          <p className="text-sm font-medium text-slate-500">Aguarde um instante.</p>
        </div>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-primary-50/20 to-teal-50/30 flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-slate-200/60 text-center space-y-6">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
            <XCircle className="w-9 h-9 text-rose-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Ops! Algo deu errado</h2>
            <p className="text-base font-semibold text-slate-500 leading-relaxed">
              {error || 'Não conseguimos carregar as informações do seu agendamento.'}
            </p>
          </div>
          <p className="text-xs font-semibold text-slate-400">
            Se você acha que isso é um erro, entre em contato diretamente com o seu profissional de saúde.
          </p>
        </div>
      </div>
    );
  }

  // Format Date and Time
  const dateObj = new Date(appointment.date_time);
  const formattedDay = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
  const capitalizedDay = formattedDay.charAt(0).toUpperCase() + formattedDay.slice(1);
  const formattedDate = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-primary-50/25 to-teal-50/40 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      
      {/* Brand Logo & Name */}
      <div className="flex items-center gap-2 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="bg-primary-600 p-2.5 rounded-2xl shadow-lg shadow-primary-600/20 text-white flex items-center justify-center">
          <Activity className="w-6 h-6 stroke-[2.5]" />
        </div>
        <span className="text-2xl font-black text-slate-800 tracking-tight">
          Nutri<span className="text-primary-600 font-extrabold">.AI</span>
        </span>
      </div>

      {/* Main Glassmorphic Card */}
      <div className="max-w-lg w-full bg-white/80 backdrop-blur-md rounded-[32px] p-6 sm:p-8.5 shadow-2xl border border-white/60 hover:shadow-slate-200/50 transition-all duration-350 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
        
        {/* Card Header & Decorative Icon */}
        <div className="text-center relative">
          <div className="absolute -top-3.5 -right-2 text-primary-500 opacity-60 animate-pulse">
            <Sparkles className="w-5.5 h-5.5" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
            Confirmação de Consulta
          </h1>
          <p className="text-sm font-semibold text-slate-450 mt-1.5 leading-relaxed">
            Olá, <strong className="text-slate-700 font-bold">{appointment.patient_name}</strong>! Verifique os detalhes do seu atendimento abaixo e confirme ou desmarque sua presença.
          </p>
        </div>

        {/* Appointment details panel */}
        <div className="bg-slate-50/65 rounded-2xl p-5 border border-slate-200/50 divide-y divide-slate-150 space-y-4">
          
          {/* Clinic Section */}
          <div className="flex items-start gap-3.5 pb-3.5">
            <div className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-sm shrink-0">
              <Building2 className="w-5.5 h-5.5 text-primary-600" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Local de Atendimento</span>
              <p className="text-base sm:text-lg font-extrabold text-slate-800 truncate mt-0.5">{appointment.clinic_name}</p>
            </div>
          </div>

          {/* Date & Time Section */}
          <div className="flex items-start gap-3.5 py-3.5">
            <div className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-sm shrink-0">
              <Calendar className="w-5.5 h-5.5 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Data da Consulta</span>
              <p className="text-base sm:text-lg font-extrabold text-slate-800 mt-0.5">{capitalizedDay}, {formattedDate}</p>
              <div className="flex items-center gap-1 text-sm font-semibold text-indigo-650 mt-1">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>Horário: <strong>{formattedTime}</strong></span>
              </div>
            </div>
          </div>

          {/* Service & Nutritionist Section */}
          <div className="flex items-start gap-3.5 pt-3.5">
            <div className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-sm shrink-0">
              <User className="w-5.5 h-5.5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Serviço e Responsável</span>
              <p className="text-base sm:text-lg font-extrabold text-slate-800 mt-0.5">
                {appointment.service_name}
              </p>
              <p className="text-sm font-semibold text-slate-500 mt-1">
                Nutricionista: <strong className="text-slate-700 font-bold">{appointment.professional_name}</strong>
              </p>
            </div>
          </div>

        </div>

        {/* Dynamic Status / Actions Area */}
        <div className="mt-2">
          
          {appointment.status === 'pendente' && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleUpdateStatus('confirmado')}
                disabled={submitting}
                className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-55 disabled:cursor-not-allowed text-white text-base font-extrabold py-4 px-6 rounded-2xl transition-all duration-200 shadow-md shadow-primary-600/10 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="w-5.5 h-5.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5.5 h-5.5 stroke-[2.2]" />
                )}
                Confirmar Presença
              </button>

              <button
                type="button"
                onClick={() => handleUpdateStatus('cancelado')}
                disabled={submitting}
                className="w-full bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 disabled:opacity-55 disabled:cursor-not-allowed text-slate-500 hover:text-rose-650 text-sm font-bold py-3.5 px-6 rounded-2xl transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                ) : (
                  <XCircle className="w-4.5 h-4.5 stroke-[2]" />
                )}
                Desmarcar Consulta
              </button>
            </div>
          )}

          {appointment.status === 'confirmado' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5.5 text-center flex flex-col items-center gap-3 animate-in zoom-in-95 duration-450">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-150 animate-bounce">
                <CheckCircle2 className="w-6.5 h-6.5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-emerald-900 tracking-wide">Presença Confirmada!</h3>
                <p className="text-sm font-semibold text-emerald-700 mt-1.5 leading-relaxed">
                  Obrigado por confirmar sua presença. O seu nutricionista foi notificado e tudo já está pronto para o seu atendimento!
                </p>
              </div>
            </div>
          )}

          {appointment.status === 'cancelado' && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5.5 text-center flex flex-col items-center gap-3 animate-in zoom-in-95 duration-450">
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center text-rose-500 shadow-sm border border-rose-150">
                <XCircle className="w-6.5 h-6.5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-rose-900 tracking-wide">Consulta Desmarcada</h3>
                <p className="text-sm font-semibold text-rose-700 mt-1.5 leading-relaxed">
                  Esta consulta foi cancelada com sucesso. Caso precise agendar um novo horário ou tirar dúvidas, entre em contato diretamente com a clínica.
                </p>
              </div>
            </div>
          )}

          {(appointment.status === 'concluido') && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5.5 text-center flex flex-col items-center gap-2">
              <CheckCircle2 className="w-10 h-10 text-slate-400" />
              <h3 className="text-base font-bold text-slate-700">Consulta Concluída</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Este atendimento já foi realizado.
              </p>
            </div>
          )}

        </div>

      </div>

      {/* Footer Info */}
      <p className="mt-8 text-xs font-semibold text-slate-400 tracking-wider">
        Nutri-AI © {new Date().getFullYear()} • Sistema de Saúde Integrado
      </p>

    </div>
  );
};
