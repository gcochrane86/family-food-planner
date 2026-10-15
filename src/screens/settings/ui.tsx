import { Link } from 'react-router-dom';
import ErrorBanner from '../../components/ErrorBanner';

export const card = 'rounded-2xl border border-line bg-surface';
export const input = 'w-full rounded-xl border border-line bg-surface px-3 py-2.5';
export const button = 'rounded-xl border border-line bg-surface px-4 py-2.5 font-semibold disabled:opacity-60';
export const primary = 'rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-ink disabled:opacity-60';

/** A settings sub-screen: back link, title, intro and the load/error states. */
export function Page({ title, intro, loading, error, onRetry, children }: {
  title: string;
  intro?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 py-4">
      <Link to="/settings" className="text-sm font-semibold text-muted no-underline">← Settings</Link>
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {intro && <p className="mt-1 text-muted">{intro}</p>}
      </div>
      {error && <ErrorBanner message={error} onRetry={onRetry} />}
      {loading && !error ? <p className="text-muted">Loading…</p> : !error && children}
    </section>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
