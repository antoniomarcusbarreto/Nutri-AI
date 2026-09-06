import React from 'react';
import { Stethoscope } from 'lucide-react';

/** Fallback de Suspense para as rotas carregadas sob demanda (PERF-01). */
export const PageLoader: React.FC = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center">
    <Stethoscope className="h-12 w-12 text-primary-600 animate-pulse" />
  </div>
);
