import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { formatQty } from '../../lib/recipes';
import { repo } from '../../lib/repo';
import { buildShoppingList, pickShoppingWeek, tickKey, type ShopItem } from '../../lib/shopping';
import SparList from './SparList';
import { packsNeeded } from '../../lib/packs';
import type { BasketRun, MealSlot, PreparedItem, Product, RecipeDetail } from '../../lib/types';
import { parseBatch } from '../../lib/batch';
import { SAVE_ERROR, useAsync } from '../settings/useAsync';
import { weekStarts } from '../week/useWeek';

type Delivery = 'sun' | 'tue';


export default function ShopList() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, error, loading, reload } = useAsync(async () => {
    const starts = weekStarts();
    const [next, current, staples, settings, basics, products] = await Promise.all([
      repo.getWeek(hid, starts.nextWeek), repo.getWeek(hid, starts.thisWeek), repo.listStaples(hid), repo.getSettings(hid), repo.listBasics(hid),
      repo.listProducts(hid),
    ]);
    const chosen = pickShoppingWeek(next, current);
    const draft = !chosen && (next.week ?? current.week) ? true : false;
    if (!chosen) return { chosen: null, draft, list: null, ticks: new Map<string, boolean>(), runs: [] as BasketRun[], products: new Map<string, Product>(), build: null, freezer: [] as PreparedItem[] };
    const ids = [...new Set(chosen.slots.filter((s) => s.slot === 'dinner' && s.mode === 'cook' && s.recipe_id).map((s) => s.recipe_id!))];
    const details = (await Promise.all(ids.map((id) => repo.getRecipe(id)))).filter((r): r is RecipeDetail => !!r);
    const recipes = new Map(details.map((r) => [r.id, r]));
    const build = (slots: MealSlot[]) => buildShoppingList(slots, recipes, staples, settings.shops_per_week, basics);
    const [tickRows, runs, freezer] = await Promise.all([repo.getTicks(chosen.week!.id), repo.getRuns(chosen.week!.id), repo.listPrepared(hid).catch(() => [] as PreparedItem[])]);
    const ticks = new Map(tickRows.map((t) => [`${t.delivery}:${t.item_key}`, t.ticked]));
    return { chosen, draft, list: build(chosen.slots), build, recipes, ticks, shops: settings.shops_per_week, runs, products: new Map(products.map((p) => [p.item_key, p])), freezer };
  }, [hid]);
  const [ticked, setTicked] = useState<Map<string, boolean>>(new Map());
  const [banner, setBanner] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, BasketRun>>({});
  const runFor = (d: Delivery) => runs[d] ?? data?.runs.find((r) => r.delivery === d) ?? null;
  // The freezer check changes dinners' batch plans, and so the list: keep the changed slots and rebuild from them.
  const [slots, setSlots] = useState<MealSlot[] | null>(null);
  // The freezer as the check leaves it, so a second "It's there" takes the next portion, not the same one again.
  const [freezerNow, setFreezer] = useState<PreparedItem[] | null>(null);
  const freezer = freezerNow ?? data?.freezer ?? [];
  const weekSlots = slots ?? data?.chosen?.slots ?? [];
  const list = data?.build ? (slots ? data.build(slots) : data.list) : null;
  const unchecked = weekSlots.filter((s) => s.slot === 'dinner' && s.batch === 'frozen');

  /** "It's there": takes one portion (soonest in-date use-by first) and marks the dinner checked. "Not there": the
   *  dinner buys its batch ingredients again, and that recipe's freezer entries are cleared. */
  async function freezerAnswer(slot: MealSlot, there: boolean) {
    if (!data?.chosen) return;
    setBanner(null);
    const today = new Date().toISOString().slice(0, 10);
    const items = freezer.filter((i) => i.recipe_id === slot.recipe_id && i.location === 'freezer' && i.portions > 0);
    const inDate = items.filter((i) => !i.use_by || i.use_by >= today).sort((a, b) => (a.use_by ?? '9999').localeCompare(b.use_by ?? '9999'));
    const take = there ? inDate[0] : undefined;
    const updated: MealSlot = { ...slot, batch: take ? 'frozen_ok' : null };
    try {
      // Freezer first: if that fails the dinner stays unanswered, so nothing is checked without its portion taken.
      if (take) await repo.setPreparedPortions(take.id, take.portions - 1);
      else await Promise.all(items.map((i) => repo.setPreparedPortions(i.id, 0)));
      setFreezer((list) => (list ?? data.freezer ?? []).map((i) => (take ? (i.id === take.id ? { ...i, portions: i.portions - 1 } : i) : items.some((x) => x.id === i.id) ? { ...i, portions: 0 } : i)));
      await repo.saveSlots([updated]);
      setSlots((prev) => (prev ?? data.chosen!.slots).map((s) => (s.date === slot.date && s.slot === slot.slot ? updated : s)));
      if (there && !take) setBanner(`No ${parseBatch(data.recipes?.get(slot.recipe_id ?? '')?.batch)?.name.toLowerCase() ?? 'batch'} left in the freezer list, so its ingredients are back on the list.`);
    } catch {
      setBanner(SAVE_ERROR);
    }
  }


  async function ready(d: Delivery, emptyFirst = false) {
    if (!data?.chosen?.week) return;
    setBanner(null);
    try {
      const run = await repo.requestRun(data.chosen.week.id, d, emptyFirst);
      setRuns((r) => ({ ...r, [d]: run }));
    } catch {
      setBanner(SAVE_ERROR);
    }
  }

  const isTicked = (d: Delivery, item: ShopItem) => {
    const id = `${d}:${tickKey(item)}`;
    return ticked.get(id) ?? data?.ticks.get(id) ?? false;
  };

  async function toggle(d: Delivery, item: ShopItem) {
    if (!data?.chosen?.week) return;
    const id = `${d}:${tickKey(item)}`;
    const value = !isTicked(d, item);
    setTicked((m) => new Map(m).set(id, value));
    setBanner(null);
    try {
      await repo.setTick(data.chosen.week.id, d, tickKey(item), value);
    } catch {
      setTicked((m) => new Map(m).set(id, !value));
      setBanner(SAVE_ERROR);
    }
  }

  return (
    <section className="grid gap-5 py-4">
      <h1 className="text-3xl font-bold">Shopping</h1>
      <SparList />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {banner && <ErrorBanner message={banner} />}
      {loading && !error && <p className="text-muted">Loading…</p>}
      {!loading && data && !data.chosen && (
        <div className="rounded-2xl border border-dashed border-line p-6">
          <p className="m-0 font-semibold">{data.draft ? "Approve next week's menu to make the list." : 'No menu yet. Your first menu arrives Friday at 7pm.'}</p>
        </div>
      )}
      {unchecked.length > 0 && (
        <section aria-label="Check the freezer first" className="grid gap-2 rounded-2xl border border-yolk bg-yolk-soft p-4">
          <h2 className="m-0 text-lg font-bold">Check the freezer first</h2>
          <p className="m-0 text-sm">These dinners use a batch from the freezer, so their ingredients aren't on the list. Is each one really there?</p>
          {unchecked.map((s) => {
            const r = data?.recipes?.get(s.recipe_id ?? '');
            const name = parseBatch(r?.batch)?.name ?? r?.title ?? 'A batch';
            const day = new Date(`${s.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
            return (
              <div key={s.date} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
                <span className="font-semibold">{name} · for {day}</span>
                <span className="flex gap-2">
                  <button type="button" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink" onClick={() => void freezerAnswer(s, true)}>It's there</button>
                  <button type="button" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold" onClick={() => void freezerAnswer(s, false)}>Not there</button>
                </span>
              </div>
            );
          })}
        </section>
      )}
      {list && (data?.shops === 2 ? (
        <>
          <Section d="sun" title="Sunday delivery" items={list.sun} isTicked={isTicked} toggle={toggle} run={runFor('sun')} onReady={ready} products={data.products} blocked={unchecked.length > 0} />
          <Section d="tue" title="Tuesday delivery" items={list.tue} isTicked={isTicked} toggle={toggle} run={runFor('tue')} onReady={ready} products={data.products} blocked={unchecked.length > 0} />
        </>
      ) : (
        <Section d="sun" title="Your shop" items={[...list.sun, ...list.tue]} isTicked={isTicked} toggle={toggle} run={runFor('sun')} onReady={ready} products={data!.products} blocked={unchecked.length > 0} />
      ))}
      {data?.list && <p className="text-sm text-muted">Made from the approved menu's dinners plus your weekly basics (Settings → Weekly basics).</p>}
    </section>
  );
}

function RunStatus({ run, onReady, blocked = false }: { run: BasketRun | null; onReady: (emptyFirst?: boolean) => void; blocked?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  if (run?.status === 'requested') {
    return <p className="m-0 rounded-xl bg-evening-soft px-3 py-2 text-sm">
      {run.empty_first ? 'Waiting for Claude to empty and refill your trolley.' : 'Waiting for Claude.'} It starts within 15 minutes while your Mac is on.
    </p>;
  }
  if (run?.status === 'filling') {
    return <p className="m-0 rounded-xl bg-evening-soft px-3 py-2 text-sm font-semibold">
      {run.empty_first ? 'Claude is emptying and refilling your trolley now…' : 'Claude is filling your basket now…'}
    </p>;
  }
  const filledBefore = run?.status === 'done' || run?.status === 'failed';
  return (
    <div className="grid gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {run?.status === 'done' && <><b className="text-accent">✓ Basket filled.</b> <span>{run.summary}</span></>}
          {run?.status === 'failed' && <><b className="text-warn">Basket not finished.</b> <span>{run.summary}</span></>}
          {!run && 'When the list looks right:'}
        </span>
        <span className="flex flex-wrap gap-2">
          <button type="button" disabled={blocked} title={blocked ? 'Check the freezer first' : undefined} onClick={() => onReady()} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink disabled:opacity-50">{filledBefore ? 'Fill again (tops up only)' : "Ready for Sainsbury's"}</button>
          {filledBefore && !confirm && (
            <button type="button" disabled={blocked} onClick={() => setConfirm(true)} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold disabled:opacity-50">Empty and refill</button>
          )}
        </span>
      </div>
      {confirm && (
        <div role="group" aria-label="Empty the trolley?" className="grid gap-2 rounded-lg border border-line bg-surface p-3">
          <p className="m-0">This removes everything in your Sainsbury's trolley, including things you added yourself, then fills it again from this list.</p>
          <span className="flex gap-2">
            <button type="button" onClick={() => { setConfirm(false); onReady(true); }} className="rounded-lg bg-warn px-3 py-1.5 font-semibold text-bg">Yes, empty and refill</button>
            <button type="button" onClick={() => setConfirm(false)} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold">Cancel</button>
          </span>
        </div>
      )}
    </div>
  );
}

/** One delivery's list. A top-level component, so ticking doesn't rebuild the list (and lose keyboard focus). */
function Section({ d, title, items, isTicked, toggle, run, onReady, products, blocked = false }: {
  d: Delivery; title: string; items: ShopItem[]; isTicked: (d: Delivery, item: ShopItem) => boolean;
  toggle: (d: Delivery, item: ShopItem) => Promise<void>; run: BasketRun | null; onReady: (d: Delivery, emptyFirst?: boolean) => void;
  products: Map<string, Product>;
  blocked?: boolean;
}) {
  const left = items.filter((i) => !isTicked(d, i)).length;
  return (
    <section aria-label={title} className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <span className="text-sm text-muted">{left} to get</span>
      </div>
      <RunStatus run={run} onReady={(emptyFirst) => onReady(d, emptyFirst)} blocked={blocked} />
      {items.length === 0 ? <p className="text-muted">Nothing needed.</p> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {items.map((item) => {
            const done = isTicked(d, item);
            const amount = formatQty(item.qty, item.unit, item.approx);
            const product = products.get(item.key);
            const packs = product?.pack_size ? packsNeeded(item.qty, item.unit, Number(product.pack_size), product.pack_unit) : null;
            return (
              <li key={item.key}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5">
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--accent)]" checked={done} onChange={() => void toggle(d, item)}
                    aria-label={`${amount} ${item.name}`.trim()} />
                  <span className="min-w-0">
                    <span className={`block font-semibold ${done ? 'text-muted line-through' : ''}`}>{amount ? `${amount} ${item.name}` : item.name}</span>
                    <span className="block text-[12.5px] text-muted">{item.forMeals[0]?.startsWith('Cupboard') ? item.forMeals[0] : `for ${item.forMeals.join(', ')}`}</span>
                    {product && <span className="block text-[12.5px] text-teal">{product.product_name}{packs ? ` × ${packs}` : ''}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
