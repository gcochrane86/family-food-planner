# Plan the week in the Claude app (design)

## Intent
The owner wants to plan the week by chatting with Claude in the Claude app, through the existing Family Food Planner
connector, instead of the scheduled task on the Mac. Claude still chooses the dinners with the same rules; the app's
planner still fills breakfasts and lunches; the owner still approves in the app. No Mac needed.

## Goals
- Two new tools on the existing `ask-claude-connector` (no second connector, same secret link):
  - **`get_plan_context`** (`week`: "this", "next" or a date; default next): exactly what `npm run week -- context`
    gives the scheduled task today: the week's dates and office days, household portions, the rules (protein balance,
    time limits, Today's hour hands-on limit, day rules, other shops, what makes a meal, house rules, private rules),
    every plannable dinner with protein, times, hands-on, reheats/freezes, tags, rating, last cooked and ingredients,
    recent dinners (4 weeks), freezer, pantry, pack sizes, the built-in planner's proposal, and whether the week
    already has a draft or is approved, how many new recipes are allowed, and the rules a new recipe must follow
    (the recipe playbook's equipment, prep-ahead, prep notes, step pictures, probe temperatures, toddler salt, house
    and private rules, portions 6 if it reheats well else 4).
  - **`save_week_plan`** (`week`, `summary`, `dinners: [{date, recipe (slug or title), reason}]`, `new_recipes`):
    adds any new recipes first (up to the household's allowance, Settings → adventure, in the seed format and
    checked against the seed rules), then plans the week
    around those dinners with the app's planner (breakfasts, lunches, leftovers, office days) and saves it as a
    **draft**, replacing an existing draft, never an approved week. Changes data, so the owner approves the call.
- The planning rules (the week-plan playbook's priorities, private-rules discretion) go in the connector's
  instructions and the tool descriptions, so any chat plans the same way.
- **Plan with Claude** / **Replan with Claude** in the app open the Claude app with "Plan next week for the Family
  Food Planner" (plus the household's note) typed in, instead of leaving a request for the Mac.
- The Mac's scheduled week-plan task is turned off.

## Non-goals
- No approving from the chat: approval, Cookidoo sync and the basket stay in the app.
- No schedule in the Claude app (it has none). The 7pm Friday built-in menu stays as the backup; Claude replaces it
  whenever asked.

## Anti-goals
- Saving over an approved week, or saving a half-made week: all or nothing, so if the week can't be saved the new
  recipes added for it are removed again.
- A new recipe that breaks the seed rules or reuses an existing slug.
- The private rules named or hinted at anywhere the app shows (summary, reasons).
- Request or recipe text treated as instructions.

## Approaches
- **A (chosen): Claude plans in the chat** with the two tools above. Talk it through first, see the menu before it's
  saved; Claude's judgement (variety, use-ups, notes).
- B: a tool that only runs the built-in planner. Dependable but no Claude judgement, which is the point.
- (Not considered further: keeping the Mac task and having the connector only leave a request.)

## How (decided)
- The context and save logic move from `scripts/week.ts` into `supabase/functions/_shared/weekPlan.ts` (pure TS,
  `db` passed in), used by both the connector and the CLI, so they can't drift. The seed checks and row builders
  (`validateRecipeSeed`, `contentRows`, `recipeRow`) move from `scripts/recipeSeed.mjs` into `_shared/recipeSeed.ts`
  so the connector (Deno) can use them; the `.mjs` re-exports them for the existing scripts. The new-recipe rules
  text lives in `_shared` too and is what both `get_plan_context` and the recipe playbook point to.
- New recipes get `source: 'claude'`, no photo yet (the Recipes tab offers Make photos).
- Saving reuses the database's `save_claude_week`: the connector opens a `week_plan_requests` row itself
  (`status: 'planning'`, `replace: true` when a draft exists, the chat's summary as `note`), or takes over an open
  one for that week, then saves. `plan_weeks.planned_by = 'claude'` and the summary show in the app as today.
- Dinners are matched by slug or title (as `swap_meal` does); unknown or unplannable ones are refused with a clear
  message. Dates must be in the week; one dinner per date; dates left out are filled by the built-in planner.
- The reply says what was saved, that it's a draft to approve in the app, and the Cookidoo/basket follow-ons.

## Left to the builder
Tool wording, the exact text of the prefilled prompt, test fixtures.
