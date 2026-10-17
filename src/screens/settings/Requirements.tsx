import { useState } from 'react';
import ErrorBanner from '../../components/ErrorBanner';
import { repo } from '../../lib/repo';
import type { DayRule, OtherShop, Settings } from '../../lib/types';
import { card, input } from './ui';
import { SAVE_ERROR } from './useAsync';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PROTEIN: Record<DayRule['protein'], string> = { chicken: 'chicken', fish: 'fish', red_meat: 'red meat', veggie: 'veggie', egg: 'egg', other: 'other' };
const small = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold';

/** Your requirements: a dinner on a set day (fish on Thursday), and things bought at other shops. */
export default function Requirements({ householdId, settings, onSaved }: { householdId: string; settings: Settings; onSaved: (s: Settings) => void }) {
  const [banner, setBanner] = useState<string | null>(null);
  const [weekday, setWeekday] = useState(3);
  const [protein, setProtein] = useState<DayRule['protein']>('fish');
  const [why, setWhy] = useState('');
  const [shop, setShop] = useState('');
  const [buys, setBuys] = useState('');
  const [shopDay, setShopDay] = useState('');
  const [sometimes, setSometimes] = useState(false);
  const dayRules = settings.day_rules ?? [];
  const shops = settings.other_shops ?? [];

  async function save(next: Settings) {
    setBanner(null);
    try { await repo.saveSettings(householdId, next); onSaved(next); } catch { setBanner(SAVE_ERROR); }
  }

  return (
    <section aria-label="Your requirements" className="grid gap-2">
      <h2 className="text-lg font-bold">Your requirements</h2>
      {banner && <ErrorBanner message={banner} />}
      <ul className={`${card} m-0 grid list-none gap-0 divide-y divide-line p-0 text-[15px]`}>
        {dayRules.length === 0 && shops.length === 0 && <li className="p-4 text-muted">None yet.</li>}
        {dayRules.map((r, i) => (
          <li key={`d${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span><b>{DAYS[r.weekday]}:</b> a {PROTEIN[r.protein]} dinner{r.note ? ` · ${r.note}` : ''}</span>
            <button type="button" aria-label={`Remove the ${DAYS[r.weekday]} rule`} className="text-sm text-muted underline" onClick={() => void save({ ...settings, day_rules: dayRules.filter((_, j) => j !== i) })}>Remove</button>
          </li>
        ))}
        {shops.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span><b>{s.name}{s.day !== null ? `, on ${DAYS[s.day]}` : ''}:</b> {s.buys.join(', ')}{s.sometimes ? ' · only some weeks (switch on the Shop tab)' : ''}</span>
            <button type="button" aria-label={`Remove ${s.name}`} className="text-sm text-muted underline" onClick={() => void save({ ...settings, other_shops: shops.filter((x) => x.name !== s.name) })}>Remove</button>
          </li>
        ))}
      </ul>

      <form aria-label="Add a day rule" className={`${card} flex flex-wrap items-end gap-2 p-3`} onSubmit={(e) => {
        e.preventDefault();
        void save({ ...settings, day_rules: [...dayRules.filter((r) => r.weekday !== weekday), { weekday, protein, note: why.trim() || null }].sort((a, b) => a.weekday - b.weekday) });
        setWhy('');
      }}>
        <label className="grid gap-1 text-sm font-semibold">Day
          <select className={input} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Dinner
          <select className={input} value={protein} onChange={(e) => setProtein(e.target.value as DayRule['protein'])}>
            {(Object.keys(PROTEIN) as DayRule['protein'][]).map((p) => <option key={p} value={p}>{PROTEIN[p]}</option>)}
          </select>
        </label>
        <label className="grid flex-1 gap-1 text-sm font-semibold">Why (optional)<input className={input} value={why} maxLength={80} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. the fishmonger's in town" /></label>
        <button type="submit" className={small}>Add</button>
      </form>

      <form aria-label="Add a shop" className={`${card} flex flex-wrap items-end gap-2 p-3`} onSubmit={(e) => {
        e.preventDefault();
        const list = buys.split(',').map((b) => b.trim().toLowerCase()).filter(Boolean);
        if (!shop.trim() || !list.length) return;
        const next: OtherShop = { name: shop.trim(), buys: list, day: shopDay === '' ? null : Number(shopDay), sometimes, weeks: [] };
        void save({ ...settings, other_shops: [...shops.filter((s) => s.name !== next.name), next] });
        setShop(''); setBuys(''); setShopDay(''); setSometimes(false);
      }}>
        <label className="grid gap-1 text-sm font-semibold">Shop<input className={input} value={shop} maxLength={40} onChange={(e) => setShop(e.target.value)} placeholder="e.g. Farm shop" /></label>
        <label className="grid flex-1 gap-1 text-sm font-semibold">What you buy there<input className={input} value={buys} onChange={(e) => setBuys(e.target.value)} placeholder="e.g. eggs, milk, butter" /></label>
        <label className="grid gap-1 text-sm font-semibold">For
          <select className={input} value={shopDay} onChange={(e) => setShopDay(e.target.value)}>
            <option value="">Any day</option>{DAYS.map((d, i) => <option key={d} value={i}>{d}'s dinner</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sometimes} onChange={(e) => setSometimes(e.target.checked)} /> Only some weeks</label>
        <button type="submit" className={small}>Add</button>
      </form>
    </section>
  );
}
