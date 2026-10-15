import { useState } from 'react';
import { getSupabase } from '../lib/supabase';
import ErrorBanner from '../components/ErrorBanner';
import { useAuth } from './AuthProvider';
import { field, primaryButton, secondaryButton } from './SignIn';

export default function Onboarding() {
  const { refresh, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const { error: e } = await getSupabase().rpc('create_household', { p_name: 'Our household' });
    setBusy(false);
    if (e) { setError(`Couldn't create the household: ${e.message}`); return; }
    await refresh();
  }

  async function join() {
    setBusy(true);
    setError(null);
    const { error: e } = await getSupabase().rpc('join_household', { p_code: code.trim() });
    setBusy(false);
    if (e) { setError(e.message.includes('invalid_code') ? 'No household has that code.' : `Couldn't join: ${e.message}`); return; }
    await refresh();
  }

  return (
    <section className="mx-auto grid max-w-md gap-6 py-10">
      <div>
        <h1 className="text-3xl font-bold">Set up your household</h1>
        <p className="mt-2 text-muted">One of you creates it. The other joins with the invite code from Settings → Household.</p>
      </div>
      <button type="button" className={primaryButton} disabled={busy} onClick={() => void create()}>Create our household</button>
      <form className="grid gap-3 rounded-2xl border border-line bg-surface p-4" onSubmit={(e) => { e.preventDefault(); void join(); }}>
        <label className="grid gap-1.5 font-semibold">
          I have a code
          <input id="invite" autoCapitalize="characters" autoComplete="off" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())} className={`${field} font-mono tracking-[0.3em]`} />
        </label>
        <button type="submit" className={secondaryButton} disabled={busy || code.trim().length < 6}>Join</button>
      </form>
      {error && <ErrorBanner message={error} />}
      <button type="button" className="text-sm text-muted underline" onClick={() => void signOut()}>Sign out</button>
    </section>
  );
}
