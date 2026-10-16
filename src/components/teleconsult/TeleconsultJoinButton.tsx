import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Video } from 'lucide-react';
import { Button } from '../ui';
import { teleconsultPath, teleconsultWindow } from '../../lib/teleconsult';

/**
 * Botão "Entrar na teleconsulta". Liberado 10 min antes do horário até 30 min
 * depois do fim (mesma janela da Edge Function); antes disso mostra quando a
 * sala abre, e depois some. Reavalia a cada 30 s para liberar sozinho.
 */
interface Props {
  appointmentId: string;
  dateTime: string;
  durationMinutes: number | null | undefined;
  asPatient?: boolean;
  label?: string;
  size?: 'md' | 'sm';
  className?: string;
  fullWidth?: boolean;
}

export const TeleconsultJoinButton: React.FC<Props> = ({
  appointmentId, dateTime, durationMinutes, asPatient = false, label, size = 'md', className = '', fullWidth,
}) => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const win = teleconsultWindow(dateTime, durationMinutes, now);
  if (win.state === 'encerrada') return null;

  const open = win.state === 'aberta';
  const sameDay = win.opensAt.toDateString() === now.toDateString();
  const hint = sameDay ? `Abre às ${format(win.opensAt, 'HH:mm')}` : `Abre em ${format(win.opensAt, "dd/MM 'às' HH:mm")}`;

  return (
    <Button
      size={size}
      fullWidth={fullWidth}
      disabled={!open}
      className={className}
      leftIcon={<Video className="h-4 w-4" />}
      onClick={() => navigate(teleconsultPath(appointmentId, asPatient))}
      title={open ? undefined : 'A sala abre 10 minutos antes do horário'}
    >
      {open ? (label ?? 'Entrar na teleconsulta') : hint}
    </Button>
  );
};
