import React, { useState } from 'react';
import { CheckCircle, Circle, Lock, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useReminders, ymd } from '../../hooks/queries/useDashboard';
import { useReminderMutations } from '../../hooks/mutations/useReminderMutations';
import { cn } from '../../lib/cn';
import { Button, Card, DateInput, EmptyState } from '../ui';
import { ListSkeleton, LoadError, SectionTitle } from './dashboardUi';

/** `YYYY-MM-DD` → `dd/mm/aaaa`, sem passar por `Date` (evita deslocar o dia pelo fuso). */
const formatYmd = (v: string) => v.slice(0, 10).split('-').reverse().join('/');

export const RemindersCard: React.FC = () => {
  const { isReadOnly, clinic, profile } = useAuth();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const query = useReminders(clinic?.id);
  const reminders = query.data ?? [];
  const { add, toggle, remove } = useReminderMutations();
  const today = ymd(new Date());
  const pending = reminders.filter((r) => !r.is_completed).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text || !date || !clinic || !profile) return;
    try {
      await add.mutateAsync({ clinicId: clinic.id, userId: profile.id, description: text, dueDate: date });
      setText('');
      setDate('');
    } catch {
      showToast('Não foi possível salvar o lembrete.', 'error');
    }
  };

  return (
    <Card as="section" aria-labelledby="reminders-title" className="flex max-h-[520px] flex-col">
      <SectionTitle
        id="reminders-title"
        title="Lembretes"
        hint={query.isPending ? 'Carregando…' : pending === 0 ? 'Nenhum pendente' : `${pending} ${pending === 1 ? 'pendente' : 'pendentes'} · concluídos do mês abaixo`}
        action={isReadOnly ? (
          <span className="flex items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50/50 px-2.5 py-1 text-xs font-medium text-rose-700">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Somente leitura
          </span>
        ) : undefined}
      />

      {!isReadOnly && (
        <form onSubmit={submit} className="mb-4 flex shrink-0 flex-wrap gap-2.5 sm:flex-nowrap">
          <input
            type="text"
            placeholder="O que você precisa lembrar?"
            aria-label="Descrição do lembrete"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-w-0 flex-1 basis-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-normal shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:basis-auto"
            required
          />
          <DateInput value={date} onChange={setDate} wrapperClassName="flex-1 sm:flex-none sm:w-40" className="rounded-xl border-slate-300 py-2.5" required />
          <Button type="submit" size="icon" aria-label="Adicionar lembrete" loading={add.isPending} className="shrink-0">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Button>
        </form>
      )}

      <div className="custom-scrollbar scrollbar-thin flex-1 overflow-y-auto pr-1.5">
        {query.isPending ? (
          <ListSkeleton rows={2} />
        ) : query.isError ? (
          <LoadError message="Não foi possível carregar os lembretes." onRetry={() => query.refetch()} />
        ) : reminders.length === 0 ? (
          <EmptyState size="sm" title="Nenhum lembrete." description="Anote aqui o que não pode esquecer: retornos, ligações, compras." />
        ) : (
          <ul className="space-y-2.5">
            {reminders.map((r) => {
              const overdue = !r.is_completed && r.due_date < today;
              const dueToday = !r.is_completed && r.due_date === today;
              return (
                <li key={r.id} className={cn('flex items-start gap-3.5 rounded-2xl border border-slate-200 p-3.5', r.is_completed ? 'bg-slate-50' : 'bg-white')}>
                  <button
                    type="button"
                    onClick={() => toggle.mutate({ id: r.id, isCompleted: r.is_completed }, { onError: () => showToast('Não foi possível atualizar o lembrete.', 'error') })}
                    disabled={isReadOnly}
                    aria-pressed={r.is_completed}
                    aria-label={r.is_completed ? `Reabrir lembrete: ${r.description}` : `Concluir lembrete: ${r.description}`}
                    className={cn('mt-0.5 shrink-0 rounded-full', isReadOnly ? 'cursor-default opacity-60' : 'cursor-pointer')}
                  >
                    {r.is_completed
                      ? <CheckCircle className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                      : <Circle className="h-5 w-5 text-slate-400 transition-colors hover:text-slate-600" aria-hidden="true" />}
                  </button>
                  <div className={cn('min-w-0 flex-1', r.is_completed && 'line-through opacity-50')}>
                    <p className="truncate text-sm font-medium leading-snug text-slate-900">{r.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <span className={overdue ? 'font-medium text-rose-700' : dueToday ? 'font-medium text-amber-700' : undefined}>
                        {overdue ? 'Atrasado · ' : dueToday ? 'Hoje · ' : 'Para '}{formatYmd(r.due_date)}
                      </span>
                      {r.profiles?.full_name && ` · Por ${r.profiles.full_name}`}
                    </p>
                  </div>
                  {!isReadOnly && (
                    deletingId === r.id ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          loading={remove.isPending}
                          onClick={() => remove.mutate(r.id, {
                            onSuccess: () => setDeletingId(null),
                            onError: () => showToast('Não foi possível excluir o lembrete.', 'error'),
                          })}
                        >
                          Excluir
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setDeletingId(null)}>Cancelar</Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeletingId(r.id)}
                        aria-label={`Excluir lembrete: ${r.description}`}
                        className="shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
};
