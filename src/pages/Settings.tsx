import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Palette, Check, RefreshCw, Lock, Unlock, Key, Search, UserCheck, X, Info, AlertTriangle } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

export const Settings: React.FC = () => {
  const { profile, clinic, updateTheme, remainingTrialDays, isReadOnly } = useAuth();
  const { showToast } = useToast();
  const currentMode = profile?.theme_mode || 'light';
  const currentColor = profile?.theme_color || 'white';
  
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'theme' | 'clinic' | 'team' | 'services' | 'patient_access'>('theme');
  const [services, setServices] = useState<{ id?: string, name: string; duration_minutes: number; price: number; modality: string }[]>([]);
  const [newService, setNewService] = useState({ name: '', duration_minutes: 60, price: 150, modality: 'presencial' });
  const [serviceToDeleteIndex, setServiceToDeleteIndex] = useState<number | null>(null);

  // Patient Access states
  const [patientAccessList, setPatientAccessList] = useState<any[]>([]);
  const [searchPatientAccess, setSearchPatientAccess] = useState('');
  const [loadingPatientsAccess, setLoadingPatientsAccess] = useState(false);
  const [passwordModalPatient, setPasswordModalPatient] = useState<any | null>(null);
  const [newPatientPassword, setNewPatientPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Team states
  const [teamList, setTeamList] = useState<any[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [searchTeam, setSearchTeam] = useState('');
  const [showAddEditTeamModal, setShowAddEditTeamModal] = useState(false);
  const [selectedTeamMember, setSelectedTeamMember] = useState<any | null>(null);
  const [teamFormData, setTeamFormData] = useState({
    name: '',
    email: '',
    phone: '',
    crn: '',
    role: 'nutritionist',
    password: ''
  });
  const [teamError, setTeamError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'team' && clinic?.id) {
      loadTeam();
    } else if (activeTab === 'services' && clinic?.id) {
      loadServices();
    } else if (activeTab === 'patient_access' && clinic?.id) {
      loadPatientsAccess();
    }
  }, [activeTab, clinic?.id]);

  const loadTeam = async () => {
    if (!clinic?.id) return;
    setLoadingTeam(true);
    try {
      const { data: members, error: membersError } = await supabase
        .from('clinic_members')
        .select('user_id, role')
        .eq('clinic_id', clinic.id);

      if (membersError) throw membersError;
      if (members && members.length > 0) {
        const userIds = members.map(m => m.user_id).filter(Boolean);
        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name, phone, crn, is_active, created_at')
            .in('id', userIds);

          if (profilesError) throw profilesError;
          if (profiles) {
            const merged = profiles.map(p => {
              const member = members.find(m => m.user_id === p.id);
              return {
                ...p,
                role: member?.role || 'nutritionist'
              };
            });
            setTeamList(merged);
          }
        } else {
          setTeamList([]);
        }
      } else {
        setTeamList([]);
      }
    } catch (err) {
      console.error('Erro ao carregar equipe:', err);
      showToast('Erro ao carregar lista de funcionários.', 'error');
    } finally {
      setLoadingTeam(false);
    }
  };

  const handleSaveTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic?.id) return;
    setSaving(true);
    setTeamError(null);

    const { name, email, phone, crn, role, password } = teamFormData;

    try {
      if (selectedTeamMember) {
        const { error } = await supabase.rpc('update_staff_member', {
          p_clinic_id: clinic.id,
          p_user_id: selectedTeamMember.id,
          p_name: name,
          p_phone: phone,
          p_crn: crn || null,
          p_role: role
        });

        if (error) throw error;
        showToast('Funcionário atualizado com sucesso!', 'success');
      } else {
        if (!email || !password) {
          setTeamError('E-mail e Senha são obrigatórios para cadastro.');
          setSaving(false);
          return;
        }

        const { error } = await supabase.rpc('create_staff_member', {
          p_clinic_id: clinic.id,
          p_name: name,
          p_email: email,
          p_phone: phone,
          p_crn: crn || null,
          p_role: role,
          p_password: password
        });

        if (error) throw error;
        showToast('Funcionário cadastrado com sucesso!', 'success');
      }

      setShowAddEditTeamModal(false);
      loadTeam();
    } catch (err: any) {
      console.error('Erro ao salvar funcionário:', err);
      setTeamError(err.message || 'Erro ao processar solicitação no banco.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTeamMemberStatus = async (member: any) => {
    if (!clinic?.id || !member.id) return;
    setSaving(true);
    try {
      const newActive = !member.is_active;
      const { error } = await supabase.rpc('toggle_staff_member_status', {
        p_clinic_id: clinic.id,
        p_user_id: member.id,
        p_is_active: newActive
      });

      if (error) throw error;

      showToast(newActive ? 'Acesso reativado!' : 'Acesso desativado!', 'success');
      loadTeam();
    } catch (err: any) {
      console.error('Erro ao alternar status do funcionário:', err);
      showToast(err.message || 'Erro ao alterar status de acesso.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeamMember = async (member: any) => {
    if (!clinic?.id || !member.id) return;
    if (!window.confirm(`Tem certeza que deseja remover ${member.full_name} da equipe?`)) return;

    setSaving(true);
    try {
      const { error } = await supabase.rpc('delete_staff_member', {
        p_clinic_id: clinic.id,
        p_user_id: member.id
      });

      if (error) throw error;

      showToast('Membro removido da equipe!', 'success');
      loadTeam();
    } catch (err: any) {
      console.error('Erro ao remover funcionário:', err);
      showToast(err.message || 'Erro ao remover membro da equipe.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const loadServices = async () => {
    if (!clinic?.id) return;
    const { data } = await supabase.from('services').select('*').eq('clinic_id', clinic.id);
    if (data) setServices(data);
  };

  const loadPatientsAccess = async () => {
    if (!clinic?.id) return;
    setLoadingPatientsAccess(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, email, user_id, profiles(is_active)')
        .eq('clinic_id', clinic.id)
        .not('user_id', 'is', null)
        .order('name');
        
      if (error) throw error;
      setPatientAccessList(data || []);
    } catch (err) {
      console.error('Erro ao carregar acesso dos pacientes:', err);
    } finally {
      setLoadingPatientsAccess(false);
    }
  };

  const isPatientActive = (patient: any) => {
    const profile = patient.profiles;
    if (!profile) return true;
    if (Array.isArray(profile)) {
      return profile[0]?.is_active !== false;
    }
    return profile.is_active !== false;
  };

  const handleToggleAccess = async (patient: any) => {
    if (!patient.user_id) return;
    const currentActive = isPatientActive(patient);
    const newActive = !currentActive;
    
    setSaving(true);
    try {
      const { error } = await supabase.rpc('toggle_patient_status', {
        p_patient_user_id: patient.user_id,
        p_is_active: newActive
      });
      
      if (error) throw error;
      
      // Update local state list
      setPatientAccessList(prev => prev.map(p => {
        if (p.id === patient.id) {
          const updatedProfile = Array.isArray(p.profiles) 
            ? [{ ...p.profiles[0], is_active: newActive }]
            : { ...p.profiles, is_active: newActive };
          return { ...p, profiles: updatedProfile };
        }
        return p;
      }));
      showToast(newActive ? 'Acesso do paciente liberado!' : 'Acesso do paciente bloqueado!', 'success');
    } catch (err: any) {
      console.error('Erro ao alterar status de acesso:', err);
      showToast(err.message || 'Erro ao alterar status de acesso do paciente.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalPatient?.user_id || !newPatientPassword) return;
    
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      const { error } = await supabase.rpc('change_patient_password', {
        p_patient_user_id: passwordModalPatient.user_id,
        p_new_password: newPatientPassword
      });
      
      if (error) throw error;
      
      showToast('Senha alterada com sucesso!', 'success');
      setPasswordModalPatient(null);
      setNewPatientPassword('');
    } catch (err: any) {
      console.error('Erro ao alterar senha do paciente:', err);
      setPasswordError(err.message || 'Erro ao redefinir a senha do paciente.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const addService = async () => {
    if (!newService.name || newService.price < 0 || !clinic?.id) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('services').insert([{
        clinic_id: clinic.id,
        ...newService
      }]).select().single();
      if (error) throw error;
      setServices([...services, data]);
      setNewService({ name: '', duration_minutes: 60, price: 150, modality: 'presencial' });
      showToast('Serviço adicionado com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao adicionar serviço.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeService = async (index: number) => {
    const srv = services[index];
    if (!srv.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('services').delete().eq('id', srv.id);
      if (error) throw error;
      setServices(services.filter((_, i) => i !== index));
      showToast('Serviço removido com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao remover serviço.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Helper to detect current selected profile card
  const getSelectedProfile = () => {
    if (currentMode === 'dark' || currentColor === 'dark') return 'dark';
    if (currentColor === 'blue') return 'blue';
    if (currentColor === 'teal') return 'teal';
    return 'white'; // default/claro
  };

  const selectedProfile = getSelectedProfile();

  const handleSelectTheme = async (mode: string, color: string) => {
    setSaving(true);
    try {
      await updateTheme(mode, color);
    } catch (error) {
      console.error('Erro ao atualizar tema:', error);
    } finally {
      setSaving(false);
    }
  };

  const themeOptions = [
    {
      id: 'white',
      name: 'Claro (Clássico)',
      description: 'Fundo branco limpo com detalhes cinza e verde.',
      bgColor: 'bg-white',
      textColor: 'text-slate-800',
      borderColor: 'border-slate-200',
      action: () => handleSelectTheme('light', 'white')
    },
    {
      id: 'teal',
      name: 'Verde Suave',
      description: 'Barra lateral e topo em verde escuro suave e elegante.',
      bgColor: 'bg-[#115e59]',
      textColor: 'text-white',
      borderColor: 'border-teal-700',
      action: () => handleSelectTheme('light', 'teal')
    },
    {
      id: 'blue',
      name: 'Azul Suave',
      description: 'Barra lateral e topo em azul escuro moderno e profissional.',
      bgColor: 'bg-blue-800',
      textColor: 'text-white',
      borderColor: 'border-blue-700',
      action: () => handleSelectTheme('light', 'blue')
    },
    {
      id: 'dark',
      name: 'Escuro (Dark Mode Harmony)',
      description: 'Fundo azul-escuro profundo e refinado com acentos em verde clínico.',
      bgColor: 'bg-[#0b132b]',
      textColor: 'text-white',
      borderColor: 'border-[#1c2541]',
      action: () => handleSelectTheme('dark', 'dark')
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 max-w-4xl">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Palette className="h-8 w-8 text-primary-600" />
            Configurações
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie os dados da clínica, equipe e identidade visual.</p>
        </div>
        
        {saving && (
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary-600" />
            <span>Aplicando...</span>
          </div>
        )}
      </div>

      {/* Trial Banner */}
      {!isReadOnly ? (
        <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5 flex items-start gap-4 shadow-sm transition-all hover:shadow-md">
          <Info className="h-6 w-6 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-bold text-blue-900">Período de Degustação</h3>
            <p className="mt-1.5 text-base font-medium text-blue-700 leading-relaxed">
              Você tem <strong>{remainingTrialDays} {remainingTrialDays === 1 ? 'dia restante' : 'dias restantes'}</strong> no seu período de teste grátis. Aproveite todos os recursos!
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-5 flex items-start gap-4 shadow-sm transition-all hover:shadow-md">
          <AlertTriangle className="h-6 w-6 text-red-650 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-bold text-red-950">Período de Degustação Encerrado</h3>
            <p className="mt-1.5 text-base font-medium text-red-800 leading-relaxed">
              O sistema agora encontra-se em modo <strong>somente leitura</strong>. Assine um plano para voltar a cadastrar e editar informações.
            </p>
          </div>
        </div>
      )}

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('theme')}
            className={`${activeTab === 'theme' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Tema e Visual
          </button>
          <button
            onClick={() => setActiveTab('clinic')}
            className={`${activeTab === 'clinic' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Dados da Clínica
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`${activeTab === 'team' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Equipe
          </button>
          <button
            onClick={() => setActiveTab('services')}
            className={`${activeTab === 'services' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Serviços Prestados
          </button>
          <button
            onClick={() => setActiveTab('patient_access')}
            className={`${activeTab === 'patient_access' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Acesso dos Pacientes
          </button>
        </nav>
      </div>

      {activeTab === 'theme' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Visual do Menu e Topo</h2>
            <p className="text-sm text-slate-500">
              Selecione uma opção de estilo para a barra de navegação e cabeçalho. As páginas centrais e de conteúdo continuarão limpas e claras para melhor leitura.
            </p>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {themeOptions.map((option) => {
                const isSelected = selectedProfile === option.id;
                const isDarkThemeOption = option.id === 'dark';
                return (
                  <button
                    key={option.id}
                    onClick={option.action}
                    disabled={saving}
                    className={`relative flex flex-col text-left p-5 border rounded-2xl transition-all duration-300 hover:shadow-md ${
                      isSelected 
                        ? isDarkThemeOption
                          ? 'border-primary-500 bg-[#0b132b] text-white ring-2 ring-primary-500 ring-offset-2'
                          : 'border-primary-500 bg-primary-50/50 ring-2 ring-primary-500 ring-offset-2' 
                        : isDarkThemeOption
                          ? 'border-slate-800 bg-[#0b132b] text-white hover:border-slate-700'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between w-full">
                      {/* Preview do Tema */}
                      <div className="flex gap-1.5 mb-3">
                        <div className={`w-8 h-10 rounded ${option.bgColor} border ${option.borderColor}`} />
                        <div className="w-16 h-10 rounded bg-slate-50 border border-slate-200" />
                      </div>
                      
                      {isSelected && (
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary-600 text-white">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>

                    <h3 className={`text-sm font-semibold ${
                      isDarkThemeOption 
                        ? isSelected 
                          ? 'text-white' 
                          : 'text-slate-200' 
                        : 'text-slate-900'
                    }`}>{option.name}</h3>
                    <p className={`text-xs ${
                      isDarkThemeOption 
                        ? isSelected 
                          ? 'text-slate-200 font-semibold' 
                          : 'text-slate-400' 
                        : 'text-slate-500'
                    } mt-1`}>{option.description}</p>
                  </button>
                );
              })}
            </div>
            
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 text-xs text-slate-500">
              💡 <strong>Dica:</strong> A alteração é instantânea! Ao clicar sobre qualquer perfil acima, o sistema salva automaticamente sua escolha no banco de dados e atualiza a barra lateral e o topo do painel na hora.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'clinic' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Dados da Clínica</h2>
            <p className="text-sm text-slate-500">Atualize as informações de contato e endereço do consultório.</p>
          </div>
          <div className="p-6">
            <form onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const formData = new FormData(e.currentTarget);
              const updates = Object.fromEntries(formData);
              try {
                // @ts-ignore
                const { error } = await supabase.from('clinics').update(updates).eq('id', clinic?.id);
                if (error) throw error;
                showToast('Dados salvos com sucesso!', 'success');
              } catch (err) {
                console.error(err);
                showToast('Erro ao salvar os dados da clínica.', 'error');
              } finally {
                setSaving(false);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">CEP</label>
                  {/* @ts-ignore */}
                  <input type="text" name="cep" defaultValue={clinic?.cep || ''} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal focus:outline-none" />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Endereço</label>
                  {/* @ts-ignore */}
                  <input type="text" name="address" defaultValue={clinic?.address || ''} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal focus:outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Número/Complemento</label>
                  {/* @ts-ignore */}
                  <input type="text" name="complement" defaultValue={clinic?.complement || ''} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal focus:outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Bairro</label>
                  {/* @ts-ignore */}
                  <input type="text" name="neighborhood" defaultValue={clinic?.neighborhood || ''} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal focus:outline-none" />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Cidade</label>
                  {/* @ts-ignore */}
                  <input type="text" name="city" defaultValue={clinic?.city || ''} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal focus:outline-none" />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Estado</label>
                  {/* @ts-ignore */}
                  <input type="text" name="state" defaultValue={clinic?.state || ''} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal focus:outline-none" />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Telefone da Clínica</label>
                  {/* @ts-ignore */}
                  <input type="text" name="phone" defaultValue={clinic?.phone || ''} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal focus:outline-none" />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">E-mail da Clínica</label>
                  {/* @ts-ignore */}
                  <input type="email" name="email" defaultValue={clinic?.email || ''} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal focus:outline-none" />
                </div>
                <div className="sm:col-span-6">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Horário de Funcionamento</label>
                  {/* @ts-ignore */}
                  <input type="text" name="operating_hours" defaultValue={clinic?.operating_hours || ''} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal focus:outline-none" />
                </div>
              </div>
              <div className="pt-6 flex justify-end">
                <button type="submit" disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-sm">Salvar Dados</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Equipe da Clínica</h2>
              <p className="text-sm text-slate-500">Cadastre e gerencie o acesso de nutricionistas e secretárias.</p>
            </div>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTeamMember(null);
                  setTeamFormData({
                    name: '',
                    email: '',
                    phone: '',
                    crn: '',
                    role: 'nutritionist',
                    password: ''
                  });
                  setTeamError(null);
                  setShowAddEditTeamModal(true);
                }}
                className="bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all duration-200 cursor-pointer"
              >
                Cadastrar Funcionário
              </button>
            )}
          </div>
          
          <div className="p-6 space-y-6">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar funcionário pelo nome..."
                value={searchTeam}
                onChange={e => setSearchTeam(e.target.value)}
                className="pl-10 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:text-sm transition-all"
              />
            </div>

            {loadingTeam ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
                <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
                <span className="text-sm font-medium animate-pulse">Carregando equipe...</span>
              </div>
            ) : (() => {
              const filteredList = teamList.filter(p =>
                p.full_name?.toLowerCase().includes(searchTeam.toLowerCase()) ||
                (p.role === 'nutritionist' ? 'nutricionista' : 'secretária').includes(searchTeam.toLowerCase())
              );

              if (filteredList.length === 0) {
                return (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
                    <UserCheck className="mx-auto h-12 w-12 text-slate-300" />
                    <h3 className="mt-2 text-sm font-semibold text-slate-900">Nenhum funcionário encontrado</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {searchTeam ? 'Experimente buscar por outro termo.' : 'Você não possui nenhum funcionário cadastrado.'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredList.map(member => {
                    const isSelf = member.id === profile?.id;
                    return (
                      <div
                        key={member.id}
                        className="flex flex-col justify-between p-5 border border-slate-200 rounded-2xl bg-white hover:shadow-md transition-all duration-300 gap-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700 uppercase">
                              {member.full_name?.substring(0, 2) || 'ST'}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-slate-900 truncate max-w-[180px] sm:max-w-xs">{member.full_name} {isSelf && '(Você)'}</h4>
                              <p className="text-xs text-slate-500 truncate max-w-[180px] sm:max-w-xs">{member.phone || 'Sem telefone'}</p>
                              {member.crn && (
                                <p className="text-[11px] font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded px-1.5 py-0.5 mt-1 w-fit">
                                  CRN: {member.crn}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end gap-1.5 text-right shrink-0">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                              member.role === 'owner' 
                                ? 'bg-purple-50 text-purple-700 ring-purple-600/20' 
                                : member.role === 'nutritionist'
                                ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
                                : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                            }`}>
                              {member.role === 'owner' ? 'Proprietário' : member.role === 'nutritionist' ? 'Nutricionista' : 'Secretária'}
                            </span>
                            
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              member.is_active 
                                ? 'bg-green-50 text-green-700 border border-green-250' 
                                : 'bg-slate-105 text-slate-650 border border-slate-200'
                            }`}>
                              {member.is_active ? 'Ativo' : 'Bloqueado'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                          {!isReadOnly && !isSelf && member.role !== 'owner' && (
                            <button
                              type="button"
                              onClick={() => handleToggleTeamMemberStatus(member)}
                              disabled={saving}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                                member.is_active
                                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                  : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                              }`}
                            >
                              {member.is_active ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  Desativar
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3.5 h-3.5" />
                                  Ativar
                                </>
                              )}
                            </button>
                          )}
                          
                          {!isReadOnly && member.role !== 'owner' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTeamMember(member);
                                  setTeamFormData({
                                    name: member.full_name,
                                    email: '',
                                    phone: member.phone || '',
                                    crn: member.crn || '',
                                    role: member.role,
                                    password: ''
                                  });
                                  setTeamError(null);
                                  setShowAddEditTeamModal(true);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 cursor-pointer"
                              >
                                Editar
                              </button>

                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTeamMember(member)}
                                  disabled={saving}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-red-200 bg-white text-red-650 hover:bg-red-50 hover:border-red-300 transition-all duration-200 cursor-pointer"
                                >
                                  Remover
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {activeTab === 'services' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Serviços Prestados</h2>
            <p className="text-sm text-slate-500">Cadastre os tipos de consultas e procedimentos da clínica.</p>
          </div>
          <div className="p-6 space-y-6">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Nome do Serviço</label>
                  <input type="text" placeholder="Ex: Primeira Consulta" value={newService.name} onChange={e => setNewService({...newService, name: e.target.value})} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal" />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Duração (min)</label>
                  <input type="number" value={newService.duration_minutes} onChange={e => setNewService({...newService, duration_minutes: parseInt(e.target.value) || 0})} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal" />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Preço (R$)</label>
                  <input type="number" value={newService.price} onChange={e => setNewService({...newService, price: parseFloat(e.target.value) || 0})} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-base font-bold text-slate-700 mb-1.5">Modalidade</label>
                  <select value={newService.modality} onChange={e => setNewService({...newService, modality: e.target.value})} className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 text-base px-4 py-3 border bg-white font-normal">
                    <option value="presencial">Presencial</option>
                    <option value="online">Online</option>
                    <option value="hibrido">Híbrido</option>
                  </select>
                </div>
                <div className="sm:col-span-2 flex items-end">
                  <button type="button" onClick={addService} disabled={saving} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 px-6 rounded-xl text-base font-bold transition-all shadow-sm">
                    Adicionar Serviço
                  </button>
                </div>
              </div>
            </div>

            {services.length > 0 ? (
              <ul className="divide-y divide-slate-200">
                {services.map((srv, idx) => (
                  <li key={srv.id || idx} className="py-4 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{srv.name}</p>
                      <p className="text-xs text-slate-500">{srv.duration_minutes} min • R$ {srv.price} • {srv.modality}</p>
                    </div>
                    {serviceToDeleteIndex === idx ? (
                      <div className="flex gap-2 items-center">
                        <span className="text-xs font-bold text-rose-600">Confirmar exclusão?</span>
                        <button type="button" onClick={() => { removeService(idx); setServiceToDeleteIndex(null); }} className="text-xs font-bold text-white bg-rose-650 px-2.5 py-1 rounded-xl shadow-sm hover:bg-rose-700 transition-colors">Sim</button>
                        <button type="button" onClick={() => setServiceToDeleteIndex(null)} className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-xl hover:bg-slate-200 transition-colors">Não</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setServiceToDeleteIndex(idx)} disabled={saving} className="text-red-500 hover:text-red-750 text-sm font-semibold hover:underline">Remover</button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">Nenhum serviço cadastrado ainda.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'patient_access' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Acesso dos Pacientes ao Sistema</h2>
              <p className="text-sm text-slate-500">Gerencie quais pacientes têm acesso ao aplicativo móvel/web, bloqueie acessos temporariamente ou altere suas senhas.</p>
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Barra de busca */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar paciente pelo nome..."
                value={searchPatientAccess}
                onChange={e => setSearchPatientAccess(e.target.value)}
                className="pl-10 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:text-sm transition-all"
              />
            </div>

            {loadingPatientsAccess ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
                <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
                <span className="text-sm font-medium animate-pulse">Carregando pacientes...</span>
              </div>
            ) : (() => {
              const filteredList = patientAccessList.filter(p =>
                p.name.toLowerCase().includes(searchPatientAccess.toLowerCase())
              );

              if (filteredList.length === 0) {
                return (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
                    <UserCheck className="mx-auto h-12 w-12 text-slate-300" />
                    <h3 className="mt-2 text-sm font-semibold text-slate-900">Nenhum paciente encontrado</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {searchPatientAccess ? 'Experimente buscar por outro nome.' : 'Nenhum paciente possui conta de acesso ao sistema ativa.'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredList.map(patient => {
                    const active = isPatientActive(patient);
                    return (
                      <div
                        key={patient.id}
                        className="flex flex-col justify-between p-5 border border-slate-200 rounded-2xl bg-white hover:shadow-md transition-all duration-300 gap-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center font-bold text-primary-700">
                              {patient.name?.substring(0, 2).toUpperCase() || 'PA'}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-slate-900 truncate max-w-[180px] sm:max-w-xs">{patient.name}</h4>
                              <p className="text-xs text-slate-500 truncate max-w-[180px] sm:max-w-xs">{patient.email}</p>
                            </div>
                          </div>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                            active 
                              ? 'bg-green-50 text-green-700 ring-green-600/20' 
                              : 'bg-red-50 text-red-700 ring-red-600/20'
                          }`}>
                            {active ? 'Ativo' : 'Bloqueado'}
                          </span>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => handleToggleAccess(patient)}
                            disabled={saving}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                              active
                                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            }`}
                          >
                            {active ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                Bloquear
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                Desbloquear
                              </>
                            )}
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordModalPatient(patient);
                              setNewPatientPassword('');
                              setPasswordError(null);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
                          >
                            <Key className="w-3.5 h-3.5" />
                            Alterar Senha
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal de Alteração de Senha do Paciente */}
      {passwordModalPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Definir Nova Senha</h3>
                <p className="text-xs text-slate-500 mt-0.5">Paciente: <strong className="text-slate-700">{passwordModalPatient.name}</strong></p>
              </div>
              <button 
                type="button" 
                onClick={() => setPasswordModalPatient(null)} 
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {passwordError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                {passwordError}
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-6">
              <div>
                <label className="block text-base font-bold text-slate-700 mb-1.5">Nova Senha Temporária</label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo de 6 caracteres"
                  minLength={6}
                  value={newPatientPassword}
                  onChange={e => setNewPatientPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none bg-white font-normal shadow-sm"
                  autoFocus
                />
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setPasswordModalPatient(null)} 
                  className="px-5 py-2.5 text-base font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={passwordSaving}
                  className="px-5 py-2.5 text-base font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {passwordSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      Salvar Nova Senha
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Cadastro/Edição de Funcionário */}
      {showAddEditTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-start mb-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedTeamMember ? 'Editar Integrante da Equipe' : 'Cadastrar Novo Funcionário'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Preencha os dados do profissional ou secretário(a).
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAddEditTeamModal(false)} 
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {teamError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium shrink-0">
                {teamError}
              </div>
            )}

            <form onSubmit={handleSaveTeamMember} className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Nome do profissional"
                  value={teamFormData.name}
                  onChange={e => setTeamFormData({ ...teamFormData, name: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none bg-white font-normal shadow-sm"
                />
              </div>

              {!selectedTeamMember && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">E-mail (Login)</label>
                  <input
                    type="email"
                    required
                    placeholder="email@clinica.com"
                    value={teamFormData.email}
                    onChange={e => setTeamFormData({ ...teamFormData, email: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none bg-white font-normal shadow-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Telefone</label>
                <input
                  type="text"
                  placeholder="(00) 00000-0000"
                  value={teamFormData.phone}
                  onChange={e => setTeamFormData({ ...teamFormData, phone: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none bg-white font-normal shadow-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Função / Cargo</label>
                <select
                  value={teamFormData.role}
                  onChange={e => setTeamFormData({ ...teamFormData, role: e.target.value })}
                  className="block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none bg-white font-normal shadow-sm"
                >
                  <option value="nutritionist">Nutricionista</option>
                  <option value="secretary">Secretária(o)</option>
                </select>
              </div>

              {teamFormData.role === 'nutritionist' && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">CRN (Conselho Regional de Nutrição)</label>
                  <input
                    type="text"
                    required={teamFormData.role === 'nutritionist'}
                    placeholder="CRN-X 00000"
                    value={teamFormData.crn}
                    onChange={e => setTeamFormData({ ...teamFormData, crn: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none bg-white font-normal shadow-sm"
                  />
                </div>
              )}

              {!selectedTeamMember && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Senha de Acesso Inicial</label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    value={teamFormData.password}
                    onChange={e => setTeamFormData({ ...teamFormData, password: e.target.value })}
                    className="block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none bg-white font-normal shadow-sm"
                  />
                </div>
              )}
              
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setShowAddEditTeamModal(false)} 
                  className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={saving}
                  className="px-5 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      Salvar Funcionário
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
