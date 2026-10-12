import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isCloudConfigured, supabase } from './supabase';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function requireClient() {
  if (!supabase) throw new Error('Cloud sync is not configured for this build.');
  return supabase;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isCloudConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setIsLoading(false); }
    }).catch(() => {
      if (active) { setError('No se pudo recuperar la sesión.'); setIsLoading(false); }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireClient();
    setError(null);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) { setError(signInError.message); throw signInError; }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const client = requireClient();
    setError(null);
    const { data, error: signUpError } = await client.auth.signUp({ email, password });
    if (signUpError) { setError(signUpError.message); throw signUpError; }
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const client = requireClient();
    setError(null);
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) { setError(signOutError.message); throw signOutError; }
  }, []);

  const deleteAccount = useCallback(async () => {
    const client = requireClient();
    setError(null);
    const { error: functionError } = await client.functions.invoke('delete-account', { body: { confirm: true } });
    if (functionError) { setError(functionError.message); throw functionError; }
    setSession(null);
    await client.auth.signOut().catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ session, isLoading, isConfigured: isCloudConfigured, error, signIn, signUp, signOut, deleteAccount }), [session, isLoading, error, signIn, signUp, signOut, deleteAccount]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
