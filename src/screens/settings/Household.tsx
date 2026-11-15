import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { householdPortions, parseWeight } from '../../lib/household';
import { INVITE_LENGTH, joinErrorMessage, normaliseCode } from '../../lib/invite';
import { repo } from '../../lib/repo';
import type { Member, MemberKind, Partners, Recipe } from '../../lib/types';
import { button, card, copyText, input, Page, primary } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';
import type { Macro, Targets } from '../../../supabase/functions/_shared/balance.ts';

export function formatPortions(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(Number(n.toFixed(2)));
}

export default function Household() {
  const { householdId, refresh } = useAuth();
  const hid = householdId!;
  const { data, setData, error, loading, reload } = useAsync(
    async () => {
      const [household, members, settings, recipes] = await Promise.all([repo.getHousehold(hid), repo.listMembers(hid),
        Promise.resolve().then(() => repo.getSettings(hid)).catch(() => null),
        Promise.resolve().then(() => repo.listRecipes(hid)).catch(() => [] as Recipe[])]);
      return { household, members, settings, recipes };
    },
    [hid],
  );
  const [text, setText] = useState<Record<string, string>>({});
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [nameError, setNameError] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<MemberKind>('adult');
  const [switching, setSwitching] = useState(false);
  const [switchCode, setSwitchCode] = useState('');

  async function switchHousehold() {
    setBanner(null);
    try {
      const joined = await repo.joinHousehold(switchCode);
      if (!joined) { setBanner(joinErrorMessage(null)); return; }
      await refresh();
    } catch (e) {
      setBanner(joinErrorMessage({ message: e instanceof Error ? e.message : String(e) }));
    }
  }

  const members = data?.members ?? [];
  const setMembers = (next: Member[] | ((list: Member[]) => Member[])) =>
    setData((d) => (d ? { ...d, members: typeof next === 'function' ? next(d.members) : next } : d));
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

  async function commitName(m: Member) {
    const name = (names[m.id] ?? m.name).trim();
    if (!name) { setNameError((e) => ({ ...e, [m.id]: 'Enter a name' })); return; }
    setNameError((e) => ({ ...e, [m.id]: '' }));
    setNames((n) => ({ ...n, [m.id]: name }));
    if (name === m.name) return;
    const before = members;
    const updated = { ...m, name };
    setMembers(members.map((x) => (x.id === m.id ? updated : x)));
    setBanner(null);
    try {
      await repo.saveMember(updated);
    } catch {
      setMembers(before);
      setNames((n) => ({ ...n, [m.id]: m.name }));
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
      // Their meal partners go with them, so nothing more is made or bought for them.
      const partners = data?.settings?.meal_partners ?? {};
      if (Object.values(partners).some((by) => id in by)) {
        const next = Object.fromEntries(Object.entries(partners).map(([meal, by]) => [meal, Object.fromEntries(Object.entries(by).filter(([k]) => k !== id))])
          .filter(([, by]) => Object.keys(by as object).length)) as Partners;
        await repo.saveMealPartners(hid, next);
        setData((d) => (d && d.settings ? { ...d, settings: { ...d.settings, meal_partners: next } } : d));
      }
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
              <div className="min-w-0 flex-1">
                <input id={`name-${m.id}`} aria-label={`${m.name} name`} autoComplete="off"
                  className={`${input} max-w-[16rem] font-semibold`} value={names[m.id] ?? m.name}
                  onChange={(e) => setNames((n) => ({ ...n, [m.id]: e.target.value }))}
                  onBlur={() => void commitName(m)} />
                <p className="mt-1 text-sm text-muted">{m.kind === 'adult' ? 'Adult' : 'Child'}</p>
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
            {nameError[m.id] && <p className="text-sm font-semibold text-warn">{nameError[m.id]}</p>}
            <DailyTargets m={m} onSave={async (targets) => {
              const before = m.targets ?? null;
              setBanner(null);
              setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, targets } : x)));
              try { await repo.saveMember({ ...m, targets }); return true; } catch {
                setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, targets: before } : x)));
                setBanner(SAVE_ERROR);
                return false;
              }
            }} />
            {data?.settings && <MealPartners m={m} partners={data.settings.meal_partners ?? {}}
              meals={[...new Set([...(data.settings.breakfasts ?? []), ...(data.settings.lunches ?? []), 'Packed lunch'])]}
              snacks={data.recipes.filter((r) => r.kind === 'snack' && r.status !== 'archived' && (m.kind !== 'child' || r.toddler_ok !== false))}
              onSave={async (next) => {
                setBanner(null);
                try {
                  await repo.saveMealPartners(hid, next);
                  setData((d) => (d && d.settings ? { ...d, settings: { ...d.settings, meal_partners: next } } : d));
                } catch { setBanner(SAVE_ERROR); }
              }} />}
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
            <span className="font-mono text-2xl tracking-[0.2em]">{data.household.invite_code}</span>
            <button type="button" className={button} onClick={async () => setCopied(await copyText(data.household.invite_code))}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 break-all text-xs text-muted">Household ID (for the seed script): <span className="select-all font-mono">{hid}</span></p>
        </div>
      )}

      {data && (
        <div className={`${card} grid gap-3 p-4`}>
          {!switching ? (
            <button type="button" className={`${button} justify-self-start`} onClick={() => setSwitching(true)}>Join another household</button>
          ) : (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void switchHousehold(); }}>
              <p className="text-sm">
                You'll leave this household and join theirs. If nobody else is in this one, it's deleted along with its settings.
              </p>
              <label className="grid gap-1.5 text-sm font-semibold">
                Their invite code
                <input id="switch-code" autoCapitalize="characters" autoComplete="off" className={`${input} font-mono tracking-[0.2em]`}
                  value={switchCode} onChange={(e) => setSwitchCode(normaliseCode(e.target.value))} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={primary} disabled={switchCode.length < INVITE_LENGTH}>Leave and join</button>
                <button type="button" className={button} onClick={() => { setSwitching(false); setSwitchCode(''); }}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
    </Page>
  );
}

