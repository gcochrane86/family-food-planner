import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  householdId: string | null;
  loading: boolean;
  error: string | null;
  /** Re-read the session and the household (after signing in, creating or joining). */
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function describe(e: unknown): string {
  if (e instanceof Error && e.name === 'MissingConfigError') {
    return "The app isn't connected to its database yet. See the setup steps in the README.";
  }
  return "Couldn't reach the server. Check your connection and try again.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabase();
      const { data, error: sessionError } = await sb.auth.getSession();
      if (sessionError) throw sessionError;
      setSession(data.session);
      if (data.session) {
        const { data: rows, error: hhError } = await sb.from('household_users').select('household_id').limit(1);
        if (hhError) throw hhError;
        setHouseholdId(rows?.[0]?.household_id ?? null);
      } else {
        setHouseholdId(null);
      }
    } catch (e) {
      setError(describe(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    let unsubscribe = () => {};
    try {
      const { data } = getSupabase().auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') { setSession(null); setHouseholdId(null); }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Missing config is reported by refresh().
    }
    return unsubscribe;
  }, [refresh]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setSession(null);
    setHouseholdId(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, householdId, loading, error, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
