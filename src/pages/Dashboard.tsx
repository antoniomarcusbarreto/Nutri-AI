import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, CalendarCheck, Clock, CheckCircle, Circle, Trash2, Plus, ChevronLeft, ChevronRight, Lock, Utensils, Copy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';

export const Dashboard: React.FC = () => {
  const { isReadOnly, clinic, profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    patientsCount: 0,
    appointmentsToday: 0
  });

  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [newReminderText, setNewReminderText] = useState('');
  const [newReminderDate, setNewReminderDate] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!clinic) return;

    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59, 999);

    const fetchStats = async () => {
      // Get total active patients
      const { count: pCount } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinic.id)
        .eq('status', 'ativo');

      // Get appointments for the month
      const { count: aCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinic.id)
        .gte('date_time', monthStart.toISOString())
        .lte('date_time', monthEnd.toISOString());

      setStats({
        patientsCount: pCount || 0,
        appointmentsToday: aCount || 0
      });
    };

    const fetchReminders = async () => {
      const { data } = await supabase
        .from('reminders')
        .select('*, profiles:user_id(full_name)')
        .eq('clinic_id', clinic.id)
        .gte('due_date', monthStart.toISOString())
        .lte('due_date', monthEnd.toISOString())
        .order('is_completed', { ascending: true })
        .order('due_date', { ascending: true });
      if (data) setReminders(data);
    };

    const fetchUpcomingAppointments = async () => {
      const nowStr = new Date().toISOString();
      const { data } = await supabase
        .from('appointments')
        .select(`
          id,
          clinic_id,
          patient_id,
          service_id,
          nutritionist_id,
          date_time,
          status,
          patients:patient_id(name),
          services:service_id(name),
          profiles:nutritionist_id(full_name)
        `)
        .eq('clinic_id', clinic.id)
        .gte('date_time', nowStr)
        .order('date_time', { ascending: true })
        .limit(5);

      if (data) setUpcomingAppointments(data);
    };

    fetchStats();
    fetchReminders();
    fetchUpcomingAppointments();
  }, [clinic, selectedDate]);

  const addReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderText || !newReminderDate || !clinic || !profile) return;
    
    const { data, error } = await supabase.from('reminders').insert([{
      clinic_id: clinic.id,
      user_id: profile.id,
      description: newReminderText,
      due_date: newReminderDate
    }]).select('*, profiles:user_id(full_name)').single();
    
    if (!error && data) {
      setReminders([...reminders, data].sort((a,b) => {
        if (a.is_completed === b.is_completed) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        return a.is_completed ? 1 : -1;
      }));
      setNewReminderText('');
      setNewReminderDate('');
    }
  };

  const toggleReminder = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('reminders').update({ is_completed: !currentStatus }).eq('id', id);
    if (!error) {
      setReminders(prev => prev.map(r => r.id === id ? { ...r, is_completed: !currentStatus } : r));
    }
  };

  const confirmDelete = async (id: string) => {
    const { error } = await supabase.from('reminders').delete().eq('id', id);
    if (!error) {
      setReminders(prev => prev.filter(r => r.id !== id));
      setDeletingId(null);
    }
  };
  
  const displayStats = [
    { name: 'Pacientes Ativos', value: stats.patientsCount.toString(), icon: Users, change: 'Total', changeType: 'neutral' },
    { name: 'Consultas no Mês', value: stats.appointmentsToday.toString(), icon: CalendarCheck, change: 'Neste mês', changeType: 'neutral' },
    { name: 'Refeições Registradas', value: 'Em breve', icon: Utensils, change: 'Acompanhamento', changeType: 'neutral' },
    { name: 'Horas Atendidas', value: 'Em breve', icon: Clock, change: 'Este mês', changeType: 'neutral' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Visão Geral */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Visão Geral
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Acompanhe os resultados da sua clínica no período selecionado.
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-white px-5 py-2.5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:border-slate-300">
          <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors">
            <ChevronLeft className="w-5.5 h-5.5" />
          </button>
          <span className="min-w-[150px] text-center text-base font-bold text-slate-800 capitalize tracking-wide">
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
          <div key={stat.name} className="relative overflow-hidden rounded-3xl bg-white p-6.5 shadow-sm border border-slate-200/60 hover:shadow-md transition-all hover:translate-y-[-2px] duration-300">
            <dt>
              <div className="absolute rounded-2xl bg-primary-50 p-3.5">
                <stat.icon className="h-6.5 w-6.5 text-primary-600" aria-hidden="true" />
              </div>
              <p className="ml-18 truncate text-xs font-bold uppercase tracking-wider text-slate-400">{stat.name}</p>
            </dt>
            <dd className="ml-18 flex items-baseline pb-1 mt-1 sm:pb-2">
              <p className="text-2xl font-black text-slate-900 tracking-tight">{stat.value}</p>
              <p
                className={`ml-2.5 flex items-baseline text-xs font-semibold px-2 py-0.5 rounded-full ${
                  stat.changeType === 'positive' ? 'text-green-700 bg-green-50' : stat.changeType === 'negative' ? 'text-red-700 bg-red-50' : 'text-slate-500 bg-slate-50'
                }`}
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
        <div className="bg-white rounded-3xl p-6.5 shadow-sm border border-slate-200/60 flex flex-col max-h-[480px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 shrink-0">
            <h2 className="text-lg font-black text-slate-800">Próximos Agendamentos</h2>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-2xl shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status:</span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                Confirmado
              </span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                Pendente
              </span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                Cancelado
              </span>
            </div>
          </div>
          
          {upcomingAppointments.length === 0 ? (
            <div className="text-slate-400 flex flex-col items-center justify-center flex-1 py-14 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/10 min-h-[220px]">
              <CalendarCheck className="w-10 h-10 text-slate-300 stroke-[1.4] mb-2.5" />
              <p className="text-lg font-bold text-slate-600">Nenhum agendamento previsto</p>
              <p className="text-sm font-medium text-slate-450 mt-1">Acesse a Agenda para marcar novas consultas.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1.5 space-y-3.5 custom-scrollbar scrollbar-thin">
              {upcomingAppointments.map((apt) => {
                const dateObj = new Date(apt.date_time);
                const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const formattedDate = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const profName = apt.profiles?.full_name?.split(' ')[0] || 'Nutri';
                
                return (
                  <div key={apt.id} className="flex items-center justify-between p-4 bg-slate-50/30 hover:bg-slate-50 border border-slate-200/80 hover:border-slate-300 rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md group min-w-0">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Visual status pillar/indicator */}
                      <div className={`w-1.5 h-12 rounded-full shrink-0 ${
                        apt.status === 'confirmado' ? 'bg-emerald-500' :
                        apt.status === 'pendente' ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`} />
                      
                      <div className="min-w-0">
                        <p className="text-base font-bold text-slate-800 tracking-wide truncate">
                          {apt.patients?.name || 'Paciente'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {/* Service Pill */}
                          <span className="inline-flex items-center text-xs font-semibold text-primary-850 bg-primary-50 px-2.5 py-0.5 rounded-lg border border-primary-100 truncate max-w-[170px]">
                            {apt.services?.name || 'Serviço'}
                          </span>
                          
                          {/* Nutritionist Pill */}
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-800 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100 truncate max-w-[170px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 animate-pulse" />
                            Dr(a). {profName}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <div className="text-right shrink-0">
                        <span className="text-base font-extrabold text-slate-800 flex items-center justify-end gap-1">
                          <Clock className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                          {formattedTime}
                        </span>
                        <span className="text-xs font-semibold text-slate-400 mt-1 block">
                          {formattedDate}
                        </span>
                      </div>
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const link = `${window.location.origin}/confirmar/${apt.id}`;
                          navigator.clipboard.writeText(link);
                          showToast('Link de confirmação copiado! Envie ao paciente via WhatsApp.', 'success');
                        }}
                        className="p-2 text-slate-400 hover:text-primary-655 hover:bg-primary-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-primary-100 shrink-0"
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
        <div className="bg-white rounded-3xl p-6.5 shadow-sm border border-slate-200/60 flex flex-col max-h-[480px]">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black text-slate-800">Lembretes</h2>
            {isPastMonth() ? (
              <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                <Lock className="w-3.5 h-3.5" />
                Modo Histórico
              </span>
            ) : isReadOnly ? (
              <span className="flex items-center gap-1.5 text-xs font-extrabold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg">
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
                className="flex-1 rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm font-semibold px-4 py-2.5 border"
                required
              />
              <input 
                type="date" 
                value={newReminderDate}
                onChange={e => setNewReminderDate(e.target.value)}
                className="w-40 rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm font-semibold px-4 py-2.5 border"
                required
              />
              <button type="submit" className="bg-primary-600 text-white p-2.5 rounded-xl hover:bg-primary-700 flex-shrink-0 transition-colors shadow-sm cursor-pointer">
                <Plus className="w-5.5 h-5.5" />
              </button>
            </form>
          )}

          <div className="flex-1 overflow-y-auto pr-1.5 space-y-3 custom-scrollbar scrollbar-thin">
            {reminders.length === 0 ? (
              <div className="text-slate-400 flex items-center justify-center h-28 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/10 text-sm font-medium">
                Nenhum lembrete para este mês.
              </div>
            ) : (
              reminders.map(reminder => (
                <div key={reminder.id} className={`flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 ${reminder.is_completed ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'}`}>
                  <button 
                    onClick={() => (!isPastMonth() && !isReadOnly) && toggleReminder(reminder.id, reminder.is_completed)} 
                    className={`mt-0.5 shrink-0 transition-transform hover:scale-105 active:scale-95 ${(isPastMonth() || isReadOnly) ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                    disabled={isPastMonth() || isReadOnly}
                  >
                    {reminder.is_completed ? (
                      <CheckCircle className="w-5.5 h-5.5 text-green-500" />
                    ) : (
                      <Circle className="w-5.5 h-5.5 text-slate-300 hover:text-primary-500 transition-colors" />
                    )}
                  </button>
                  <div className={`flex-1 min-w-0 ${reminder.is_completed ? 'opacity-50 line-through' : ''}`}>
                    <p className="text-base font-bold text-slate-800 leading-snug truncate">{reminder.description}</p>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                      Para: {new Date(reminder.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      {reminder.profiles?.full_name && ` • Por: ${reminder.profiles.full_name}`}
                    </p>
                  </div>
                  {!isPastMonth() && !isReadOnly && (
                    <div className="shrink-0 flex items-center">
                      {deletingId === reminder.id ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => confirmDelete(reminder.id)} className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-all border border-red-200 cursor-pointer">
                            Confirmar
                          </button>
                          <button onClick={() => setDeletingId(null)} className="text-xs font-bold text-slate-550 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeletingId(reminder.id)} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
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
