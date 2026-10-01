import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isValid, parse,
  startOfMonth, startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { INPUT_BASE, FIELD_LABEL } from './Input';

/**
 * Campo de data sempre em dd/MM/aaaa, independente do idioma do navegador.
 *
 * O `<input type="date">` nativo exibe no formato do locale do browser/SO
 * (um Chrome em inglês mostra mm/dd/yyyy) e não há atributo que force isso.
 * Aqui o campo é texto com máscara + calendário próprio em pt-BR.
 *
 * Contrato igual ao nativo: `value` e `onChange` trafegam 'yyyy-MM-dd' (ou '').
 */
export interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Limites em 'yyyy-MM-dd' (inclusivos). */
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  wrapperClassName?: string;
}

const ISO = 'yyyy-MM-dd';
const BR = 'dd/MM/yyyy';
const POPOVER_H = 340;
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const parseISO = (s: string | undefined) => {
  if (!s) return null;
  const d = parse(s, ISO, new Date());
  return isValid(d) ? d : null;
};

const isoToBR = (s: string) => {
  const d = parseISO(s);
  return d ? format(d, BR) : '';
};

/** Aplica a máscara dd/mm/aaaa a qualquer coisa digitada/colada. */
const mask = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/** 'dd/MM/aaaa' completo e existente (rejeita 31/02) → Date; senão null. */
const parseBR = (s: string) => {
  if (s.length !== 10) return null;
  const d = parse(s, BR, new Date());
  return isValid(d) && format(d, BR) === s ? d : null;
};

