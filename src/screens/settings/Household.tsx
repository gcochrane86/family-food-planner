import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { householdPortions, parseWeight } from '../../lib/household';
import { repo } from '../../lib/repo';
import type { Member, MemberKind } from '../../lib/types';
import { button, card, copyText, input, Page, primary } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

export function formatPortions(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(Number(n.toFixed(2)));
}

export default function Household() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload } = useAsync(
    async () => {
      const [household, members] = await Promise.all([repo.getHousehold(hid), repo.listMembers(hid)]);
      return { household, members };
    },
    [hid],
  );
  const [text, setText] = useState<Record<string, string>>({});
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<MemberKind>('adult');

  const members = data?.members ?? [];
  const setMembers = (next: Member[]) => setData((d) => (d ? { ...d, members: next } : d));
  const shown = (m: Member) => text[m.id] ?? String(m.portion_weight);

  async function commitWeight(m: Member) {
    const parsed = parseWeight(shown(m));
    if (!parsed.ok) { setFieldError((e) => ({ ...e, [m.id]: parsed.error })); return; }
    setFieldError((e) => ({ ...e, [m.id]: '' }));
    if (parsed.value === m.portion_weight) return;
    const before = members;
    const updated = { ...m, portion_weight: parsed.value };
    setMembers(members.map((x) => (x.id === m.id ? updated : x)));
    setText((t) => ({ ...t, [m.id]: String(parsed.value) }));
    setBanner(null);
    try {
      await repo.saveMember(updated);
    } catch {
      setMembers(before);
      setText((t) => ({ ...t, [m.id]: String(m.portion_weight) }));
      setBanner(SAVE_ERROR);
    }
  }

  async function addMember() {
    setBanner(null);
    try {
      const saved = await repo.saveMember({
        household_id: hid, name: newName.trim(), kind: newKind, birthdate: null,
        portion_weight: newKind === 'adult' ? 1.25 : 0.5,
      });
      setMembers([...members, { ...saved, portion_weight: Number(saved.portion_weight) }]);
      setNewName('');
    } catch {
      setBanner(SAVE_ERROR);
    }
  }

  async function removeMember(id: string) {
    setBanner(null);
    try {
      await repo.deleteMember(id);
      setMembers(members.filter((m) => m.id !== id));
    } catch {
      setBanner(SAVE_ERROR);
    }
    setConfirmRemove(null);
  }

  return (
    <Page title="Household" intro="Who's eating, and how big their portions are." loading={loading} error={error} onRetry={reload}>
      <p className="font-display text-2xl font-bold">Household dinner = {formatPortions(householdPortions(members))} portions</p>
      {banner && <ErrorBanner message={banner} />}
      <ul className={`${card} divide-y divide-line`}>
        {members.map((m) => (
          <li key={m.id} className="grid gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{m.name}</p>
                <p className="text-sm text-muted">{m.kind === 'adult' ? 'Adult' : 'Child'}</p>
              </div>
              <span className="flex items-center gap-2 text-sm text-muted">
                <input id={`weight-${m.id}`} aria-label={`${m.name} portion weight`} inputMode="decimal"
                  className={`${input} w-20 text-right`} value={shown(m)}
                  onChange={(e) => setText((t) => ({ ...t, [m.id]: e.target.value }))}
                  onBlur={() => void commitWeight(m)} />
                portions
              </span>
            </div>
            {fieldError[m.id] && <p className="text-sm font-semibold text-warn">{fieldError[m.id]}</p>}
            <div>
              {confirmRemove === m.id ? (
                <span className="flex flex-wrap gap-2">
                  <button type="button" className={button} onClick={() => void removeMember(m.id)}>Remove {m.name}</button>
                  <button type="button" className={button} onClick={() => setConfirmRemove(null)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="text-sm text-muted underline" onClick={() => setConfirmRemove(m.id)}>Remove</button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form className={`${card} grid gap-3 p-4`} onSubmit={(e) => { e.preventDefault(); void addMember(); }}>
        <p className="font-semibold">Add a person</p>
        <div className="flex flex-wrap gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Name</span>
            <input id="new-member-name" placeholder="Name" className={input} value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <label>
            <span className="sr-only">Adult or child</span>
            <select id="new-member-kind" className={input} value={newKind} onChange={(e) => setNewKind(e.target.value as MemberKind)}>
              <option value="adult">Adult</option>
              <option value="child">Child</option>
            </select>
          </label>
          <button type="submit" className={primary} disabled={!newName.trim()}>Add</button>
        </div>
      </form>

      {data && (
        <div className={`${card} grid gap-2 p-4`}>
          <p className="font-semibold">Invite your partner</p>
          <p className="text-sm text-muted">They sign in on their phone, tap “I have a code” and enter:</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl tracking-[0.3em]">{data.household.invite_code}</span>
            <button type="button" className={button} onClick={async () => setCopied(await copyText(data.household.invite_code))}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 break-all text-xs text-muted">Household ID (for the seed script): <span className="select-all font-mono">{hid}</span></p>
        </div>
      )}
    </Page>
  );
}
