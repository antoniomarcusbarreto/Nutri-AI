import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Link2, Pencil } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Card, Input } from '../ui';
import { useLeadForm, useSaveLeadForm } from '../../hooks/queries/useLeads';
import { copyText } from '../dashboard/dashboardFormat';
import { isValidSlug, slugify } from '../../lib/leads';

/**
 * Link público de triagem do nutricionista (/n/<slug>). É o que vai na bio do
 * Instagram, nos stories e no WhatsApp.
 */
export const LeadLinkCard: React.FC = () => {
  const { user, clinic, profile } = useAuth();
  const { showToast } = useToast();
  const form = useLeadForm(user?.id);
  const save = useSaveLeadForm(user?.id, clinic?.id);
  // null = sem edição em andamento.
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const current = form.data;
  const url = current ? `${window.location.origin}/n/${current.slug}` : '';
  const slug = draft ?? current?.slug ?? slugify(profile?.full_name ?? '');
  const slugError = slug && !isValidSlug(slug) ? 'Use de 3 a 40 letras minúsculas, números e hífen.' : undefined;

  const onSave = async (enabled: boolean, nextSlug: string) => {
    try {
      await save.mutateAsync({ slug: nextSlug, enabled });
      setDraft(null);
      if (!current) showToast('Link criado. Coloque na bio e nos stories.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível salvar o link.', 'error');
    }
  };

  const onCopy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      showToast('Não foi possível copiar. Selecione o link e copie manualmente.', 'error');
    }
  };

  if (form.isPending) return <Card padding="sm" radius="2xl"><div className="h-14 animate-pulse rounded-xl bg-slate-100" /></Card>;

  const showEditor = draft !== null || !current;

  return (
    <Card as="section" padding="sm" radius="2xl" aria-labelledby="lead-link-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 id="lead-link-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Link2 className="h-4 w-4 text-primary-600" aria-hidden="true" /> Seu link de triagem
          </h2>
          {!current ? (
            <p className="mt-1 text-sm text-slate-500">
              Quem se interessar pelo seu trabalho preenche um formulário curto e o pedido chega aqui, já organizado pela IA.
            </p>
          ) : !showEditor ? (
            <p className="mt-1 truncate text-sm">
              <a href={url} target="_blank" rel="noreferrer" className={current.enabled ? 'text-[#5024fc] hover:underline' : 'text-slate-400 line-through'}>
                {url}
              </a>
            </p>
          ) : null}
          {current && !showEditor && (
            <p className="mt-1 text-xs text-slate-500">
              Dica: para saber de qual post veio cada pedido, acrescente <code className="rounded bg-slate-100 px-1">?origem=nome-do-post</code> ao link.
            </p>
          )}
        </div>

        {showEditor ? (
          <form
            className="flex w-full flex-col gap-2 sm:flex-row sm:items-start lg:max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              if (slug && !slugError) onSave(current?.enabled ?? true, slug);
            }}
          >
            <Input
              aria-label="Endereço do link"
              wrapperClassName="flex-1"
              value={slug}
              onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              error={slugError}
              hint={slugError ? undefined : `${window.location.host}/n/${slug || '…'}`}
            />
            <div className="flex gap-2">
              {current && <Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button>}
              <Button type="submit" loading={save.isPending} disabled={!slug || !!slugError}>
                {current ? 'Salvar' : 'Criar meu link'}
              </Button>
            </div>
          </form>
        ) : current && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onCopy} leftIcon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Ver formulário
            </a>
            <Button variant="ghost" size="sm" onClick={() => setDraft(current.slug)} leftIcon={<Pencil className="h-3.5 w-3.5" />}>Endereço</Button>
            <label className="ml-1 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-primary-600"
                checked={current.enabled}
                disabled={save.isPending}
                onChange={(e) => onSave(e.target.checked, current.slug)}
              />
              {current.enabled ? 'Recebendo pedidos' : 'Pausado'}
            </label>
          </div>
        )}
      </div>
    </Card>
  );
};
