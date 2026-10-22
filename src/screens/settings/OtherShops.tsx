import { useState } from 'react';
import ErrorBanner from '../../components/ErrorBanner';
import { useAuth } from '../../auth/AuthProvider';
import { repo } from '../../lib/repo';
import type { OtherShop, Settings } from '../../lib/types';
import { card, input, Page } from './ui';
import { SAVE_ERROR, useAsync } from './useAsync';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** What the fishmonger, farm shop and other shops sell. The shopping list sends those ingredients there instead of
 *  Sainsbury's, and Claude plans with them (fish from the fishmonger on its day). Add a shop in Planner
 *  specifications → Your requirements. */
export default function OtherShops() {
  const { householdId } = useAuth();
  const { data, setData, error, loading, reload } = useAsync(() => repo.getSettings(householdId!), [householdId]);
  const [banner, setBanner] = useState<string | null>(null);
  const shops = data?.other_shops ?? [];

  async function change(name: string, buys: string[]) {
    if (!data) return;
    const next: Settings = { ...data, other_shops: shops.map((s) => (s.name === name ? { ...s, buys } : s)) };
    setBanner(null);
    const before = data;
    setData(next);
    try { await repo.saveSettings(householdId!, next); } catch { setData(before); setBanner(SAVE_ERROR); }
  }

  return (
    <Page title="Fishmonger & farm shop" intro="What each shop sells. Those ingredients go on that shop's list instead of Sainsbury's, and Claude plans with them." loading={loading} error={error} onRetry={reload}>
      {banner && <ErrorBanner message={banner} />}
      {data && shops.length === 0 && <p className="text-muted">No other shops yet. Add one in Planner specifications → Your requirements.</p>}
      {shops.map((s) => <ShopCard key={s.name} shop={s} onChange={(buys) => void change(s.name, buys)} />)}
    </Page>
  );
}

function ShopCard({ shop, onChange }: { shop: OtherShop; onChange: (buys: string[]) => void }) {
  const [text, setText] = useState('');
  const when = [shop.day !== null ? `For ${DAYS[shop.day]}'s dinner` : 'Any day', shop.sometimes ? 'Only some weeks (switch on the Shop tab)' : 'Every week'].join(' · ');
  function add() {
    const more = text.split(',').map((t) => t.trim().toLowerCase()).filter((t) => t && !shop.buys.includes(t));
    setText('');
    if (more.length) onChange([...shop.buys, ...new Set(more)]);
  }
  return (
    <section aria-label={shop.name} className={`${card} grid gap-3 p-4`}>
      <div>
        <h2 className="m-0 text-lg font-bold">{shop.name}</h2>
        <p className="m-0 text-sm text-muted">{when}</p>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {shop.buys.map((b) => (
          <li key={b} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm font-semibold">
            {b}
            <button type="button" aria-label={`Remove ${b}`} disabled={shop.buys.length <= 1} onClick={() => onChange(shop.buys.filter((x) => x !== b))}
              className="grid h-6 w-6 place-items-center rounded-full text-muted disabled:opacity-30">×</button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input aria-label="Add an ingredient" className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. hake, mussels" />
        <button type="submit" className="rounded-xl border border-line bg-surface px-4 py-2.5 font-semibold">Add</button>
      </form>
    </section>
  );
}
