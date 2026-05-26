import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Building2, Users, ClipboardList, CheckCircle2, User, Apple, Upload } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

export const Onboarding: React.FC = () => {
  const [step, setStep] = useState(1);
  const { clinic, session, profile } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const formatToBrDate = (dateString?: string | null) => {
    if (!dateString) return '';
    if (dateString.includes('/')) return dateString;
    const [year, month, day] = dateString.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return dateString;
  };

  const formatToDbDate = (dateString?: string) => {
    if (!dateString) return null;
    if (dateString.includes('-')) return dateString;
    const [day, month, year] = dateString.split('/');
    if (day && month && year && year.length === 4) return `${year}-${month}-${day}`;
    return null;
  };

  // Step 1: Profile Data
  const [profileData, setProfileData] = useState({
    full_name: profile?.full_name || '',
    birth_date: formatToBrDate(profile?.birth_date) || '',
    phone: profile?.phone || '',
    crn: profile?.crn || '',
    avatar_url: profile?.avatar_url || ''
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url || null);

  // Step 2: Clinic Data
  const [clinicData, setClinicData] = useState({
    name: clinic?.name || '',
    cep: clinic?.cep || '',
    address: clinic?.address || '',
    neighborhood: clinic?.neighborhood || '',
    city: clinic?.city || '',
    state: clinic?.state || '',
    complement: clinic?.complement || '',
    operating_hours: clinic?.operating_hours || '',
    email: clinic?.email || session?.user?.email || '',
    phone: clinic?.phone || '',
  });

  // Step 3: Professionals Data
  const [invites, setInvites] = useState<{ email: string; name: string; role: string }[]>([]);
  const [newInvite, setNewInvite] = useState({ email: '', name: '', role: 'nutritionist' });

  // Step 4: Services Data
  const [services, setServices] = useState<{ name: string; duration_minutes: number; price: number; modality: string }[]>([]);
  const [newService, setNewService] = useState({ name: '', duration_minutes: 60, price: 150, modality: 'presencial' });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);
    
    if (value.length >= 5) {
      value = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
    } else if (value.length >= 3) {
      value = `${value.slice(0, 2)}/${value.slice(2)}`;
    }
    
    setProfileData({ ...profileData, birth_date: value });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    value = value.replace(/^(\d{2})(\d)/g, '($1) $2');
    value = value.replace(/(\d)(\d{4})$/, '$1-$2');
    
    setProfileData({ ...profileData, phone: value });
  };

  const handleClinicPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    value = value.replace(/^(\d{2})(\d)/g, '($1) $2');
    value = value.replace(/(\d)(\d{4})$/, '$1-$2');
    
    setClinicData({ ...clinicData, phone: value });
  };

  const handleCrnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value.toUpperCase();
    
    // Só aceita letras, números, hífen e espaço
    input = input.replace(/[^A-Z0-9\-\s]/g, '');
    
    // Auto-preenche CRN- se começar com número
    if (/^[0-9]/.test(input)) {
      input = 'CRN-' + input;
    }

    // Limita a segunda parte (após o espaço) a 6 dígitos
    const parts = input.split(' ');
    if (parts.length > 1) {
      const prefix = parts[0];
      let digits = parts[1].replace(/\D/g, '');
      if (digits.length > 6) digits = digits.slice(0, 6);
      input = `${prefix} ${digits}`;
    }

    // Evita strings gigantes
    if (input.length > 15) input = input.slice(0, 15);

    setProfileData({ ...profileData, crn: input });
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      let finalAvatarUrl = profileData.avatar_url;

      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${session.user.id}-${Math.random()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, avatarFile);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
        finalAvatarUrl = data.publicUrl;
      }

      const { error } = await supabase.from('profiles').upsert({
        id: session.user.id,
        full_name: profileData.full_name || 'Usuário',
        birth_date: formatToDbDate(profileData.birth_date),
        phone: profileData.phone,
        crn: profileData.crn,
        avatar_url: finalAvatarUrl,
        is_active: true
      });

      if (error) throw error;
      setStep(2);
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar perfil.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClinicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      if (!clinic?.id) {
        // Criar nova clínica
        const { data: newClinic, error: clinicError } = await supabase.from('clinics').insert([{
          owner_id: session.user.id,
          name: clinicData.name || `Consultório de ${profileData.full_name.split(' ')[0] || 'Nutrição'}`,
          plan_level: 'starter',
          cep: clinicData.cep,
          address: clinicData.address,
          neighborhood: clinicData.neighborhood,
          city: clinicData.city,
          state: clinicData.state,
          complement: clinicData.complement,
          operating_hours: clinicData.operating_hours,
          email: clinicData.email,
          phone: clinicData.phone,
        }]).select().single();
        
        if (clinicError) throw clinicError;

        const { error: memberError } = await supabase.from('clinic_members').insert([{
          clinic_id: newClinic.id,
          user_id: session.user.id,
          role: 'owner'
        }]);

        if (memberError) throw memberError;
      } else {
        // Atualizar clínica existente
        const { error } = await supabase.from('clinics').update({
          name: clinicData.name,
          cep: clinicData.cep,
          address: clinicData.address,
          neighborhood: clinicData.neighborhood,
          city: clinicData.city,
          state: clinicData.state,
          complement: clinicData.complement,
          operating_hours: clinicData.operating_hours,
          email: clinicData.email,
          phone: clinicData.phone,
        }).eq('id', clinic.id);
        
        if (error) throw error;
      }
      setStep(3);
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar dados da clínica.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const addInvite = () => {
    if (newInvite.email && newInvite.name) {
      setInvites([...invites, newInvite]);
      setNewInvite({ email: '', name: '', role: 'nutritionist' });
    }
  };

  const removeInvite = (index: number) => {
    setInvites(invites.filter((_, i) => i !== index));
  };

  const handleInvitesSubmit = async () => {
    if (invites.length === 0) {
      setStep(4);
      return;
    }
    setLoading(true);
    try {
      // Obter clinic_id mais recente (pode estar no contexto ou precisamos buscar se recém-criada)
      let currentClinicId = clinic?.id;
      if (!currentClinicId) {
        const { data: member } = await supabase.from('clinic_members').select('clinic_id').eq('user_id', session?.user?.id).single();
        if (member) currentClinicId = member.clinic_id;
      }

      if (!currentClinicId) throw new Error('Clínica não encontrada.');

      const invitesToInsert = invites.map(inv => ({
        clinic_id: currentClinicId,
        email: inv.email,
        name: inv.name,
        role: inv.role,
        status: 'pending'
      }));

      const { error } = await supabase.from('clinic_invites').insert(invitesToInsert);
      if (error) throw error;
      setStep(4);
    } catch (err) {
      console.error(err);
      showToast('Erro ao enviar convites.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const addService = () => {
    if (newService.name && newService.price >= 0) {
      setServices([...services, newService]);
      setNewService({ name: '', duration_minutes: 60, price: 150, modality: 'presencial' });
    }
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const handleServicesSubmit = async () => {
    if (services.length === 0) {
      window.location.href = '/dashboard';
      return;
    }
    setLoading(true);
    try {
      let currentClinicId = clinic?.id;
      if (!currentClinicId) {
        const { data: member } = await supabase.from('clinic_members').select('clinic_id').eq('user_id', session?.user?.id).single();
        if (member) currentClinicId = member.clinic_id;
      }

      if (!currentClinicId) {
         window.location.href = '/dashboard';
         return;
      }

      const servicesToInsert = services.map(srv => ({
        clinic_id: currentClinicId,
        name: srv.name,
        duration_minutes: srv.duration_minutes,
        price: srv.price,
        modality: srv.modality
      }));

      const { error } = await supabase.from('services').insert(servicesToInsert);
      if (error) throw error;
      window.location.href = '/dashboard';
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar serviços.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const skipStep = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      window.location.href = '/dashboard';
    }
  };

  const steps = [
    { id: 1, name: 'Perfil', icon: User },
    { id: 2, name: 'Clínica', icon: Building2 },
    { id: 3, name: 'Equipe', icon: Users },
    { id: 4, name: 'Serviços', icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <div className="flex-1 flex flex-col pt-10 pb-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-4xl">
          <div className="flex justify-center mb-8">
            <div className="h-16 w-16 bg-primary-100 rounded-full flex items-center justify-center">
              <Apple className="h-8 w-8 text-primary-600" />
            </div>
          </div>
          <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight mb-8">
            Complete seu cadastro
          </h2>
          
          {/* Progress Bar */}
          <nav aria-label="Progress">
            <ol role="list" className="flex items-center justify-center px-4 sm:px-0">
              {steps.map((s, stepIdx) => (
                <li key={s.name} className={`relative ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-24' : ''}`}>
                  <div className="flex items-center">
                    <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${step >= s.id ? 'bg-primary-600' : 'bg-slate-200'}`}>
                      <s.icon className={`h-4 w-4 ${step >= s.id ? 'text-white' : 'text-slate-500'}`} aria-hidden="true" />
                    </div>
                    {stepIdx !== steps.length - 1 && (
                      <div className={`absolute left-8 top-4 -ml-px h-0.5 w-full bg-slate-200 ${step > s.id ? 'bg-primary-600' : 'bg-slate-200'}`} />
                    )}
                  </div>
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-slate-500 hidden sm:block">{s.name}</span>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <div className="mt-12 sm:mx-auto sm:w-full sm:max-w-2xl">
          <div className="bg-white py-8 px-4 shadow sm:rounded-xl sm:px-10 border border-slate-200">
            
            {/* Step 1: Profile */}
            {step === 1 && (
              <form onSubmit={handleProfileSubmit} className="space-y-6">
                <div className="border-b border-slate-200 pb-4 mb-4">
                  <h3 className="text-lg font-medium leading-6 text-slate-900">Perfil Profissional</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Insira seus dados pessoais e foto de perfil.
                  </p>
                </div>

                <div className="flex flex-col items-center mb-6">
                  <div className="relative">
                    <div className="h-24 w-24 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border-2 border-slate-200">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-12 w-12 text-slate-400" />
                      )}
                    </div>
                    <label htmlFor="avatar-upload" className="absolute bottom-0 right-0 h-8 w-8 bg-primary-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-700 transition-colors border-2 border-white shadow-sm">
                      <Upload className="h-4 w-4 text-white" />
                      <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </label>
                  </div>
                  <span className="mt-2 text-xs text-slate-500">Foto de perfil (opcional)</span>
                </div>
                
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-base font-bold text-slate-700 mb-1">Nome Completo</label>
                    <input type="text" required value={profileData.full_name} onChange={e => setProfileData({...profileData, full_name: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div>
                    <label className="block text-base font-bold text-slate-700 mb-1">Data de Nascimento</label>
                    <input type="text" placeholder="DD/MM/AAAA" maxLength={10} value={profileData.birth_date} onChange={handleDateChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border text-slate-700" />
                  </div>
                  <div>
                    <label className="block text-base font-bold text-slate-700 mb-1">Celular</label>
                    <input type="text" placeholder="(00) 00000-0000" maxLength={15} value={profileData.phone} onChange={handlePhoneChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-base font-bold text-slate-700 mb-1">CRN / CRM</label>
                    <input type="text" placeholder="Ex: CRN-3 123456" maxLength={15} value={profileData.crn} onChange={handleCrnChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                </div>

                <div className="flex justify-between pt-5">
                  <button type="button" onClick={skipStep} className="bg-white py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none">
                    Pular esta etapa
                  </button>
                  <button type="submit" disabled={loading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none">
                    {loading ? 'Salvando...' : 'Avançar'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Clinic */}
            {step === 2 && (
              <form onSubmit={handleClinicSubmit} className="space-y-6">
                <div className="border-b border-slate-200 pb-4 mb-4">
                  <h3 className="text-lg font-medium leading-6 text-slate-900">Dados da Clínica</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Estas informações serão usadas em prescrições e recibos.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                  <div className="sm:col-span-6">
                    <label className="block text-base font-bold text-slate-700 mb-1">Nome da Clínica/Consultório</label>
                    <input type="text" placeholder="Ex: Consultório de Nutrição" value={clinicData.name} onChange={e => setClinicData({...clinicData, name: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-base font-bold text-slate-700 mb-1">CEP</label>
                    <input type="text" value={clinicData.cep} onChange={e => setClinicData({...clinicData, cep: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-base font-bold text-slate-700 mb-1">Endereço</label>
                    <input type="text" value={clinicData.address} onChange={e => setClinicData({...clinicData, address: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-base font-bold text-slate-700 mb-1">Número/Complemento</label>
                    <input type="text" value={clinicData.complement} onChange={e => setClinicData({...clinicData, complement: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-base font-bold text-slate-700 mb-1">Bairro</label>
                    <input type="text" value={clinicData.neighborhood} onChange={e => setClinicData({...clinicData, neighborhood: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-base font-bold text-slate-700 mb-1">Cidade</label>
                    <input type="text" value={clinicData.city} onChange={e => setClinicData({...clinicData, city: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-base font-bold text-slate-700 mb-1">Estado</label>
                    <input type="text" value={clinicData.state} onChange={e => setClinicData({...clinicData, state: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-base font-bold text-slate-700 mb-1">Telefone da Clínica</label>
                    <input type="text" placeholder="(00) 0000-0000" maxLength={15} value={clinicData.phone} onChange={handleClinicPhoneChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-base font-bold text-slate-700 mb-1">E-mail da Clínica</label>
                    <input type="email" value={clinicData.email} onChange={e => setClinicData({...clinicData, email: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                  <div className="sm:col-span-6">
                    <label className="block text-base font-bold text-slate-700 mb-1">Horário de Funcionamento</label>
                    <input type="text" placeholder="Ex: Seg a Sex das 08h às 18h" value={clinicData.operating_hours} onChange={e => setClinicData({...clinicData, operating_hours: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-base px-4 py-2.5 border" />
                  </div>
                </div>

                <div className="flex justify-between pt-5">
                  <button type="button" onClick={skipStep} className="bg-white py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none">
                    Pular esta etapa
                  </button>
                  <button type="submit" disabled={loading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none">
                    {loading ? 'Salvando...' : 'Avançar'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Team */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="border-b border-slate-200 pb-4 mb-4">
                  <h3 className="text-lg font-medium leading-6 text-slate-900">Profissionais da Clínica</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Adicione membros à sua equipe. Eles receberão um e-mail para acessar o sistema.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-base font-bold text-slate-700 mb-1">Nome</label>
                      <input type="text" value={newInvite.name} onChange={e => setNewInvite({...newInvite, name: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 text-base px-4 py-3 border" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-base font-bold text-slate-700 mb-1">E-mail</label>
                      <input type="email" value={newInvite.email} onChange={e => setNewInvite({...newInvite, email: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 text-base px-4 py-3 border" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-base font-bold text-slate-700 mb-1">Função</label>
                      <select value={newInvite.role} onChange={e => setNewInvite({...newInvite, role: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 text-base px-4 py-3 border bg-white">
                        <option value="nutritionist">Nutricionista</option>
                        <option value="secretary">Secretária</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 flex items-end">
                      <button type="button" onClick={addInvite} className="w-full bg-slate-800 text-white py-2.5 px-4 rounded-md text-sm hover:bg-slate-700 font-bold transition-colors">
                        Adicionar à lista
                      </button>
                    </div>
                  </div>
                </div>

                {invites.length > 0 && (
                  <ul className="divide-y divide-slate-200">
                    {invites.map((inv, idx) => (
                      <li key={idx} className="py-3 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{inv.name}</p>
                          <p className="text-xs text-slate-500">{inv.email} • {inv.role === 'nutritionist' ? 'Nutricionista' : 'Secretária'}</p>
                        </div>
                        <button type="button" onClick={() => removeInvite(idx)} className="text-red-500 hover:text-red-700 text-sm font-medium">Remover</button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex justify-between pt-5">
                  <button type="button" onClick={skipStep} className="bg-white py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none">
                    Pular esta etapa
                  </button>
                  <button type="button" onClick={handleInvitesSubmit} disabled={loading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none">
                    {loading ? 'Enviando...' : invites.length > 0 ? 'Convidar e Avançar' : 'Avançar sem convites'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Services */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="border-b border-slate-200 pb-4 mb-4">
                  <h3 className="text-lg font-medium leading-6 text-slate-900">Serviços Prestados</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Cadastre os tipos de consultas e procedimentos que a clínica oferece.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-base font-bold text-slate-700 mb-1">Nome do Serviço</label>
                      <input type="text" placeholder="Ex: Primeira Consulta" value={newService.name} onChange={e => setNewService({...newService, name: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 text-base px-4 py-3 border" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-base font-bold text-slate-700 mb-1">Duração (min)</label>
                      <input type="number" value={newService.duration_minutes} onChange={e => setNewService({...newService, duration_minutes: parseInt(e.target.value) || 0})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 text-base px-4 py-3 border" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-base font-bold text-slate-700 mb-1">Preço (R$)</label>
                      <input type="number" value={newService.price} onChange={e => setNewService({...newService, price: parseFloat(e.target.value) || 0})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 text-base px-4 py-3 border" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-base font-bold text-slate-700 mb-1">Modalidade</label>
                      <select value={newService.modality} onChange={e => setNewService({...newService, modality: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-primary-500 text-base px-4 py-3 border bg-white">
                        <option value="presencial">Presencial</option>
                        <option value="online">Online</option>
                        <option value="hibrido">Híbrido</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 flex items-end">
                      <button type="button" onClick={addService} className="w-full bg-slate-800 text-white py-2.5 px-4 rounded-md text-sm hover:bg-slate-700 font-bold transition-colors">
                        Adicionar à lista
                      </button>
                    </div>
                  </div>
                </div>

                {services.length > 0 && (
                  <ul className="divide-y divide-slate-200">
                    {services.map((srv, idx) => (
                      <li key={idx} className="py-3 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{srv.name}</p>
                          <p className="text-xs text-slate-500">{srv.duration_minutes} min • R$ {srv.price} • {srv.modality}</p>
                        </div>
                        <button type="button" onClick={() => removeService(idx)} className="text-red-500 hover:text-red-700 text-sm font-medium">Remover</button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex justify-between pt-5">
                  <button type="button" onClick={skipStep} className="bg-white py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none">
                    Pular e Finalizar
                  </button>
                  <button type="button" onClick={handleServicesSubmit} disabled={loading} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none">
                    <CheckCircle2 className="w-4 h-4 mr-2 my-auto" />
                    {loading ? 'Salvando...' : 'Finalizar Cadastro'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
