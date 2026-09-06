import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../lib/logger';

/**
 * Ditado por voz + medição de volume do microfone (Onda 5 / PERF-13).
 *
 * Move para fora de Consultations.tsx: os tipos da Web Speech API, a
 * inicialização do `SpeechRecognition`, o `AudioContext`/analyser para a onda
 * de volume, e o start/stop. O objeto de reconhecimento é criado UMA vez
 * (antes era recriado a cada troca de `recordingMode` — o consumidor agora
 * decide append/replace dentro do callback, sem re-montar nada).
 */

// --- tipos mínimos da Web Speech API (não vêm no lib.dom) ---
interface SpeechRecognitionAlternative { transcript: string; confidence: number }
interface SpeechRecognitionResult {
  isFinal: boolean; length: number;
  item(i: number): SpeechRecognitionAlternative;
  [i: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number; item(i: number): SpeechRecognitionResult;
  [i: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number; results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event { error: string; message?: string }

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechCapableWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
  webkitAudioContext?: typeof AudioContext;
}

const speechWindow = (): SpeechCapableWindow => window as unknown as SpeechCapableWindow;
const getRecognitionCtor = (): SpeechRecognitionCtor | undefined => {
  const w = speechWindow();
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export interface UseSpeechRecognitionOptions {
  lang?: string;
  /** Recebe cada trecho FINAL reconhecido. */
  onFinalTranscript: (text: string) => void;
  /** Erros já traduzidos (microfone negado, etc.) para exibir num toast. */
  onError?: (message: string) => void;
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions) {
  // Feature-detection só no primeiro render (sem setState em effect).
  const [supported] = useState(() => !!getRecognitionCtor());
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const micRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // callbacks via ref → o effect de init não precisa deles nas deps
  const cbRef = useRef(opts);
  useEffect(() => {
    cbRef.current = opts;
  });

  const stopVolumeAnalysis = useCallback(() => {
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    micRef.current?.disconnect();
    micRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setVolume(0);
  }, []);

  const startVolumeAnalysis = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const Ctx = window.AudioContext || speechWindow().webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      const mic = ctx.createMediaStreamSource(stream);
      micRef.current = mic;
      const node = ctx.createScriptProcessor(2048, 1, 1);
      nodeRef.current = node;

      mic.connect(analyser);
      analyser.connect(node);
      node.connect(ctx.destination);

      node.onaudioprocess = () => {
        const arr = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(arr);
        const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
        setVolume(Math.min(100, Math.round(avg * 1.8)));
      };
    } catch (err) {
      logger.warn('Sem áudio para análise de volume:', err);
    }
  }, []);

  useEffect(() => {
    const SR = getRecognitionCtor();
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = cbRef.current.lang ?? 'pt-BR';

    rec.onstart = () => {
      setIsRecording(true);
      startVolumeAnalysis();
    };
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
      }
      if (finalTranscript.trim()) cbRef.current.onFinalTranscript(finalTranscript.trim());
    };
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      const msg = event.error === 'not-allowed'
        ? 'Acesso ao microfone negado. Habilite nas configurações do navegador.'
        : `Erro na transcrição: ${event.error}`;
      cbRef.current.onError?.(msg);
      setIsRecording(false);
      stopVolumeAnalysis();
    };
    rec.onend = () => {
      setIsRecording(false);
      stopVolumeAnalysis();
    };

    recognitionRef.current = rec;
    return () => {
      rec.abort();
      stopVolumeAnalysis();
    };
  }, [startVolumeAnalysis, stopVolumeAnalysis]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.start();
    } catch {
      rec.abort();
      setTimeout(() => rec.start(), 300);
    }
  }, []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  const toggle = useCallback(() => {
    if (!supported) {
      cbRef.current.onError?.('O seu navegador não suporta transcrição por voz.');
      return;
    }
    if (isRecording) stop();
    else start();
  }, [supported, isRecording, start, stop]);

  return { supported, isRecording, volume, start, stop, toggle };
}
