import { useEffect, useState } from 'react';
import { repo } from '../../lib/repo';
import { makeStepPhotos } from '../../lib/stepPhotos';
import type { MealSlot, Recipe } from '../../lib/types';
import type { WeekState } from './useWeek';

const VERDICTS = [['not_enough', 'Not enough'], ['right', 'About right'], ['leftovers', 'Leftovers']] as const;

/** "How was last night's …?": portions and "Have it again?" in two taps, in place of Mark cooked (spec §6). */
export default function FeedbackCard({ w }: { w: WeekState }) {
  // Keep the dinner the card opened with, so it can say thanks after both answers (when lastNight clears).
  const [target, setTarget] = useState<{ slot: MealSlot; recipe: Recipe } | null>(null);
  const [verdict, setVerdict] = useState<MealSlot['portions_verdict']>(null);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => { if (!target && w.lastNight) setTarget({ slot: w.lastNight.slot, recipe: w.lastNight.recipe }); }, [w.lastNight, target]);

  const answeredVerdict = verdict ?? target?.slot.portions_verdict ?? null;
  const answeredRating = rating ?? target?.recipe.rating ?? null;
  const finished = !!answeredVerdict && !!answeredRating;
  useEffect(() => {
    if (!finished) return undefined;
    const t = setTimeout(() => setDone(true), 2500);
    return () => clearTimeout(t);
  }, [finished]);
  if (!target || done) return null;

  async function rate(r: 'up' | 'down') {
    setRating(r);
    if (!(await w.rate(target!.recipe.id, r))) { setRating(null); return; } // not saved: no thanks, ask again
    if (r === 'down') return;
    const detail = await repo.getRecipe(target!.recipe.id).catch(() => null);
    if (detail) void makeStepPhotos(detail.id, detail.steps, () => {});
  }

  const title = `How was last night's ${target.recipe.title}?`;
  const pill = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13.5px] font-semibold ${on ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`;
  return (
    <section aria-label={title} className="relative grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3.5 rounded-[20px] bg-surface p-3 shadow-sm md:grid-cols-[110px_minmax(0,1fr)]">
      {target.recipe.hero_image_path
        ? <img src={repo.heroUrl(target.recipe.hero_image_path, 300)} alt="" className="aspect-square w-full rounded-[14px] object-cover" />
        : <div className="aspect-square w-full rounded-[14px] bg-gradient-to-br from-yolk-soft to-surface-2" />}
      {finished ? (
        <p className="m-0 font-semibold text-accent">Thanks!{answeredRating === 'up' ? ' Step photos are on their way.' : answeredRating === 'down' ? " It won't be suggested again." : ''}</p>
      ) : (
        <div className="grid gap-2 pr-6">
          <h3 className="text-[17px] font-bold leading-tight">{title}</h3>
          <div className="flex flex-wrap gap-1.5">
            {VERDICTS.map(([v, label]) => (
              <button key={v} type="button" aria-pressed={answeredVerdict === v} className={pill(answeredVerdict === v)}
                onClick={() => { setVerdict(v); void w.lastNightVerdict(v).then((ok) => { if (!ok) setVerdict(null); }); }}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={answeredRating === 'up'} className={pill(answeredRating === 'up')} onClick={() => void rate('up')}>👍 Have it again</button>
            <button type="button" aria-pressed={answeredRating === 'down'} className={pill(answeredRating === 'down')} onClick={() => void rate('down')}>👎 Not for us</button>
          </div>
        </div>
      )}
      <button type="button" aria-label="Dismiss" onClick={() => { w.dismissLastNight(); setDone(true); }}
        className="absolute right-2.5 top-2 text-xl text-muted">×</button>
    </section>
  );
}