export const DateInput: React.FC<DateInputProps> = ({
  value, onChange, label, hint, required, disabled, min, max, id, className, wrapperClassName,
}) => {
  const reactId = useId();
  const inputId = id ?? reactId;
  const msgId = `${inputId}-msg`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // `draft` só existe enquanto a pessoa digita algo ainda não confirmado.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => parseISO(value) ?? new Date());
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [dark, setDark] = useState(false);

  const minDate = parseISO(min);
  const maxDate = parseISO(max);
  const selected = parseISO(value);
  const outOfRange = (d: Date) =>
    (!!minDate && format(d, ISO) < format(minDate, ISO)) || (!!maxDate && format(d, ISO) > format(maxDate, ISO));

  // Validação nativa do form (o browser bloqueia o submit e mostra a mensagem).
  useEffect(() => {
    inputRef.current?.setCustomValidity(error ?? '');
  }, [error]);

  const commit = (text: string) => {
    if (text === '') {
      setError(null);
      setDraft(null);
      onChange('');
      return;
    }
    const d = parseBR(text);
    if (!d) {
      setError('Data inválida. Use dd/mm/aaaa.');
      return;
    }
    if (outOfRange(d)) {
      setError(
        minDate && maxDate ? `Escolha entre ${format(minDate, BR)} e ${format(maxDate, BR)}.`
          : minDate ? `A data não pode ser antes de ${format(minDate, BR)}.`
            : `A data não pode ser depois de ${format(maxDate!, BR)}.`,
      );
      return;
    }
    setError(null);
    setDraft(null);
    onChange(format(d, ISO));
  };

  const handleType = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = mask(e.target.value);
    setDraft(next);
    setError(null);
    if (next === '' || next.length === 10) commit(next);
  };

  const pick = (d: Date) => {
    setDraft(null);
    setError(null);
    onChange(format(d, ISO));
    setOpen(false);
    inputRef.current?.focus();
  };

  const toggle = () => {
    if (open) return setOpen(false);
    setMonth(selected ?? new Date());
    setDark(!!document.querySelector('.theme-dark'));
    setOpen(true);
  };

  // Posiciona o calendário (portal em fixed, para não ser cortado pelo scroll
  // do corpo do Modal) e o vira para cima quando falta espaço abaixo.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = wrapRef.current?.querySelector('input')?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const top = below < POPOVER_H && r.top > below ? r.top - POPOVER_H - 4 : r.bottom + 4;
      const left = Math.min(r.left, window.innerWidth - 296 - 8);
      setPos({ top, left: Math.max(8, left) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Fecha com clique fora e com Escape — este em captura na window para não
  // deixar o Escape chegar ao Modal (que fecharia o modal inteiro).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || wrapRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      inputRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const today = new Date();
  const message = error || hint;

  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label != null && (
        <label htmlFor={inputId} className={FIELD_LABEL}>
          {label}
          {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
        </label>
      )}
      <div ref={wrapRef} className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          maxLength={10}
          required={required}
          disabled={disabled}
          value={draft ?? isoToBR(value)}
          onChange={handleType}
          onBlur={() => { if (draft !== null) commit(draft); }}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? msgId : undefined}
          className={cn(INPUT_BASE, 'tabular-nums', className)}
          // inline: a camada global de `index.css` fixa o padding de inputs em
          // main/dialog e venceria um `pr-10` do Tailwind.
          style={{ paddingRight: '2.5rem' }}
        />
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-label="Abrir calendário"
          aria-expanded={open}
          // idem: `[role=dialog] form button[type=button]` pinta fundo/padding.
          style={{ background: 'transparent', padding: 0 }}
          className="date-input-trigger absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition-colors hover:text-[#5024fc] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>
      {message && (
        <p id={msgId} className={cn('mt-1 text-xs', error ? 'text-rose-600' : 'text-slate-500')}>
          {message}
        </p>
      )}

      {open && pos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Calendário"
          style={{ top: pos.top, left: pos.left }}
          className={cn(
            'date-input-popover fixed z-[60] w-[296px] rounded-xl border p-3 shadow-xl animate-in fade-in duration-100',
            dark ? 'border-[#383838] bg-[#242424] text-[#f5f5f5]' : 'border-slate-200 bg-white text-slate-700',
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setMonth(m => addMonths(m, -1))} aria-label="Mês anterior"
              className={cn('rounded-lg p-1.5', dark ? 'hover:bg-white/10' : 'hover:bg-slate-100')}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">
              {format(month, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^./, c => c.toUpperCase())}
            </span>
            <button type="button" onClick={() => setMonth(m => addMonths(m, 1))} aria-label="Próximo mês"
              className={cn('rounded-lg p-1.5', dark ? 'hover:bg-white/10' : 'hover:bg-slate-100')}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className={cn('grid grid-cols-7 text-center text-[11px] font-medium', dark ? 'text-slate-400' : 'text-slate-500')}>
            {WEEKDAYS.map((w, i) => <span key={i} className="py-1">{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map(d => {
              const isSel = !!selected && isSameDay(d, selected);
              const isOut = !isSameMonth(d, month);
              const blocked = outOfRange(d);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={blocked}
                  onClick={() => pick(d)}
                  aria-label={format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  aria-pressed={isSel}
                  className={cn(
                    'h-9 rounded-lg text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30',
                    isSel ? 'bg-[#5024fc] font-semibold text-white'
                      : dark ? 'hover:bg-white/10' : 'hover:bg-slate-100',
                    !isSel && isOut && (dark ? 'text-slate-500' : 'text-slate-400'),
                    !isSel && isSameDay(d, today) && 'font-semibold ring-1 ring-inset ring-[#5024fc]/50',
                  )}
                >
                  {format(d, 'd')}
                </button>
              );
            })}
          </div>
          <div className={cn('mt-2 flex justify-between border-t pt-2 text-xs font-medium', dark ? 'border-[#383838]' : 'border-slate-100')}>
            <button type="button" onClick={() => { setDraft(null); setError(null); onChange(''); setOpen(false); }}
              className="rounded-md px-2 py-1 text-slate-500 hover:text-rose-600">
              Limpar
            </button>
            <button type="button" disabled={outOfRange(today)} onClick={() => pick(today)}
              className="rounded-md px-2 py-1 text-[#5024fc] hover:underline disabled:opacity-40">
              Hoje
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
