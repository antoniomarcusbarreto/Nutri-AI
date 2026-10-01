import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, MailCheck, Sparkles } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Input, Button } from '../components/ui';
import { AuthShell } from '../components/auth/AuthShell';
import { PasswordField, PasswordRules } from '../components/auth/PasswordField';
import { isStrongPassword } from '../components/auth/passwordRules';
import { cn } from '../lib/cn';

const RECOVERY_COOLDOWN_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_CLASS = 'h-11 text-[15px]';

/** Planos vindos dos CTAs da landing (`/login?mode=signup&plan=...`). */
const PLAN_NAMES: Record<string, string> = {
  starter: 'Autônomo',
  pro: 'Clínica / Equipe',
};

type View = 'auth' | 'recovery' | 'checkEmail';
type FieldErrors = { email?: string; password?: string; confirm?: string };

/** supabase-js: FunctionsHttpError (não-2xx) traz `.context: Response` com o corpo `{ error }`. */
async function extractFnErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.status === 'number') {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return body.error as string;
    } catch {
      // corpo não-JSON
    }
  }
  return fallback;
}

function translateAuthError(message: string): string {
  if (message === 'Invalid login credentials') return 'E-mail ou senha incorretos. Confira e tente de novo.';
  if (message === 'User already registered') return 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.';
  if (message === 'User is banned') return 'Acesso bloqueado. Esta conta foi suspensa pelo administrador.';
  if (message === 'Email not confirmed') return 'Confirme seu e-mail antes de entrar — procure a mensagem na sua caixa de entrada.';
  if (/rate limit|too many requests|only request this after/i.test(message)) {
    return 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.';
  }
  if (/failed to fetch|network/i.test(message)) return 'Sem conexão com o servidor. Verifique sua internet.';
  if (message.includes('Password should be')) return 'A senha não atende aos requisitos mínimos.';
  return message || 'Ocorreu um erro durante a autenticação.';
}

const ErrorBanner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
    <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </div>
);

const TextLink: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, ...props }) => (
  <button
    type="button"
    className={cn(
      'rounded font-medium text-[#5024fc] transition-colors hover:text-[#431cdb] disabled:cursor-not-allowed disabled:text-slate-400',
      className,
    )}
    {...props}
  />
);

