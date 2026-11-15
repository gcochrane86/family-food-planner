# Daily balance and snack batches

Agreed with the owner on 15 Nov 2026.

## Why

The household eats a Mediterranean-style diet with protein-first breakfasts for steadier glucose, and favours
healthy fats. They want to see:
- how each planned day measures up to that pattern;
- healthy snacks that fill the day's gaps, made in Today's cooking. Spare Thermomix time, and the second TM7, is what
  they were bought for.

## Goals

1. **Nutrition estimates.** Each recipe (meals, breakfasts, lunches and snacks) gets an estimate per portion,
   worked out by Claude from its ingredients:
   - grams of protein and of fibre;
   - veg portions and fruit portions (80g each);
   - grams of carbohydrate;
   - flags: healthy fat (olive oil, oily fish, nuts or seeds, avocado), oily fish, beans or lentils, whole grain,
     red meat, processed meat.

   Breakfasts and home lunches that are names only, with no recipe, get the same estimate in settings. These are
   estimates for spotting patterns, never shown as precise figures.
2. **The daily balance.** For each planned day, from that day's breakfast, lunch, dinner and snacks for an adult
   portion, the app shows four markers, each OK or low:
   - **Protein at breakfast:** at least 25g.
   - **Veg and fruit:** at least 5 portions, with veg at least half of them.
   - **Healthy fats:** at least one source that day.
   - **Fibre:** at least 30g.

   The week shows, once:
   - **Oily fish:** at least 2 dinners.
   - **Beans or lentils:** at least 3 days with some, from any meal or snack.
   - **Red meat:** at most 2 dinners, and processed meat at most 1.

   A marker with a missing piece (a night out, or a breakfast or lunch with no estimate) shows as unknown, never as
   low. A day's tile shows "Low: …" only for markers that are really low. The day sheet shows all four markers, with the snacks.
3. **Snack batches.**
   - Snacks are recipes of a new kind, `snack`, with steps, photos and a keeping time in days: hummus, roasted
     chickpeas, egg muffins, yoghurt pots and the like.
   - When Claude plans a week, it picks one or two snack batches, from the library or as new recipes (these count
     towards the week's new-recipe allowance). They're chosen to fill the days' low markers, pairing protein or
     healthy fat with fibre so they don't spike glucose, and to use up what dinners leave in their packs.
   - **Make days come from the planner's longer prep days** (Usual week, or the Plan with Claude screen for that
     week). The owner's ideal is Sunday and one midweek day.
     - A Sunday prep day makes snacks on the Sunday *before* the week, like the Monday prep tile, and covers the start
       of the planned week.
     - A midweek prep day covers the rest.
     - With no prep days chosen, Claude picks evenings with the most time.
   - A batch covers its make day and the days after, as long as it keeps (`keeps_days` counts from the make day, as
     day 0).
   - Snacks follow the meal specifications and the private rules, like any recipe.
4. **Making them.** On a batch's make day, its steps join that day's Today's cooking as an extra, in the free TM7
   where there is one.
5. **Shopping.** A snack batch's ingredients go on the shopping list for the make day's delivery, and so into the
   Sainsbury's trolley.
6. **The days it covers.** Each day a batch covers shows the snack in its day sheet and counts it in the balance.

## Calls made without the owner (theirs to change)

- **Two snack slots a day,** morning and afternoon, so two batches can cover the same days.
- **Toddler:** each snack recipe uses the existing `toddler_ok` flag. Claude makes at least one batch a week
  toddler-safe: low salt, no whole nuts (nut butters or ground nuts instead), soft textures.
- **Portions:** two snack portions a day for each adult, plus one for the toddler on a toddler-friendly batch.
- **Built-in planner:** Quick menu (the built-in planner, without Claude) plans no snacks. Snacks come only from
  Claude's plan.

## Non-goals

- No calorie counting and no per-person targets.
- No lab-accurate figures and no nutrition labels.
- No change to the protein balance, cuisine variety or time rules for dinners.

## Anti-goals

- Numbers that look precise: the UI shows markers and "about" amounts only.
- Snacks that break the meal specifications or the private rules.
- A balance that goes stale after a swap. It's always worked out from the current slots.

## Approaches considered

1. **Stored estimates per recipe, and the balance worked out in the app (chosen).** It stays right through swaps,
   and Claude estimates each recipe only once.
2. **Claude writes each day's balance when it plans.** Simpler, but it goes stale after any change.
3. **A nutrition database lookup per ingredient.** More precise, but it needs an outside service and ingredient
   matching. That's out of proportion for spotting patterns.

## How it works (decided)

- **Data:** migration 0023.
  - `recipes.kind` allows `snack`.
  - `recipes.nutrition jsonb` (per portion) and `recipes.keeps_days int`.
  - `meal_slots.slot` allows `snack_am` and `snack_pm`. Every place that checks slot kinds (types, `askClaude.ts`,
    the save RPCs) learns them.
  - A snack made on a day is its slot with mode `cook` (portions for every day it covers). Each other day it covers
    has the same slot with mode `leftovers` and `source_date` = the make day, mirroring leftover lunches.
  - A Sunday-before make day is stored in the planned week with its date: the Sunday before `week_start`. The Week
    tab's day list keeps ignoring dates before the week, and the Monday prep tile shows it.
  - In code, these are "snack makes", never "batches": `meal_slots.batch` already means freezer batches.
  - Settings gain `routine_nutrition` (name → estimate) for breakfasts and lunches without a recipe.
- **Nutrition from Claude:**
  - The connector's planning context marks which planned recipes have no nutrition yet.
  - A new connector tool, `save_nutrition`, saves estimates for recipes and routines.
  - `HOW_TO_PLAN` asks Claude to fill in any missing estimates before saving the week.
  - New recipes (meals and snacks) carry `nutrition` and, for snacks, `keeps_days` in their seed.
  - The existing library is filled in once from the Mac, the same way.
- **Planning:** `save_week_plan` gains `snacks: [{ recipe, slot: 'am' | 'pm', make_date, covers: [dates] }]`. It's
  checked so that `make_date` is a prep day (or the Sunday before, for a Sunday prep day), the covered days start on
  the make day and fit within `keeps_days`, and no slot is covered twice. A replan replaces them with the rest of the
  week. Snacks don't go to Cookidoo.
- **New code paths:** shopping (`buildShoppingList` only reads dinner cooks today) and Today's cooking (extras are
  only tomorrow's meals today) each need a path for snack makes. `recipeSeed.ts` learns the `snack` kind, with no
  protein requirement, and `keeps_days`.
- **Breakfasts and home lunches** are routine names, not recipes, so `routine_nutrition` in settings carries nearly
  all of them. The context gives Claude the days' balance from
  the built-in proposal, so it can aim the snacks at the gaps.
- **Shared logic:** `supabase/functions/_shared/balance.ts`, pure TS, holds `dayBalance` and `weekBalance`, used
  by the app and the connector.

## Left to the builder

- Exact component layout, following the existing day sheet and tile.
- How Today's cooking orders the snack extra among the other extras.
- The wording of the planning rule lines.
