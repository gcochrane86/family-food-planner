import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { RuleKind } from '../../lib/types';
import { card, input, Page, primary } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

const KIND_LABEL: Record<RuleKind, string> = { substitute: 'Swap', prefer: 'Prefer', avoid: 'Avoid' };

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
    <Page title="Meal rules" intro="What every recipe follows: made from scratch, no ultra-processed food, and which kit does what. Claude follows these when it writes, imports or reworks a recipe, and when it shops."
      loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
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
    </Page>
  );
}
