import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { KeyRound, ArrowRightLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAccessGrants, useAccessGrantMutations } from '../../hooks/queries/useAccessGrants';
import { Button, Select, Textarea } from '../ui';

interface PanelUser {
  id: string;
  full_name?: string | null;
  is_active?: boolean | null;
  clinic_members?: { role?: string | null; clinic_id?: string | null }[] | null;
}
interface PanelClinic {
  id: string;
  name?: string | null;
}

interface ClinicPatientOption {
  patient_id: string;
  patient_name: string;
  nutritionist_id: string;
  nutritionist_name: string;
}

const errMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return 'Erro inesperado';
};

const VALIDITY = [
  { value: 'none', label: 'Sem prazo' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
];

/**
 * Painel Master › Acessos entre nutricionistas (migration 0029).
 *
 * O Master concede acesso aos pacientes de um nutricionista a outro da mesma
 * clínica, encerra acessos e transfere pacientes (ex.: quando alguém sai da
 * clínica). Ele vê só nome do paciente e responsável — nunca dado clínico.
 */
export const MasterAccessPanel: React.FC<{
  users: PanelUser[];
  clinics: PanelClinic[];
  onMessage: (text: string, type: 'success' | 'error') => void;
}> = ({ users, clinics, onMessage }) => {
  const [clinicId, setClinicId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [granteeId, setGranteeId] = useState('');
  const [patientId, setPatientId] = useState('');
  const [validity, setValidity] = useState('none');
  const [reason, setReason] = useState('');
  const [transferPatientId, setTransferPatientId] = useState('');
  const [transferTo, setTransferTo] = useState('');

  const { masterGrant, masterReassign, revoke } = useAccessGrantMutations();
  const { data: grants = [] } = useAccessGrants();

  const { data: clinicPatients = [], refetch: refetchClinicPatients } = useQuery({
    queryKey: ['admin', 'clinic-patients', clinicId],
    enabled: !!clinicId,
    queryFn: async (): Promise<ClinicPatientOption[]> => {
      const { data, error } = await supabase.rpc('admin_list_clinic_patients', { p_clinic_id: clinicId });
      if (error) throw error;
      return (data ?? []) as ClinicPatientOption[];
    },
  });

  const professionals = useMemo(
    () =>
      users
        .filter((u) => u.is_active !== false)
        .filter((u) => (u.clinic_members ?? []).some(
          (m) => m.clinic_id === clinicId && (m.role === 'owner' || m.role === 'nutritionist'),
        ))
        .map((u) => ({ id: u.id, name: u.full_name || 'Sem nome' })),
    [users, clinicId],
  );
  const clinicGrants = grants.filter((g) => g.clinic_id === clinicId && (g.status === 'approved' || g.status === 'pending'));
  const ownerPatients = clinicPatients.filter((p) => p.nutritionist_id === ownerId);
  const transferPatient = clinicPatients.find((p) => p.patient_id === transferPatientId);

  const resetClinic = (id: string) => {
    setClinicId(id);
    setOwnerId(''); setGranteeId(''); setPatientId(''); setTransferPatientId(''); setTransferTo('');
  };

  const handleGrant = (e: React.FormEvent) => {
    e.preventDefault();
    masterGrant.mutate(
      {
        ownerId,
        granteeId,
        patientId: patientId || null,
        expiresAt: validity === 'none' ? null : addDays(new Date(), Number(validity)).toISOString(),
        reason,
      },
      {
        onSuccess: () => { onMessage('Acesso concedido.', 'success'); setPatientId(''); setReason(''); },
        onError: (err) => onMessage(errMessage(err), 'error'),
      },
    );
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    masterReassign.mutate(
      { patientId: transferPatientId, newNutritionistId: transferTo },
      {
        onSuccess: () => {
          onMessage('Paciente transferido. Acessos concedidos pelo responsável anterior deixam de valer para ele.', 'success');
          setTransferPatientId(''); setTransferTo('');
          void refetchClinicPatients();
        },
        onError: (err) => onMessage(errMessage(err), 'error'),
      },
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50/50">
        <h2 className="text-lg font-semibold text-slate-800">Acessos entre nutricionistas</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Cada nutricionista vê só os próprios pacientes. Conceda acesso, encerre ou transfira — sem ver dados clínicos.
        </p>
      </div>

      <div className="p-6 space-y-8">
        <Select label="Clínica" value={clinicId} onChange={(e) => resetClinic(e.target.value)} wrapperClassName="max-w-md">
          <option value="">Selecione…</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name || 'Sem nome'}</option>)}
        </Select>

        {clinicId && professionals.length < 2 && (
          <p className="text-sm text-slate-500">Esta clínica tem menos de dois nutricionistas ativos — não há o que compartilhar.</p>
        )}

        {clinicId && professionals.length >= 2 && (
          <>
            <form onSubmit={handleGrant} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <h3 className="md:col-span-2 text-sm font-semibold text-slate-700 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-slate-400" /> Conceder acesso
              </h3>
              <Select label="Pacientes de" required value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setPatientId(''); }}>
                <option value="">Selecione…</option>
                {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Select label="Para" required value={granteeId} onChange={(e) => setGranteeId(e.target.value)}>
                <option value="">Selecione…</option>
                {professionals.filter((p) => p.id !== ownerId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Select label="Escopo" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                <option value="">Todos os pacientes</option>
                {ownerPatients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_name}</option>)}
              </Select>
              <Select label="Validade" value={validity} onChange={(e) => setValidity(e.target.value)}>
                {VALIDITY.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </Select>
              <Textarea label="Motivo" rows={2} wrapperClassName="md:col-span-2" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={!ownerId || !granteeId} loading={masterGrant.isPending}>Conceder</Button>
              </div>
            </form>

            {clinicGrants.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Acessos ativos e pedidos pendentes</h3>
                <ul className="mt-2 divide-y divide-slate-100">
                  {clinicGrants.map((g) => (
                    <li key={g.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-slate-900">
                          {g.grantee_name} → pacientes de {g.owner_name}
                          {g.status === 'pending' && <span className="ml-2 text-xs text-amber-700">(aguardando)</span>}
                        </p>
                        <p className="text-slate-500">
                          {g.patient_id ? g.patient_name ?? 'Paciente específico' : 'Todos os pacientes'}
                          {g.expires_at ? ` · até ${format(parseISO(g.expires_at), 'dd/MM/yyyy')}` : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(g.id, {
                          onSuccess: () => onMessage('Acesso encerrado.', 'success'),
                          onError: (err) => onMessage(errMessage(err), 'error'),
                        })}
                      >
                        Encerrar
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleTransfer} className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-6">
              <h3 className="md:col-span-2 text-sm font-semibold text-slate-700 flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-slate-400" /> Transferir paciente
              </h3>
              <Select label="Paciente" required value={transferPatientId} onChange={(e) => { setTransferPatientId(e.target.value); setTransferTo(''); }}>
                <option value="">Selecione…</option>
                {clinicPatients.map((p) => (
                  <option key={p.patient_id} value={p.patient_id}>{p.patient_name} — {p.nutritionist_name}</option>
                ))}
              </Select>
              <Select label="Novo responsável" required value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                <option value="">Selecione…</option>
                {professionals.filter((p) => p.id !== transferPatient?.nutritionist_id).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" variant="secondary" disabled={!transferPatientId || !transferTo} loading={masterReassign.isPending}>
                  Transferir
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
