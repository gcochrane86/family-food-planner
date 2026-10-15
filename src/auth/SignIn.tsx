import { useState } from 'react';
import { getSupabase } from '../lib/supabase';
import ErrorBanner from '../components/ErrorBanner';
import { useAuth } from './AuthProvider';
import SignInWithCode from './SignInWithCode';
import { field, primaryButton } from './styles';

/**
 * 'password': accounts are created in Supabase (Authentication → Users) and sign-ups are off. No emails sent.
 * 'code': emailed 6-digit code; only works once custom SMTP is set up so the email template can include the code.
 */
export const SIGN_IN_METHOD: 'password' | 'code' = 'password';

function describe(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Check them and try again.";
  if (/fetch|network|timed out|timeout/i.test(message)) return "Couldn't reach the server. Check your connection and try again.";
  return `Couldn't sign in: ${message}`;
}

export default function SignIn() {
  if (SIGN_IN_METHOD === 'code') return <SignInWithCode />;
  return <SignInWithPassword />;
}

function SignInWithPassword() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (e) { setError(describe(e.message)); return; }
      await refresh();
    } catch (e) {
      setError(describe(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md py-10">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <form className="mt-6 grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="grid gap-1.5 font-semibold">
          Email
          <input id="email" type="email" autoComplete="username" autoCapitalize="none" required value={email}
            onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        <label className="grid gap-1.5 font-semibold">
          Password
          <input id="password" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className={field} />
        </label>
        {error && <ErrorBanner message={error} />}
        <button type="submit" disabled={busy || !email.trim() || !password} className={primaryButton}>Sign in</button>
        <p className="text-sm text-muted">Accounts are set up by the household owner in Supabase. Ask them if you need one.</p>
      </form>
    </section>
  );
}
