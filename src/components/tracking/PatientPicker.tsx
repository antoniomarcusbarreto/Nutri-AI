import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { PatientRow } from '../../types/clinical';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface PatientPickerProps {
  patients: PatientRow[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
}

/**
 * Combobox de paciente com busca (ignora acentos). Lista ativos primeiro e
 * também os inativos — antes o `<select>` só mostrava ativos, deixando o
 * histórico de quem teve alta inacessível.
 */
export const PatientPicker: React.FC<PatientPickerProps> = ({ patients, value, onChange, loading }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = patients.find((p) => p.id === value);

  const options = useMemo(() => {
    const q = normalize(query.trim());
    return patients
      .filter((p) => !q || normalize(p.name).includes(q))
      .sort((a, b) => Number(a.status !== 'ativo') - Number(b.status !== 'ativo') || a.name.localeCompare(b.name, 'pt-BR'));
  }, [patients, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openPicker = () => {
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[activeIndex]) choose(options[activeIndex].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full sm:w-72">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm hover:border-slate-300 cursor-pointer disabled:cursor-wait disabled:opacity-60"
      >
        <span className="truncate">
          {loading ? 'Carregando pacientes…' : selected ? selected.name : 'Selecionar paciente'}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-full min-w-[18rem] rounded-2xl border border-slate-200 bg-white bg-white-pure p-2 shadow-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-label="Buscar paciente"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={options[activeIndex] ? `${listId}-${options[activeIndex].id}` : undefined}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
              onKeyDown={onKeyDown}
              placeholder="Buscar pelo nome…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 focus:border-[#5024fc]"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Pacientes" className="mt-2 max-h-72 overflow-y-auto">
            {options.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Nenhum paciente encontrado</li>}
            {options.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${p.id}`}
                role="option"
                aria-selected={p.id === value}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(p.id); }}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
                  i === activeIndex ? 'bg-slate-100' : '',
                  p.id === value ? 'font-medium text-[#5024fc]' : 'text-slate-800',
                )}
              >
                <span className="truncate">{p.name}</span>
                {p.status !== 'ativo' && <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">Inativo</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
