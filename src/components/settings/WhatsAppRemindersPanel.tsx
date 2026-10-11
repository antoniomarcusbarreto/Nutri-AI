import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../lib/logger';
import { Button, Card, FormActions, Select } from '../ui';

/**
 * Lembrete automático de consulta pelo WhatsApp (migration 0038).
 * O envio é feito pelo número central da plataforma (n8n + Pulze), em nome da
 * clínica; o paciente confirma ou desmarca respondendo à mensagem.
 * Só o dono altera (RLS de clinics_update_owner).
 */
export const WhatsAppRemindersPanel: React.FC = () => {
  const { clinic, userRole, isReadOnly, updateClinic } = useAuth();
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(clinic?.whatsapp_reminders_enabled ?? false);
  const [hours, setHours] = useState(clinic?.whatsapp_reminder_hours ?? 24);
  const [saving, setSaving] = useState(false);

  const canEdit = userRole === 'owner' && !isReadOnly;
  const dirty = enabled !== (clinic?.whatsapp_reminders_enabled ?? false) || hours !== (clinic?.whatsapp_reminder_hours ?? 24);

  const save = async () => {
    setSaving(true);
    try {
      await updateClinic({ whatsapp_reminders_enabled: enabled, whatsapp_reminder_hours: hours });
      showToast(enabled ? 'Lembrete pelo WhatsApp ativado.' : 'Lembrete pelo WhatsApp desativado.', 'success');
    } catch (err) {
      logger.error(err);
      showToast('Não foi possível salvar o lembrete pelo WhatsApp.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="section" padding="none" radius="2xl" className="overflow-hidden shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <div className="p-6 border-b border-slate-100">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <MessageCircle className="h-5 w-5 text-primary-600" aria-hidden="true" /> Lembrete de consulta pelo WhatsApp
        </h2>
        <p className="text-sm text-slate-500">
          O paciente recebe um lembrete em nome da clínica e confirma ou desmarca respondendo à mensagem. A agenda é atualizada sozinha.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600"
            checked={enabled}
            disabled={!canEdit}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Enviar lembrete automático</span>
            <span className="block text-sm text-slate-500">
              Vai para consultas pendentes de pacientes com telefone cadastrado. Quem responder "SAIR" deixa de receber.
            </span>
          </span>
        </label>
        <Select
          wrapperClassName="sm:max-w-xs"
          label="Quando enviar"
          value={hours}
          disabled={!canEdit || !enabled}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          <option value={12}>12 horas antes</option>
          <option value={24}>24 horas antes</option>
          <option value={48}>48 horas antes</option>
        </Select>
        {!canEdit && userRole !== 'owner' && (
          <p className="text-sm text-slate-500">Só o responsável pela clínica pode alterar esta configuração.</p>
        )}
        {canEdit && (
          <FormActions>
            <Button type="button" onClick={save} disabled={saving || !dirty}>Salvar lembrete</Button>
          </FormActions>
        )}
      </div>
    </Card>
  );
};
