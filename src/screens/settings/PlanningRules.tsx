import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { repo } from '../../lib/repo';
import { DEFAULT_BALANCE } from '../../../supabase/functions/_shared/planInput.ts';
import { card, Page } from './ui';
import { useAsync } from './useAsync';

const OFFICE_MAX = 20; // the planner's limit on office days (supabase/functions/_shared/planner.ts)

function Badge({ live }: { live: boolean }) {
  return (
    <span className={`mr-2 inline-block rounded-full px-2 py-0.5 align-[1px] text-[11px] font-bold uppercase tracking-[0.06em] ${live ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>
      {live ? 'Now' : 'Coming'}
    </span>
  );
}

/** How the Friday menu is built, step by step, and the checks every choice passes. Steps not built yet say so. */
export default function PlanningRules() {
  const { householdId } = useAuth();
  const { data, error, loading, reload } = useAsync(() => repo.getSettings(householdId!), [householdId]);
  const b = DEFAULT_BALANCE;
  const minutes = data?.weekday_dinner_max_min ?? 30;
  const adventure = data?.adventure ?? 1;

  const steps: { live: boolean; title: string; text: ReactNode }[] = [
    { live: true, title: 'Set the fixed parts', text: 'Sunday is a leftovers or freezer night. Office days get a packed lunch and overnight oats; your other breakfasts take turns.' },
    { live: true, title: 'Pick the cook-once dinner', text: 'One 6-portion dinner that reheats well, Monday to Thursday, ideally the night before an office day so the leftovers become the packed lunch.' },
    { live: true, title: 'Plan the protein order', text: `Spread ${b.chicken} chicken, ${b.fish} fish, ${b.red_meat} red meat and ${b.veggie} veggie across the week, never the same protein two nights running.` },
    { live: true, title: 'Fill the other nights one at a time', text: 'Each night gets a dinner that passes the checks below. Among equally good dinners it picks at random, so weeks vary.' },
    { live: false, title: 'Check the pack size', text: "For each dinner's fresh ingredients, look at the pack Sainsbury's sells and note what's left over: a recipe needing 100g of spinach comes from a 200g bag, so 100g is spare." },
    { live: false, title: 'Step forward with the leftovers', text: 'The next night prefers a dinner that uses what is spare, but only among dinners that keep the flavour variety. Then check its packs, and on to the next night.' },
    { live: false, title: 'Use the freezer', text: "Batch portions you've confirmed are in the freezer are used before buying the same thing again." },
    { live: false, title: 'Fill gaps with new recipes', text: `When nothing in your library uses a leftover well, or just for something new, Claude writes a recipe: up to ${adventure} a week, as drafts until you've cooked and rated them.` },
    { live: false, title: 'Explain it', text: "Tap Approve to see why each dinner was chosen, which packs are shared between dinners, what's left over and the week's flavour spread." },
  ];

  const checks: { live: boolean; title: string; text: ReactNode }[] = [
    { live: true, title: 'Meal rules', text: 'From scratch, no UPFs, sauces in the TM7 and the rest of your Meal rules (in Settings). Every recipe is written to follow them.' },
    { live: true, title: 'Protein balance', text: `${b.chicken} chicken, ${b.fish} fish, ${b.red_meat} red meat and ${b.veggie} veggie, never the same protein two nights running.` },
    { live: true, title: 'Weeknight time', text: `Monday to Friday dinners take ${minutes} minutes or less (${Math.min(OFFICE_MAX, minutes)} on office days). Weekends have no limit.` },
    { live: true, title: 'No repeats', text: "Nothing from the last two weeks and nothing twice in a week (if there's no other option, the dinner says why). Recipes you've rated 👎 or archived are left out." },
    { live: false, title: 'Flavour variety', text: 'No two dinners in a row from the same cuisine, at most two of one cuisine a week, and no flavour (spicy, creamy, tomato…) more than twice.' },
    { live: false, title: 'Use up leftovers', text: 'Prefer dinners that use what earlier dinners leave in the pack, but never at the expense of the checks above.' },
  ];

  return (
    <Page title="Planner" intro="Every Friday at 7pm the app plans next week from your recipes. This is how it does it. What goes into each recipe is in Meal rules." loading={loading} error={error} onRetry={reload}>
      {data && (
        <>
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
