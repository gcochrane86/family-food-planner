import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorBanner from '../../components/ErrorBanner';
import { householdPortions } from '../../lib/household';
import { repo } from '../../lib/repo';
import { SAVE_ERROR } from '../settings/useAsync';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The day a recipe is being picked for (`?lunch=YYYY-MM-DD`, from the + on a day's lunch options), by name. */
export function lunchDayName(date: string | null): string | null {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] : null;
}

/** Makes a recipe a day's lunch, at the household's portions. */
export async function saveLunchRecipe(hid: string, date: string, recipeId: string): Promise<void> {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const [{ slots }, members] = await Promise.all([repo.getWeek(hid, d.toISOString().slice(0, 10)), repo.listMembers(hid)]);
  const lunch = slots.find((s) => s.date === date && s.slot === 'lunch');
  if (!lunch) throw new Error('That day has no lunch in the plan.');
  await repo.saveSlots([{ ...lunch, mode: 'cook', recipe_id: recipeId, portions: householdPortions(members), source_date: null, routine_choice: null, reason: null }]);
}

/** On a recipe opened while picking a day's lunch: one tap makes it that lunch and goes back to the week (past the recipes list it was picked from). */
export default function UseForLunch({ householdId, recipeId, date }: { householdId: string; recipeId: string; date: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const day = lunchDayName(date);
  if (!day) return null;
  async function use() {
    setError(null);
    try { await saveLunchRecipe(householdId, date, recipeId); navigate(-2); } catch { setError(SAVE_ERROR); }
  }
  return (
    <div className="mt-3 grid gap-2">
      <button type="button" onClick={() => void use()} className="min-h-11 rounded-2xl bg-accent font-bold text-accent-ink">Use for {day}'s lunch</button>
      {error && <ErrorBanner message={error} />}
    </div>
  );
}
