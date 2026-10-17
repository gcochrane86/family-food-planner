import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { FreshStart } from '../../lib/types';
import { card, Page } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

const STATUS: Record<FreshStart['trolley_status'], string> = { requested: 'waiting for Claude (within 15 minutes while your Mac is on)', done: 'emptied', failed: "couldn't finish" };
const COOKIDOO: Record<FreshStart['cookidoo_status'], string> = { ...STATUS, done: "Claude's dinners removed" };

/** Clears the week plans and lists, and asks the Mac to empty the trolley and Claude's My Week entries. */
export default function StartFresh() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload } = useAsync(() => repo.getFreshStart(hid), [hid]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  async function go() {
    setAsking(false);
    setBusy(true);
    setBanner(null);
    try {
      const id = await repo.startFresh(hid);
      setData({ id, household_id: hid, requested_at: new Date().toISOString(), my_week: [], trolley_status: 'requested', cookidoo_status: 'requested', summary: null });
    } catch {
      setBanner(SAVE_ERROR);
    }
    setBusy(false);
  }

  return (
    <Page title="Start fresh" intro="Clear the planned weeks to see the app as new. Nothing you've built up is lost." loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      <section aria-label="What goes" className={`${card} grid gap-1 p-4`}>
        <h2 className="m-0 text-lg font-bold">What goes</h2>
        <ul className="m-0 grid gap-1 pl-5 text-[15px]">
          <li>This week's and next week's plans, with their shopping list and ticks</li>
          <li>The Spar list</li>
          <li>Everything in your Sainsbury's trolley (Claude empties it from your Mac; nothing you've ordered is touched)</li>
          <li>The dinners Claude added to your Cookidoo My Week (anything you added yourself stays)</li>
        </ul>
      </section>
      <section aria-label="What stays" className={`${card} grid gap-1 p-4`}>
        <h2 className="m-0 text-lg font-bold">What stays</h2>
        <p className="m-0 text-[15px]">Your recipes, photos and ratings, the pantry and freezer, staples, settings, saved Sainsbury's products and your Cookidoo recipes.</p>
      </section>
      <button type="button" disabled={busy} onClick={() => setAsking(true)} className="justify-self-start rounded-xl bg-warn px-4 py-2.5 font-semibold text-bg disabled:opacity-50">Start fresh</button>

      {data && (
        <div role="status" className={`${card} grid gap-1 p-4 text-sm`}>
          <b>Started fresh {new Date(data.requested_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}: plans and lists are cleared.</b>
          <span>Sainsbury's trolley: {STATUS[data.trolley_status]}</span>
          <span>Cookidoo My Week: {COOKIDOO[data.cookidoo_status]}</span>
          {data.summary && <span className="text-muted">{data.summary}</span>}
        </div>
      )}

      {asking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setAsking(false)}>
          <div role="alertdialog" aria-modal="true" aria-label="Start fresh?" onClick={(e) => e.stopPropagation()} className="grid w-full max-w-sm gap-3 rounded-2xl bg-surface p-5 shadow-xl">
            <h2 className="m-0 text-lg font-bold">Start fresh?</h2>
            <p className="m-0 text-sm">This deletes both week plans and your lists now, and empties your Sainsbury's trolley and Claude's My Week dinners shortly. It can't be undone.</p>
            <span className="flex gap-2">
              <button type="button" onClick={() => void go()} className="rounded-lg bg-warn px-3 py-1.5 text-sm font-semibold text-bg">Yes, start fresh</button>
              <button type="button" onClick={() => setAsking(false)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Cancel</button>
            </span>
          </div>
        </div>
      )}
    </Page>
  );
}
