import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { buildAdhocList } from '../../lib/adhoc';
import { repo } from '../../lib/repo';
import { tickKey, type ShopItem } from '../../lib/shopping';
import type { AdhocItem, Product, RecipeDetail } from '../../lib/types';
import { CupboardCheckList, gotKey, needKey, Section, type Answer } from '../shop/Shopping';
import { SAVE_ERROR, useAsync } from '../settings/useAsync';

const NO_PRODUCTS = new Map<string, Product>();

/** The Shop tab in ad-hoc: the ad-hoc plan's list and anything added by hand, with the cupboard check, in the order
 *  you walk the shop. Its ticks are its own, so the week's shop is never touched. */
export default function AdhocShop() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, error, loading, reload } = useAsync(async () => {
    const [adhoc, staples] = await Promise.all([repo.listAdhoc(hid), repo.listStaples(hid)]);
    const ids = [...new Set(adhoc.meals.map((m) => m.recipe_id))];
    const recipes = new Map((await Promise.all(ids.map((id) => repo.getRecipe(id)))).filter((r): r is RecipeDetail => !!r).map((r) => [r.id, r]));
    return { ...adhoc, staples, recipes };
  }, [hid]);
  const [banner, setBanner] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Map<string, boolean>>(new Map());
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map());
  const [added, setAdded] = useState<AdhocItem[] | null>(null);
  const [name, setName] = useState('');
  const items = added ?? data?.items ?? [];

  const isOn = (key: string) => ticked.get(key) ?? data?.ticks.get(key) ?? false;
  const answerOf = (id: string): Answer => (answers.has(id) ? answers.get(id)! : isOn(needKey(id)) ? 'need' : isOn(gotKey(id)) ? 'got' : null);
  const needed = new Set((data?.staples ?? []).map((s) => s.id).filter((id) => answerOf(id) === 'need'));
  const built = data ? buildAdhocList(data.meals, data.recipes, data.staples, items, needed) : null;
  const checks = data && needed.size ? buildAdhocList(data.meals, data.recipes, data.staples, items).check : built?.check ?? [];

  async function save(key: string, value: boolean) {
    setTicked((m) => new Map(m).set(key, value));
    await repo.setAdhocTick(hid, key, value);
  }

  /** As on the weekly shop: "Need it" marks it run out, so it's bought, and ticking it restocks it. */
  async function answer(id: string, value: Answer) {
    const prev = answerOf(id);
    setAnswers((m) => new Map(m).set(id, value));
    setBanner(null);
    try {
      if (value !== null) await save(value === 'got' ? gotKey(id) : needKey(id), true);
      if (prev !== null && prev !== value) await save(prev === 'got' ? gotKey(id) : needKey(id), false);
      if (value === 'need') await repo.setStaple(id, 'out');
      else if (prev === 'need') await repo.setStaple(id, 'have');
    } catch {
      // Back to how it was, in the database too.
      setAnswers((m) => new Map(m).set(id, prev));
      await Promise.all([save(gotKey(id), prev === 'got'), save(needKey(id), prev === 'need')]).catch(() => {});
      setBanner(SAVE_ERROR);
    }
  }

  async function confirmRest(ids: string[]) {
    setAnswers((m) => { const n = new Map(m); for (const id of ids) n.set(id, 'got'); return n; });
    setBanner(null);
    try { await Promise.all(ids.map((id) => save(gotKey(id), true))); } catch {
      setAnswers((m) => { const n = new Map(m); for (const id of ids) n.set(id, null); return n; });
      await Promise.all(ids.map((id) => save(gotKey(id), false))).catch(() => {});
      setBanner(SAVE_ERROR);
    }
  }

  async function toggle(_d: 'sun' | 'tue', item: ShopItem) {
    const key = tickKey(item);
    const value = !isOn(key);
    setBanner(null);
    try {
      await save(key, value);
      // A cupboard item in the trolley is back in the cupboard; untick it and it's low (or out) again.
      try {
        await Promise.all((item.staples ?? []).map((s) => repo.setStaple(s.id, value ? 'have' : s.status)));
      } catch (e) {
        await repo.setAdhocTick(hid, key, !value).catch(() => {});
        throw e;
      }
    } catch {
      setTicked((m) => new Map(m).set(key, !value));
      setBanner(SAVE_ERROR);
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const text = name.trim().slice(0, 80);
    if (!text) return;
    setBanner(null);
    try {
      const saved = await repo.addAdhocItem(hid, text);
      setAdded([...items, saved]);
      setName('');
    } catch { setBanner(SAVE_ERROR); }
  }

  async function removeItem(item: AdhocItem) {
    setBanner(null);
    setAdded(items.filter((x) => x.id !== item.id));
    try {
      await repo.removeAdhocItem(item.id);
      // The last of the plan gone: clear it, so its ticks and cupboard answers don't carry over to the next trip.
      if (items.length === 1 && !data?.meals.length) { await repo.clearAdhoc(hid); setTicked(new Map()); setAnswers(new Map()); }
    } catch { setAdded(items); setBanner(SAVE_ERROR); }
  }

  const empty = !!data && data.meals.length === 0 && items.length === 0;
  return (
    <>
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {banner && <ErrorBanner message={banner} />}
      {loading && !error && <p className="text-muted">Loading…</p>}
      {data && (
        <>
          {checks.length > 0 && <CupboardCheckList checks={checks} answerOf={answerOf} onAnswer={(id, v) => void answer(id, v)} onConfirmRest={(ids) => void confirmRest(ids)} />}
          {empty ? (
            <p className="m-0 rounded-2xl border border-dashed border-line p-6 font-semibold">Add meals on the Plan tab, or add an item.</p>
          ) : built && (
            <Section d="sun" title="Ad-hoc shop" items={built.list} isTicked={(_d, i) => isOn(tickKey(i))} toggle={toggle}
              run={null} onReady={() => {}} products={NO_PRODUCTS} showRun={false} />
          )}
          <form onSubmit={(e) => void addItem(e)} className="flex gap-2">
            <input aria-label="Add an item" placeholder="Add an item (toothpaste, bin bags…)" value={name} onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5" />
            <button type="submit" disabled={!name.trim()} className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-ink disabled:opacity-60">Add</button>
          </form>
          {items.length > 0 && (
            <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-muted">
              Added:
              {items.map((x) => (
                <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5">
                  {x.name}
                  <button type="button" aria-label={`Remove ${x.name}`} onClick={() => void removeItem(x)} className="font-bold">×</button>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </>
  );
}
