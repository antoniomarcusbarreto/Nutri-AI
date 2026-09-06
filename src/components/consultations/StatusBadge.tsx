import React from 'react';
import { CheckCircle2, Check, X, AlertCircle } from 'lucide-react';

/** Badge de status de agendamento (Onda 5.3 — antes `getStatusBadge` inline). */
export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'concluido':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-100 shadow-sm">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Concluído
        </span>
      );
    case 'confirmado':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-100 shadow-sm">
          <Check className="w-3 h-3 text-blue-500" /> Confirmado
        </span>
      );
    case 'cancelado':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-100 shadow-sm">
          <X className="w-3 h-3 text-rose-500" /> Cancelado
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-100 shadow-sm">
          <AlertCircle className="w-3 h-3 text-amber-500" /> Pendente
        </span>
      );
  }
};
