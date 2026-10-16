import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import ErrorBanner from '../../components/ErrorBanner';
import { formatQty } from '../../lib/recipes';
import { repo } from '../../lib/repo';
import { buildShoppingList, type ShopItem } from '../../lib/shopping';
import type { RecipeDetail } from '../../lib/types';
import { SAVE_ERROR, useAsync } from '../settings/useAsync';
import { weekStarts } from '../week/useWeek';

type Delivery = 'sun' | 'tue';

/** A tick belongs to an item at a quantity: if the amount changes (guests, swaps), the line needs buying again. */
const tickKey = (item: ShopItem) => (item.qty === null ? item.key : `${item.key}@${Math.round(item.qty * 100) / 100}`);

export default function ShopList() {
  const { householdId } = useAuth();
  const hid = householdId!;
  const { data, error, loading, reload } = useAsync(async () => {
    const starts = weekStarts();
    const [next, current, staples, settings] = await Promise.all([
      repo.getWeek(hid, starts.nextWeek), repo.getWeek(hid, starts.thisWeek), repo.listStaples(hid), repo.getSettings(hid),
    ]);
    const chosen = next.week?.status === 'approved' ? next : current.week?.status === 'approved' ? current : null;
    const draft = !chosen && (next.week ?? current.week) ? true : false;
    if (!chosen) return { chosen: null, draft, list: null, ticks: new Map<string, boolean>() };
    const ids = [...new Set(chosen.slots.filter((s) => s.slot === 'dinner' && s.mode === 'cook' && s.recipe_id).map((s) => s.recipe_id!))];
    const details = (await Promise.all(ids.map((id) => repo.getRecipe(id)))).filter((r): r is RecipeDetail => !!r);
    const list = buildShoppingList(chosen.slots, new Map(details.map((r) => [r.id, r])), staples, settings.shops_per_week);
    const ticks = new Map((await repo.getTicks(chosen.week!.id)).map((t) => [`${t.delivery}:${t.item_key}`, t.ticked]));
    return { chosen, draft, list, ticks, shops: settings.shops_per_week };
  }, [hid]);
  const [ticked, setTicked] = useState<Map<string, boolean>>(new Map());
  const [banner, setBanner] = useState<string | null>(null);

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

  function Section({ d, title, items }: { d: Delivery; title: string; items: ShopItem[] }) {
    const left = items.filter((i) => !isTicked(d, i)).length;
    return (
      <section aria-label={title} className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <span className="text-sm text-muted">{left} to get</span>
        </div>
        {items.length === 0 ? <p className="text-muted">Nothing needed.</p> : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {items.map((item) => {
              const done = isTicked(d, item);
              const amount = formatQty(item.qty, item.unit, item.approx);
              return (
                <li key={item.key}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5">
                    <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--accent)]" checked={done} onChange={() => void toggle(d, item)}
                      aria-label={`${amount} ${item.name}`.trim()} />
                    <span className="min-w-0">
                      <span className={`block font-semibold ${done ? 'text-muted line-through' : ''}`}>{amount ? `${amount} ${item.name}` : item.name}</span>
                      <span className="block text-[12.5px] text-muted">{item.forMeals[0]?.startsWith('Cupboard') ? item.forMeals[0] : `for ${item.forMeals.join(', ')}`}</span>
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

  return (
    <section className="grid gap-5 py-4">
      <h1 className="text-3xl font-bold">Shopping</h1>
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
          <Section d="sun" title="Sunday delivery" items={data.list.sun} />
          <Section d="tue" title="Tuesday delivery" items={data.list.tue} />
        </>
      ) : (
        <Section d="sun" title="Your shop" items={[...data.list.sun, ...data.list.tue]} />
      ))}
      {data?.list && <p className="text-sm text-muted">Made from the dinners in the approved menu. Breakfast and lunch basics come in a later update.</p>}
    </section>
  );
}
