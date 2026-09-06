import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, CalendarCheck, Clock, CheckCircle, Circle, Trash2, Plus, ChevronLeft, ChevronRight, Lock, Utensils, Copy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useClinicStats, useUpcomingAppointments, useReminders } from '../hooks/queries/useDashboard';
import { useReminderMutations } from '../hooks/mutations/useReminderMutations';
import { pickOne } from '../types/clinical';

export const Dashboard: React.FC = () => {
  const { isReadOnly, clinic, profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [newReminderText, setNewReminderText] = useState('');
  const [newReminderDate, setNewReminderDate] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // PERF-03/PERF-16: 3 queries independentes, disparadas em paralelo pelo
  // TanStack Query. `upcoming` não tem o mês na key → não refaz ao trocar de mês.
  const { data: stats } = useClinicStats(clinic?.id, selectedDate);
  const { data: upcomingAppointments = [] } = useUpcomingAppointments(clinic?.id);
  const { data: reminders = [] } = useReminders(clinic?.id, selectedDate);
  const { add: addReminderMutation, toggle: toggleReminderMutation, remove: removeReminderMutation } =
    useReminderMutations();

  const isPastMonth = () => {
    const now = new Date();
    if (selectedDate.getFullYear() < now.getFullYear()) return true;
    if (selectedDate.getFullYear() === now.getFullYear() && selectedDate.getMonth() < now.getMonth()) return true;
    return false;
  };

  const nextMonth = () => setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const prevMonth = () => setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  
  const monthName = selectedDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const formattedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  useEffect(() => {
    if (profile?.is_superadmin) {
      navigate('/admin', { replace: true });
    }
  }, [profile, navigate]);

  const addReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderText || !newReminderDate || !clinic || !profile) return;
    try {
      await addReminderMutation.mutateAsync({
        clinicId: clinic.id,
        userId: profile.id,
        description: newReminderText,
        dueDate: newReminderDate,
      });
      setNewReminderText('');
      setNewReminderDate('');
    } catch {
      showToast('Não foi possível salvar o lembrete.', 'error');
    }
  };

  const toggleReminder = (id: string, currentStatus: boolean) => {
    toggleReminderMutation.mutate({ id, isCompleted: currentStatus });
  };

  const confirmDelete = (id: string) => {
    removeReminderMutation.mutate(id, {
      onSuccess: () => setDeletingId(null),
      onError: () => showToast('Não foi possível excluir o lembrete.', 'error'),
    });
  };

  const displayStats = [
    { name: 'Pacientes Ativos', value: (stats?.patientsCount ?? 0).toString(), icon: Users, change: 'Total', gradient: 'from-blue-600 to-indigo-600' },
    { name: 'Consultas no Mês', value: (stats?.appointmentsInMonth ?? 0).toString(), icon: CalendarCheck, change: 'Neste mês', gradient: 'from-emerald-600 to-teal-600' },
    { name: 'Planos Alimentares', value: (stats?.mealPlansInMonth ?? 0).toString(), icon: Utensils, change: 'Neste mês', gradient: 'from-amber-500 to-orange-500' },
    { name: 'Horas Atendidas', value: `${stats?.attendedHours ?? 0}h`, icon: Clock, change: 'Neste mês', gradient: 'from-violet-600 to-purple-600' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Visão Geral */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 shrink-0">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            Visão Geral
          </h1>
          <p className="text-sm font-normal text-slate-500 mt-1">
            Acompanhe os resultados da sua clínica no período selecionado.
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-white px-5 py-2.5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:border-slate-300">
          <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors">
            <ChevronLeft className="w-5.5 h-5.5" />
          </button>
          <span className="min-w-[150px] text-center text-base font-medium text-slate-900 capitalize tracking-wide">
            {formattedMonthName}
          </span>
          <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors">
            <ChevronRight className="w-5.5 h-5.5" />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {displayStats.map((stat) => (
          <div key={stat.name} className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${stat.gradient} p-6.5 shadow-md hover:shadow-xl transition-all hover:translate-y-[-2px] duration-300 border border-white/10`}>
            <dt>
              <div className="absolute rounded-2xl bg-white/15 backdrop-blur-md p-3.5 border border-white/10">
                <stat.icon className="h-6.5 w-6.5 text-white" aria-hidden="true" />
              </div>
              <p className="ml-18 truncate text-xs font-medium uppercase tracking-wider text-white/80">{stat.name}</p>
            </dt>
            <dd className="ml-18 flex items-baseline pb-1 mt-1 sm:pb-2">
              <p className="text-2xl text-white font-medium tracking-tight">
                {stat.value}
              </p>
              <p
                className="ml-2.5 flex items-baseline text-xs font-medium px-2 py-0.5 rounded-full text-white bg-white/15 backdrop-blur-md border border-white/10"
              >
                {stat.change}
              </p>
            </dd>
          </div>
        ))}
      </div>

      {/* Upcoming & Reminders Split Section */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Upcoming appointments card */}
        <div className="bg-white rounded-3xl p-6.5 shadow-sm border border-slate-200 flex flex-col max-h-[480px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 shrink-0">
            <h2 className="text-lg font-semibold text-slate-900">Próximos Agendamentos</h2>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-2xl shrink-0">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Status:</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-650">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                Confirmado
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-650">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                Pendente
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-650">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                Cancelado
              </span>
            </div>
          </div>
          
          {upcomingAppointments.length === 0 ? (
            <div className="text-slate-400 flex flex-col items-center justify-center flex-1 py-14 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/10 min-h-[220px]">
              <CalendarCheck className="w-10 h-10 text-slate-300 stroke-[1.4] mb-2.5" />
              <p className="text-lg font-medium text-slate-900">Nenhum agendamento previsto</p>
              <p className="text-sm font-normal text-slate-500 mt-1">Acesse a Agenda para marcar novas consultas.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1.5 space-y-3.5 custom-scrollbar scrollbar-thin">
              {upcomingAppointments.map((apt) => {
                const dateObj = new Date(apt.date_time);
                const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const formattedDate = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const profName = pickOne(apt.profiles)?.full_name?.split(' ')[0] || 'Nutri';
                const patientName = pickOne(apt.patients)?.name || 'Paciente';
                const serviceName = pickOne(apt.services)?.name || 'Serviço';
                
                return (
                  <div key={apt.id} className="flex items-center justify-between p-4 bg-slate-50/30 hover:bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md group min-w-0">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-1.5 h-12 rounded-full shrink-0 ${
                        apt.status === 'confirmado' ? 'bg-emerald-500' :
                        apt.status === 'pendente' ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`} />
                      
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-900 tracking-wide truncate">
                          {patientName}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="inline-flex items-center text-xs font-medium text-emerald-600 bg-emerald-50/50 px-2.5 py-0.5 rounded-lg border border-emerald-150 truncate max-w-[170px]">
                            {serviceName}
                          </span>
                          
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-650 bg-indigo-50/50 px-2.5 py-0.5 rounded-lg border border-indigo-100 truncate max-w-[170px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                            Dr(a). {profName}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                          <Clock className="w-4 h-4" />
                        </span>
                        <div>
                          <span className="text-base font-medium text-slate-900 flex items-center justify-end gap-1">
                            {formattedTime}
                          </span>
                          <span className="text-xs font-normal text-slate-500 mt-0.5 block">
                            {formattedDate}
                          </span>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!apt.public_token) {
                            showToast('Link indisponível. Recarregue a página.', 'error');
                            return;
                          }
                          const link = `${window.location.origin}/confirmar/${apt.public_token}`;
                          navigator.clipboard.writeText(link);
                          showToast('Link de confirmação copiado! Envie ao paciente via WhatsApp.', 'success');
                        }}
                        className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 rounded-xl transition-all cursor-pointer border border-indigo-100/80 shrink-0 shadow-sm"
                        title="Copiar link de confirmação para WhatsApp"
                      >
                        <Copy className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reminders Card */}
        <div className="bg-white rounded-3xl p-6.5 shadow-sm border border-slate-200 flex flex-col max-h-[480px]">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-slate-900">Lembretes</h2>
            {isPastMonth() ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                <Lock className="w-3.5 h-3.5" />
                Modo Histórico
              </span>
            ) : isReadOnly ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-rose-600 bg-rose-50/50 px-2.5 py-1 rounded-lg border border-rose-100/30">
                <Lock className="w-3.5 h-3.5" />
                Somente Leitura
              </span>
            ) : null}
          </div>
          
          {!isPastMonth() && !isReadOnly && (
            <form onSubmit={addReminder} className="flex gap-2.5 mb-5 shrink-0">
              <input 
                type="text" 
                placeholder="O que você precisa lembrar?" 
                value={newReminderText}
                onChange={e => setNewReminderText(e.target.value)}
                className="flex-1 rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm font-normal px-4 py-2.5 border"
                required
              />
              <input 
                type="date" 
                value={newReminderDate}
                onChange={e => setNewReminderDate(e.target.value)}
                className="w-40 rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm font-normal px-4 py-2.5 border"
                required
              />
              <button type="submit" className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 flex-shrink-0 transition-colors shadow-sm cursor-pointer">
                <Plus className="w-5.5 h-5.5" />
              </button>
            </form>
          )}

          <div className="flex-1 overflow-y-auto pr-1.5 space-y-3 custom-scrollbar scrollbar-thin">
            {reminders.length === 0 ? (
              <div className="text-slate-500 flex items-center justify-center h-28 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/10 text-sm font-normal">
                Nenhum lembrete para este mês.
              </div>
            ) : (
              reminders.map(reminder => (
                <div key={reminder.id} className={`flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 ${reminder.is_completed ? 'bg-slate-50 border-slate-150' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'}`}>
                  <button 
                    onClick={() => (!isPastMonth() && !isReadOnly) && toggleReminder(reminder.id, reminder.is_completed)} 
                    className={`mt-0.5 shrink-0 transition-transform hover:scale-105 active:scale-95 ${(isPastMonth() || isReadOnly) ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                    disabled={isPastMonth() || isReadOnly}
                  >
                    {reminder.is_completed ? (
                      <CheckCircle className="w-5.5 h-5.5 text-emerald-600" />
                    ) : (
                      <Circle className="w-5.5 h-5.5 text-indigo-500 hover:text-indigo-700 transition-colors" />
                    )}
                  </button>
                  <div className={`flex-1 min-w-0 ${reminder.is_completed ? 'opacity-50 line-through' : ''}`}>
                    <p className="text-base font-medium text-slate-900 leading-snug truncate">{reminder.description}</p>
                    <p className="text-sm font-normal text-slate-500 mt-1">
                      Para: {new Date(reminder.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      {reminder.profiles?.full_name && ` • Por: ${reminder.profiles.full_name}`}
                    </p>
                  </div>
                  {!isPastMonth() && !isReadOnly && (
                    <div className="shrink-0 flex items-center">
                      {deletingId === reminder.id ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => confirmDelete(reminder.id)} className="text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50/50 hover:bg-rose-100/50 px-2.5 py-1.5 rounded-lg transition-all border border-rose-100 cursor-pointer">
                            Confirmar
                          </button>
                          <button onClick={() => setDeletingId(null)} className="text-xs font-medium text-slate-650 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeletingId(reminder.id)} className="text-indigo-650 hover:text-red-500 p-1.5 rounded-lg bg-indigo-50/50 hover:bg-red-50 transition-colors cursor-pointer border border-indigo-100/50 hover:border-red-100 shadow-sm">
                           <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
