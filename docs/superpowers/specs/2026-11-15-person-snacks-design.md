# Each person's snacks and meal partners

Agreed with the owner on 15 Nov 2026. Builds on the daily balance (`2026-11-15-balance-snacks-design.md`) and
per-person macros (`2026-11-15-person-macros-design.md`).

## Why

The day sheet now shows each person's numbers, and they differ: one adult wants more calories, another doesn't;
overnight oats are always short on protein for a protein-first breakfast. The owner doesn't want a list of warnings.
They want the plan to come out balanced for each person, by Claude, with the household still prepping and buying as
one family.

## Goals

1. **Meal partners.** A breakfast or lunch can have a fixed partner per person, for example overnight oats → 2 boiled
   eggs for one adult, 1 for the other, none for the toddler. Whenever that meal is planned for a day, its partners
   come with it for those people: counted in their numbers, made, and bought. Partners aren't optional day by day.
2. **Each person's snacks.** Morning and afternoon snacks are chosen per person and per day, varied across the week,
   to fill that person's gaps (their targets, or the Mediterranean markers where no target is set). One person can
   have protein balls, another an apple and almonds, another nothing, on the same afternoon.
3. **One family unit.** Everything is made in batches on the prep days and bought on the family shop: a make's
   portions are everyone's portions added up. Only *who eats what* is per person.
4. **One go.** "Plan with Claude" plans the meals, then partners and snacks for each person, in the same plan. The
   owner reviews and approves the lot together.
5. **Simple items are tiny recipes.** Boiled egg, apple & almonds, chia & raspberries, Greek yoghurt, hummus & veg
   sticks: snack recipes with an estimate per portion (one portion = one item, e.g. one egg), ingredients and a
   one-line method, so they shop and prep like anything else.
6. **A nudge after changes.** When a later change (a swap, a different lunch) leaves a person off target, the day
   sheet says so once and offers one fix, e.g. "You're now 15g under protein: add Greek yoghurt this afternoon?" Yes
   adds it for that person on that day.
7. **A simpler Week page.** The week tiles show the meals only: no "Low: …" line, no "Under protein: 2" line, and no
   oily fish / beans / red meat strip at the top. The balance markers, the "Each person" table and each meal's
   numbers stay inside the day sheet. Claude still uses the week counts (oily fish and so on) when planning.

## Non-goals

- Logging what was actually eaten.
- Different main meals for different people.
- Suggesting targets.

## Anti-goals

- Warnings everywhere: the Week page stays calm; nudges live in the day sheet only, one at a time.
- Separate shopping or prep per person.
- A partner or snack that a person can't eat (the toddler only gets `toddler_ok` items; private rules apply as for
  any recipe).

## Approaches considered

1. **Extend the existing snack makes (chosen).** Makes stay household rows in `meal_slots`, which shopping and
   Today's cooking already read; a new list says who eats what. Least new code, and the one-family prep and shop
   come for free.
2. **A separate per-person extras list** with its own shopping and prep: cleaner on paper, but shopping and prep
   would be built twice and the two lists could disagree.
3. **Claude writes per-person advice as text:** no numbers, no shopping, no prep. Rejected.

## How it works (decided)

- **Migration 0025.**
  - `meal_slots` snack rows become *makes*: one row per snack recipe made on a day, `slot = 'snack'`, mode `cook`,
    `portions` = everyone's portions it covers. The unique `(plan_week_id, date, slot)` becomes unique for
    breakfast, lunch and dinner only; makes are unique per `(plan_week_id, date, recipe_id)`. The old `snack_am` /
    `snack_pm` rows and their `leftovers` rows go (none are saved yet).
  - New table `snack_eats` (snacks only): `plan_week_id`, `date`, `slot` (`snack_am` | `snack_pm`), `member_id`,
    `recipe_id`, `qty` (portions, > 0), `make_date` (the make it comes from). RLS like `meal_slots`. An eat belongs to
    the week of its date; a make on the Sunday before the week belongs to that planned week, as today.
  - `settings.meal_partners`: `{ "<breakfast or lunch name>": { "<member_id>": [{ "recipe": slug, "qty": n }] } }`,
    keyed by the plain routine name (`routineName`). Leftover lunches (a dinner) have no partners.
  - `plan_weeks.new_partners jsonb`: partners Claude proposed with a draft, merged into settings on approval
    (`approve_week`), dropped with a discarded or replaced draft.
