import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { RuleKind } from '../../lib/types';
import { DEFAULT_BALANCE } from '../../../supabase/functions/_shared/planInput.ts';
import { Badge, card, input, Page, primary } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

const KIND_LABEL: Record<RuleKind, string> = { substitute: 'Swap', prefer: 'Prefer', avoid: 'Avoid' };

const b = DEFAULT_BALANCE;
const BALANCE = [
  { live: true, title: 'Protein', text: `${b.chicken} chicken, ${b.fish} fish, ${b.red_meat} red meat and ${b.veggie} veggie dinners a week, never the same protein two nights running.` },
  { live: true, title: 'Toddler salt', text: "About 0.5g or less in the toddler's portion of a main meal; season the adult plates at the table." },
  { live: false, title: 'Flavour variety', text: 'No two dinners in a row from the same cuisine, at most two of one cuisine a week, and no flavour (spicy, creamy, tomato…) more than twice.' },
];

export default function HouseRules() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload } = useAsync(() => repo.listRules(hid), [hid]);
  const [banner, setBanner] = useState<string | null>(null);
  const [kind, setKind] = useState<RuleKind>('substitute');
  const [match, setMatch] = useState('');
  const [replacement, setReplacement] = useState('');
  const [note, setNote] = useState('');

  async function add() {
    setBanner(null);
    try {
      const rule = await repo.saveRule({
        household_id: hid, kind, match: match.trim(),
        replacement: kind === 'substitute' ? replacement.trim() || null : null, note: note.trim() || null,
      });
      setData((d) => [...(d ?? []).filter((r) => r.id !== rule.id), rule]);
      setMatch(''); setReplacement(''); setNote('');
    } catch {
      setBanner(SAVE_ERROR);
    }
  }

  async function remove(id: string) {
    setBanner(null);
    try {
      await repo.deleteRule(id);
      setData((d) => (d ?? []).filter((r) => r.id !== id));
    } catch {
      setBanner(SAVE_ERROR);
    }
  }

  return (
    <Page title="Meal specifications" intro="What a good week of meals looks like: the balance across the week, and how every recipe is made. The planner follows the balance; Claude follows all of it when it writes, imports or reworks a recipe."
      loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      <section aria-label="Balance across the week" className="grid gap-2">
        <h2 className="text-lg font-bold">Balance across the week</h2>
        <ul className={`${card} m-0 grid list-none gap-3 p-4 text-[15px] leading-snug`}>
          {BALANCE.map((r) => (
            <li key={r.title} className={r.live ? '' : 'text-muted'}><Badge live={r.live} /><b className="text-ink">{r.title}:</b> {r.text}</li>
          ))}
        </ul>
      </section>
      <section aria-label="How meals are made" className="grid gap-2">
      <h2 className="text-lg font-bold">How meals are made</h2>
      <ul className={`${card} divide-y divide-line`}>
        {data?.length === 0 && <li className="p-4 text-muted">No rules yet.</li>}
        {data?.map((r) => (
          <li key={r.id} className="grid gap-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0">
                <span className="mr-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-muted">{KIND_LABEL[r.kind]}</span>
                <span className="font-semibold">{r.match}</span>
                {r.replacement && <> → <span className="font-semibold">{r.replacement}</span></>}
              </p>
              <button type="button" className="shrink-0 text-sm text-muted underline" onClick={() => void remove(r.id)}>Remove</button>
            </div>
            {r.note && <p className="text-sm text-muted">{r.note}</p>}
          </li>
        ))}
      </ul>
      <form className={`${card} grid gap-3 p-4`} onSubmit={(e) => { e.preventDefault(); if (match.trim()) void add(); }}>
        <p className="font-semibold">Add a rule</p>
        <label className="grid gap-1 text-sm font-semibold">
          Type
          <select id="rule-kind" className={input} value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
            <option value="substitute">Swap one thing for another</option>
            <option value="prefer">Prefer</option>
            <option value="avoid">Avoid</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {kind === 'substitute' ? 'Instead of' : 'Ingredient or product'}
          <input id="rule-match" className={input} value={match} onChange={(e) => setMatch(e.target.value)} />
        </label>
        {kind === 'substitute' && (
          <label className="grid gap-1 text-sm font-semibold">
            Use
            <input id="rule-replacement" className={input} value={replacement} onChange={(e) => setReplacement(e.target.value)} />
          </label>
        )}
        <label className="grid gap-1 text-sm font-semibold">
          Note (optional)
          <input id="rule-note" className={input} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" className={primary} disabled={!match.trim()}>Add rule</button>
      </form>
      </section>
    </Page>
  );
}
