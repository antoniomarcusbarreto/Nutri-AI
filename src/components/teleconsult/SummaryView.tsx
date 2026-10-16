import React from 'react';
import type { TeleconsultSummary } from '../../lib/teleconsult';
import { HABIT_LABELS, LIST_SECTIONS } from './summaryModel';

/** Resumo salvo da teleconsulta, só leitura (aba Teleconsultas). */
export const SummaryView: React.FC<{ summary: TeleconsultSummary }> = ({ summary }) => {
  const habits = HABIT_LABELS.filter((h) => summary.habitos?.[h.key]);
  const lists = LIST_SECTIONS.filter((s) => (summary[s.key] ?? []).length > 0);

  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-700">
      {summary.resumo_geral && <p>{summary.resumo_geral}</p>}
      <dl className="grid gap-4 sm:grid-cols-2">
        {lists.slice(0, 1).map((s) => <ListBlock key={s.key} label={s.label} items={summary[s.key]} />)}
        {habits.length > 0 && (
          <div>
            <dt className="font-semibold text-slate-900">Hábitos</dt>
            <dd className="mt-1 space-y-1">
              {habits.map((h) => (
                <p key={h.key}><span className="text-slate-500">{h.label}:</span> {summary.habitos[h.key]}</p>
              ))}
            </dd>
          </div>
        )}
        {lists.slice(1, 3).map((s) => <ListBlock key={s.key} label={s.label} items={summary[s.key]} />)}
        {summary.metas?.length > 0 && (
          <div>
            <dt className="font-semibold text-slate-900">Metas</dt>
            <dd>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {summary.metas.map((m, i) => (
                  <li key={i}>{m.descricao}{m.prazo ? <span className="text-slate-500"> — {m.prazo}</span> : null}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {lists.slice(3).map((s) => <ListBlock key={s.key} label={s.label} items={summary[s.key]} />)}
      </dl>
    </div>
  );
};

const ListBlock: React.FC<{ label: string; items: string[] }> = ({ label, items }) => (
  <div>
    <dt className="font-semibold text-slate-900">{label}</dt>
    <dd>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </dd>
  </div>
);
