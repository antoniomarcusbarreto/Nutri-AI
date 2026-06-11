import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  Lock, 
  Check, 
  Trash2, 
  User, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Sparkles, 
  Info,
  ChevronRight as ChevronRightIcon,
  Copy
} from 'lucide-react';
import { 
  format, 
  isSameDay, 
  isToday, 
  isSameMonth, 
  addMonths, 
  subMonths, 
  addWeeks, 
  subWeeks, 
  addDays, 
  subDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getDaysInMonth, getDaysInWeek } from '../utils/calendar';

export const Agenda: React.FC = () => {
  const { clinic, isReadOnly, profile } = useAuth();
  
  // Date and Calendar states
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  
  // Filters & Data states
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('all');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [newAppointmentData, setNewAppointmentData] = useState({
    patient_id: '',
    service_id: '',
    nutritionist_id: '',
    date: '',
    time: '09:00',
    status: 'pendente'
  });
  
  // Details Modal state
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toast & inline errors state
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'error') => {
    setToast({ text, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load clinic dropdowns (Patients, Services, Professionals)
  const loadDropdownData = async () => {
    if (!clinic?.id) return;
    
    try {
      // 1. Fetch patients
      const { data: patientsData } = await supabase
        .from('patients')
        .select('id, name, email, phone')
        .eq('clinic_id', clinic.id)
        .order('name');
      if (patientsData) setPatients(patientsData);

      // 2. Fetch services
      const { data: servicesData } = await supabase
        .from('services')
        .select('id, name, duration_minutes, price')
        .eq('clinic_id', clinic.id)
        .order('name');
      if (servicesData) setServices(servicesData);

      // 3. Fetch professionals safely via clinic_members & profiles
      const { data: members, error: membersError } = await supabase
        .from('clinic_members')
        .select('user_id, role')
        .eq('clinic_id', clinic.id);
        
      if (!membersError && members) {
        const userIds = members.map(m => m.user_id).filter(Boolean);
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, is_active')
            .in('id', userIds);
            
          if (profiles) {
            const mappedProfessionals = profiles.map(p => {
              const member = members.find(m => m.user_id === p.id);
              return {
                ...p,
                role: member?.role || 'nutritionist'
              };
            }).filter(p => p.is_active !== false);
            setProfessionals(mappedProfessionals);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados do formulário:', err);
    }
  };

  // Load appointments
  const fetchAppointments = async () => {
    if (!clinic?.id) return;
    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          date_time,
          status,
          clinic_id,
          patient_id,
          nutritionist_id,
          service_id,
          patients ( id, name, email, phone ),
          services ( id, name, duration_minutes, price ),
          consultations ( id, anamnese_notes )
        `)
        .eq('clinic_id', clinic.id)
        .order('date_time', { ascending: true });
        
      if (!error && data) {
        setAppointments(data);
      } else if (error) {
        console.error('Erro ao carregar consultas:', error);
      }
    } catch (err) {
      console.error('Erro na requisição de consultas:', err);
    } finally {
      setLoading(false);
    }
  };

  const isAttention = (apt: any) => {
    if (!apt) return false;
    if (apt.status === 'cancelado' || apt.status === 'concluido') return false;
    
    const isPast = new Date(apt.date_time) < new Date();
    if (!isPast) return false;
    
    const hasNotes = apt.consultations && 
                     apt.consultations.length > 0 && 
                     apt.consultations[0].anamnese_notes && 
                     apt.consultations[0].anamnese_notes.trim() !== '';
                     
    return !hasNotes;
  };

  useEffect(() => {
    if (clinic?.id) {
      fetchAppointments();
      loadDropdownData();
    }
  }, [clinic?.id]);

  // Calendar dates generation
  const calendarDays = useMemo(() => {
    if (viewMode === 'month') {
      return getDaysInMonth(selectedDate);
    } else if (viewMode === 'week') {
      return getDaysInWeek(selectedDate);
    }
    return [selectedDate];
  }, [selectedDate, viewMode]);

  // Filter appointments by professional & selected scope
  const filteredAppointments = useMemo(() => {
    return appointments.filter(apt => {
      if (selectedProfessionalId !== 'all' && apt.nutritionist_id !== selectedProfessionalId) {
        return false;
      }
      return true;
    });
  }, [appointments, selectedProfessionalId]);

  // Get appointments for a specific day
  const getAppointmentsForDay = (date: Date) => {
    return filteredAppointments.filter(apt => isSameDay(new Date(apt.date_time), date));
  };

  // Format date helper for localized headers
  const getHeaderTitle = () => {
    if (viewMode === 'month') {
      const title = format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR });
      return title.charAt(0).toUpperCase() + title.slice(1);
    } else if (viewMode === 'week') {
      const start = calendarDays[0];
      const end = calendarDays[6];
      if (start && end) {
        if (start.getMonth() === end.getMonth()) {
          return `${format(start, 'dd')} - ${format(end, 'dd')} de ${format(start, 'MMMM, yyyy', { locale: ptBR })}`;
        }
        return `${format(start, "dd 'de' MMMM", { locale: ptBR })} - ${format(end, "dd 'de' MMMM, yyyy", { locale: ptBR })}`;
      }
    }
    return format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  };

  // Navigation handlers
  const handlePrevious = () => {
    if (viewMode === 'month') {
      setSelectedDate(prev => subMonths(prev, 1));
    } else if (viewMode === 'week') {
      setSelectedDate(prev => subWeeks(prev, 1));
    } else {
      setSelectedDate(prev => subDays(prev, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setSelectedDate(prev => addMonths(prev, 1));
    } else if (viewMode === 'week') {
      setSelectedDate(prev => addWeeks(prev, 1));
    } else {
      setSelectedDate(prev => addDays(prev, 1));
    }
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  // Actions
  const handleDayClick = (date: Date) => {
    if (isReadOnly) return;
    
    // Check for past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    if (targetDate < today) {
      showToast('Não é permitido agendar consultas em datas retroativas.', 'error');
      return;
    }
    
    // Format local date for input
    const formattedDate = format(date, 'yyyy-MM-dd');
    
    // Set default nutritionist
    let defaultNutri = '';
    if (selectedProfessionalId !== 'all') {
      defaultNutri = selectedProfessionalId;
    } else if (profile?.id && professionals.some(p => p.id === profile.id)) {
      defaultNutri = profile.id;
    } else if (professionals.length > 0) {
      defaultNutri = professionals[0].id;
    }

    setFormError(null);
    setNewAppointmentData({
      patient_id: '',
      service_id: services[0]?.id || '',
      nutritionist_id: defaultNutri,
      date: formattedDate,
      time: '09:00',
      status: 'pendente'
    });
    setPatientSearch('');
    setIsNewModalOpen(true);
  };

  const handleAppointmentClick = (apt: any, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering day cell click
    setSelectedAppointment(apt);
  };

  // Create Appointment
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !clinic?.id) return;
    
    setFormError(null);
    const { patient_id, service_id, nutritionist_id, date, time, status } = newAppointmentData;
    if (!patient_id || !service_id || !nutritionist_id || !date || !time) {
      setFormError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const combinedDateTime = new Date(`${date}T${time}:00`);
    if (combinedDateTime < new Date()) {
      setFormError('Não é possível criar agendamentos em data e hora retroativas.');
      return;
    }

    setSaving(true);
    try {
      const combinedDateTime = new Date(`${date}T${time}:00`);
      
      const { error } = await supabase
        .from('appointments')
        .insert([{
          clinic_id: clinic.id,
          patient_id,
          service_id,
          nutritionist_id,
          date_time: combinedDateTime.toISOString(),
          status
        }]);

      if (error) throw error;
      
      setIsNewModalOpen(false);
      fetchAppointments(); // Refresh grid
      showToast('Consulta agendada com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao agendar consulta:', err);
      setFormError('Ocorreu um erro ao criar a consulta no banco de dados.');
    } finally {
      setSaving(false);
    }
  };

  // Update Status
  const handleUpdateStatus = async (newStatus: 'confirmado' | 'pendente' | 'cancelado') => {
    if (isReadOnly || !selectedAppointment) return;
    
    if (selectedAppointment.status === 'confirmado' || selectedAppointment.status === 'cancelado') {
      showToast('Consultas confirmadas ou canceladas não podem ter seu status alterado.', 'error');
      return;
    }
    
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', selectedAppointment.id);

      if (error) throw error;
      
      // Update local state
      setAppointments(prev => prev.map(a => a.id === selectedAppointment.id ? { ...a, status: newStatus } : a));
      setSelectedAppointment((prev: any) => prev ? { ...prev, status: newStatus } : null);
      showToast('Status da consulta atualizado com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao atualizar status da consulta:', err);
      showToast('Falha ao atualizar o status no servidor.', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Delete Appointment
  const handleDeleteAppointment = async () => {
    if (isReadOnly || !selectedAppointment) return;
    
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', selectedAppointment.id);

      if (error) throw error;
      
      // Update states
      setAppointments(prev => prev.filter(a => a.id !== selectedAppointment.id));
      setSelectedAppointment(null);
      setDeletingId(null);
      showToast('Consulta excluída com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao excluir consulta:', err);
      showToast('Falha ao excluir a consulta no servidor.', 'error');
    }
  };

  const filteredPatientsForSelect = useMemo(() => {
    return patients.filter(p => 
      p.name.toLowerCase().includes(patientSearch.toLowerCase())
    );
  }, [patients, patientSearch]);

  const selectedDayAppointments = useMemo(() => {
    return getAppointmentsForDay(selectedDate);
  }, [filteredAppointments, selectedDate]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col font-sans">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Agenda de Consultas
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1">
            <p className="text-sm text-slate-500">Gerencie a escala da clínica, profissionais, serviços e agendamento dos pacientes.</p>
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl shrink-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status:</span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Confirmado
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Pendente
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Cancelado
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-605">
                <span className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-400/50 animate-pulse" />
                Atenção
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Professional Selector Dropdown */}
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm min-w-[220px]">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedProfessionalId}
              onChange={e => setSelectedProfessionalId(e.target.value)}
              className="text-sm font-semibold text-slate-700 bg-transparent border-0 focus:outline-none w-full cursor-pointer"
            >
              <option value="all">Todos os Nutricionistas</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>

          <button 
            disabled={isReadOnly}
            onClick={() => handleDayClick(new Date())}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:shadow transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReadOnly ? <Lock className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* CALENDAR BODY */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 flex flex-col flex-1 overflow-hidden">
        
        {/* Navigation & Controls bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-200/80 px-6 py-4 bg-slate-50/50 gap-4 shrink-0">
          
          {/* Left: View Mode Toggle */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            {(['month', 'week', 'day'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === mode 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {mode === 'month' ? 'Mês' : mode === 'week' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>

          {/* Center: Navigation */}
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight text-center min-w-[200px]">
              {getHeaderTitle()}
            </h2>
            <div className="flex items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <button 
                className="p-2 text-slate-400 hover:text-slate-600 border-r border-slate-100 hover:bg-slate-50 rounded-l-xl transition-colors"
                onClick={handlePrevious}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button 
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors" 
                onClick={handleToday}
              >
                Hoje
              </button>
              <button 
                className="p-2 text-slate-400 hover:text-slate-600 border-l border-slate-100 hover:bg-slate-50 rounded-r-xl transition-colors"
                onClick={handleNext}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Right: Selected Scope */}
          <div className="hidden sm:flex items-center gap-2 bg-primary-50/60 px-3 py-1.5 rounded-lg border border-primary-100/50">
            <CalendarIcon className="h-4 w-4 text-primary-600" />
            <span className="text-xs font-bold text-primary-700">{format(selectedDate, "dd/MM/yyyy")}</span>
          </div>
        </div>

        {/* View Layout Renderer */}
        <div className="flex-1 flex flex-col overflow-y-auto min-h-0 bg-slate-50/30">
          
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent mb-3" />
              <p className="text-sm font-medium">Carregando consultas e agenda...</p>
            </div>
          ) : (
            <>
              {/* MONTH VIEW */}
              {viewMode === 'month' && (
                <div className="flex-1 flex flex-col min-w-[700px]">
                  {/* Days of Week Header */}
                  <div className="grid grid-cols-7 border-b border-slate-200 text-center bg-white shrink-0">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                      <div key={day} className="py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {day}
                      </div>
                    ))}
                  </div>
                  
                  {/* Days Grid */}
                  <div className="grid grid-cols-7 gap-px bg-slate-200/70 flex-1">
                    {calendarDays.map((day, idx) => {
                      const dayAppointments = getAppointmentsForDay(day);
                      const isCurrentMonth = isSameMonth(day, selectedDate);
                      const isTodayDay = isToday(day);
                      const isSelected = isSameDay(day, selectedDate);

                      return (
                        <div 
                          key={idx} 
                          onClick={() => {
                            setSelectedDate(day);
                            handleDayClick(day);
                          }}
                          className={`bg-white min-h-[110px] p-2.5 flex flex-col justify-between group hover:bg-slate-50/80 transition-all duration-200 relative cursor-pointer ${
                            !isCurrentMonth ? 'opacity-40 bg-slate-50/40 text-slate-300' : 'text-slate-700'
                          } ${isSelected ? 'ring-2 ring-primary-500 ring-inset z-10' : ''}`}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`text-xs font-bold h-7.5 w-7.5 flex items-center justify-center rounded-full transition-transform group-hover:scale-105 ${
                              isTodayDay ? 'bg-primary-600 text-white shadow-sm font-extrabold' : ''
                            }`}>
                              {format(day, 'd')}
                            </span>
                            {dayAppointments.length > 0 && (
                              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {dayAppointments.length} c.
                              </span>
                            )}
                          </div>
                          
                          {/* Inner appointments */}
                          <div className="mt-2 space-y-1 overflow-y-auto flex-1 max-h-[72px] custom-scrollbar scrollbar-none pr-1">
                            {dayAppointments.slice(0, 3).map(apt => {
                              const prof = professionals.find(p => p.id === apt.nutritionist_id);
                              const initials = prof
                                ? prof.full_name.split(' ').filter(Boolean).map((n: any) => n[0]).join('').slice(0, 2).toUpperCase()
                                : '';
                              const attention = isAttention(apt);
                              return (
                                <div 
                                  key={apt.id}
                                  onClick={(e) => handleAppointmentClick(apt, e)}
                                  title={attention 
                                    ? `Atenção: Consulta pendente de prontuário com ${prof?.full_name || 'Nutricionista'}` 
                                    : `Consulta com ${prof?.full_name || 'Nutricionista'}`}
                                  className={`text-[10px] px-2 py-0.5 rounded-md border flex items-center justify-between gap-1 transition-all hover:translate-x-0.5 shadow-sm min-w-0 ${
                                    attention ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold ring-1 ring-amber-500/25' :
                                    apt.status === 'confirmado' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 
                                    apt.status === 'pendente' ? 'bg-amber-50 border-amber-100 text-amber-800' : 
                                    'bg-rose-50 border-rose-100 text-rose-800'
                                  }`}
                                >
                                  <span className="truncate pr-0.5 flex items-center gap-0.5">
                                    {attention && <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />}
                                    <strong>{format(new Date(apt.date_time), 'HH:mm')}</strong> {apt.patients?.name || 'Paciente'}
                                  </span>
                                  {initials && (
                                    <span 
                                      className={`shrink-0 text-[8px] font-black px-1 py-px rounded-md border scale-90 ${
                                        attention ? 'bg-amber-100/50 border-amber-250/50 text-amber-900' :
                                        apt.status === 'confirmado' ? 'bg-emerald-100/50 border-emerald-200/50 text-emerald-900' : 
                                        apt.status === 'pendente' ? 'bg-amber-100/50 border-amber-200/50 text-amber-900' : 
                                        'bg-rose-100/50 border-rose-200/50 text-rose-900'
                                      }`}
                                    >
                                      {initials}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {dayAppointments.length > 3 && (
                              <div className="text-[10px] font-bold text-primary-600 pl-1">
                                + {dayAppointments.length - 3} mais
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* WEEK VIEW */}
              {viewMode === 'week' && (
                <div className="grid grid-cols-1 md:grid-cols-7 gap-4 p-5 bg-slate-50 flex-1">
                  {calendarDays.map((day, idx) => {
                    const dayAppointments = getAppointmentsForDay(day);
                    const isTodayDay = isToday(day);
                    const isSelected = isSameDay(day, selectedDate);

                    return (
                      <div 
                        key={idx}
                        className={`bg-white border rounded-2xl p-4 flex flex-col min-h-[350px] shadow-sm hover:shadow transition-all ${
                          isTodayDay ? 'ring-2 ring-primary-500 border-transparent bg-slate-50/20' : 'border-slate-200/80'
                        } ${isSelected ? 'border-primary-400 bg-slate-50/5' : ''}`}
                      >
                        <div 
                          onClick={() => {
                            setSelectedDate(day);
                            handleDayClick(day);
                          }}
                          className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between cursor-pointer group"
                        >
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {format(day, 'EEEE', { locale: ptBR }).split('-')[0]}
                            </p>
                            <p className="text-xl font-extrabold text-slate-800 mt-0.5">
                              {format(day, 'd')}
                            </p>
                          </div>
                          <button className="opacity-0 group-hover:opacity-100 p-1.5 bg-primary-50 text-primary-600 rounded-xl transition-all hover:bg-primary-100">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="flex-1 space-y-2.5 overflow-y-auto scrollbar-none pr-1">
                          {dayAppointments.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center py-12 text-slate-300">
                              <Clock className="w-6 h-6 stroke-[1.2] mb-1.5" />
                              <span className="text-[10px] font-semibold">Sem consultas</span>
                            </div>
                          ) : (
                            dayAppointments.map(apt => {
                              const prof = professionals.find(p => p.id === apt.nutritionist_id);
                              const attention = isAttention(apt);
                              return (
                                <div 
                                  key={apt.id}
                                  onClick={(e) => handleAppointmentClick(apt, e)}
                                  title={attention 
                                    ? `Atenção: Consulta pendente de prontuário com ${prof?.full_name || 'Nutricionista'}` 
                                    : `Consulta com ${prof?.full_name || 'Nutricionista'}`}
                                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all hover:translate-x-0.5 hover:shadow-sm ${
                                    attention ? 'bg-amber-50/80 border-amber-300 text-amber-950 ring-1 ring-amber-500/25' :
                                    apt.status === 'confirmado' ? 'bg-emerald-50/60 border-emerald-100 text-emerald-900' : 
                                    apt.status === 'pendente' ? 'bg-amber-50/60 border-amber-100 text-amber-900' : 
                                    'bg-rose-50/60 border-rose-100 text-rose-900'
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-bold flex items-center gap-1 text-slate-500">
                                      <Clock className="w-3.5 h-3.5" />
                                      {format(new Date(apt.date_time), 'HH:mm')}
                                    </span>
                                    {attention ? (
                                      <span className="text-[9px] font-extrabold text-amber-700 flex items-center gap-0.5 bg-amber-100/60 px-1.5 py-0.5 rounded border border-amber-250 animate-pulse">
                                        <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                                        Atenção
                                      </span>
                                    ) : (
                                      <span className={`h-1.5 w-1.5 rounded-full ${
                                        apt.status === 'confirmado' ? 'bg-emerald-500' : 
                                        apt.status === 'pendente' ? 'bg-amber-500' : 
                                        'bg-rose-500'
                                      }`} />
                                    )}
                                  </div>
                                  <p className="text-xs font-bold truncate">{apt.patients?.name || 'Paciente'}</p>
                                  <p className="text-[10px] text-slate-500 truncate mt-0.5">{apt.services?.name || 'Serviço'}</p>
                                  {prof && (
                                    <div className="mt-2 pt-1.5 border-t border-slate-100/50 flex items-center gap-1 text-[9px] font-semibold text-slate-400">
                                      <span className="truncate">Nutri: {prof.full_name.split(' ')[0]}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* DAY VIEW */}
              {viewMode === 'day' && (
                <div className="flex flex-col lg:flex-row gap-6 p-6 bg-slate-50 flex-1 overflow-y-auto">
                  {/* Left Column: Feed of appointments */}
                  <div className="flex-1 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col min-h-[400px]">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4 shrink-0">
                      <h3 className="text-lg font-extrabold text-slate-800">
                        Consultas de {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                      </h3>
                      <button 
                        disabled={isReadOnly}
                        onClick={() => handleDayClick(selectedDate)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 px-3.5 py-2 rounded-xl transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        Agendar
                      </button>
                    </div>
                    
                    <div className="space-y-4 flex-1">
                      {selectedDayAppointments.length === 0 ? (
                        <div className="text-center py-20 flex flex-col items-center justify-center">
                          <CalendarIcon className="mx-auto h-16 w-16 text-slate-300 stroke-[1.2]" />
                          <h3 className="mt-4 text-sm font-semibold text-slate-800">Nenhum agendamento</h3>
                          <p className="mt-1 text-xs text-slate-400 max-w-xs">Não existem consultas agendadas para esta data.</p>
                        </div>
                      ) : (
                        selectedDayAppointments.map(apt => {
                          const attention = isAttention(apt);
                          return (
                            <div 
                              key={apt.id}
                              onClick={(e) => handleAppointmentClick(apt, e)}
                              className={`group relative bg-white border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm hover:shadow transition-all duration-300 cursor-pointer ${
                                attention ? 'border-amber-250 bg-amber-50/30' : 'border-slate-100 hover:border-slate-200/85'
                              }`}
                            >
                              <div className={`absolute top-0 bottom-0 left-0 w-1.5 rounded-l-2xl ${
                                attention ? 'bg-amber-500 ring-2 ring-amber-400/50' :
                                apt.status === 'confirmado' ? 'bg-emerald-500' : 
                                apt.status === 'pendente' ? 'bg-amber-500' : 
                                'bg-rose-500'
                              }`} />
                              
                              <div className="flex flex-col items-center justify-center sm:w-24 shrink-0 sm:border-r border-slate-100 pr-4 pl-2">
                                <span className="text-2xl font-black text-slate-800">
                                  {format(new Date(apt.date_time), 'HH:mm')}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-400 mt-1 flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  {apt.services?.duration_minutes || 60} min
                                </span>
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-base font-extrabold text-slate-800 truncate">
                                    {apt.patients?.name || 'Paciente'}
                                  </h4>
                                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                    apt.status === 'confirmado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
                                    apt.status === 'pendente' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 
                                    'bg-rose-50 text-rose-700 border border-rose-100'
                                  }`}>
                                    {apt.status === 'confirmado' ? 'Confirmado' : apt.status === 'pendente' ? 'Pendente' : 'Cancelado'}
                                  </span>
                                  {attention && (
                                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-300 shadow-sm animate-pulse">
                                      <AlertCircle className="w-3 h-3 text-amber-600" />
                                      Sem Anotações
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-slate-500 mt-1">
                                  {apt.services?.name || 'Serviço'}
                                </p>
                                
                                {/* Show professional details */}
                                {professionals.find(p => p.id === apt.nutritionist_id) && (
                                  <p className="text-xs font-medium text-slate-400 mt-2.5 flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded w-fit">
                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                    Nutricionista: {professionals.find(p => p.id === apt.nutritionist_id)?.full_name}
                                  </p>
                                )}
                              </div>
                              
                              <div className="flex items-center justify-end shrink-0 sm:pl-4">
                                <span className="text-xs font-bold text-slate-400 group-hover:text-primary-600 transition-colors">
                                  Gerenciar
                                </span>
                                <ChevronRightIcon className="w-4 h-4 text-slate-400 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-all ml-1" />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                  
                  {/* Right Column: Day analytics/summary */}
                  <div className="w-full lg:w-80 space-y-6 shrink-0">
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
                      <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-500" />
                        Resumo de Atendimentos
                      </h3>
                      <div className="grid grid-cols-2 gap-3.5">
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
                          <p className="text-xs font-semibold text-slate-400">Total Geral</p>
                          <p className="text-2xl font-black text-slate-800 mt-1">{selectedDayAppointments.length}</p>
                        </div>
                        <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-2xl p-3.5">
                          <p className="text-xs font-semibold text-emerald-600">Confirmados</p>
                          <p className="text-2xl font-black text-emerald-850 mt-1">
                            {selectedDayAppointments.filter(a => a.status === 'confirmado').length}
                          </p>
                        </div>
                        <div className="bg-amber-50/50 border border-amber-100/50 rounded-2xl p-3.5">
                          <p className="text-xs font-semibold text-amber-600">Pendentes</p>
                          <p className="text-2xl font-black text-amber-850 mt-1">
                            {selectedDayAppointments.filter(a => a.status === 'pendente').length}
                          </p>
                        </div>
                        <div className="bg-rose-50/50 border border-rose-100/50 rounded-2xl p-3.5">
                          <p className="text-xs font-semibold text-rose-600">Cancelados</p>
                          <p className="text-2xl font-black text-rose-850 mt-1">
                            {selectedDayAppointments.filter(a => a.status === 'cancelado').length}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-primary-600 to-indigo-700 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
                      <div className="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 opacity-10">
                        <CalendarIcon className="w-48 h-48" />
                      </div>
                      <h3 className="text-base font-bold mb-2 flex items-center gap-1.5">
                        <Info className="w-4.5 h-4.5" /> Dica do Dia
                      </h3>
                      <p className="text-xs text-white/80 leading-relaxed font-medium">
                        Consultas confirmadas aumentam a fidelização do paciente. Tente manter o status de todos os agendamentos atualizados no sistema.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* MODAL 1: NEW APPOINTMENT */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-primary-600" />
                Agendar Nova Consulta
              </h3>
              <button 
                onClick={() => setIsNewModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200/80 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateAppointment} className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {formError && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-start gap-2.5 text-rose-800 text-xs font-bold animate-in fade-in duration-200 shrink-0">
                  <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}
              
              {/* Patient intelligent selector */}
              <div className="space-y-1">
                <label className="text-slate-700 font-semibold text-sm mb-1 block">Paciente</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="🔎 Filtrar paciente por nome..."
                    value={patientSearch}
                    onChange={e => setPatientSearch(e.target.value)}
                    className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white text-slate-700 shadow-sm"
                  />
                  {patientSearch && (
                    <button 
                      type="button" 
                      onClick={() => setPatientSearch('')}
                      className="text-xs font-bold text-slate-400 hover:text-slate-600 px-2 border rounded-xl hover:bg-slate-50 cursor-pointer"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <select
                  value={newAppointmentData.patient_id}
                  onChange={e => setNewAppointmentData(prev => ({ ...prev, patient_id: e.target.value }))}
                  required
                  className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white text-slate-700 shadow-sm"
                >
                  <option value="">-- Selecione o Paciente --</option>
                  {filteredPatientsForSelect.map(p => (
                    <option key={p.id} value={p.id}>{p.name} {p.email ? `(${p.email})` : ''}</option>
                  ))}
                </select>
                {filteredPatientsForSelect.length === 0 && (
                  <p className="text-xs text-rose-500 font-bold mt-1">Nenhum paciente encontrado com essa busca.</p>
                )}
              </div>

              {/* Service Select */}
              <div className="space-y-1">
                <label className="text-slate-700 font-semibold text-sm mb-1 block">Serviço / Procedimento</label>
                <select
                  value={newAppointmentData.service_id}
                  onChange={e => setNewAppointmentData(prev => ({ ...prev, service_id: e.target.value }))}
                  required
                  className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white text-slate-700 shadow-sm"
                >
                  <option value="">-- Selecione o Serviço --</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes} min) • R$ {s.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nutritionist Select */}
              <div className="space-y-1">
                <label className="text-slate-700 font-semibold text-sm mb-1 block">Nutricionista Responsável</label>
                <select
                  value={newAppointmentData.nutritionist_id}
                  onChange={e => setNewAppointmentData(prev => ({ ...prev, nutritionist_id: e.target.value }))}
                  required
                  className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white text-slate-700 shadow-sm"
                >
                  <option value="">-- Selecione o Profissional --</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </div>

              {/* Date & Time Selectors */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-700 font-semibold text-sm mb-1 block">Data</label>
                  <input
                    type="date"
                    value={newAppointmentData.date}
                    onChange={e => setNewAppointmentData(prev => ({ ...prev, date: e.target.value }))}
                    required
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white text-slate-700 shadow-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-700 font-semibold text-sm mb-1 block">Hora</label>
                  <input
                    type="time"
                    value={newAppointmentData.time}
                    onChange={e => setNewAppointmentData(prev => ({ ...prev, time: e.target.value }))}
                    required
                    className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white text-slate-700 shadow-sm"
                  />
                </div>
              </div>

              {/* Status Select */}
              <div className="space-y-1">
                <label className="text-slate-700 font-semibold text-sm mb-1 block">Status Inicial</label>
                <div className="flex gap-4 mt-1.5">
                  {(['pendente', 'confirmado'] as const).map(s => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="new-appointment-status"
                        value={s}
                        checked={newAppointmentData.status === s}
                        onChange={() => setNewAppointmentData(prev => ({ ...prev, status: s }))}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-slate-300"
                      />
                      <span className={`text-xs font-bold capitalize ${
                        s === 'confirmado' ? 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100' : 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100'
                      }`}>
                        {s}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="rounded-xl font-bold py-2.5 px-5 text-sm transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl font-bold py-2.5 px-5 text-sm transition-all text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Agendando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4.5 h-4.5" />
                      Agendar Consulta
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: APPOINTMENT DETAILS & EDITING */}
      {selectedAppointment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Info className="w-5 h-5 text-indigo-500" />
                Detalhes da Consulta
              </h3>
              <button 
                onClick={() => {
                  setSelectedAppointment(null);
                  setDeletingId(null);
                }}
                className="p-1 rounded-lg hover:bg-slate-200/80 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content body */}
            <div className="p-6 space-y-6">
              
              {isAttention(selectedAppointment) && (
                <div className="bg-amber-50 border border-amber-250 rounded-2xl p-4 flex gap-3 animate-in fade-in duration-300">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-extrabold text-amber-900">Atenção: Consulta pendente de prontuário</p>
                    <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                      Esta consulta ocorreu no passado mas está sem nenhuma anotação registrada. Acesse a tela de <strong>Consultas</strong> para realizar o atendimento e preencher o prontuário do paciente.
                    </p>
                  </div>
                </div>
              )}

              {/* Main summary card */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex gap-3.5 relative">
                <div className={`absolute top-0 bottom-0 left-0 w-1.5 rounded-l-2xl ${
                  selectedAppointment.status === 'confirmado' ? 'bg-emerald-500' : 
                  selectedAppointment.status === 'pendente' ? 'bg-amber-500' : 
                  'bg-rose-500'
                }`} />
                
                <div className="pl-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Horário Marcado
                  </p>
                  <p className="text-2xl font-black text-slate-800 mt-1">
                    {format(new Date(selectedAppointment.date_time), 'HH:mm')}
                  </p>
                  <p className="text-xs font-semibold text-slate-500 mt-1">
                    {format(new Date(selectedAppointment.date_time), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                </div>
              </div>

              {/* Copy Link Section */}
              <div className="bg-primary-50/50 border border-primary-100/80 rounded-2xl p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-primary-800 uppercase tracking-wider">Link de Confirmação</span>
                  <span className="text-[10px] text-primary-650 font-semibold">Envie por WhatsApp</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const link = `${window.location.origin}/confirmar/${selectedAppointment.id}`;
                    navigator.clipboard.writeText(link);
                    showToast('Link de confirmação copiado com sucesso!', 'success');
                  }}
                  className="w-full bg-white hover:bg-primary-50 border border-primary-200 hover:border-primary-300 text-primary-750 font-extrabold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow active:scale-[0.99] cursor-pointer"
                >
                  <Copy className="w-4 h-4 shrink-0" />
                  Copiar Link para WhatsApp
                </button>
              </div>

              {/* Patient Info */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Paciente</h4>
                <div className="border border-slate-150 rounded-2xl p-4 space-y-2.5">
                  <div>
                    <p className="text-sm font-extrabold text-slate-800">{selectedAppointment.patients?.name || 'Paciente Excluído'}</p>
                  </div>
                  {selectedAppointment.patients?.email && (
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span className="font-bold text-slate-400 w-12 shrink-0">E-mail:</span>
                      <span className="truncate">{selectedAppointment.patients.email}</span>
                    </div>
                  )}
                  {selectedAppointment.patients?.phone && (
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span className="font-bold text-slate-400 w-12 shrink-0">Tel:</span>
                      <span>{selectedAppointment.patients.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Service & Nutri */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Serviço</h4>
                  <div className="bg-slate-50/55 p-3 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-850 truncate">{selectedAppointment.services?.name || 'Excluído'}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      R$ {selectedAppointment.services?.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Profissional</h4>
                  <div className="bg-slate-50/55 p-3 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-850 truncate">
                      {professionals.find(p => p.id === selectedAppointment.nutritionist_id)?.full_name || 'Não definido'}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Nutricionista</p>
                  </div>
                </div>
              </div>

              {/* Action: Toggle Status */}
              <div className="space-y-2 border-t border-slate-100 pt-5">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Alterar Status</h4>
                
                {(selectedAppointment.status === 'confirmado' || selectedAppointment.status === 'cancelado') ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-2.5">
                    <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                      Consultas com status <strong className="capitalize text-slate-700">{selectedAppointment.status}</strong> não podem ser alteradas, somente excluídas permanentemente.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2.5">
                    {(['pendente', 'confirmado', 'cancelado'] as const).map(status => {
                      const isActive = selectedAppointment.status === status;
                      
                      return (
                        <button
                          key={status}
                          type="button"
                          disabled={updatingStatus || isReadOnly}
                          onClick={() => handleUpdateStatus(status)}
                          className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all disabled:opacity-55 ${
                            status === 'confirmado' 
                              ? isActive 
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                                : 'bg-white hover:bg-emerald-50/50 border-slate-200 text-emerald-700 hover:border-emerald-200' 
                              : status === 'pendente'
                              ? isActive
                                ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                                : 'bg-white hover:bg-amber-50/50 border-slate-200 text-amber-700 hover:border-amber-200'
                              : isActive
                              ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                              : 'bg-white hover:bg-rose-50/50 border-slate-200 text-rose-700 hover:border-rose-200'
                          }`}
                        >
                          <span className="capitalize">{status}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Delete / Cancelation Section */}
              {!isReadOnly && (
                <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                  {deletingId === selectedAppointment.id ? (
                    <div className="w-full flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl p-3.5 animate-in fade-in duration-300">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                        <span className="text-xs font-bold text-rose-700">Confirmar exclusão?</span>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={handleDeleteAppointment}
                          className="bg-rose-600 hover:bg-rose-750 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm transition-all"
                        >
                          Sim, Excluir
                        </button>
                        <button 
                          onClick={() => setDeletingId(null)}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg transition-all"
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(selectedAppointment.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3.5 py-2.5 rounded-xl transition-all border border-transparent hover:border-rose-100 w-full justify-center"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                      Excluir Agendamento Permanentemente
                    </button>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border ${
            toast.type === 'success' 
              ? 'bg-emerald-50 border-emerald-250 text-emerald-800' 
              : 'bg-rose-50 border-rose-250 text-rose-800'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="text-sm font-bold text-slate-800">{toast.text}</span>
            <button 
              type="button"
              onClick={() => setToast(null)}
              className={`p-0.5 rounded-lg transition-colors ml-2 ${
                toast.type === 'success' ? 'hover:bg-emerald-100 text-emerald-500' : 'hover:bg-rose-100 text-rose-500'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
