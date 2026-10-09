import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Mail, Phone, Lock, Edit, Power, PowerOff, ClipboardList, KeyRound, Smartphone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { usePatients } from '../hooks/queries/usePatients';
import { useAccessGrantMutations, useClinicProfessionals } from '../hooks/queries/useAccessGrants';
import { qk } from '../lib/queryKeys';
import { logger } from '../lib/logger';
import type { PatientRow } from '../types/clinical';
import { PageHeader, Modal } from '../components/ui';
import { PortalAccessModal } from '../components/patients/PortalAccessModal';
import { portalAccessState } from '../types/portal';

const errMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return '';
};

export const Patients: React.FC = () => {
  const { clinic, profile, userRole, isReadOnly, isTrialActive } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const isSecretary = userRole === 'secretary';

  const { data: patients = [], isLoading: loading } = usePatients(clinic?.id);
  const refetchPatients = () => queryClient.invalidateQueries({ queryKey: qk.patients.all });

  // Responsável pelo paciente (migration 0029): a secretária escolhe; o
  // profissional cadastra sempre para si.
  const { data: professionals = [] } = useClinicProfessionals(clinic?.id);
  const professionalName = (id: string | null | undefined) =>
    professionals.find((p) => p.id === id)?.full_name ?? 'Outro profissional';
  const { request: requestAccess } = useAccessGrantMutations();

  const handleRequestAccess = (patient: PatientRow) => {
    if (requestAccess.isPending) return;
    requestAccess.mutate(
      { ownerId: patient.nutritionist_id, patientId: patient.id, reason: 'Pedido pela lista de pacientes' },
      {
        onSuccess: () => showToast(`Pedido enviado para ${professionalName(patient.nutritionist_id)}.`, 'success'),
        onError: (err) => showToast(errMessage(err) || 'Não foi possível enviar o pedido.', 'error'),
      },
    );
  };

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientRow | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    email: '',
    phone: '',
    status: 'ativo',
    birth_date: '',
    biological_sex: 'F',
    main_goal: 'Emagrecimento',
    nutritionist_id: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalPatientId, setPortalPatientId] = useState<string | null>(null);
  const portalPatient = patients.find((p) => p.id === portalPatientId) ?? null;

  // Clinical modal states
  const [isClinicalModalOpen, setIsClinicalModalOpen] = useState(false);
  const [selectedClinicalPatient, setSelectedClinicalPatient] = useState<PatientRow | null>(null);
  const [clinicalFormData, setClinicalFormData] = useState({
    allergies: '',
    dietary_restrictions: '',
    pathologies: '',
    medications: '',
    physical_activity_level: '',
    profession: '',
    sleep_quality: ''
  });
  const [clinicalSaving, setClinicalSaving] = useState(false);
  const [clinicalError, setClinicalError] = useState<string | null>(null);

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isLimitReached = isTrialActive 
    ? patients.length >= 5 
    : (clinic?.plan_level === 'starter' && patients.length >= 50);
    
  const isButtonDisabled = isReadOnly || isLimitReached;

  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const formatPhone = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4,5})(\d{4})$/, '$1-$2')
      .substring(0, 15); // (00) 00000-0000 -> 15 chars max
  };

  const formatDateMask = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1/$2')
      .replace(/(\d{2})(\d)/, '$1/$2')
      .substring(0, 10);
  };

  const toInputDate = (isoDate: string) => {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return '';
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const toIsoDate = (inputDate: string) => {
    if (!inputDate || inputDate.length !== 10) return null;
    const parts = inputDate.split('/');
    if (parts.length !== 3) return null;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const handleOpenModal = (patient?: PatientRow) => {
    setError(null);
    if (patient) {
      setEditingPatient(patient);
      setFormData({
        name: patient.name,
        cpf: patient.cpf || '',
        email: patient.email || '',
        phone: patient.phone || '',
        status: patient.status,
        birth_date: patient.birth_date ? toInputDate(patient.birth_date) : '',
        biological_sex: patient.biological_sex || 'F',
        main_goal: patient.main_goal || 'Emagrecimento',
        nutritionist_id: patient.nutritionist_id
      });
    } else {
      setEditingPatient(null);
      setFormData({
        name: '',
        cpf: '',
        email: '',
        phone: '',
        status: 'ativo',
        birth_date: '',
        biological_sex: 'F',
        main_goal: 'Emagrecimento',
        nutritionist_id: isSecretary ? (professionals.length === 1 ? professionals[0].id : '') : profile?.id ?? ''
      });
    }
    setIsModalOpen(true);
  };

  // Atalho do Dashboard: /pacientes?novo=1 abre o cadastro. A secretária
  // espera a lista de profissionais (define o nutricionista padrão).
  useEffect(() => {
    if (searchParams.get('novo') !== '1' || isReadOnly || (isSecretary && professionals.length === 0)) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('novo');
      return next;
    }, { replace: true });
    handleOpenModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, professionals.length]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic) return;
    
    const isoBirthDate = toIsoDate(formData.birth_date);
    if (!isoBirthDate) {
      setError('Data de Nascimento inválida. Use o formato DD/MM/AAAA');
      return;
    }

    if (!editingPatient && isSecretary && !formData.nutritionist_id) {
      setError('Escolha o nutricionista responsável pelo paciente.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingPatient) {
        // Edit existing patient in this clinic using RPC
        const { error: updateError } = await supabase.rpc('update_patient_account', {
          p_clinic_id: clinic.id,
          p_patient_id: editingPatient.id,
          p_name: formData.name,
          p_cpf: formData.cpf,
          p_email: formData.email,
          p_phone: formData.phone,
          p_status: formData.status,
          p_birth_date: isoBirthDate,
          p_biological_sex: formData.biological_sex,
          p_main_goal: formData.main_goal
        });

        if (updateError) throw updateError;

        // Troca do e-mail de LOGIN do paciente (se tem conta de acesso): só via
        // Edge Function, com confirmação. `p_email` acima é só contato (SEC-03).
        if (editingPatient.user_id && formData.email && formData.email !== editingPatient.email) {
          const { error: emailErr } = await supabase.functions.invoke('admin-update-user-email', {
            body: { target_user_id: editingPatient.user_id, new_email: formData.email },
          });
          if (emailErr) throw emailErr;
          showToast('Link de confirmação enviado ao novo e-mail do paciente.', 'success');
        }
      } else {
        // Cadastro sem conta de login: o acesso ao app é liberado depois, por
        // convite (migration 0031).
        const { error: rpcError } = await supabase.rpc('create_patient_account', {
          p_clinic_id: clinic.id,
          p_name: formData.name,
          p_cpf: formData.cpf,
          p_email: formData.email,
          p_phone: formData.phone,
          p_status: formData.status,
          p_birth_date: isoBirthDate,
          p_biological_sex: formData.biological_sex,
          p_main_goal: formData.main_goal,
          // Ignorado pelo banco quando quem cadastra é o profissional (fica com ele).
          p_nutritionist_id: formData.nutritionist_id || null
        });

        if (rpcError) throw rpcError;
      }

      refetchPatients();
      setIsModalOpen(false);
    } catch (err) {
      logger.error(err);
      setError(errMessage(err) || 'Erro ao salvar paciente.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenClinicalModal = (patient: PatientRow) => {
    setClinicalError(null);
    setSelectedClinicalPatient(patient);
    setClinicalFormData({
      allergies: patient.allergies || '',
      dietary_restrictions: patient.dietary_restrictions || '',
      pathologies: patient.pathologies || '',
      medications: patient.medications || '',
      physical_activity_level: patient.physical_activity_level || '',
      profession: patient.profession || '',
      sleep_quality: patient.sleep_quality || ''
    });
    setIsClinicalModalOpen(true);
  };

  const handleSaveClinical = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClinicalPatient) return;

    setClinicalSaving(true);
    setClinicalError(null);

    try {
      // Ficha de saúde fica em `patient_health` (migration 0029), fora do
      // alcance da secretária.
      const { error: updateError } = await supabase
        .from('patient_health')
        .upsert({
          patient_id: selectedClinicalPatient.id,
          allergies: clinicalFormData.allergies,
          dietary_restrictions: clinicalFormData.dietary_restrictions,
          pathologies: clinicalFormData.pathologies,
          medications: clinicalFormData.medications,
          physical_activity_level: clinicalFormData.physical_activity_level,
          profession: clinicalFormData.profession,
          sleep_quality: clinicalFormData.sleep_quality,
          updated_at: new Date().toISOString(),
        });

      if (updateError) throw updateError;

      refetchPatients();
      setIsClinicalModalOpen(false);
    } catch (err) {
      logger.error(err);
      setClinicalError(errMessage(err) || 'Erro ao salvar ficha clínica.');
    } finally {
      setClinicalSaving(false);
    }
  };

  const toggleStatus = async (patient: PatientRow) => {
    if (isReadOnly) return;
    const newStatus = patient.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const { error } = await supabase
        .from('patients')
        .update({ status: newStatus })
        .eq('id', patient.id);
        
      if (error) throw error;
      queryClient.setQueryData<PatientRow[]>(
        qk.patients.list(clinic!.id),
        (prev) => prev?.map(p => (p.id === patient.id ? { ...p, status: newStatus } : p)) ?? prev,
      );
    } catch (err) {
      logger.error('Error toggling status', err);
      showToast('Não foi possível alterar o status do paciente.', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title="Pacientes"
        description={isSecretary
          ? 'Cadastro dos pacientes da clínica. Prontuários ficam restritos a cada nutricionista.'
          : 'Gerencie seus pacientes e prontuários.'}
        actions={<>
          {isLimitReached && (
            <span className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded-full font-medium">
              {isTrialActive ? 'Limite de 5 pacientes do Trial atingido' : 'Limite de 50 pacientes atingido'}
            </span>
          )}
          <button 
            disabled={isButtonDisabled}
            onClick={() => handleOpenModal()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5024fc] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#431cdb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5024fc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={isLimitReached ? 'Faça upgrade para adicionar mais pacientes' : isReadOnly ? 'Sistema em modo somente leitura' : ''}
          >
            {isButtonDisabled ? <Lock className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
            Novo Paciente
          </button>
        </>}
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <div className="relative max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              className="block w-full rounded-xl border-0 py-2 pl-10 pr-3 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6"
              placeholder="Buscar pelo nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-slate-900">Paciente</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Contato</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Status</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-6"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-slate-500">
                    Carregando pacientes...
                  </td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-slate-500">
                    Nenhum paciente encontrado.
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => {
                  const hasAccess = patient.has_clinical_access === true;
                  const canEditRegistration = hasAccess || isSecretary;
                  return (
                  <tr key={patient.id} className="hover:bg-slate-50 transition-colors">
                    <td className="whitespace-nowrap py-4 pl-6 pr-3">
                      <div className="font-medium text-slate-900 flex items-center gap-2">
                        {patient.name}
                        {hasAccess && !patient.physical_activity_level && (
                          <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20" title="Ficha clínica não preenchida">
                            ⚠️ Incompleto
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 text-sm mt-0.5">CPF: {patient.cpf || 'Não informado'}</div>
                      {hasAccess && portalAccessState(patient.portal_access_until) !== 'none' && (
                        <div className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                          <Smartphone className="h-3 w-3" aria-hidden="true" />
                          {portalAccessState(patient.portal_access_until) === 'active'
                            ? `App até ${new Date(patient.portal_access_until!).toLocaleDateString('pt-BR')}`
                            : 'App somente leitura'}
                        </div>
                      )}
                      {patient.nutritionist_id !== profile?.id && (
                        <div className="text-slate-500 text-xs mt-0.5">
                          Responsável: {professionalName(patient.nutritionist_id)}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                      <div className="flex items-center gap-2 mb-1">
                        <Mail className="h-4 w-4 text-slate-400" />
                        {patient.email || 'Não informado'}
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-slate-400" />
                        {patient.phone || 'Não informado'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <button
                        onClick={() => toggleStatus(patient)}
                        disabled={isReadOnly || !canEditRegistration}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                          patient.status === 'ativo'
                            ? 'bg-green-50 text-green-700 ring-green-600/20 hover:bg-green-100'
                            : 'bg-slate-50 text-slate-600 ring-slate-500/10 hover:bg-slate-100'
                        } ${isReadOnly || !canEditRegistration ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {patient.status === 'ativo' ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                        {patient.status.charAt(0).toUpperCase() + patient.status.slice(1)}
                      </button>
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-6 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        {hasAccess && (
                          <button
                            onClick={() => handleOpenClinicalModal(patient)}
                            className="transition-colors flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-slate-500 hover:text-primary-600 hover:bg-slate-50"
                            title="Ficha Clínica (Anamnese)"
                          >
                            <ClipboardList className="h-4 w-4" />
                            Ficha
                          </button>
                        )}
                        {hasAccess && (
                          <button
                            onClick={() => setPortalPatientId(patient.id)}
                            className="transition-colors flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-slate-500 hover:text-primary-600 hover:bg-slate-50"
                            title="Acesso do paciente ao app"
                          >
                            <Smartphone className="h-4 w-4" />
                            App
                          </button>
                        )}
                        {!hasAccess && !isSecretary && (
                          <button
                            onClick={() => handleRequestAccess(patient)}
                            disabled={isReadOnly || requestAccess.isPending}
                            className="transition-colors flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-slate-500 hover:text-primary-600 hover:bg-slate-50 disabled:opacity-50"
                            title={`Pedir a ${professionalName(patient.nutritionist_id)} acesso ao prontuário`}
                          >
                            <KeyRound className="h-4 w-4" />
                            Solicitar acesso
                          </button>
                        )}
                        {canEditRegistration && (
                          <button
                            onClick={() => handleOpenModal(patient)}
                            disabled={isReadOnly}
                            className="text-primary-600 hover:text-primary-900 disabled:opacity-50"
                            title="Editar Paciente"
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        size="lg"
        title={editingPatient ? 'Editar Paciente' : 'Novo Paciente'}
        footer={<>
          <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl font-bold py-2.5 px-5 text-sm transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">Cancelar</button>
          <button type="submit" form="patient-form" disabled={saving} className="rounded-xl font-bold py-2.5 px-5 text-sm transition-all text-white bg-[#5024fc] hover:bg-[#431cdb] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">{saving ? 'Salvando...' : 'Salvar Paciente'}</button>
        </>}
      >
            <form id="patient-form" onSubmit={handleSave} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isSecretary && (
                  <div className="md:col-span-2">
                    <label className="text-slate-700 font-semibold text-sm mb-1 block">Nutricionista responsável *</label>
                    <select
                      required
                      disabled={!!editingPatient}
                      value={formData.nutritionist_id}
                      onChange={e => setFormData({...formData, nutritionist_id: e.target.value})}
                      className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <option value="" disabled>Selecione…</option>
                      {professionals.map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      {editingPatient
                        ? 'Só o suporte pode transferir o paciente para outro nutricionista.'
                        : 'Só este nutricionista verá o prontuário do paciente.'}
                    </p>
                  </div>
                )}

                <div className="md:col-span-2">
                  <label className="text-slate-700 font-semibold text-sm mb-1 block">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-semibold text-sm mb-1 block">E-mail *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">É para este e-mail que vai o código do convite do app.</p>
                </div>

                <div>
                  <label className="text-slate-700 font-semibold text-sm mb-1 block">Telefone (WhatsApp) *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: formatPhone(e.target.value)})}
                    className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-semibold text-sm mb-1 block">CPF</label>
                  <input
                    type="text"
                    value={formData.cpf}
                    onChange={e => setFormData({...formData, cpf: formatCPF(e.target.value)})}
                    className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-semibold text-sm mb-1 block">Data de Nascimento *</label>
                  <input
                    type="text"
                    required
                    placeholder="DD/MM/AAAA"
                    value={formData.birth_date}
                    onChange={e => setFormData({...formData, birth_date: formatDateMask(e.target.value)})}
                    className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-semibold text-sm mb-1 block">Sexo Biológico *</label>
                  <select
                    required
                    value={formData.biological_sex}
                    onChange={e => setFormData({...formData, biological_sex: e.target.value})}
                    className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                  >
                    <option value="F">Feminino</option>
                    <option value="M">Masculino</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-slate-700 font-semibold text-sm mb-1 block">Objetivo Principal *</label>
                  <select
                    required
                    value={formData.main_goal}
                    onChange={e => setFormData({...formData, main_goal: e.target.value})}
                    className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                  >
                    <option value="Emagrecimento">Emagrecimento</option>
                    <option value="Hipertrofia">Hipertrofia</option>
                    <option value="Performance Esportiva">Performance Esportiva</option>
                    <option value="Gestação">Gestação</option>
                    <option value="Tratamento de Patologia">Tratamento de Patologia</option>
                    <option value="Reeducação Alimentar">Reeducação Alimentar</option>
                  </select>
                </div>
              </div>

            </form>
      </Modal>

      {selectedClinicalPatient && (
      <Modal
        open={isClinicalModalOpen}
        onClose={() => setIsClinicalModalOpen(false)}
        size="lg"
        title="Ficha Clínica / Anamnese"
        description={`Paciente: ${selectedClinicalPatient.name}`}
        footer={<>
          <button type="button" onClick={() => setIsClinicalModalOpen(false)} className="rounded-xl font-bold py-2.5 px-5 text-sm transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">Cancelar</button>
          <button type="submit" form="clinical-form" disabled={clinicalSaving} className="rounded-xl font-bold py-2.5 px-5 text-sm transition-all text-white bg-[#5024fc] hover:bg-[#431cdb] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">{clinicalSaving ? 'Salvando...' : 'Salvar Ficha'}</button>
        </>}
      >
            <form id="clinical-form" onSubmit={handleSaveClinical} className="space-y-4 text-left">
              {clinicalError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100">
                  {clinicalError}
                </div>
              )}

              {/* Seção 1: Dados Clínicos */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-primary-600 uppercase tracking-wider">Dados Clínicos e Restrições</h4>
                
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-slate-700 font-semibold text-sm mb-1 block">Alergias e Intolerâncias Alimentares</label>
                    <textarea
                      rows={2}
                      value={clinicalFormData.allergies}
                      onChange={e => setClinicalFormData({...clinicalFormData, allergies: e.target.value})}
                      placeholder="Ex: Glúten, Lactose, Oleaginosas. Se não possuir, deixe em branco."
                      className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold text-sm mb-1 block">Restrições Culturais ou Opções Alimentares</label>
                    <input
                      type="text"
                      value={clinicalFormData.dietary_restrictions}
                      onChange={e => setClinicalFormData({...clinicalFormData, dietary_restrictions: e.target.value})}
                      placeholder="Ex: Vegano, Vegetariano, Kosher"
                      className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold text-sm mb-1 block">Patologias ou Doenças Crônicas</label>
                    <textarea
                      rows={2}
                      value={clinicalFormData.pathologies}
                      onChange={e => setClinicalFormData({...clinicalFormData, pathologies: e.target.value})}
                      placeholder="Ex: Diabetes Tipo 1/2, Hipertensão, Gastrite"
                      className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold text-sm mb-1 block">Uso de Medicamentos / Suplementos Atuais</label>
                    <textarea
                      rows={2}
                      value={clinicalFormData.medications}
                      onChange={e => setClinicalFormData({...clinicalFormData, medications: e.target.value})}
                      placeholder="Medicamentos e suplementos em uso"
                      className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* Seção 2: Hábitos e Estilo de Vida */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-primary-600 uppercase tracking-wider">Hábitos e Estilo de Vida</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-slate-700 font-semibold text-sm mb-1 block">Nível de Atividade Física *</label>
                    <select
                      required
                      value={clinicalFormData.physical_activity_level}
                      onChange={e => setClinicalFormData({...clinicalFormData, physical_activity_level: e.target.value})}
                      className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                    >
                      <option value="" disabled>Selecione...</option>
                      <option value="Sedentário">Sedentário (Nenhuma atividade física)</option>
                      <option value="Levemente Ativo">Levemente Ativo (Exercício leve 1-3 dias/semana)</option>
                      <option value="Moderadamente Ativo">Moderadamente Ativo (Exercício moderado 3-5 dias/semana)</option>
                      <option value="Muito Ativo">Muito Ativo (Exercício intenso 6-7 dias/semana)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold text-sm mb-1 block">Profissão / Rotina de Trabalho *</label>
                    <input
                      type="text"
                      required
                      value={clinicalFormData.profession}
                      onChange={e => setClinicalFormData({...clinicalFormData, profession: e.target.value})}
                      placeholder="Ex: Fica muito tempo sentado, em pé"
                      className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="text-slate-700 font-semibold text-sm mb-1 block">Qualidade do Sono *</label>
                    <input
                      type="text"
                      required
                      value={clinicalFormData.sleep_quality}
                      onChange={e => setClinicalFormData({...clinicalFormData, sleep_quality: e.target.value})}
                      placeholder="Ex: 8h por noite, sono reparador"
                      className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                    />
                  </div>
                </div>
              </div>

            </form>
      </Modal>
      )}
      {portalPatient && (
        <PortalAccessModal
          open={!!portalPatient}
          patient={portalPatient}
          readOnly={isReadOnly}
          onClose={() => setPortalPatientId(null)}
        />
      )}
    </div>
  );
};
