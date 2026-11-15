# Snacks in the Recipes tab, and adding a snack to a day

Agreed with the owner in the Claude app on 15 Nov 2026. Builds on each person's snacks
(`2026-11-15-person-snacks-design.md`). To be reviewed before the plan is written.

## Why

The only ways to get a snack today are Claude (it writes snack recipes and plans snacks with the week) or the day
sheet's one-fix nudge. The owner wants to:
- add snacks themselves, from the Recipes tab;
- let an existing recipe double as a snack. Baked oats is a breakfast that's also a good snack;
- have simple snacks like "an apple and a handful of nuts" without writing a full recipe;
- add a snack to a day themselves.

## Goals

1. **Snacks on the Recipes tab.** A **Snacks** filter next to Components. It lists snack recipes, recipes that can be
   snacks, and quick snacks.
2. **Any recipe can be a snack.** A recipe gains **"Can be a snack"**, so it keeps its own kind (a meal, or the
   recipe behind a breakfast like Baked oats) and can also be eaten as a snack. Turning it on asks for:
   - **Snack portion:** how a batch splits into snacks, e.g. "1 square, 8 from the tray". The snack's numbers are
     the recipe's nutrition for one of those.
   - **Keeps for:** days from the day it's made (the existing `keeps_days`).
   - **OK for Zach:** the existing `toddler_ok`.
   There's one recipe, so a change to the recipe reaches the breakfast and the snack alike.
3. **Quick snacks.** On the Recipes tab, **+ Add → Quick snack** is a short form with no steps, no prep and no
   photo generation:
   - a name ("Apple & almonds");
   - one portion's items with amounts, chosen from the shopping items (1 apple, 30g almonds);
   - OK for Zach (yes or no).
   The app works out the nutrition from the items, or asks Claude when it can't. A quick snack is never "made": it
   doesn't appear in Today's cooking, but its items go on the shopping list for the days it's eaten.
4. **Add a snack to a day.** The day sheet's Balance card gains **+ Add a snack**: who (one or more people), morning
   or afternoon, which snack, and how many. If it's a batch snack, the app picks the latest make day that keeps it in
   date (or makes it that day). It's saved straight to the week, draft or approved, and the shop and Today's cooking
   follow. Each snack on the card can be removed.
5. **Claude uses all of them.** `get_plan_context` lists every snack-able recipe and quick snack, with its portion
   and keeping time. Writing a quick snack counts as a recipe for the new-recipe allowance only if Claude adds it.

## Non-goals

- Logging what was actually eaten.
- Snacks for nights or meals; snacks stay morning and afternoon.
- Changing how the one-fix nudge chooses its snack.

## Anti-goals

- Two copies of the same food (a "Baked oats" breakfast and a "Baked oats" snack) drifting apart.
- A quick snack showing up as a make in Today's cooking.
- A manual snack quietly removed by the next replan without saying so.

## How it works (suggested; the builder decides the details)

- **Data:**
  - `recipes.snack_ok boolean default false` and `recipes.snack_portions int` (how many snacks one batch makes).
    `kind = 'snack'` stays for snack-only recipes and implies snack_ok.
  - `recipes.quick boolean default false`: a quick snack has ingredients and nutrition per portion but no steps.
  - `snack_eats.added_by text check (added_by in ('claude','household'))`, so a replan can keep or list the
    household's own snacks.
- **Numbers:** a snack eat of a snack_ok meal counts `nutrition × base_portions / snack_portions` per snack, not a
  meal portion.
- **Makes:** quick snacks are excluded from makes. A snack_ok recipe that's also on the plan as a breakfast that week
  can be made once in a bigger batch, if the make dates line up.
- **Replan:** `save_claude_week` keeps snack eats with `added_by = 'household'` unless the request says replace them.
  The draft lists them.
- **Connector:** `get_plan_context.snackRecipes` includes snack_ok and quick recipes, with their snack portion. The
  `save_week_plan` check accepts them.

## Open questions for the owner

1. Should a manual snack on an approved week update the Sainsbury's basket if the order is already in, or go on the
   top-up list instead?
2. Should quick snacks have a small stock photo or an emoji, or no picture at all?
3. Should Settings → Household's meal partners also be able to pick a quick snack (overnight oats → apple & almonds)?
