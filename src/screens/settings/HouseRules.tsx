import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { RuleKind } from '../../lib/types';
import { MEAL_SPEC as MEAL } from '../../lib/mealSpec';
import { card, input, Page, primary } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

/** The rules read best as: what we always do, what we swap, and what we never use. */
const GROUPS: { kind: RuleKind; title: string }[] = [
  { kind: 'prefer', title: 'Always' }, { kind: 'substitute', title: 'Swap' }, { kind: 'avoid', title: 'Never' },
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
    <Page title="Meal specifications" intro="What every single meal should be. Claude follows these when it writes, imports or reworks a recipe. How meals are balanced across the week is in Planner specifications."
      loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      <section aria-label="What makes a meal" className="grid gap-2">
        <h2 className="text-lg font-bold">What makes a meal</h2>
        <ul className={`${card} m-0 grid list-none gap-3 p-4 text-[15px] leading-snug`}>
          {MEAL.map((r) => <li key={r.title}><b>{r.title}:</b> {r.text}</li>)}
        </ul>
      </section>
      <section aria-label="How it is made" className="grid gap-2">
      <h2 className="text-lg font-bold">How it's made</h2>
      {data?.length === 0 && <p className={`${card} p-4 text-muted`}>No rules yet.</p>}
      {GROUPS.map((g) => {
        const rules = (data ?? []).filter((r) => r.kind === g.kind).sort((a, b) => a.match.localeCompare(b.match));
        if (!rules.length) return null;
        return (
          <div key={g.kind} className="grid gap-1.5">
            <h3 id={`rules-${g.kind}`} className="text-sm font-bold uppercase tracking-[0.08em] text-muted">{g.title}</h3>
            <ul aria-labelledby={`rules-${g.kind}`} className={`${card} m-0 list-none divide-y divide-line p-0`}>
              {rules.map((r) => (
                <li key={r.id} className="grid gap-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="m-0 min-w-0">
                      <span className="font-semibold">{r.match}</span>
                      {r.replacement && <> → <span className="font-semibold">{r.replacement}</span></>}
                    </p>
                    <button type="button" className="shrink-0 text-sm text-muted underline" onClick={() => void remove(r.id)}>Remove</button>
                  </div>
                  {r.note && <p className="m-0 text-sm text-muted">{r.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <form className={`${card} grid gap-3 p-4`} onSubmit={(e) => { e.preventDefault(); if (match.trim()) void add(); }}>
        <p className="font-semibold">Add a rule</p>
        <label className="grid gap-1 text-sm font-semibold">
          Type
          <select id="rule-kind" className={input} value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
            <option value="substitute">Swap one thing for another</option>
            <option value="prefer">Always</option>
            <option value="avoid">Never</option>
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
