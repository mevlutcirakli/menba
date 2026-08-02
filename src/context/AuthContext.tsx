import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, hasSupabaseEnv } from '../services/supabase';

export interface UserUser {
  id: string;
  email?: string;
  isGuest: boolean;
  name?: string;
}

interface AuthContextType {
  user: UserUser | null;
  isLoading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signUpWithEmail: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signInAsGuest: () => void;
  signOut: () => Promise<void>;
  isSupabaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_GUEST_KEY = 'menba_guest_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        if (hasSupabaseEnv) {
          // Attempt to get session safely without crashing on missing session
          const { data, error } = await supabase.auth.getSession().catch((err) => {
            console.log('Supabase session fetch handled silently:', err?.message || err);
            return { data: { session: null }, error: null };
          });

          if (error) {
            console.log('Handled auth session error silently:', error.message);
          }

          if (data?.session?.user && isMounted) {
            setUser({
              id: data.session.user.id,
              email: data.session.user.email || 'Kullanıcı',
              isGuest: false,
              name: data.session.user.user_metadata?.full_name || data.session.user.email?.split('@')[0] || 'Kullanıcı',
            });
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.log('Ignored auth session error safely:', err);
      }

      // Fallback or guest user session restore
      if (isMounted) {
        const savedGuest = localStorage.getItem(LOCAL_GUEST_KEY);
        if (savedGuest) {
          try {
            setUser(JSON.parse(savedGuest));
          } catch {
            createGuestUser();
          }
        } else {
          createGuestUser();
        }
        setIsLoading(false);
      }
    }

    initAuth();

    if (hasSupabaseEnv) {
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const u: UserUser = {
            id: session.user.id,
            email: session.user.email || 'Kullanıcı',
            isGuest: false,
            name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Kullanıcı',
          };
          setUser(u);
          localStorage.removeItem(LOCAL_GUEST_KEY);
        } else if (event === 'SIGNED_OUT') {
          createGuestUser();
        }
      });

      return () => {
        isMounted = false;
        authListener.subscription.unsubscribe();
      };
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const createGuestUser = () => {
    const guest: UserUser = {
      id: 'guest-' + Math.random().toString(36).substr(2, 9),
      email: 'misafir@menba.ai',
      name: 'Misafir Öğrenci',
      isGuest: true,
    };
    setUser(guest);
    localStorage.setItem(LOCAL_GUEST_KEY, JSON.stringify(guest));
  };

  const signInWithEmail = async (email: string, pass: string) => {
    if (!hasSupabaseEnv) {
      // Local simulation sign in
      const u: UserUser = {
        id: 'user-' + Date.now(),
        email: email,
        name: email.split('@')[0] || 'Öğrenci',
        isGuest: false,
      };
      setUser(u);
      localStorage.setItem('menba_active_user', JSON.stringify(u));
      return { success: true };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email || email,
          name: data.user.email?.split('@')[0] || 'Kullanıcı',
          isGuest: false,
        });
        return { success: true };
      }
      return { success: false, error: 'Giriş yapılamadı.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Giriş sırasında hata oluştu.' };
    }
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    if (!hasSupabaseEnv) {
      return signInWithEmail(email, pass);
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email || email,
          name: email.split('@')[0] || 'Kullanıcı',
          isGuest: false,
        });
        return { success: true };
      }
      return { success: false, error: 'Kayıt gerçekleştirilemedi.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Kayıt sırasında hata oluştu.' };
    }
  };

  const signInAsGuest = () => {
    createGuestUser();
  };

  const signOut = async () => {
    try {
      if (hasSupabaseEnv) {
        await supabase.auth.signOut().catch((err) => console.log('SignOut handled:', err));
      }
    } catch (err) {
      console.log('SignOut error ignored:', err);
    } finally {
      localStorage.removeItem('menba_active_user');
      createGuestUser();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        signInWithEmail,
        signUpWithEmail,
        signInAsGuest,
        signOut,
        isSupabaseConfigured: hasSupabaseEnv,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
