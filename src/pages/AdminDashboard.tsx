import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Key, Calendar, Save, UserPlus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : 'Erro inesperado');

interface AdminClinicMember {
  role?: string | null;
  clinic_id?: string | null;
  clinics?: { name?: string | null } | null;
}
interface AdminPatientLink {
  clinic_id?: string | null;
  clinics?: { name?: string | null } | null;
}
interface AdminUser {
  id: string;
  full_name?: string | null;
  crn?: string | null;
  avatar_url?: string | null;
  is_active?: boolean | null;
  is_superadmin?: boolean | null;
  created_at: string;
  clinic_members?: AdminClinicMember[] | null;
  patients?: AdminPatientLink[] | null;
}
interface AdminClinic {
  id: string;
  name?: string | null;
  owner?: { full_name?: string | null } | null;
  subscription_status?: string | null;
  subscription_end_date?: string | null;
  created_at: string;
}

async function fetchAdminData(): Promise<{ users: AdminUser[]; clinics: AdminClinic[] }> {
  const [usersRes, clinicsRes] = await Promise.all([
    supabase.from('profiles').select('*, clinic_members(role, clinic_id, clinics(name)), patients(clinic_id, clinics(name))').order('created_at', { ascending: false }),
    supabase.from('clinics').select('*, owner:profiles(full_name)').order('created_at', { ascending: false }),
  ]);
  return {
    users: (usersRes.data ?? []) as unknown as AdminUser[],
    clinics: (clinicsRes.data ?? []) as unknown as AdminClinic[],
  };
}

