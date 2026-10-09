import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Link2Off, MailCheck, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AuthShell } from '../components/auth/AuthShell';
import { PasswordField, PasswordRules } from '../components/auth/PasswordField';
import { isStrongPassword } from '../components/auth/passwordRules';
import { Button, Input } from '../components/ui';
import { PORTAL_TERMS_VERSION } from '../types/portal';

/**
 * Aceite do convite do Portal do Paciente (/convite/:token).
 *
 * O código vai para o e-mail que o NUTRICIONISTA cadastrou — o paciente nunca
 * digita o e-mail aqui, então um link repassado não dá acesso a outra pessoa.
 * Tudo passa pela Edge Function `portal-invite` (migration 0031).
 */

const CODE_COOLDOWN_MS = 60_000;

interface InvitePeek {
  patient_first_name: string;
  masked_email: string;
  nutritionist_name: string;
  clinic_name: string;
  has_account: boolean;
}

async function callInvite<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('portal-invite', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let message = 'Algo deu errado. Tente novamente.';
    if (ctx && typeof ctx.status === 'number') {
      try {
        const parsed = await ctx.clone().json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // corpo não-JSON
      }
    }
    throw new Error(message);
  }
  return data as T;
}

const ErrorBanner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
    <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </div>
);

type Step = 'loading' | 'invalid' | 'intro' | 'code' | 'entering';

