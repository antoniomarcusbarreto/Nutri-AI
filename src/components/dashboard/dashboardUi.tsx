import React from 'react';
import { RotateCw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../ui';
import { APPOINTMENT_STATUS } from './dashboardFormat';

export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const s = APPOINTMENT_STATUS[status] ?? { label: status, className: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', s.className)}>
      {s.label}
    </span>
  );
};

export const SectionTitle: React.FC<{ id: string; title: string; hint?: React.ReactNode; action?: React.ReactNode }> = ({ id, title, hint, action }) => (
  <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 id={id} className="text-lg font-semibold text-slate-900">{title}</h2>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
    {action}
  </div>
);

export const LoadError: React.FC<{ message: string; onRetry: () => void; className?: string }> = ({ message, onRetry, className }) => (
  <div role="alert" className={cn('flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50/50 px-4 py-3 text-sm text-rose-700', className)}>
    {message}
    <Button variant="secondary" size="sm" leftIcon={<RotateCw className="h-3.5 w-3.5" aria-hidden="true" />} onClick={onRetry}>
      Tentar novamente
    </Button>
  </div>
);

export const ListSkeleton: React.FC<{ rows?: number; height?: string }> = ({ rows = 3, height = 'h-16' }) => (
  <div className="space-y-2.5" aria-hidden="true">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className={cn('rounded-2xl bg-slate-200/70 animate-pulse', height)} />
    ))}
  </div>
);
