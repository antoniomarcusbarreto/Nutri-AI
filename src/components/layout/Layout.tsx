import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { uploadAvatar } from '../../lib/storage';

import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../lib/logger';

export const Layout: React.FC = () => {
  const { profile, updateProfile } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const themeColor = profile?.theme_color || 'white';
  const location = useLocation();

  // Fecha o drawer ao trocar de rota e trava o scroll do body enquanto aberto.
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileNavOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [mobileNavOpen]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0 || !profile) {
        return;
      }
      const file = event.target.files[0];
      setIsUploading(true);

      const publicUrl = await uploadAvatar(profile.id, file);
      await updateProfile({ avatar_url: publicUrl });
      showToast('Foto de perfil atualizada com sucesso!', 'success');
    } catch (error) {
      logger.error('Erro ao fazer upload da imagem:', error);
      showToast('Erro ao atualizar foto de perfil.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  const getHeaderTheme = () => {
    if (themeColor === 'dark') return 'bg-sidebar-graphite-raised border-b border-sidebar-hairline text-[#f5f5f5]';
    if (themeColor === 'teal') return 'bg-sidebar-teal border-b border-teal-700/20 text-white';
    if (themeColor === 'blue') return 'bg-sidebar-navy border-b border-white/10 text-white';
    return 'bg-white border-b border-slate-100 text-slate-700'; // Default fallback
  };

  const getTextColor = () => {
    if (themeColor === 'blue' || themeColor === 'teal' || themeColor === 'dark') return 'text-slate-100';
    return 'text-slate-700';
  };

  return (
    <div className={`flex h-screen overflow-hidden print:h-auto print:block print:overflow-visible ${themeColor === 'dark' ? 'bg-sidebar-graphite theme-dark' : 'bg-slate-200'} font-sans transition-colors duration-200 print:!bg-white`}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900 focus:shadow-lg focus:outline focus:outline-2 focus:outline-[#5024fc]"
      >
        Pular para o conteúdo
      </a>
      {/* Sidebar fixa (desktop) */}
      <div className="hidden lg:flex shrink-0 print:!hidden">
        <Sidebar />
      </div>

      {/* Drawer + backdrop (mobile / tablet) */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden print:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex lg:hidden print:hidden transition-transform duration-300 ease-out ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        aria-hidden={!mobileNavOpen}
      >
        <Sidebar onNavigate={() => setMobileNavOpen(false)} />
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="absolute top-3.5 right-3 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-500/10"
          aria-label="Fechar menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <main className={`flex-1 min-w-0 flex flex-col overflow-y-auto overflow-x-hidden print:overflow-visible print:block print:!bg-white ${themeColor === 'dark' ? 'bg-sidebar-graphite' : 'bg-slate-200'} antialiased transition-colors duration-200`}>
        {/* Header Superior Simples */}
        <header className={`print:hidden ${getHeaderTheme()} h-16 shrink-0 flex items-center gap-3 px-4 sm:px-6 lg:px-8 shadow-sm transition-colors duration-200`}>
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className={`lg:hidden -ml-1 p-2 rounded-lg hover:bg-slate-500/10 ${getTextColor()}`}
            aria-label="Abrir menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <span className={`text-sm font-medium ${getTextColor()}`}>
              {profile?.full_name || 'Profissional'}
            </span>
            <button
              type="button"
              className="relative h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold backdrop-blur-sm overflow-hidden border border-white/20 cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
              title="Alterar foto de perfil"
              aria-label="Alterar foto de perfil"
              disabled={isUploading}
            >
              {isUploading ? (
                <div className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              ) : profile?.avatar_url ? (
                <>
                  <img src={profile.avatar_url} alt={`Foto de ${profile.full_name || 'perfil'}`} width={32} height={32} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </>
              ) : (
                <>
                  <span>{profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'PR'}</span>
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </>
              )}
            </button>
            <input
              type="file"
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleAvatarUpload} 
            />
          </div>
        </header>
        
        {/* Conteúdo Principal das Rotas */}
        <div id="conteudo" tabIndex={-1} className="flex-1 p-4 sm:p-6 lg:p-8 print:p-0 print:w-full print:max-w-none focus:outline-none">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
