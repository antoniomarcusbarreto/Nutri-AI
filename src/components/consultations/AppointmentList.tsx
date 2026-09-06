import React from 'react';
import { format } from 'date-fns';
import { Clock, ClipboardList, ArrowRight } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { ConsultationAppointment, ClinicProfessional } from '../../types/clinical';

type DayAppointment = ConsultationAppointment;
type ProfessionalLite = ClinicProfessional;

/**
 * Grid de cards de agendamento do dia (Onda 5.3 / PERF-11).
 *
 * `React.memo` no card e na lista: como as props (appointments filtrados,
 * profissionais, callbacks) não mudam enquanto o nutricionista digita no
 * formulário clínico, o grid não re-renderiza a cada tecla.
 */

interface CardProps {
  apt: DayAppointment;
  professionalName: string;
  isResponsible: boolean;
  onOpen: (apt: DayAppointment) => void;
}

const AppointmentCardBase: React.FC<CardProps> = ({ apt, professionalName, isResponsible, onOpen }) => {
  const timeStr = format(new Date(apt.date_time), 'HH:mm');
  const initials = (apt.patients?.name ?? '').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  const locked = apt.status !== 'concluido' && !isResponsible;

  return (
    <div
      onClick={() => onOpen(apt)}
      className={`group bg-white border border-slate-200/80 hover:border-primary-400 hover:shadow-md rounded-2xl p-5 shadow-sm transition-all duration-300 cursor-pointer flex flex-col justify-between h-60 relative overflow-hidden ${
        locked ? 'opacity-85' : ''
      }`}
    >
      <div className={`absolute top-0 bottom-0 left-0 w-1.5 rounded-l-2xl transition-colors ${
        apt.status === 'concluido' ? 'bg-emerald-500 group-hover:bg-emerald-600' :
        apt.status === 'confirmado' ? 'bg-blue-500 group-hover:bg-blue-600' :
        apt.status === 'cancelado' ? 'bg-rose-500 group-hover:bg-rose-600' :
        'bg-amber-500 group-hover:bg-amber-600'
      }`} />

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold flex items-center gap-1.5 text-slate-600 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-xl">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          {timeStr}
        </span>
        <StatusBadge status={apt.status} />
      </div>

      <div className="flex items-center gap-3.5 my-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-primary-50 to-indigo-50 text-primary-700 border border-primary-100 flex items-center justify-center font-extrabold text-sm shadow-sm">
          {initials}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-black text-slate-800 truncate group-hover:text-primary-600 transition-colors">
            {apt.patients?.name}
          </h4>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate">
            {apt.services?.name || 'Consulta Geral'}
          </p>
          <p className="text-[10px] text-slate-500 font-semibold mt-1 truncate">
            <span className="font-bold text-slate-400">Nutri:</span> {professionalName}
          </p>
        </div>
      </div>

      <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between mt-auto">
        <span className="text-[10px] font-bold text-slate-400">
          Objetivo: <span className="text-slate-600 truncate max-w-[120px] inline-block align-bottom">{apt.patients?.main_goal || 'Não informado'}</span>
        </span>

        {apt.status === 'concluido' ? (
          <span className="text-[11px] font-extrabold text-emerald-600 flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
            Visualizar <ArrowRight className="w-3.5 h-3.5" />
          </span>
        ) : isResponsible ? (
          <span className="text-[11px] font-extrabold text-primary-600 flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
            Iniciar <ArrowRight className="w-3.5 h-3.5" />
          </span>
        ) : (
          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-0.5 cursor-not-allowed" title="Apenas o profissional responsável pode iniciar esta consulta">
            Restrito
          </span>
        )}
      </div>
    </div>
  );
};

const AppointmentCard = React.memo(AppointmentCardBase);

interface ListProps {
  appointments: DayAppointment[];
  professionals: ProfessionalLite[];
  currentUserId: string | undefined;
  loading: boolean;
  selectedDate: Date;
  onOpen: (apt: DayAppointment) => void;
}

const AppointmentListBase: React.FC<ListProps> = ({
  appointments, professionals, currentUserId, loading, selectedDate, onOpen,
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent mb-3" />
        <p className="text-sm font-semibold">Buscando lista de atendimentos...</p>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400 flex flex-col items-center justify-center p-8 bg-white border border-dashed border-slate-200 rounded-3xl max-w-xl mx-auto shadow-sm my-6">
        <ClipboardList className="h-16 w-16 text-slate-300 stroke-[1.2] mb-3" />
        <h3 className="text-base font-extrabold text-slate-800">Sem agendamentos nesta data</h3>
        <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed text-center">
          Não há consultas programadas ou correspondentes aos filtros para {format(selectedDate, 'dd/MM/yyyy')}. Selecione outra data no calendário ao lado ou adicione um novo agendamento na tela de agenda.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {appointments.map((apt) => (
        <AppointmentCard
          key={apt.id}
          apt={apt}
          professionalName={professionals.find((p) => p.id === apt.nutritionist_id)?.full_name || 'Profissional'}
          isResponsible={currentUserId === apt.nutritionist_id}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
};

export const AppointmentList = React.memo(AppointmentListBase);
