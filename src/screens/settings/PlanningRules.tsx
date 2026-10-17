import { useAuth } from '../../auth/AuthProvider';
import { repo } from '../../lib/repo';
import { DEFAULT_BALANCE } from '../../../supabase/functions/_shared/planInput.ts';
import { card, Page } from './ui';
import { useAsync } from './useAsync';

const OFFICE_MAX = 20; // the planner's limit on office days (supabase/functions/_shared/planner.ts)

/** What the Friday menu follows, in plain words. Read-only: the numbers come from your settings. */
export default function PlanningRules() {
  const { householdId } = useAuth();
  const { data, error, loading, reload } = useAsync(() => repo.getSettings(householdId!), [householdId]);
  const b = DEFAULT_BALANCE;
  const minutes = data?.weekday_dinner_max_min ?? 30;

  const now = [
    <><b>Protein balance:</b> {b.chicken} chicken, {b.fish} fish, {b.red_meat} red meat and {b.veggie} veggie dinners, never the same protein two nights running.</>,
    <><b>Weeknight time:</b> Monday to Friday dinners take {minutes} minutes or less ({Math.min(OFFICE_MAX, minutes)} on office days). Weekends have no limit.</>,
    <><b>Cook once, eat twice:</b> one 6-portion dinner that reheats well, Monday to Thursday, ideally the night before an office day so the leftovers become the packed lunch.</>,
    <><b>No repeats:</b> nothing you've had in the last two weeks, and nothing twice in a week. If there's no other option, the dinner says why.</>,
    <><b>Left out:</b> recipes you've rated 👎 or archived.</>,
    <><b>Sunday:</b> a leftovers or freezer night.</>,
    <><b>Breakfast:</b> overnight oats on office days; your other breakfasts take turns.</>,
    <><b>Lunch:</b> packed on office days; at home, last night's leftovers when that dinner reheats well, otherwise one from your lunch list.</>,
    <><b>Ties:</b> among dinners that fit equally well, it picks at random, so weeks vary.</>,
  ];
  const next = [
    <><b>Flavour variety:</b> no two dinners in a row from the same cuisine, at most two of one cuisine a week, and no flavour (spicy, creamy, tomato…) more than twice.</>,
    <><b>Using up packs:</b> after each dinner, what's left of a pack (the other 100g of a 200g bag of spinach) goes into a later dinner, but never at the expense of variety.</>,
    <><b>The freezer:</b> dinners use batch portions you've checked are in the freezer.</>,
    <><b>Claude plans the week:</b> and writes up to your "new recipes per week", explaining each choice when you tap Approve.</>,
  ];

  return (
    <Page title="Planning rules" intro="Every Friday at 7pm the app plans next week from your recipes, following these rules in this order." loading={loading} error={error} onRetry={reload}>
      {data && (
        <>
          <section aria-label="The rules it follows now" className="grid gap-2">
            <h2 className="text-lg font-bold">The rules it follows now</h2>
            <ol className={`${card} m-0 grid list-decimal gap-2.5 py-4 pl-9 pr-4 text-[15px] leading-snug`}>
              {now.map((r, i) => <li key={i}>{r}</li>)}
            </ol>
            <p className="m-0 text-sm text-muted">Change the weeknight time limit in Planning &amp; shopping, and office days in Office days.</p>
          </section>
          <section aria-label="Coming next" className="grid gap-2">
            <h2 className="text-lg font-bold">Coming next</h2>
            <ul className={`${card} m-0 grid list-disc gap-2.5 py-4 pl-9 pr-4 text-[15px] leading-snug text-muted`}>
              {next.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </section>
        </>
      )}
    </Page>
  );
}