export const AdminDashboard: React.FC = () => {
  const { profile } = useAuth();

  // Dados do painel Master via TanStack Query (antes: useEffect + fetchData + 3 setState).
  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ['admin', 'panel'],
    enabled: !!profile?.is_superadmin,
    queryFn: fetchAdminData,
  });
  const users = data?.users ?? [];
  const clinics = data?.clinics ?? [];
  const fetchData = () => { void refetch(); };

  // Modal states
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<AdminClinic | null>(null);
  const [subStatus, setSubStatus] = useState('trial');
  const [subDate, setSubDate] = useState('');

  // Allocation Modal states
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [allocateClinicId, setAllocateClinicId] = useState('');
  const [allocateRole, setAllocateRole] = useState('nutritionist');

  const [message, setMessage] = useState({ text: '', type: '' });

  const callAdminAction = async (action: string, payload: Record<string, unknown>) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action, ...payload })
    });
    
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || 'Erro na requisição');
    return result;
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      await callAdminAction('change_password', { targetUserId: selectedUser.id, newPassword });
      setMessage({ text: 'Senha alterada com sucesso!', type: 'success' });
      setIsPasswordModalOpen(false);
      setNewPassword('');
    } catch (err) {
      setMessage({ text: errMessage(err), type: 'error' });
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    try {
      const newStatus = !user.is_active;
      await callAdminAction('toggle_status', { targetUserId: user.id, isActive: newStatus });
      setMessage({ text: `Usuário ${newStatus ? 'ativado' : 'desativado'} com sucesso!`, type: 'success' });
      fetchData();
    } catch (err) {
      setMessage({ text: errMessage(err), type: 'error' });
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (user.id === profile?.id) {
      setMessage({ text: 'Você não pode excluir seu próprio perfil Master.', type: 'error' });
      return;
    }
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente o usuário ${user.full_name}? Esta ação não pode ser desfeita.`)) {
      return;
    }
    
    try {
      const { error } = await supabase.rpc('delete_user_master', { p_user_id: user.id });
      if (error) throw error;
      setMessage({ text: 'Usuário excluído com sucesso!', type: 'success' });
      fetchData();
    } catch (err) {
      setMessage({ text: errMessage(err), type: 'error' });
    }
  };

  const handleAllocateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !allocateClinicId) return;
    
    try {
      const { error } = await supabase.rpc('allocate_user_to_clinic', {
        p_user_id: selectedUser.id,
        p_clinic_id: allocateClinicId,
        p_role: allocateRole
      });

      if (error) throw error;

      setMessage({ text: 'Usuário alocado à clínica com sucesso!', type: 'success' });
      setIsAllocateModalOpen(false);
      setAllocateClinicId('');
      setAllocateRole('nutritionist');
      fetchData();
    } catch (err) {
      setMessage({ text: errMessage(err), type: 'error' });
    }
  };

  const handleSubUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClinic) return;
    try {
      const { error } = await supabase
        .from('clinics')
        .update({ 
          subscription_status: subStatus,
          subscription_end_date: subDate ? new Date(subDate).toISOString() : null
        })
        .eq('id', selectedClinic.id);
        
      if (error) throw error;
      
      setMessage({ text: 'Assinatura atualizada!', type: 'success' });
      setIsSubModalOpen(false);
      fetchData();
    } catch (err) {
      setMessage({ text: errMessage(err), type: 'error' });
    }
  };

  if (!profile?.is_superadmin) {
    return <div className="p-8 text-center text-red-600">Acesso Restrito. Você não tem permissão para visualizar esta página.</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary-600" />
          Painel Master
        </h1>
        <p className="text-sm text-slate-500 mt-1">Gerencie usuários, acessos e assinaturas da plataforma.</p>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl ${message.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'} border`}>
          {message.text}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-800">Usuários Registrados</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-slate-900">Nome / CRN</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Perfil</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Clínica</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Cadastro</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Status</th>
                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-slate-900">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Carregando...</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.id}>
                    <td className="whitespace-nowrap py-4 pl-6 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-500">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            u.full_name?.substring(0, 2).toUpperCase() || 'US'
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{u.full_name}</div>
                          <div className="text-sm text-slate-500">{u.crn || 'Sem CRN'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                      {(() => {
                        if (u.is_superadmin) return 'Master';
                        const role = u.clinic_members?.[0]?.role;
                        if (role === 'owner') return 'Nutricionista (Titular)';
                        if (role === 'nutritionist') return 'Nutricionista';
                        if (role === 'secretary') return 'Secretária';
                        if (u.patients && u.patients.length > 0) return 'Paciente';
                        return 'Usuário';
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                      {u.clinic_members?.[0]?.clinics?.name || u.patients?.[0]?.clinics?.name || 'Sem Clínica'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                      {new Date(u.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        u.is_active ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-red-50 text-red-700 ring-red-600/20'
                      }`}>
                        {u.is_active ? 'Ativo' : 'Bloqueado'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3.5">
                        <button 
                          onClick={() => {
                            setSelectedUser(u);
                            setAllocateClinicId(u.clinic_members?.[0]?.clinic_id || '');
                            setAllocateRole(u.clinic_members?.[0]?.role || 'nutritionist');
                            setIsAllocateModalOpen(true);
                          }}
                          className="text-indigo-650 hover:text-indigo-900 flex items-center gap-1 font-semibold"
                          title="Alocar em uma Clínica"
                        >
                          <UserPlus className="h-4 w-4" /> Alocar
                        </button>
                        <button 
                          onClick={() => handleToggleStatus(u)}
                          className={`text-sm ${u.is_active ? 'text-amber-600 hover:text-amber-900' : 'text-green-600 hover:text-green-900'}`}
                        >
                          {u.is_active ? 'Bloquear' : 'Ativar'}
                        </button>
                        <button 
                          onClick={() => { setSelectedUser(u); setIsPasswordModalOpen(true); }}
                          className="text-primary-600 hover:text-primary-900 flex items-center gap-1"
                        >
                          <Key className="h-4 w-4" /> Senha
                        </button>
                        {u.id !== profile?.id && (
                          <button 
                            onClick={() => handleDeleteUser(u)}
                            className="text-red-650 hover:text-red-900 flex items-center gap-1 font-semibold"
                            title="Remover Usuário"
                          >
                            <Trash2 className="h-4 w-4" /> Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clinics Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-800">Clínicas e Assinaturas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-slate-900">Clínica</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Dono</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Status</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Fim (Over)</th>
                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-slate-900">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">Carregando...</td></tr>
              ) : (
                clinics.map(c => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap py-4 pl-6 pr-3 font-medium text-slate-900">{c.name}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">{c.owner?.full_name}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        (c.subscription_status || 'trial') === 'active' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                        (c.subscription_status || 'trial') === 'trial' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                        'bg-red-50 text-red-700 ring-red-600/20'
                      }`}>
                        {(c.subscription_status || 'trial').toUpperCase()}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                      {(() => {
                        const status = c.subscription_status || 'trial';
                        if (status === 'trial') {
                          const createdAt = new Date(c.created_at);
                          const expiresAt = new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000);
                          return expiresAt.toLocaleDateString('pt-BR');
                        }
                        if (status === 'active') {
                          return c.subscription_end_date ? new Date(c.subscription_end_date).toLocaleDateString('pt-BR') : 'Ilimitado';
                        }
                        return 'N/A';
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm font-medium">
                      <button 
                        onClick={() => {
                          setSelectedClinic(c);
                          setSubStatus(c.subscription_status || 'trial');
                          setSubDate(c.subscription_end_date ? new Date(c.subscription_end_date).toISOString().split('T')[0] : '');
                          setIsSubModalOpen(true);
                        }}
                        className="text-primary-600 hover:text-primary-900 flex items-center justify-end gap-1"
                      >
                        <Calendar className="h-4 w-4" /> Gerenciar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Alterar Senha - {selectedUser?.full_name}</h3>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nova Senha</label>
                <input
                  type="password"
                  required
                  pattern="^(?=.*[A-Z])(?=.*\d).{8,}$"
                  title="Mínimo 8 caracteres, 1 maiúscula e 1 número."
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsPasswordModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700">Salvar Nova Senha</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      {isSubModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Gerenciar Assinatura - {selectedClinic?.name}</h3>
            <form onSubmit={handleSubUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={subStatus}
                  onChange={e => setSubStatus(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                >
                  <option value="trial">Trial (Usa data de criação)</option>
                  <option value="active">Ativo (Ilimitado ou até Data Fim)</option>
                  <option value="inactive">Inativo (Bloqueado)</option>
                </select>
              </div>
              {subStatus === 'active' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Data Fim (Deixe vazio para ilimitado)</label>
                  <input
                    type="date"
                    value={subDate}
                    onChange={e => setSubDate(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsSubModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 flex items-center gap-2"><Save className="w-4 h-4" /> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Allocation Modal */}
      {isAllocateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-200 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Alocar Usuário à Clínica</h3>
            <p className="text-xs text-slate-500 mb-4">Usuário: <span className="font-semibold text-slate-700">{selectedUser?.full_name}</span></p>
            <form onSubmit={handleAllocateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Selecione a Clínica</label>
                <select
                  required
                  value={allocateClinicId}
                  onChange={e => setAllocateClinicId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-sm focus:ring-primary-500 focus:border-primary-500 focus:outline-none"
                >
                  <option value="" disabled>Selecione uma clínica...</option>
                  {clinics.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.owner?.full_name || 'Sem proprietário'})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Função / Papel na Clínica</label>
                <select
                  required
                  value={allocateRole}
                  onChange={e => setAllocateRole(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-sm focus:ring-primary-500 focus:border-primary-500 focus:outline-none"
                >
                  <option value="owner">Proprietário (Titular)</option>
                  <option value="nutritionist">Nutricionista</option>
                  <option value="secretary">Secretária(o)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsAllocateModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer">Cancelar</button>
                <button type="submit" className="px-5 py-2 text-sm font-bold text-white bg-primary-600 rounded-xl hover:bg-primary-700 flex items-center gap-1.5 cursor-pointer"><Save className="w-4 h-4" /> Alocar Usuário</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
