import { useState } from 'react';
import { getSupabase } from '../lib/supabase';
import ErrorBanner from '../components/ErrorBanner';
import { useAuth } from './AuthProvider';
import { INVITE_LENGTH, joinErrorMessage, normaliseCode } from '../lib/invite';
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
    const { data, error: e } = await getSupabase().rpc('join_household', { p_code: code });
    setBusy(false);
    if (e || !data) { setError(joinErrorMessage(e)); return; }
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
          <input id="invite" autoCapitalize="characters" autoComplete="off" value={code}
            onChange={(e) => setCode(normaliseCode(e.target.value))} className={`${field} font-mono tracking-[0.2em]`} />
        </label>
        <button type="submit" className={secondaryButton} disabled={busy || code.length < INVITE_LENGTH}>Join</button>
      </form>
      {error && <ErrorBanner message={error} />}
      <button type="button" className="text-sm text-muted underline" onClick={() => void signOut()}>Sign out</button>
    </section>
  );
}
