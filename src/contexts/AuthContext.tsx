import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getAppBaseUrl, isSupabaseConfigured, supabase } from '../lib/supabase';
import type { AppLanguage, Profile } from '../types';
import { getSavedLanguage, setAppLanguage } from '../i18n';
import { demoStore } from '../services/demoStore';
import { getBackend } from '../services/dataService';
import { getDefaultCurrencyForLanguage } from '../utils/finance';

const DEMO_ACTIVE_KEY = 'podeli_demo_mode_active';

interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;
  isDemo: boolean;
  isSupabaseReady: boolean;
  pendingVerificationEmail: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<{ needsEmailVerification: boolean }>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateEmail: (newEmail: string) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<Profile>;
  uploadAvatar: (file: File) => Promise<string>;
  enterDemo: () => void;
  exitDemo: () => void;
  resetDemo: () => void;
  clearPendingVerification: () => void;
  setLanguage: (lang: AppLanguage) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [isDemo, setIsDemo] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(DEMO_ACTIVE_KEY) === 'true';
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);

  const loadSupabaseProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error loading profile:', error);
      return null;
    }

    if (data) {
      const profile = data as Profile;
      if (profile.preferred_language) {
        setAppLanguage(profile.preferred_language);
      }
      return profile;
    }

    // Fallback if trigger hasn't fired yet
    const { data: authUser } = await supabase.auth.getUser();
    if (!authUser.user) return null;
    const meta = authUser.user.user_metadata || {};
    const newProfile = {
      id: userId,
      first_name: String(meta.first_name || ''),
      last_name: String(meta.last_name || ''),
      email: authUser.user.email || '',
      preferred_language: getSavedLanguage(),
      preferred_currency: 'RSD' as const,
      onboarding_completed: false,
    };
    const { data: inserted, error: insertErr } = await supabase
      .from('profiles')
      .upsert(newProfile)
      .select('*')
      .single();
    if (insertErr) {
      console.error('Error creating fallback profile:', insertErr);
      return null;
    }
    return inserted as Profile;
  }, []);

  useEffect(() => {
    let active = true;

    const init = async () => {
      if (isDemo) {
        const demoProfile = demoStore.getCurrentProfile();
        if (active) {
          setUser(demoProfile);
          setLoading(false);
        }
        return;
      }

      if (!supabase) {
        if (active) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');
        if (authCode) {
          await supabase.auth.exchangeCodeForSession(authCode);
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const hashAccessToken = hashParams.get('access_token');
        const hashRefreshToken = hashParams.get('refresh_token');
        if (hashAccessToken && hashRefreshToken) {
          await supabase.auth.setSession({
            access_token: hashAccessToken,
            refresh_token: hashRefreshToken,
          });
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (err) {
        console.error('Auth callback token exchange error:', err);
      }

      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        const profile = await loadSupabaseProfile(data.session.user.id);
        if (active) setUser(profile);
      } else if (active) {
        setUser(null);
      }
      if (active) setLoading(false);
    };

    void init();

    if (!supabase) return () => { active = false; };

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (window.sessionStorage.getItem(DEMO_ACTIVE_KEY) === 'true') return;
      if (session?.user) {
        const profile = await loadSupabaseProfile(session.user.id);
        if (active) setUser(profile);
      } else if (active) {
        setUser(null);
      }
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [isDemo, loadSupabaseProfile]);

  const enterDemo = useCallback(() => {
    window.sessionStorage.setItem(DEMO_ACTIVE_KEY, 'true');
    setIsDemo(true);
    const demoProfile = demoStore.getCurrentProfile();
    setUser(demoProfile);
    setLoading(false);
  }, []);

  const exitDemo = useCallback(() => {
    window.sessionStorage.removeItem(DEMO_ACTIVE_KEY);
    setIsDemo(false);
    setUser(null);
  }, []);

  const resetDemo = useCallback(() => {
    demoStore.reset();
    if (isDemo) {
      setUser({ ...demoStore.getCurrentProfile() });
    }
  }, [isDemo]);

  const login = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    window.sessionStorage.removeItem(DEMO_ACTIVE_KEY);
    setIsDemo(false);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    if (data.user) {
      const profile = await loadSupabaseProfile(data.user.id);
      setUser(profile);
    }
  }, [loadSupabaseProfile]);

  const register = useCallback(
    async ({ firstName, lastName, email, password }: RegisterPayload) => {
      if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
      window.sessionStorage.removeItem(DEMO_ACTIVE_KEY);
      setIsDemo(false);
      const lang = getSavedLanguage();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${getAppBaseUrl()}/onboarding`,
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            preferred_language: lang,
            preferred_currency: lang === 'hr' ? 'EUR' : lang === 'bs' ? 'BAM' : 'RSD',
          },
        },
      });
      if (error) throw error;
      if (data.session?.user) {
        const profile = await loadSupabaseProfile(data.session.user.id);
        setUser(profile);
        return { needsEmailVerification: false };
      }
      setPendingVerificationEmail(email.trim());
      return { needsEmailVerification: true };
    },
    [loadSupabaseProfile]
  );

  const logout = useCallback(async () => {
    if (isDemo) {
      exitDemo();
      return;
    }
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
  }, [isDemo, exitDemo]);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${getAppBaseUrl()}/reset-password`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  const updateEmail = useCallback(async (newEmail: string) => {
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) throw error;
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) throw new Error('UNAUTHORIZED');
      const backend = getBackend(isDemo);
      const updated = await backend.updateProfile(user.id, patch);
      setUser(updated);
      if (patch.preferred_language) {
        setAppLanguage(patch.preferred_language);
      }
      return updated;
    },
    [user, isDemo]
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!user) throw new Error('UNAUTHORIZED');
      const backend = getBackend(isDemo);
      const url = await backend.uploadImage('avatars', user.id, file);
      await updateProfile({ avatar_url: url });
      return url;
    },
    [user, isDemo, updateProfile]
  );

  const setLanguage = useCallback(
    async (lang: AppLanguage) => {
      const nextCurrency = getDefaultCurrencyForLanguage(lang);
      setAppLanguage(lang);
      if (user) {
        // Optimistically update local user state immediately so all currency badges flip right away
        setUser((prev) =>
          prev
            ? { ...prev, preferred_language: lang, preferred_currency: nextCurrency }
            : prev
        );
        try {
          await updateProfile({
            preferred_language: lang,
            preferred_currency: nextCurrency,
          });
        } catch {
          // LocalStorage language still persists even if remote sync fails
        }
      }
    },
    [user, updateProfile]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isDemo,
        isSupabaseReady: isSupabaseConfigured,
        pendingVerificationEmail,
        login,
        register,
        logout,
        sendPasswordReset,
        updatePassword,
        updateEmail,
        updateProfile,
        uploadAvatar,
        enterDemo,
        exitDemo,
        resetDemo,
        clearPendingVerification: () => setPendingVerificationEmail(null),
        setLanguage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