export const PortalInvite: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, isPatient, refreshPortal } = useAuth();

  const [step, setStep] = useState<Step>('loading');
  const [invite, setInvite] = useState<InvitePeek | null>(null);
  const [invalidMessage, setInvalidMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ code?: string; password?: string; confirm?: string; terms?: string }>({});

  useEffect(() => {
    let cancelled = false;
    callInvite<InvitePeek>({ action: 'peek', token })
      .then((data) => {
        if (cancelled) return;
        setInvite(data);
        setStep('intro');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setInvalidMessage(err.message);
        setStep('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await callInvite({ action: 'send_code', token });
      setCooldownUntil(Date.now() + CODE_COOLDOWN_MS);
      setNow(Date.now());
      setStep('code');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: typeof fieldErrors = {};
    if (!/^\d{6}$/.test(code)) errs.code = 'O código tem 6 dígitos.';
    if (!isStrongPassword(password)) errs.password = 'A senha ainda não atende a todos os requisitos.';
    if (!confirm) errs.confirm = 'Repita a senha.';
    else if (confirm !== password) errs.confirm = 'As senhas não coincidem.';
    if (!terms) errs.terms = 'Para usar o app, aceite os termos.';
    setFieldErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      const first = (['code', 'password', 'confirm', 'terms'] as const).find((k) => errs[k]);
      document.getElementById(`invite-${first}`)?.focus();
      return;
    }

    setBusy(true);
    try {
      const { email } = await callInvite<{ email: string }>({ action: 'accept', token, code, password });
      setStep('entering');
      // Sessão de outra pessoa aberta neste aparelho? Sai antes de entrar.
      if (session) await supabase.auth.signOut();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error('Conta criada, mas não foi possível entrar. Tente pelo login com seu e-mail e a senha nova.');
      const { error: termsError } = await supabase.rpc('portal_accept_terms', { p_version: PORTAL_TERMS_VERSION });
      if (termsError) throw new Error('Não foi possível registrar o aceite dos termos. Entre de novo pelo login.');
      await refreshPortal();
      navigate('/portal', { replace: true });
    } catch (err) {
      setStep('code');
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // O paciente que já entrou por este aparelho e abre o link de novo vai direto ao portal.
  if (step === 'invalid' && session && isPatient) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-teal-700">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900">Você já está conectado</h1>
          <p className="mt-3 text-[15px] text-slate-600">Este convite já foi usado. Seu acompanhamento continua no app.</p>
          <Button variant="primary" fullWidth className="mt-8 h-11 text-[15px]" onClick={() => navigate('/portal')}>
            Abrir meu acompanhamento
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (step === 'loading') {
    return (
      <AuthShell>
        <div className="space-y-4" aria-busy="true" aria-label="Carregando convite">
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-8 w-3/4 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        </div>
      </AuthShell>
    );
  }

  if (step === 'invalid') {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-600">
            <Link2Off className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900">Convite indisponível</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{invalidMessage}</p>
          <p className="mt-6 text-sm text-slate-500">
            Já criou sua senha?{' '}
            <Link to="/login" className="font-medium text-[#5024fc] hover:text-[#431cdb]">Entrar</Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  const nutri = invite?.nutritionist_name || 'Seu nutricionista';

  if (step === 'intro') {
    return (
      <AuthShell>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
          <UserRound className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900">
          {invite?.patient_first_name ? `Olá, ${invite.patient_first_name}` : 'Olá'}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          <strong className="font-semibold text-slate-900">{nutri}</strong>
          {invite?.clinic_name ? <>, da {invite.clinic_name},</> : null} liberou seu acesso ao app de acompanhamento:
          seu plano alimentar e suas consultas num só lugar.
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-600">
          Para garantir que é você, vamos enviar um código de 6 dígitos para{' '}
          <strong className="font-semibold text-slate-900">{invite?.masked_email}</strong>.
        </div>

        <div className="mt-6 space-y-4">
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <Button variant="primary" fullWidth loading={busy} className="h-11 text-[15px]" onClick={sendCode}>
            Enviar código
          </Button>
          <p className="text-center text-xs text-slate-500">
            Esse não é o seu e-mail? Peça ao seu nutricionista para corrigir o cadastro e enviar um novo link.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
        <MailCheck className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900">
        {invite?.has_account ? 'Defina sua senha' : 'Crie sua senha'}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
        Enviamos o código para <strong className="font-semibold text-slate-900">{invite?.masked_email}</strong>. Confira
        também a caixa de spam.
      </p>

      <form className="mt-8 space-y-5" onSubmit={accept} noValidate>
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <Input
          id="invite-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          label="Código de verificação"
          placeholder="000000"
          className="h-14 text-center font-mono text-2xl tracking-[0.5em] placeholder:text-slate-300"
          value={code}
          error={fieldErrors.code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
            setFieldErrors((p) => ({ ...p, code: undefined }));
          }}
        />

        <PasswordField
          id="invite-password"
          label="Senha"
          autoComplete="new-password"
          value={password}
          error={fieldErrors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((p) => ({ ...p, password: undefined }));
          }}
          footer={<PasswordRules password={password} />}
        />

        <PasswordField
          id="invite-confirm"
          label="Repita a senha"
          autoComplete="new-password"
          value={confirm}
          error={fieldErrors.confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setFieldErrors((p) => ({ ...p, confirm: undefined }));
          }}
        />

        <div>
          <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-600">
            <input
              id="invite-terms"
              type="checkbox"
              checked={terms}
              onChange={(e) => {
                setTerms(e.target.checked);
                setFieldErrors((p) => ({ ...p, terms: undefined }));
              }}
              aria-invalid={fieldErrors.terms ? true : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#5024fc]"
            />
            <span>
              Li e aceito os{' '}
              <Link to="/termos" target="_blank" className="font-medium text-[#5024fc] hover:text-[#431cdb]">Termos de Uso</Link> e a{' '}
              <Link to="/privacidade" target="_blank" className="font-medium text-[#5024fc] hover:text-[#431cdb]">Política de Privacidade</Link>,
              e autorizo o uso dos meus dados de saúde pelo meu nutricionista para o meu acompanhamento.
            </span>
          </label>
          {fieldErrors.terms && <p className="mt-1 text-xs text-rose-600">{fieldErrors.terms}</p>}
        </div>

        <Button type="submit" variant="primary" fullWidth loading={busy || step === 'entering'} className="h-11 text-[15px]">
          Entrar no meu acompanhamento
        </Button>

        <p className="text-center text-sm text-slate-500">
          Não chegou?{' '}
          <button
            type="button"
            onClick={sendCode}
            disabled={busy || secondsLeft > 0}
            className="rounded font-medium text-[#5024fc] transition-colors hover:text-[#431cdb] disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {secondsLeft > 0 ? `Reenviar em ${secondsLeft}s` : 'Reenviar código'}
          </button>
        </p>
      </form>
    </AuthShell>
  );
};
