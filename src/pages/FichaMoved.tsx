import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { AuthShell } from '../components/auth/AuthShell';

/**
 * Links antigos /ficha/:token (migration 0033): a ficha agora é preenchida
 * dentro do app do paciente, com login.
 */
export const FichaMoved: React.FC = () => (
  <AuthShell>
    <div className="text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-teal-700">
        <ClipboardList className="h-7 w-7" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900">A ficha agora fica no app</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
        Para sua segurança, a ficha de saúde é preenchida dentro do app de acompanhamento. Já tem acesso? Entre e
        abra &ldquo;Ficha de saúde&rdquo;. Ainda não tem? Peça o convite ao seu nutricionista.
      </p>
      <Link
        to="/login"
        className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#5024fc] text-[15px] font-semibold text-white hover:bg-[#431cdb]"
      >
        Entrar
      </Link>
    </div>
  </AuthShell>
);
