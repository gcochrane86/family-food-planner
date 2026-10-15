import { useState } from 'react';
import { getSupabase } from '../lib/supabase';
import ErrorBanner from '../components/ErrorBanner';
import { useAuth } from './AuthProvider';

export const field = 'w-full rounded-xl border border-line bg-surface px-3.5 py-3';
export const primaryButton = 'rounded-xl bg-accent px-5 py-3 font-semibold text-accent-ink disabled:opacity-60';
export const secondaryButton = 'rounded-xl border border-line bg-surface px-4 py-2.5 font-semibold';

export default function SignIn() {
  const { refresh } = useAuth();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error: e } = await getSupabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (e) {
      setError(/rate limit/i.test(e.message)
        ? 'Too many codes sent. Wait a few minutes, then try again.'
        : `Couldn't send the code: ${e.message}`);
      return;
    }
    setCode('');
    setStage('code');
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error: e } = await getSupabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (e) { setError("That code didn't work. Check it or send a new one."); return; }
    await refresh();
  }

  return (
    <section className="mx-auto max-w-md py-10">
      <h1 className="text-3xl font-bold">Sign in</h1>
      {stage === 'email' ? (
        <form className="mt-6 grid gap-4" onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
          <p className="text-muted">We'll email you a 6-digit code. No password needed.</p>
          <label className="grid gap-1.5 font-semibold">
            Email
            <input id="email" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>
          {error && <ErrorBanner message={error} />}
          <button type="submit" disabled={busy || !email.trim()} className={primaryButton}>Send code</button>
        </form>
      ) : (
        <form className="mt-6 grid gap-4" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <p className="text-muted">We've sent a code to <strong className="text-ink">{email.trim()}</strong>.</p>
          <label className="grid gap-1.5 font-semibold">
            6-digit code
            <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${field} font-mono tracking-[0.3em]`} />
          </label>
          {error && <ErrorBanner message={error} />}
          <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}>Sign in</button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={() => void sendCode()} disabled={busy}>Send a new code</button>
            <button type="button" className={secondaryButton} onClick={() => { setStage('email'); setError(null); }}>Use a different email</button>
          </div>
        </form>
      )}
    </section>
  );
}
