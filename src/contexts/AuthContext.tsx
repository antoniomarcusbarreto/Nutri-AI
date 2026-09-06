import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

interface Profile {
  id: string;
  full_name: string;
  crn?: string;
  is_superadmin?: boolean;
  is_active?: boolean;
  theme_mode?: string;
  theme_color?: string;
  avatar_url?: string;
  birth_date?: string | null;
  phone?: string;
}

interface Clinic {
  id: string;
  name: string;
  plan_level: string;
  created_at: string;
  subscription_status?: 'trial' | 'active' | 'inactive';
  subscription_end_date?: string | null;
  cep?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  complement?: string;
  operating_hours?: string;
  email?: string;
  phone?: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  clinic: Clinic | null;
  userRole: 'owner' | 'nutritionist' | 'secretary' | null;
  isPatient: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  remainingTrialDays: number;
  isReadOnly: boolean;
  isTrialActive: boolean;
  updateTheme: (mode: string, color: string) => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  updateClinic: (updates: Partial<Clinic>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  clinic: null,
  userRole: null,
  isPatient: false,
  loading: true,
  signOut: async () => {},
  remainingTrialDays: 0,
  isReadOnly: false,
  isTrialActive: false,
  updateTheme: async () => {},
  updateProfile: async () => {},
  updateClinic: async () => {},
});

// eslint-disable-next-line react-refresh/only-export-components -- hook coabita com o provider por convenção
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [userRole, setUserRole] = useState<'owner' | 'nutritionist' | 'secretary' | null>(null);
  const [isPatient, setIsPatient] = useState(false);
  const [loading, setLoading] = useState(true);

  // Trial & Subscription Logic
  const calculateTrial = (currentClinic: Clinic | null) => {
    if (!currentClinic) return { remainingTrialDays: 0, isReadOnly: false, isTrialActive: false };

    // If superadmin has forced status
    if (currentClinic.subscription_status === 'active') {
      let remaining = 999;
      let expired = false;
      
      if (currentClinic.subscription_end_date) {
        const expiresAt = new Date(currentClinic.subscription_end_date);
        remaining = Math.ceil((expiresAt.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
        expired = remaining < 0;
      }
      
      return {
        remainingTrialDays: remaining > 0 ? remaining : 0,
        isReadOnly: expired,
        isTrialActive: !expired
      };
    }

    if (currentClinic.subscription_status === 'inactive') {
      return { remainingTrialDays: 0, isReadOnly: true, isTrialActive: false };
    }

    // Robustez: só a string EXATA 'trial' entra na regra de expiração dos 14
    // dias. Qualquer outro valor (nulo, legado, digitado errado no painel
    // Master) NÃO trava a clínica — evita read-only acidental.
    if (currentClinic.subscription_status !== 'trial') {
      return { remainingTrialDays: 999, isReadOnly: false, isTrialActive: true };
    }

    // Default trial logic (subscription_status === 'trial')
    const createdAt = new Date(currentClinic.created_at);
    const expiresAt = new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 dias
    const remaining = Math.ceil((expiresAt.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    
    return {
      remainingTrialDays: remaining > 0 ? remaining : 0,
      isReadOnly: remaining < 0,
      isTrialActive: remaining >= 0
    };
  };

  // PERF-08: só recalcula quando a clínica muda (não a cada render).
  const { remainingTrialDays, isReadOnly, isTrialActive } = useMemo(
    () => calculateTrial(clinic),
    [clinic],
  );

  const applyTheme = useCallback((_mode: string, color: string) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', color);
  }, []);

  const updateTheme = useCallback(async (mode: string, color: string) => {
    if (!profile) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ theme_mode: mode, theme_color: color })
        .eq('id', profile.id);
      
      if (error) throw error;
      
      setProfile(prev => (prev ? { ...prev, theme_mode: mode, theme_color: color } : prev));
      applyTheme(mode, color);
    } catch (error) {
      logger.error('Error updating theme:', error);
    }
  }, [profile, applyTheme]);

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!profile) return;
    // Colunas privilegiadas nunca são alteradas pelo canal direto (ver migration
    // 0018 / SEC-01); a mudança de is_active/is_superadmin passa só por RPC.
    const { is_active: _ia, is_superadmin: _is, ...safeUpdates } = updates as Partial<Profile>;
    try {
      const { error } = await supabase
        .from('profiles')
        .update(safeUpdates)
        .eq('id', profile.id);
      
      if (error) throw error;
      
      setProfile(prev => (prev ? { ...prev, ...safeUpdates } : prev));
    } catch (error) {
      logger.error('Error updating profile:', error);
      throw error;
    }
  }, [profile]);

  const updateClinic = useCallback(async (updates: Partial<Clinic>) => {
    if (!clinic) return;
    try {
      const { error } = await supabase
        .from('clinics')
        .update(updates)
        .eq('id', clinic.id);
      
      if (error) throw error;
      
      setClinic(prev => (prev ? { ...prev, ...updates } : prev));
    } catch (error) {
      logger.error('Error updating clinic:', error);
      throw error;
    }
  }, [clinic]);

  const fetchUserData = async (currentUser: User) => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();
        
      if (profileData) {
        if (profileData.is_active === false) {
          await supabase.auth.signOut();
          return;
        }
        setProfile(profileData);
        applyTheme(profileData.theme_mode || 'light', profileData.theme_color || 'white');
      }

      const { data: memberData } = await supabase
        .from('clinic_members')
        .select('role, clinic_id')
        .eq('user_id', currentUser.id)
        .limit(1);

      if (memberData && memberData.length > 0) {
        const member = memberData[0];
        setUserRole(member.role);
        const { data: clinicData } = await supabase
          .from('clinics')
          .select('*')
          .eq('id', member.clinic_id)
          .single();
        if (clinicData) setClinic(clinicData);
      } else {
        // Verifica se é paciente
        const { data: patientData } = await supabase
          .from('patients')
          .select('id, clinic_id')
          .eq('user_id', currentUser.id)
          .limit(1);
          
        if (patientData && patientData.length > 0) {
          setIsPatient(true);
        }
      }
    } catch (error) {
      logger.error('Error fetching user data:', error);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setLoading(true);
        fetchUserData(session.user).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setClinic(null);
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
    // Montagem única: assina onAuthStateChange e faz o bootstrap da sessão.
    // `fetchUserData` só usa setters estáveis + applyTheme; não entra nas deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session, user, profile, clinic, userRole, isPatient, loading, signOut,
      remainingTrialDays, isReadOnly, isTrialActive, updateTheme, updateProfile, updateClinic,
    }),
    [
      session, user, profile, clinic, userRole, isPatient, loading, signOut,
      remainingTrialDays, isReadOnly, isTrialActive, updateTheme, updateProfile, updateClinic,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
