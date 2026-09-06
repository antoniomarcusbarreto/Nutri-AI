import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Mail, Phone, Lock, X, Edit, Power, PowerOff, Check, ClipboardList } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { usePatients } from '../hooks/queries/usePatients';
import { qk } from '../lib/queryKeys';
import { logger } from '../lib/logger';
import type { PatientRow } from '../types/clinical';

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : '');

export const Patients: React.FC = () => {
  const { clinic, isReadOnly, isTrialActive } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  const { data: patients = [], isLoading: loading } = usePatients(clinic?.id);
  const refetchPatients = () => queryClient.invalidateQueries({ queryKey: qk.patients.all });

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientRow | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    email: '',
    phone: '',
    status: 'ativo',
    password: '',
    birth_date: '',
    biological_sex: 'F',
    main_goal: 'Emagrecimento',
    has_app_access: false
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
        password: '', // Don't prefill password
        birth_date: patient.birth_date ? toInputDate(patient.birth_date) : '',
        biological_sex: patient.biological_sex || 'F',
        main_goal: patient.main_goal || 'Emagrecimento',
        has_app_access: false
      });
    } else {
      setEditingPatient(null);
      setFormData({
        name: '',
        cpf: '',
        email: '',
        phone: '',
        status: 'ativo',
        password: '',
        birth_date: '',
        biological_sex: 'F',
        main_goal: 'Emagrecimento',
        has_app_access: false
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic) return;
    
    if (!editingPatient && formData.has_app_access && formData.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    const isoBirthDate = toIsoDate(formData.birth_date);
    if (!isoBirthDate) {
      setError('Data de Nascimento inválida. Use o formato DD/MM/AAAA');
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
        // Create new patient via RPC
        const generatedPassword = formData.has_app_access
          ? formData.password
          : `${crypto.randomUUID().slice(0, 10)}A1@`;
        
        const { error: rpcError } = await supabase.rpc('create_patient_account', {
          p_clinic_id: clinic.id,
          p_name: formData.name,
          p_cpf: formData.cpf,
          p_email: formData.email,
          p_phone: formData.phone,
          p_status: formData.status,
          p_password: generatedPassword,
          p_birth_date: isoBirthDate,
          p_biological_sex: formData.biological_sex,
          p_main_goal: formData.main_goal
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
      const { error: updateError } = await supabase
        .from('patients')
        .update({
          allergies: clinicalFormData.allergies,
          dietary_restrictions: clinicalFormData.dietary_restrictions,
          pathologies: clinicalFormData.pathologies,
          medications: clinicalFormData.medications,
          physical_activity_level: clinicalFormData.physical_activity_level,
          profession: clinicalFormData.profession,
          sleep_quality: clinicalFormData.sleep_quality
        })
        .eq('id', selectedClinicalPatient.id);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">Pacientes</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie seus pacientes e prontuários.</p>
        </div>
        <div className="flex items-center gap-3">
          {isLimitReached && (
            <span className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded-full font-medium">
              {isTrialActive ? 'Limite de 5 pacientes do Trial atingido' : 'Limite de 50 pacientes atingido'}
            </span>
          )}
          <button 
            disabled={isButtonDisabled}
            onClick={() => handleOpenModal()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={isLimitReached ? 'Faça upgrade para adicionar mais pacientes' : isReadOnly ? 'Sistema em modo somente leitura' : ''}
          >
            {isButtonDisabled ? <Lock className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
            Novo Paciente
          </button>
        </div>
      </div>

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
                filteredPatients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-slate-50 transition-colors">
                    <td className="whitespace-nowrap py-4 pl-6 pr-3">
                      <div className="font-medium text-slate-900 flex items-center gap-2">
                        {patient.name}
                        {!patient.physical_activity_level && (
                          <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20" title="Ficha clínica não preenchida">
                            ⚠️ Incompleto
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 text-sm mt-0.5">CPF: {patient.cpf || 'Não informado'}</div>
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
                        disabled={isReadOnly}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                          patient.status === 'ativo' 
                            ? 'bg-green-50 text-green-700 ring-green-600/20 hover:bg-green-100' 
                            : 'bg-slate-50 text-slate-600 ring-slate-500/10 hover:bg-slate-100'
                        } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {patient.status === 'ativo' ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                        {patient.status.charAt(0).toUpperCase() + patient.status.slice(1)}
                      </button>
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-6 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        <button 
                          onClick={() => {
                            if (patient.form_token) {
                              const link = `${window.location.origin}/ficha/${patient.form_token}`;
                              navigator.clipboard.writeText(link);
                              setCopiedId(patient.id);
                              setTimeout(() => setCopiedId(null), 2000);
                            } else {
                              showToast('Token não gerado. Edite e salve o paciente para gerar.', 'error');
                            }
                          }}
                          className={`transition-colors flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md ${
                            copiedId === patient.id 
                              ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20' 
                              : 'text-slate-500 hover:text-primary-600 hover:bg-slate-50'
                          }`}
                          title="Copiar Link da Ficha"
                        >
                          {copiedId === patient.id ? (
                            <>
                              <Check className="h-4 w-4" /> Copiado
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                              Link
                            </>
                          )}
                        </button>
                        <button 
                          onClick={() => handleOpenClinicalModal(patient)}
                          className="transition-colors flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-slate-500 hover:text-primary-600 hover:bg-slate-50"
                          title="Ficha Clínica (Anamnese)"
                        >
                          <ClipboardList className="h-4 w-4" />
                          Ficha
                        </button>
                        <button 
                          onClick={() => handleOpenModal(patient)}
                          disabled={isReadOnly}
                          className="text-primary-600 hover:text-primary-900 disabled:opacity-50"
                          title="Editar Paciente"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-auto animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingPatient ? 'Editar Paciente' : 'Novo Paciente'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <p className="text-xs text-slate-500 mt-1">Será usado para o login do paciente.</p>
                </div>

                {!editingPatient && (
                  <div className="md:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200 mt-1">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.has_app_access}
                        onChange={e => setFormData({...formData, has_app_access: e.target.checked})}
                        className="h-4.5 w-4.5 rounded border-slate-350 text-indigo-650 focus:ring-indigo-600 cursor-pointer"
                      />
                      <div>
                        <span className="block text-sm font-semibold text-slate-900">Permitir acesso do paciente ao Aplicativo</span>
                        <span className="block text-xs text-slate-500 mt-0.5">O paciente poderá fazer login para ver o plano alimentar e registrar o diário.</span>
                      </div>
                    </label>
                  </div>
                )}

                {!editingPatient && formData.has_app_access && (
                  <div className="md:col-span-2">
                    <label className="text-slate-700 font-semibold text-sm mb-1 block">Senha de Acesso *</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      className="block w-full rounded-lg border border-slate-200 py-2 px-3 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 focus:outline-none bg-white font-normal text-slate-700 shadow-sm"
                    />
                  </div>
                )}

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

              <div className="pt-6 flex gap-3 justify-end border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl font-bold py-2.5 px-5 text-sm transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl font-bold py-2.5 px-5 text-sm transition-all text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {saving ? 'Salvando...' : 'Salvar Paciente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isClinicalModalOpen && selectedClinicalPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-auto animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="text-left">
                <h3 className="text-lg font-semibold text-slate-900">
                  Ficha Clínica / Anamnese
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Paciente: <span className="font-semibold text-slate-700">{selectedClinicalPatient.name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsClinicalModalOpen(false)}
                className="text-slate-400 hover:text-slate-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveClinical} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-left">
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

              <div className="pt-6 flex gap-3 justify-end border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClinicalModalOpen(false)}
                  className="rounded-xl font-bold py-2.5 px-5 text-sm transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={clinicalSaving}
                  className="rounded-xl font-bold py-2.5 px-5 text-sm transition-all text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {clinicalSaving ? 'Salvando...' : 'Salvar Ficha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
