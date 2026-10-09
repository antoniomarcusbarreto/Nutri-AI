import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Activity, ChevronRight, ClipboardList, LogOut, Mail, Phone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui';

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
    <dt className="text-sm text-slate-500">{label}</dt>
    <dd className="text-sm font-medium text-slate-900 sm:text-right">{children}</dd>
  </div>
);

export const PortalProfile: React.FC = () => {
  const { patientPortal: p, signOut } = useAuth();
  if (!p) return null;
  const clinic = p.clinic;
  const address = [clinic.address, clinic.city, clinic.state].filter(Boolean).join(', ');

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Perfil</h1>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 shadow-sm" aria-labelledby="profile-me">
        <h2 id="profile-me" className="pt-4 text-base font-semibold text-slate-900">Seus dados</h2>
        <dl className="divide-y divide-slate-100">
          <Row label="Nome">{p.name}</Row>
          {p.email && <Row label="E-mail de acesso">{p.email}</Row>}
          {p.phone && <Row label="Telefone">{p.phone}</Row>}
          {p.birth_date && <Row label="Nascimento">{format(new Date(`${p.birth_date}T12:00:00`), 'dd/MM/yyyy')}</Row>}
          {p.main_goal && <Row label="Objetivo">{p.main_goal}</Row>}
        </dl>
        <p className="border-t border-slate-100 py-3 text-xs text-slate-500">
          Algum dado errado? Peça a correção ao seu nutricionista.
        </p>
      </section>

      <Link
        to="/portal/ficha"
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:bg-slate-50"
      >
        <ClipboardList className="h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-slate-900">Ficha de saúde</span>
          <span className="block text-sm text-slate-500">Alergias, restrições, medicamentos e rotina</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
      </Link>

      <Link
        to="/portal/avaliacao"
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:bg-slate-50"
      >
        <Activity className="h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-slate-900">Avaliação corporal</span>
          <span className="block text-sm text-slate-500">Medidas, fotos e resultados liberados pelo nutricionista</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 shadow-sm" aria-labelledby="profile-access">
        <h2 id="profile-access" className="pt-4 text-base font-semibold text-slate-900">Seu acompanhamento</h2>
        <dl className="divide-y divide-slate-100">
          {p.nutritionist_name && (
            <Row label="Nutricionista">
              {p.nutritionist_name}
              {p.nutritionist_crn ? <span className="font-normal text-slate-500"> · CRN {p.nutritionist_crn}</span> : null}
            </Row>
          )}
          {clinic.name && <Row label="Clínica">{clinic.name}</Row>}
          {address && <Row label="Endereço">{address}</Row>}
          <Row label="Acesso ao app">
            {p.active ? 'Ativo até ' : 'Somente leitura desde '}
            {format(new Date(p.access_until), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </Row>
        </dl>
        {(clinic.phone || clinic.email) && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 py-4">
            {clinic.phone && (
              <a href={`tel:${clinic.phone}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
                <Phone className="h-4 w-4" aria-hidden="true" /> Ligar para a clínica
              </a>
            )}
            {clinic.email && (
              <a href={`mailto:${clinic.email}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
                <Mail className="h-4 w-4" aria-hidden="true" /> E-mail da clínica
              </a>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="profile-privacy">
        <h2 id="profile-privacy" className="text-base font-semibold text-slate-900">Privacidade</h2>
        <p className="mt-2 text-sm text-slate-600">
          {p.terms_accepted_at
            ? `Você aceitou os termos em ${format(new Date(p.terms_accepted_at), 'dd/MM/yyyy')}.`
            : 'Termos aceitos.'}{' '}
          Seus dados ficam visíveis só para você e para quem acompanha você.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link to="/termos" className="font-medium text-[#5024fc] hover:text-[#431cdb]">Termos de Uso</Link>
          <Link to="/privacidade" className="font-medium text-[#5024fc] hover:text-[#431cdb]">Política de Privacidade</Link>
        </p>
      </section>

      <Button variant="secondary" fullWidth className="h-11" leftIcon={<LogOut className="h-4 w-4" />} onClick={signOut}>
        Sair
      </Button>
    </>
  );
};