export const Login: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading: authLoading, isPatient } = useAuth();

  // Modo vive na URL (?mode=signup): o CTA da landing cai direto no cadastro e
  // um refresh preserva a aba escolhida.
  const isSignUp = searchParams.get('mode') === 'signup';
  const planParam = searchParams.get('plan');
  const planName = planParam ? PLAN_NAMES[planParam] : undefined;

  const [view, setView] = useState<View>('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [justSignedUp, setJustSignedUp] = useState(false);

  // Recuperação de senha (código de 6 dígitos por e-mail via Resend — ver
  // supabase/functions/send-password-reset-code e reset-password-with-code).
  const [recoveryStep, setRecoveryStep] = useState<'email' | 'code' | 'success'>('email');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryFieldErrors, setRecoveryFieldErrors] = useState<{ email?: string; code?: string; password?: string; confirm?: string }>({});
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownRemaining = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - nowTick) / 1000)) : 0;

  useEffect(() => {
    // Só navega quando a sessão já foi totalmente carregada pelo AuthContext.
    if (session && !authLoading && !loading && !error) {
      if (justSignedUp) {
        navigate('/onboarding', { replace: true });
      } else if (isPatient) {
        navigate('/portal', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [session, authLoading, isPatient, navigate, justSignedUp, loading, error]);

  const setMode = (signUp: boolean) => {
    if (signUp === isSignUp) return;
    const next = new URLSearchParams(searchParams);
    if (signUp) next.set('mode', 'signup');
    else next.delete('mode');
    setSearchParams(next, { replace: true });
    setError(null);
    setFieldErrors({});
    setConfirmPassword('');
  };

  const clearFieldError = (field: keyof FieldErrors) =>
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!email.trim()) errs.email = 'Informe seu e-mail.';
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Este e-mail não parece válido.';
    if (!password) errs.password = 'Informe sua senha.';
    else if (isSignUp && !isStrongPassword(password)) errs.password = 'A senha ainda não atende a todos os requisitos.';
    if (isSignUp) {
      if (!confirmPassword) errs.confirm = 'Repita a senha.';
      else if (confirmPassword !== password) errs.confirm = 'As senhas não coincidem.';
    }
    return errs;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      const first = (['email', 'password', 'confirm'] as const).find((k) => errs[k]);
      document.getElementById(`auth-${first}`)?.focus();
      return;
    }

    setLoading(true);
    const cleanEmail = email.trim();
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: planName ? { data: { selected_plan: planParam } } : undefined,
        });
        if (signUpError) throw signUpError;

        // Com confirmação de e-mail ligada, um e-mail já cadastrado volta como
        // usuário "ofuscado" sem identidades (o Supabase não revela que existe).
        if (data.user && data.user.identities?.length === 0) {
          throw new Error('User already registered');
        }
        if (data.user && !data.session) {
          // Conta criada, mas precisa confirmar o e-mail antes da primeira sessão.
          setView('checkEmail');
        } else if (data.user) {
          setJustSignedUp(true);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (signInError) throw signInError;
      }
    } catch (err) {
      setError(translateAuthError(err instanceof Error ? err.message : ''));
    } finally {
      setLoading(false);
    }
  };

  // ── Recuperação de senha ────────────────────────────────────────────────

  const openRecovery = () => {
    setRecoveryEmail(email.trim());
    setRecoveryStep('email');
    setRecoveryError(null);
    setRecoveryFieldErrors({});
    setView('recovery');
  };

  const closeRecovery = (prefillEmail?: string) => {
    if (prefillEmail) setEmail(prefillEmail);
    setPassword('');
    setView('auth');
    setRecoveryStep('email');
    setRecoveryCode('');
    setRecoveryNewPassword('');
    setRecoveryConfirmPassword('');
    setRecoveryError(null);
    setRecoveryFieldErrors({});
    setCooldownUntil(null);
    if (isSignUp) setMode(false);
  };

  const requestRecoveryCode = async () => {
    setRecoveryLoading(true);
    setRecoveryError(null);
    try {
      const { error } = await supabase.functions.invoke('send-password-reset-code', {
        body: { email: recoveryEmail.trim() },
      });
      if (error) {
        throw new Error(await extractFnErrorMessage(error, 'Não foi possível enviar o código. Tente novamente.'));
      }
      setCooldownUntil(Date.now() + RECOVERY_COOLDOWN_MS);
      setNowTick(Date.now());
      setRecoveryStep('code');
    } catch (err) {
      setRecoveryError((err instanceof Error && err.message) || 'Não foi possível enviar o código. Tente novamente.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = recoveryEmail.trim();
    if (!value || !EMAIL_RE.test(value)) {
      setRecoveryFieldErrors({ email: value ? 'Este e-mail não parece válido.' : 'Informe seu e-mail.' });
      document.getElementById('recovery-email')?.focus();
      return;
    }
    setRecoveryFieldErrors({});
    await requestRecoveryCode();
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    const errs: typeof recoveryFieldErrors = {};
    if (!/^\d{6}$/.test(recoveryCode)) errs.code = 'O código tem 6 dígitos.';
    if (!isStrongPassword(recoveryNewPassword)) errs.password = 'A senha ainda não atende a todos os requisitos.';
    if (!recoveryConfirmPassword) errs.confirm = 'Repita a nova senha.';
    else if (recoveryConfirmPassword !== recoveryNewPassword) errs.confirm = 'As senhas não coincidem.';
    setRecoveryFieldErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      const first = (['code', 'password', 'confirm'] as const).find((k) => errs[k]);
      document.getElementById(`recovery-${first}`)?.focus();
      return;
    }

    setRecoveryLoading(true);
    try {
      const { error } = await supabase.functions.invoke('reset-password-with-code', {
        body: { email: recoveryEmail.trim(), code: recoveryCode, newPassword: recoveryNewPassword },
      });
      if (error) {
        throw new Error(await extractFnErrorMessage(error, 'Não foi possível redefinir a senha. Tente novamente.'));
      }
      setRecoveryStep('success');
    } catch (err) {
      setRecoveryError((err instanceof Error && err.message) || 'Não foi possível redefinir a senha. Tente novamente.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  // ── Telas ───────────────────────────────────────────────────────────────

  if (view === 'checkEmail') {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="ia-settle mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-teal-700">
            <MailCheck className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900">
            Confirme seu e-mail
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
            Enviamos um link de confirmação para{' '}
            <strong className="font-semibold text-slate-900">{email.trim()}</strong>. Abra a mensagem para ativar sua
            conta e depois entre por aqui.
          </p>
          <p className="mt-2 text-sm text-slate-500">Não chegou? Confira a caixa de spam ou promoções.</p>
          <Button
            type="button"
            variant="primary"
            fullWidth
            className="mt-8 h-11 text-[15px]"
            onClick={() => {
              setPassword('');
              setConfirmPassword('');
              setView('auth');
              setMode(false);
            }}
          >
            Ir para o login
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (view === 'recovery') {
    return (
      <AuthShell>
        {recoveryStep === 'success' ? (
          <div className="text-center">
            <div className="ia-pop mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="mt-6 text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900">
              Senha redefinida
            </h1>
            <p className="mt-3 text-[15px] text-slate-600">Tudo certo. Agora é só entrar com a nova senha.</p>
            <Button
              type="button"
              variant="primary"
              fullWidth
              className="mt-8 h-11 text-[15px]"
              onClick={() => closeRecovery(recoveryEmail.trim())}
            >
              Ir para o login
            </Button>
          </div>
        ) : (
          <>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
              <KeyRound className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-5 text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900">
              Recuperar senha
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
              {recoveryStep === 'email' ? (
                'Informe o e-mail da sua conta. Enviaremos um código de 6 dígitos.'
              ) : (
                <>
                  Enviamos um código para <strong className="font-semibold text-slate-900">{recoveryEmail.trim()}</strong>.{' '}
                  <TextLink
                    onClick={() => {
                      setRecoveryStep('email');
                      setRecoveryCode('');
                      setRecoveryError(null);
                      setRecoveryFieldErrors({});
                    }}
                  >
                    Trocar e-mail
                  </TextLink>
                </>
              )}
            </p>

            <div className="mt-8 space-y-5">
              {recoveryError && <ErrorBanner>{recoveryError}</ErrorBanner>}

              {recoveryStep === 'email' && (
                <form className="space-y-5" onSubmit={handleRequestCode} noValidate>
                  <Input
                    id="recovery-email"
                    type="email"
                    label="E-mail"
                    autoComplete="email"
                    autoFocus
                    className={FIELD_CLASS}
                    value={recoveryEmail}
                    error={recoveryFieldErrors.email}
                    onChange={(e) => {
                      setRecoveryEmail(e.target.value);
                      setRecoveryFieldErrors({});
                    }}
                  />
                  <Button type="submit" variant="primary" fullWidth loading={recoveryLoading} className="h-11 text-[15px]">
                    Enviar código
                  </Button>
                </form>
              )}

              {recoveryStep === 'code' && (
                <form className="space-y-5" onSubmit={handleConfirmReset} noValidate>
                  <Input
                    id="recovery-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    label="Código de verificação"
                    placeholder="000000"
                    className="h-14 text-center font-mono text-2xl tracking-[0.5em] placeholder:text-slate-300"
                    value={recoveryCode}
                    error={recoveryFieldErrors.code}
                    onChange={(e) => {
                      setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setRecoveryFieldErrors((p) => ({ ...p, code: undefined }));
                    }}
                  />
                  <PasswordField
                    id="recovery-password"
                    label="Nova senha"
                    autoComplete="new-password"
                    value={recoveryNewPassword}
                    error={recoveryFieldErrors.password}
                    onChange={(e) => {
                      setRecoveryNewPassword(e.target.value);
                      setRecoveryFieldErrors((p) => ({ ...p, password: undefined }));
                    }}
                    footer={<PasswordRules password={recoveryNewPassword} />}
                  />
                  <PasswordField
                    id="recovery-confirm"
                    label="Confirmar nova senha"
                    autoComplete="new-password"
                    value={recoveryConfirmPassword}
                    error={recoveryFieldErrors.confirm}
                    onChange={(e) => {
                      setRecoveryConfirmPassword(e.target.value);
                      setRecoveryFieldErrors((p) => ({ ...p, confirm: undefined }));
                    }}
                  />
                  <Button type="submit" variant="primary" fullWidth loading={recoveryLoading} className="h-11 text-[15px]">
                    Redefinir senha
                  </Button>
                  <p className="text-center text-sm text-slate-500">
                    Não recebeu?{' '}
                    <TextLink onClick={requestRecoveryCode} disabled={cooldownRemaining > 0 || recoveryLoading}>
                      {cooldownRemaining > 0 ? `Reenviar em ${cooldownRemaining}s` : 'Reenviar código'}
                    </TextLink>
                  </p>
                </form>
              )}
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
              Lembrou a senha? <TextLink onClick={() => closeRecovery()}>Voltar para o login</TextLink>
            </div>
          </>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900">
        {isSignUp ? 'Crie sua conta profissional' : 'Bem-vindo de volta'}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
        {isSignUp
          ? 'Comece seu teste grátis. O consultório você configura no próximo passo.'
          : 'Entre para continuar seus atendimentos.'}
      </p>

      {/* Alternância Entrar / Criar conta */}
      <div role="group" aria-label="Tipo de acesso" className="mt-7 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {[
          { label: 'Entrar', signUp: false },
          { label: 'Criar conta', signUp: true },
        ].map((opt) => {
          const active = opt.signUp === isSignUp;
          return (
            <button
              key={opt.label}
              type="button"
              aria-pressed={active}
              onClick={() => setMode(opt.signUp)}
              className={cn(
                'rounded-lg py-2 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200',
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {isSignUp && planName && (
        <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-sm text-teal-800">
          <Sparkles className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
          <span>
            Plano selecionado: <strong className="font-semibold">{planName}</strong>
          </span>
        </div>
      )}

      <form className="mt-6 space-y-5" onSubmit={handleAuth} noValidate>
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <Input
          id="auth-email"
          type="email"
          name="email"
          label="E-mail"
          autoComplete={isSignUp ? 'email' : 'username'}
          autoFocus
          placeholder="voce@clinica.com.br"
          className={FIELD_CLASS}
          value={email}
          error={fieldErrors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError('email');
          }}
        />

        <PasswordField
          id="auth-password"
          name="password"
          label="Senha"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          value={password}
          error={fieldErrors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearFieldError('password');
          }}
          labelAction={
            !isSignUp && (
              <TextLink onClick={openRecovery} className="text-xs">
                Esqueceu sua senha?
              </TextLink>
            )
          }
          footer={isSignUp ? <PasswordRules password={password} /> : undefined}
        />

        {isSignUp && (
          <PasswordField
            id="auth-confirm"
            name="confirm-password"
            label="Confirmar senha"
            autoComplete="new-password"
            value={confirmPassword}
            error={fieldErrors.confirm}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              clearFieldError('confirm');
            }}
          />
        )}

        <Button type="submit" variant="primary" fullWidth loading={loading} className="group h-11 text-[15px]">
          {loading ? 'Aguarde…' : isSignUp ? 'Criar conta' : 'Entrar'}
          {!loading && (
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          )}
        </Button>
      </form>

      {isSignUp && (
        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          Ao criar sua conta, você concorda com nossos{' '}
          <Link to="/termos" className="font-medium text-slate-700 underline-offset-2 hover:underline">
            Termos de Serviço
          </Link>{' '}
          e{' '}
          <Link to="/privacidade" className="font-medium text-slate-700 underline-offset-2 hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      )}
    </AuthShell>
  );
};
