import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cloudApi, isCloudConfigured, type AuthSession } from './cloudApi';

type AuthContextValue = {
  session: AuthSession | null;
  isLoading: boolean;
  isConfigured: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(isCloudConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!isCloudConfigured) return () => { active = false; };
    void cloudApi.getStoredSession().then((stored) => {
      if (active) { setSession(stored); setIsLoading(false); }
    }).catch(() => {
      if (active) { setError('No se pudo recuperar la sesión.'); setIsLoading(false); }
    });
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isCloudConfigured) throw new Error('Cloud sync is not configured for this build.');
    setError(null);
    try { setSession(await cloudApi.signIn(email, password)); } catch (signInError) { const message = signInError instanceof Error ? signInError.message : 'No se pudo iniciar sesión.'; setError(message); throw signInError; }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isCloudConfigured) throw new Error('Cloud sync is not configured for this build.');
    setError(null);
    try { setSession(await cloudApi.signUp(email, password)); return { needsEmailConfirmation: false }; } catch (signUpError) { const message = signUpError instanceof Error ? signUpError.message : 'No se pudo crear la cuenta.'; setError(message); throw signUpError; }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try { await cloudApi.signOut(session); setSession(null); } catch (signOutError) { const message = signOutError instanceof Error ? signOutError.message : 'No se pudo cerrar sesión.'; setError(message); throw signOutError; }
  }, [session]);

  const deleteAccount = useCallback(async () => {
    if (!session) throw new Error('No hay una sesión activa.');
    setError(null);
    try { await cloudApi.deleteAccount(session); setSession(null); } catch (functionError) { const message = functionError instanceof Error ? functionError.message : 'No se pudo eliminar la cuenta.'; setError(message); throw functionError; }
  }, [session]);

  const value = useMemo(() => ({ session, isLoading, isConfigured: isCloudConfigured, error, signIn, signUp, signOut, deleteAccount }), [session, isLoading, error, signIn, signUp, signOut, deleteAccount]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
