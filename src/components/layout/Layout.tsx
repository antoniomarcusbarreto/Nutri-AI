import React, { useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

import { useToast } from '../../contexts/ToastContext';

export const Layout: React.FC = () => {
  const { profile, updateProfile } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const themeColor = profile?.theme_color || 'white';

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0 || !profile) {
        return;
      }
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}-${Math.random()}.${fileExt}`;

      setIsUploading(true);

      const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      
      await updateProfile({ avatar_url: data.publicUrl });
      showToast('Foto de perfil atualizada com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao fazer upload da imagem:', error);
      showToast('Erro ao atualizar foto de perfil.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  const getHeaderTheme = () => {
    if (themeColor === 'dark') return 'bg-[#242424] border-b border-[#333333] text-[#f5f5f5]';
    if (themeColor === 'teal') return 'bg-[#115e59] border-b border-teal-700/20 text-white';
    if (themeColor === 'blue') return 'bg-blue-800 border-b border-blue-700/20 text-white';
    return 'bg-white border-b border-slate-100 text-slate-700'; // Default fallback
  };

  const getTextColor = () => {
    if (themeColor === 'blue' || themeColor === 'teal' || themeColor === 'dark') return 'text-slate-100';
    return 'text-slate-700';
  };

  return (
    <div className={`flex h-screen overflow-hidden ${themeColor === 'dark' ? 'bg-[#1a1a1a] theme-dark' : 'bg-[#f8fafc]'} font-sans transition-colors duration-200`}>
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
        {/* Header Superior Simples */}
        <header className={`${getHeaderTheme()} h-16 shrink-0 flex items-center px-8 shadow-sm transition-colors duration-200`}>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <span className={`text-sm font-medium ${getTextColor()}`}>
              {profile?.full_name || 'Profissional'}
            </span>
            <div 
              className="relative h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold backdrop-blur-sm overflow-hidden border border-white/20 cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
              title="Alterar foto de perfil"
            >
              {isUploading ? (
                <div className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              ) : profile?.avatar_url ? (
                <>
                  <img src={`${profile.avatar_url}?t=${new Date().getTime()}`} alt="Avatar" className="h-full w-full object-cover" />
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
            </div>
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
        <div className="flex-1 p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
