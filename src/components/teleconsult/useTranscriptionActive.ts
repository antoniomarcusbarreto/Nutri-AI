import { useEffect, useState } from 'react';
import type { DailyCall } from '@daily-co/daily-js';

/** A transcrição está ligada na chamada? (eventos do Daily, iguais para todos). */
export function useTranscriptionActive(call: DailyCall | null) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!call) return;
    const on = () => setActive(true);
    const off = () => setActive(false);
    call.on('transcription-started', on);
    call.on('transcription-stopped', off);
    call.on('transcription-error', off);
    call.on('left-meeting', off);
    return () => {
      call.off('transcription-started', on);
      call.off('transcription-stopped', off);
      call.off('transcription-error', off);
      call.off('left-meeting', off);
    };
  }, [call]);
  return active;
}
