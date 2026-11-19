import { useState } from 'react';
import { useAdhoc } from '../../lib/adhoc';
import { repo } from '../../lib/repo';
import { SAVE_ERROR } from '../settings/useAsync';

/** On a recipe, when this phone is in ad-hoc: puts it on the ad-hoc plan, as lunch or dinner, at the portions shown. */
export default function AddToAdhoc({ householdId, recipeId, portions }: { householdId: string; recipeId: string; portions: number }) {
  const adhoc = useAdhoc();
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!adhoc) return null;

  async function add(meal: 'lunch' | 'dinner') {
    setChoosing(false);
    try {
      await repo.addAdhocMeal(householdId, recipeId, meal, portions);
      setMessage(`Added to the ad-hoc plan as ${meal}.`);
    } catch { setMessage(SAVE_ERROR); }
  }

  const button = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold';
  return (
    <div className="mt-3 grid gap-2 print:hidden">
      {choosing ? (
        <span className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void add('lunch')} className={button}>As lunch</button>
          <button type="button" onClick={() => void add('dinner')} className={button}>As dinner</button>
          <button type="button" onClick={() => setChoosing(false)} className="text-sm font-semibold text-muted underline">Cancel</button>
        </span>
      ) : (
        <button type="button" onClick={() => { setMessage(null); setChoosing(true); }}
          className="justify-self-start rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">Add to plan</button>
      )}
      {message && <p role="status" className="m-0 text-sm text-muted">{message}</p>}
    </div>
  );
}
