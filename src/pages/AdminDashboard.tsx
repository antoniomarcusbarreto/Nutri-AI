import React, { useState, useEffect } from 'react';
import { Shield, Key, CheckCircle2, XCircle, Calendar, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const AdminDashboard: React.FC = () => {
  const { profile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [clinics, setClinics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<any>(null);
  const [subStatus, setSubStatus] = useState('trial');
  const [subDate, setSubDate] = useState('');

  const [message, setMessage] = useState({ text: '', type: '' });

  const fetchData = async () => {
    setLoading(true);
    const [usersRes, clinicsRes] = await Promise.all([
      supabase.from('profiles').select('*, clinic_members(role, clinics(name))').order('created_at', { ascending: false }),
      supabase.from('clinics').select('*, owner:profiles(full_name)').order('created_at', { ascending: false })
    ]);
    
    if (usersRes.data) setUsers(usersRes.data);
    if (clinicsRes.data) setClinics(clinicsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.is_superadmin) {
      fetchData();
    }
  }, [profile]);

  const callAdminAction = async (action: string, payload: any) => {
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
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erro na requisição');
    return result;
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await callAdminAction('change_password', { targetUserId: selectedUser.id, newPassword });
      setMessage({ text: 'Senha alterada com sucesso!', type: 'success' });
      setIsPasswordModalOpen(false);
      setNewPassword('');
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleToggleStatus = async (user: any) => {
    try {
      const newStatus = !user.is_active;
      await callAdminAction('toggle_status', { targetUserId: user.id, isActive: newStatus });
      setMessage({ text: `Usuário ${newStatus ? 'ativado' : 'desativado'} com sucesso!`, type: 'success' });
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleSubUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
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
                        return 'Usuário';
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                      {u.clinic_members?.[0]?.clinics?.name || 'Sem Clínica'}
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
                      <div className="flex items-center justify-end gap-3">
                        <button 
                          onClick={() => handleToggleStatus(u)}
                          className={`text-sm ${u.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                        >
                          {u.is_active ? 'Bloquear' : 'Desbloquear'}
                        </button>
                        <button 
                          onClick={() => { setSelectedUser(u); setIsPasswordModalOpen(true); }}
                          className="text-primary-600 hover:text-primary-900 flex items-center gap-1"
                        >
                          <Key className="h-4 w-4" /> Senha
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
    </div>
  );
};
