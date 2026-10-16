import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { formatQty } from '../../lib/recipes';
import { repo } from '../../lib/repo';
import { buildShoppingList, pickShoppingWeek, tickKey, type ShopItem } from '../../lib/shopping';
import SparList from './SparList';
import { packsNeeded } from '../../lib/packs';
import type { BasketRun, Product, RecipeDetail } from '../../lib/types';
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
    if (!chosen) return { chosen: null, draft, list: null, ticks: new Map<string, boolean>(), runs: [] as BasketRun[], products: new Map<string, Product>() };
    const ids = [...new Set(chosen.slots.filter((s) => s.slot === 'dinner' && s.mode === 'cook' && s.recipe_id).map((s) => s.recipe_id!))];
    const details = (await Promise.all(ids.map((id) => repo.getRecipe(id)))).filter((r): r is RecipeDetail => !!r);
    const list = buildShoppingList(chosen.slots, new Map(details.map((r) => [r.id, r])), staples, settings.shops_per_week, basics);
    const [tickRows, runs] = await Promise.all([repo.getTicks(chosen.week!.id), repo.getRuns(chosen.week!.id)]);
    const ticks = new Map(tickRows.map((t) => [`${t.delivery}:${t.item_key}`, t.ticked]));
    return { chosen, draft, list, ticks, shops: settings.shops_per_week, runs, products: new Map(products.map((p) => [p.item_key, p])) };
  }, [hid]);
  const [ticked, setTicked] = useState<Map<string, boolean>>(new Map());
  const [banner, setBanner] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, BasketRun>>({});
  const runFor = (d: Delivery) => runs[d] ?? data?.runs.find((r) => r.delivery === d) ?? null;

  async function ready(d: Delivery) {
    if (!data?.chosen?.week) return;
    setBanner(null);
    try {
      const run = await repo.requestRun(data.chosen.week.id, d);
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
      {data?.list && (data.shops === 2 ? (
        <>
          <Section d="sun" title="Sunday delivery" items={data.list.sun} isTicked={isTicked} toggle={toggle} run={runFor('sun')} onReady={ready} products={data.products} />
          <Section d="tue" title="Tuesday delivery" items={data.list.tue} isTicked={isTicked} toggle={toggle} run={runFor('tue')} onReady={ready} products={data.products} />
        </>
      ) : (
        <Section d="sun" title="Your shop" items={[...data.list.sun, ...data.list.tue]} isTicked={isTicked} toggle={toggle} run={runFor('sun')} onReady={ready} products={data.products} />
      ))}
      {data?.list && <p className="text-sm text-muted">Made from the approved menu's dinners plus your weekly basics (Settings → Weekly basics).</p>}
    </section>
  );
}

function RunStatus({ run, onReady }: { run: BasketRun | null; onReady: () => void }) {
  if (run?.status === 'requested') {
    return <p className="m-0 rounded-xl bg-evening-soft px-3 py-2 text-sm">Waiting for Claude. It starts within 15 minutes while your Mac is on.</p>;
  }
  if (run?.status === 'filling') {
    return <p className="m-0 rounded-xl bg-evening-soft px-3 py-2 text-sm font-semibold">Claude is filling your basket now…</p>;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
      <span>
        {run?.status === 'done' && <><b className="text-accent">✓ Basket filled.</b> <span>{run.summary}</span></>}
        {run?.status === 'failed' && <><b className="text-warn">Basket not finished.</b> <span>{run.summary}</span></>}
        {!run && 'When the list looks right:'}
      </span>
      <button type="button" onClick={onReady} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink">{run?.status === 'done' || run?.status === 'failed' ? 'Fill again (tops up only)' : "Ready for Sainsbury's"}</button>
    </div>
  );
}

/** One delivery's list. A top-level component, so ticking doesn't rebuild the list (and lose keyboard focus). */
function Section({ d, title, items, isTicked, toggle, run, onReady, products }: {
  d: Delivery; title: string; items: ShopItem[]; isTicked: (d: Delivery, item: ShopItem) => boolean;
  toggle: (d: Delivery, item: ShopItem) => Promise<void>; run: BasketRun | null; onReady: (d: Delivery) => void;
  products: Map<string, Product>;
}) {
  const left = items.filter((i) => !isTicked(d, i)).length;
  return (
    <section aria-label={title} className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <span className="text-sm text-muted">{left} to get</span>
      </div>
      <RunStatus run={run} onReady={() => onReady(d)} />
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