- **Partners are worked out, never stored per day.** A shared pure function gives a week's partner eats and partner
  makes from its breakfasts and lunches (including a lunch the app works out when none is picked, as `balance.ts`
  does), the partners and the members. Each partner item's make is on the latest prep day it keeps from, else the
  evening before. Shopping, Today's cooking, the numbers and the day sheet all read it, so a changed or removed
  breakfast, a swap or a replan can never leave partners out of step, and the Quick menu gets partners for free.
- **Checks (shared, pure TS in `_shared/`)**: every eat has a make of the same recipe on or before its date, within
  that recipe's `keeps_days`; a make's portions equal the eats it covers; the toddler only eats `toddler_ok`
  recipes; a person has at most one snack per snack slot per day.
- **Claude.** `get_plan_context` gives each person (name, kind, share, targets), the partners, the snack recipes,
  and each person's day from the built-in proposal. `save_week_plan` replaces `snacks` with:
  - `makes: [{ recipe, make_date }]` (portions are worked out from the eats);
  - `eats: [{ person, date, slot: 'am' | 'pm', recipe, qty }]`;
  - `partners: [{ meal, person, recipe, qty }]` for new or changed partners. They're saved to settings with the plan
    with the draft (`new_partners`), listed in the plan review as "New: overnight oats now comes with 2 boiled eggs
    for <name>", and kept on approval.
  - `HOW_TO_PLAN` asks Claude to balance each person's day to their targets (or the markers), vary snacks across the
    week, and keep makes to the prep days.
  - New simple items go through `add_recipe` / the seed as `kind: snack` with `nutrition` and `keeps_days`.
- **Adding one snack later** (a nudge's yes) is one shared function: add the eat, and cover it from a make of that
  recipe still keeping (its portions grow), or else a new make on the latest earlier prep day it keeps from, else
  the evening before. It joins the shopping list like anything else; a basket already sent picks it up the next time
  it's sent, and once the delivery has come the list shows it as "not in this week's shop".
- **Numbers.** `personDay` adds that person's eats (qty × the recipe's estimate) instead of "one of each snack".
  `dayBalance`'s markers stay for an adult's share and count that adult's eats.
- **Day sheet.**
  - Each meal card lists its partners per person ("With it: <name> 2 boiled eggs · <name> 1").
  - A "Snacks" list per person replaces the household snack lines.
  - The nudge sits at the top of the Balance card when there's one.
- **Settings → Household.** Each person's partners, to change or remove ("With overnight oats: 2 boiled eggs").
- **Week page.** Remove `WeekBalanceStrip` and the tile's `low` / `targets` lines.
- **Quick menu (built-in planner)** plans no snacks; its breakfasts and lunches get their partners as worked out above.

## Calls made without the owner (theirs to change)

- Snacks for the toddler are allowed, from `toddler_ok` recipes, scaled by Claude's `qty`.
- Without targets, Claude balances each adult to the markers (breakfast protein 25g, fibre 30g, 5 veg & fruit,
  a healthy fat). Setting targets makes it per person.
- A partner set for a breakfast applies to every day that breakfast is planned, in every week, until removed.

## Left to the builder

- The exact layout of the per-person snack list and the partner line on a phone.
- How the nudge picks its one fix (closest fit to the biggest gap from snack recipes the person can eat).
- Updating `snackPlan.ts`, shopping, Today's cooking and the connector's `get_week` to the new rows.
