import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { repo } from '../../lib/repo';
import { DEFAULT_BALANCE } from '../../../supabase/functions/_shared/planInput.ts';
import { Badge, card, Page } from './ui';
import Requirements from './Requirements';
import { useAsync } from './useAsync';

const OFFICE_MAX = 20; // the planner's limit on office days (supabase/functions/_shared/planner.ts)

/** How the Friday menu is built, step by step, and the checks every choice passes. Steps not built yet say so. */
export default function PlanningRules() {
  const { householdId } = useAuth();
  const { data, setData, error, loading, reload } = useAsync(() => repo.getSettings(householdId!), [householdId]);
  const b = DEFAULT_BALANCE;
  const minutes = data?.weekday_dinner_max_min ?? 30;
  const adventure = data?.adventure ?? 1;

  const steps: { live: boolean; title: string; text: ReactNode }[] = [
    { live: true, title: 'Set breakfasts and lunches', text: 'Office days get a packed lunch and overnight oats; your other breakfasts take turns. Home lunches come from your lunch list.' },
    { live: true, title: 'Plan the protein order', text: `Spread ${b.chicken} chicken, ${b.fish} fish, ${b.red_meat} red meat and ${b.veggie} veggie across the week, never the same protein two nights running.` },
    { live: true, title: 'Fill every night one at a time', text: "Each night, Sunday included, gets a dinner for your household's portions that passes the checks below. Among equally good dinners it picks at random, so weeks vary." },
    { live: true, title: 'Leftover lunches', text: "When a dinner reheats well, it also makes the next day's lunch: packed on an office day, the default pick at home. The shop buys enough for both, and picking another lunch takes the extra off. Salads, risottos and the like don't. Tap Reheats well on a recipe to change it." },
    { live: true, title: 'Check the pack size', text: "Claude: for each dinner's fresh ingredients, look at the pack Sainsbury's sells and note what's left over: a recipe needing 100g of spinach comes from a 200g bag, so 100g is spare." },
    { live: true, title: 'Step forward with the leftovers', text: 'Claude: the next night prefers a dinner that uses what is spare, but only among dinners that keep the flavour variety. Then check its packs, and on to the next night.' },
    { live: true, title: 'Use the freezer', text: "Batch portions you've confirmed are in the freezer are used before buying the same thing again." },
    { live: true, title: 'Fill gaps with new recipes', text: `Claude: when nothing in your library uses a leftover well, or just for something new, Claude writes a recipe, up to ${adventure} a week. Rate it 👎 after cooking and it won't come back.` },
    { live: true, title: 'Explain it', text: "Claude: each dinner says why it was chosen, and a note under the week covers the shared packs, what's left over and the flavour spread." },
  ];

  const checks: { live: boolean; title: string; text: ReactNode }[] = [
    { live: true, title: 'Meal specifications', text: 'Every dinner meets them: protein, veg, carb and a sauce from scratch, toddler salt, no UPFs, sauces in the TM7… (Settings → Meal specifications).' },
    { live: true, title: 'Your day rules', text: 'Days with a set dinner (Your requirements, above) are fixed first; the rest of the week is balanced around them.' },
    { live: true, title: 'Protein balance', text: `${b.chicken} chicken, ${b.fish} fish, ${b.red_meat} red meat and ${b.veggie} veggie dinners a week, never the same protein two nights running.` },
    { live: true, title: 'Weeknight time', text: `Monday to Friday dinners take ${minutes} minutes or less (${Math.min(OFFICE_MAX, minutes)} on office days). Weekends have no limit.` },
    { live: true, title: 'Flavour variety', text: 'Claude: no two dinners in a row from the same cuisine, at most two of one cuisine a week, and no flavour (spicy, creamy, tomato…) more than twice.' },
    { live: true, title: 'No repeats', text: "Nothing from the last two weeks and nothing twice in a week (if there's no other option, the dinner says why). Recipes you've rated 👎 or archived are left out." },
    { live: true, title: 'Use up leftovers', text: 'Claude: prefer dinners that use what earlier dinners leave in the pack, but never at the expense of the checks above.' },
  ];

  return (
    <Page title="Planner specifications" intro="Every Friday evening Claude plans next week (or tap Plan with Claude on the Week tab). Steps marked Claude are the ones only Claude does; Quick menu, the built-in planner, does the rest straight away. What each single meal should be is in Meal specifications." loading={loading} error={error} onRetry={reload}>
      {data && (
        <>
          <Requirements householdId={householdId!} settings={data} onSaved={setData} />
          <section aria-label="How the week is built" className="grid gap-2">
            <h2 className="text-lg font-bold">How the week is built</h2>
            <ol className={`${card} m-0 grid list-decimal gap-3 py-4 pl-9 pr-4 text-[15px] leading-snug`}>
              {steps.map((s, i) => (
                <li key={s.title} aria-label={`Step ${i + 1}: ${s.title}`} className={s.live ? '' : 'text-muted'}>
                  <Badge live={s.live} /><b className="text-ink">{s.title}</b>
                  <span className="block">{s.text}</span>
                </li>
              ))}
            </ol>
          </section>
          <section aria-label="Checks, in order of priority" className="grid gap-2">
            <h2 className="text-lg font-bold">Checks, in order of priority</h2>
            <p className="m-0 text-sm text-muted">A later check never overrides an earlier one.</p>
            <ol className={`${card} m-0 grid list-decimal gap-3 py-4 pl-9 pr-4 text-[15px] leading-snug`}>
              {checks.map((c) => (
                <li key={c.title} className={c.live ? '' : 'text-muted'}>
                  <Badge live={c.live} /><b className="text-ink">{c.title}:</b> {c.text}
                </li>
              ))}
            </ol>
            <p className="m-0 text-sm text-muted">Change the weeknight time limit and new recipes per week in Planning &amp; shopping, and office days in Office days.</p>
          </section>
        </>
      )}
    </Page>
  );
}
