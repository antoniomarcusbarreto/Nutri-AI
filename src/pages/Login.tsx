import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Apple } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const Login: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading: authLoading, isPatient } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup');
  
  useEffect(() => {
    if (searchParams.get('mode') === 'signup') {
      setIsSignUp(true);
    }
  }, [searchParams]);

  const [justSignedUp, setJustSignedUp] = useState(false);

  useEffect(() => {
    // We only want to navigate if the session is fully loaded by AuthContext
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



  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          throw new Error('As senhas não coincidem.');
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;
        
        if (data.user) {
          // Set flag to redirect to onboarding when session is detected
          setJustSignedUp(true);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      let errorMessage = err.message || 'Ocorreu um erro durante a autenticação.';
      if (errorMessage === 'Invalid login credentials') {
        errorMessage = 'Credenciais de login inválidas. Verifique seu e-mail e senha.';
      } else if (errorMessage === 'User already registered') {
        errorMessage = 'Usuário já cadastrado com este e-mail.';
      } else if (errorMessage.includes('Password should be at least')) {
        errorMessage = 'A senha deve ter pelo menos 6 caracteres.';
      } else if (errorMessage === 'User is banned') {
        errorMessage = 'Acesso bloqueado. Esta conta foi banida ou suspensa pelo administrador.';
      } else if (errorMessage === 'Email not confirmed') {
        errorMessage = 'Por favor, confirme seu e-mail antes de fazer login.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar com o Google.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-primary-100 rounded-full flex items-center justify-center">
            <Apple className="h-8 w-8 text-primary-600" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          {isSignUp ? 'Crie sua conta profissional' : 'Entre na sua conta'}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          {isSignUp ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="ml-1 font-medium text-primary-600 hover:text-primary-500 transition-colors"
          >
            {isSignUp ? 'Faça login' : 'Cadastre-se'}
          </button>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-slate-200 sm:rounded-2xl sm:px-10">
          <form className="space-y-6" onSubmit={handleAuth}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    e.target.setCustomValidity('');
                  }}
                  onInvalid={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.validity.valueMissing) {
                      target.setCustomValidity('Campo requerido');
                    } else if (target.validity.typeMismatch) {
                      target.setCustomValidity('E-mail inválido');
                    }
                  }}
                  className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Senha</label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  pattern="^(?=.*[A-Z])(?=.*\d).{8,}$"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    e.target.setCustomValidity('');
                  }}
                  onInvalid={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.validity.valueMissing) {
                      target.setCustomValidity('Campo requerido');
                    } else {
                      target.setCustomValidity('Senha inválida');
                    }
                  }}
                  className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm transition-colors"
                />
              </div>
              {isSignUp && (
                <p className="mt-1.5 text-xs text-slate-400">
                  Mínimo 8 caracteres, uma letra maiúscula e um número
                </p>
              )}
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Confirmar Senha</label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      e.target.setCustomValidity('');
                    }}
                    onInvalid={(e) => {
                      const target = e.target as HTMLInputElement;
                      if (target.validity.valueMissing) {
                        target.setCustomValidity('Campo requerido');
                      }
                    }}
                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">ou continue com</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                type="button"
                className="w-full inline-flex justify-center items-center py-2.5 px-4 border border-slate-300 rounded-xl shadow-sm bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors"
              >
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {isSignUp ? 'Cadastrar com o Google' : 'Entrar com o Google'}
              </button>
            </div>
          </div>
          
          {isSignUp && (
            <div className="mt-8">
              <p className="text-center text-xs text-slate-400">
                Ao criar sua conta, você concorda com nossos{' '}
                <Link to="/termos" className="font-semibold text-slate-500 hover:text-primary-600 transition-colors">
                  Termos de Serviço
                </Link>
                {' '}e{' '}
                <Link to="/privacidade" className="font-semibold text-slate-500 hover:text-primary-600 transition-colors">
                  Política de Privacidade
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
