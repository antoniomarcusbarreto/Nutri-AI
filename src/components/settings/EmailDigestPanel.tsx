import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../lib/logger';
import { cn } from '../../lib/cn';
import { Button, Card, FormActions, Select } from '../ui';
import {
  DEFAULT_DIGEST_SETTINGS,
  useEmailDigestSettings,
  useSaveEmailDigestSettings,
  useSendDigestPreview,
  type EmailDigestSettings,
} from '../../hooks/queries/useEmailDigest';

const WEEKDAYS = [
  { value: 1, short: 'Seg', label: 'Segunda-feira' },
  { value: 2, short: 'Ter', label: 'Terça-feira' },
  { value: 3, short: 'Qua', label: 'Quarta-feira' },
  { value: 4, short: 'Qui', label: 'Quinta-feira' },
  { value: 5, short: 'Sex', label: 'Sexta-feira' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 0, short: 'Dom', label: 'Domingo' },
];

const TIMES = Array.from({ length: 36 }, (_, i) => {
  const minutes = 5 * 60 + i * 30; // 05:00 … 22:30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`;
});

const same = (a: EmailDigestSettings, b: EmailDigestSettings) =>
  a.enabled === b.enabled && a.sendTime === b.sendTime && a.weeklyEnabled === b.weeklyEnabled &&
  [...a.weekdays].sort().join() === [...b.weekdays].sort().join();

/**
 * Resumo diário/semanal por e-mail (migration 0041 + edge function email-digest).
 * Preferência pessoal: cada membro da equipe liga o seu. A secretária recebe a
 * versão sem dados clínicos.
 */
export const EmailDigestPanel: React.FC = () => {
  const { user } = useAuth();
  const { data: saved, isLoading } = useEmailDigestSettings(user?.id);
  // A key recria o formulário quando o salvo muda (sem setState em efeito).
  return <DigestForm key={saved ? JSON.stringify(saved) : 'loading'} saved={saved} isLoading={isLoading} />;
};

const DigestForm: React.FC<{ saved: EmailDigestSettings | undefined; isLoading: boolean }> = ({ saved, isLoading }) => {
  const { user, userRole } = useAuth();
  const { showToast } = useToast();
  const save = useSaveEmailDigestSettings(user?.id);
  const preview = useSendDigestPreview();
  const [form, setForm] = useState<EmailDigestSettings>(saved ?? DEFAULT_DIGEST_SETTINGS);

  const dirty = !!saved && !same(form, saved);
  const isSecretary = userRole === 'secretary';

  const toggleDay = (day: number) =>
    setForm((f) => ({ ...f, weekdays: f.weekdays.includes(day) ? f.weekdays.filter((d) => d !== day) : [...f.weekdays, day] }));

  const onSave = async () => {
    try {
      await save.mutateAsync(form);
      showToast(form.enabled ? 'Resumo por e-mail ativado.' : 'Resumo por e-mail desativado.', 'success');
    } catch (err) {
      logger.error(err);
      showToast('Não foi possível salvar o resumo por e-mail.', 'error');
    }
  };

  const onPreview = async (kind: 'daily' | 'weekly') => {
    try {
      const email = await preview.mutateAsync(kind);
      showToast(`Exemplo enviado${email ? ` para ${email}` : ''}. Confira também o lixo eletrônico.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível enviar o exemplo.', 'error');
    }
  };

  const off = !form.enabled;

  return (
    <Card as="section" padding="none" radius="2xl" className="overflow-hidden shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <div className="p-6 border-b border-slate-100">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Mail className="h-5 w-5 text-primary-600" aria-hidden="true" /> Resumo por e-mail
        </h2>
        <p className="text-sm text-slate-500">
          {isSecretary
            ? 'Receba de manhã a agenda dos nutricionistas, as consultas sem confirmação, os pedidos do portal e as cobranças do dia.'
            : 'Receba de manhã sua agenda, as consultas sem confirmação, os pedidos do portal, as cobranças e os pacientes que pedem atenção.'}
        </p>
      </div>
      <div className="p-6 space-y-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600"
            checked={form.enabled}
            disabled={isLoading}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Receber resumos por e-mail</span>
            <span className="block text-sm text-slate-500">Enviado para o e-mail de login da sua conta.</span>
          </span>
        </label>

        <fieldset disabled={off} className={cn('space-y-5', off && 'opacity-50')}>
          <div>
            <legend className="text-sm font-semibold text-slate-800">Resumo diário</legend>
            <p className="text-sm text-slate-500">Em quais dias você quer receber.</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Dias do resumo diário">
              {WEEKDAYS.map((d) => {
                const on = form.weekdays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={on}
                    aria-label={d.label}
                    onClick={() => toggleDay(d.value)}
                    className={cn(
                      'min-w-[3.25rem] rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      on ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                    )}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <Select
            wrapperClassName="sm:max-w-xs"
            label="Horário de envio"
            value={form.sendTime}
            onChange={(e) => setForm((f) => ({ ...f, sendTime: e.target.value }))}
          >
            {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600"
              checked={form.weeklyEnabled}
              onChange={(e) => setForm((f) => ({ ...f, weeklyEnabled: e.target.checked }))}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Resumo da semana na segunda-feira</span>
              <span className="block text-sm text-slate-500">
                Substitui o diário da segunda: agenda da semana inteira e como foi a semana passada. Chega no mesmo horário, mesmo que a segunda não esteja marcada acima.
              </span>
            </span>
          </label>
        </fieldset>

        <FormActions>
          <Button type="button" variant="ghost" onClick={() => onPreview('daily')} disabled={preview.isPending}>
            Enviar exemplo do diário
          </Button>
          <Button type="button" variant="ghost" onClick={() => onPreview('weekly')} disabled={preview.isPending}>
            Enviar exemplo do semanal
          </Button>
          <Button type="button" onClick={onSave} disabled={save.isPending || !dirty}>Salvar resumo</Button>
        </FormActions>
      </div>
    </Card>
  );
};
