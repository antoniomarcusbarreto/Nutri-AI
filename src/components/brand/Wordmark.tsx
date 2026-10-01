import React from 'react';

/** Marca "Nutri-AI" (selo N + logotipo). `light` = versão para fundo escuro. */
export const Wordmark: React.FC<{ light?: boolean }> = ({ light = false }) => (
  <span className="inline-flex items-center gap-2.5">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-600 text-lg font-bold leading-none text-white shadow-sm shadow-teal-500/30">
      N
    </span>
    <span className={`text-xl font-bold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>
      Nutri<span className={light ? 'text-teal-400' : 'text-teal-600'}>-AI</span>
    </span>
  </span>
);