const TARGETS: [Macro, string, string][] = [
  ['kcal', 'Calories', 'kcal'], ['protein_g', 'Protein', 'g'], ['fat_g', 'Fat', 'g'], ['sat_fat_g', 'Saturated fat', 'g'],
  ['carbs_g', 'Carbohydrate', 'g'], ['sugars_g', 'Sugars', 'g'], ['fibre_g', 'Fibre', 'g'], ['salt_g', 'Salt', 'g'],
];

/** A person's daily targets: each saved when its box is left; an empty box clears it. */
function DailyTargets({ m, onSave }: { m: Member; onSave: (t: Targets) => Promise<boolean> }) {
  const [text, setText] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const value = (k: Macro) => text[k] ?? (m.targets?.[k] != null ? String(m.targets[k]) : '');
  function commit(k: Macro) {
    const raw = text[k];
    if (raw === undefined) return;
    const n = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    if (n !== null && (!Number.isFinite(n) || n < 0)) { setProblem('Enter a number of 0 or more, or leave it empty.'); return; }
    setProblem(null);
    const next: Targets = { ...(m.targets ?? {}) };
    if (n === null) delete next[k]; else next[k] = n;
    if (JSON.stringify(next) === JSON.stringify(m.targets ?? {})) return;
    // Saved or not, the box then shows what's saved.
    void onSave(next).then(() => setText((t) => { const { [k]: _, ...rest } = t; return rest; }));
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-accent">Daily targets</summary>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TARGETS.map(([k, label, unit]) => (
          <label key={k} className="grid gap-1">
            <span className="text-muted">{label} ({unit})</span>
            <input inputMode="decimal" aria-label={`${m.name} daily ${label.toLowerCase()} (${unit})`} className={input} value={value(k)}
              onChange={(e) => setText((t) => ({ ...t, [k]: e.target.value }))} onBlur={() => commit(k)} />
          </label>
        ))}
      </div>
      {problem && <p className="m-0 mt-1 font-semibold text-warn">{problem}</p>}
      <p className="m-0 mt-1 text-muted">Protein and fibre: at least. Sugars, saturated fat and salt: at most. The rest: about.</p>
    </details>
  );
}

/** A person's meal partners: what always comes with a breakfast or lunch for them (overnight oats → 2 boiled eggs). */
function MealPartners({ m, partners, meals, snacks, onSave }: { m: Member; partners: Partners; meals: string[]; snacks: Recipe[]; onSave: (p: Partners) => Promise<void> }) {
  const [meal, setMeal] = useState(meals[0] ?? '');
  const [snack, setSnack] = useState(snacks[0]?.slug ?? '');
  const [qty, setQty] = useState('1');
  const title = (slug: string) => snacks.find((r) => r.slug === slug)?.title ?? slug;
  const mine = Object.entries(partners).flatMap(([ml, by]) => (by[m.id] ?? []).map((it) => ({ meal: ml, ...it })));
  const without = (ml: string, slug: string): Partners => {
    const next: Partners = JSON.parse(JSON.stringify(partners));
    const list = (next[ml]?.[m.id] ?? []).filter((it) => it.recipe !== slug);
    if (list.length) next[ml][m.id] = list; else if (next[ml]) delete next[ml][m.id];
    if (next[ml] && !Object.keys(next[ml]).length) delete next[ml];
    return next;
  };
  function add() {
    const n = Number(qty.replace(',', '.'));
    if (!meal || !snack || !Number.isFinite(n) || n <= 0 || n > 6) return;
    const next = without(meal, snack);
    ((next[meal] ??= {})[m.id] ??= []).push({ recipe: snack, qty: n });
    void onSave(next);
  }
  return (
    <details className="text-sm" open={mine.length > 0 || undefined}>
      <summary className="cursor-pointer font-semibold text-accent">Meal partners</summary>
      <ul className="m-0 mt-2 grid list-none gap-1 p-0">
        {mine.map((it) => (
          <li key={`${it.meal}|${it.recipe}`} className="flex items-center justify-between gap-2">
            <span>{`With ${it.meal}: ${it.qty} × ${title(it.recipe)}`}</span>
            <button type="button" className="text-muted underline" aria-label={`Remove ${title(it.recipe)} with ${it.meal} for ${m.name}`}
              onClick={() => void onSave(without(it.meal, it.recipe))}>Remove</button>
          </li>
        ))}
      </ul>
      {snacks.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label={`${m.name} partner meal`} className={input} value={meal} onChange={(e) => setMeal(e.target.value)}>
            {meals.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select aria-label={`${m.name} partner snack`} className={input} value={snack} onChange={(e) => setSnack(e.target.value)}>
            {snacks.map((r) => <option key={r.id} value={r.slug}>{r.title}</option>)}
          </select>
          <input aria-label={`${m.name} partner how many`} inputMode="decimal" className={`${input} w-16 text-right`} value={qty} onChange={(e) => setQty(e.target.value)} />
          <button type="button" className={button} aria-label={`Add a partner for ${m.name}`} onClick={add}>Add</button>
        </div>
      ) : <p className="m-0 mt-1 text-muted">No snack recipes yet. Claude adds them when it plans a week.</p>}
      <p className="m-0 mt-1 text-muted">Comes with that meal for {m.name} whenever it's planned: counted in their day, made on prep days and bought with the shop.</p>
    </details>
  );
}
