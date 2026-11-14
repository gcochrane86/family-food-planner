# Prep Ahead in Today's Hour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "8pm prep" with Today's hour holding essential tasks plus optional, recommended prep for tomorrow, chosen on the Week tab or in Today's hour; must-do prep (flagged per step by Claude) and roasts' prep stay essential.

**Architecture:** One per-dinner setting on `meal_slots` (`prep_ahead`) and one per-step flag on `recipe_steps` (`needs_night_before`), both added by migration 0018. `planHour` (pure) takes both and decides what is optional tonight and what is carried into tomorrow. The UI only reads and writes `prep_ahead`.

**Tech Stack:** React + Vite + TS, Supabase (Postgres, Edge Functions), Vitest (in-memory Postgres for migrations).

**Spec:** `docs/superpowers/specs/2026-11-14-prep-ahead-in-the-hour-design.md`

## Global Constraints

- The `prep_8pm` phase name stays in the database, the seed format and the connector. Only the wording changes.
- No "8pm" anywhere in UI copy. Phase labels: "Prep ahead" / "On the day". Step badges: "Can be done the day before" / "Needs the night before".
- Roasts (Build a roast, Christmas) are untouched: their phases, wording ("Night before" stays a roast phase) and cook view.
- Cookidoo's exported step text (`src/lib/cookidoo.ts`, "The night before: ") is unchanged.
- Database changes are a new migration, `supabase/migrations/0018_prep_ahead.sql`, which the owner runs in the SQL Editor **before** the app is pushed (the app writes the new column).
- Recipe data changes: back up to `seed/private/backups/` first; the owner sees the flagged steps before they're saved.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before each commit, run the private-words grep from the session rules on the staged diff; it must print nothing.
- `npm test` must be green before each commit.

## Ruling made while planning (changes the spec's call 4)

`prep_ahead` is a three-state text, not a boolean: `'ahead'` (default: optional prep done the evening before), `'on_the_day'` (optional prep skipped; must-do prep was still done), and `'missed'` (nothing was done last night, set by "I didn't get to it"). A boolean couldn't tell whether a skipped-optional day's must-do steps were done. Undoing "I didn't get to it" sets it back to `'ahead'`. A spec edit records this in Task 1.

## Review Focus

1. **A dinner swapped after the tick was changed.** The trigger resets the setting to `'ahead'`, so the new dinner's prep shows as recommended (test in Task 1).
2. **No hour yesterday** (first day of a plan, or the week wasn't planned). Tonight's prep, must-do included, is all done tonight, with the "needed the night before" warning on must-do steps (test in Task 3).
3. **Tomorrow's dinner has only must-do prep.** No tick is shown anywhere, and the must-do steps are in tonight's hour (tests in Tasks 3 and 5).
4. **Tomorrow is out, leftovers, or a roast.** No dinner-prep tick; a roast shows its line instead (tests in Tasks 3 and 4).
5. **Tonight's version replacing a prep step.** The flag carries over by phase and title (test in Task 2).

---

### Task 1: Migration 0018 and data types

**Files:**
- Create: `supabase/migrations/0018_prep_ahead.sql`
- Modify: `src/lib/types.ts` (MealSlot, RecipeStep), `src/lib/repo.ts` (new `setPrepAhead`), `src/lib/recipes.ts` (`recipeSavePayload` passes `needs_night_before`), spec (ruling above)
- Test: `scripts/migration.test.mjs`

**Interfaces:**
- Produces: `MealSlot.prep_ahead?: 'ahead' | 'on_the_day' | 'missed'`; `RecipeStep.needs_night_before?: boolean`; `repo.setPrepAhead(slotId: string, value: 'ahead' | 'on_the_day' | 'missed'): Promise<void>`; the `PrepAhead` type exported from `types.ts`.

- [ ] **Step 1: Write the failing migration tests** in `scripts/migration.test.mjs`, following the 0015 tests' helpers (`one`, `as`, `recipeFor`):
  - `"0018: a dinner's prep ahead defaults to ahead and can be set by members"`: insert a dinner slot; `prep_ahead` is `'ahead'`; update it to `'on_the_day'`, then `'missed'`; a value of `'later'` is rejected; a STRANGER sees no rows.
  - `"0018: prep ahead goes back to ahead when the dinner's recipe changes or it isn't cooked"`: set `'on_the_day'`, update portions (it stays), change recipe_id (it becomes `'ahead'`); set `'missed'`, set mode `'out'` (it becomes `'ahead'`).
  - `"0018: steps carry needs the night before, kept through save_recipe"`: a step saved with `needs_night_before: true` through `save_recipe` is true; re-saving the same phase and title without the field keeps it true; a new title defaults to false.
- [ ] **Step 2: Run** `npx vitest run scripts/migration.test.mjs -t 0018`. Expected: FAIL (column doesn't exist).
- [ ] **Step 3: Write `0018_prep_ahead.sql`**:
  - `alter table public.meal_slots add column prep_ahead text not null default 'ahead' check (prep_ahead in ('ahead','on_the_day','missed'))`.
  - Trigger `prep_ahead_follows_recipe` (before update), modelled on 0015's: when `recipe_id` changes or the new mode isn't `'cook'`, set it to `'ahead'`.
  - `alter table public.recipe_steps add column needs_night_before boolean not null default false`.
  - `create or replace function public.replace_recipe_contents` as in the latest definition (`0010_recipe_editing.sql`), adding `needs_night_before`: kept from the old step with the same phase and title (the `kept_photo` lookup already matches on them; add it to that jsonb), else `coalesce((e->>'needs_night_before')::boolean, false)`. An explicit value in `e` wins.
  - Header comment in the 0015 style, explaining both columns.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then `npm test`: all green.
- [ ] **Step 5: Types, repo and spec.** Add the fields and the `PrepAhead` type. Add `repo.setPrepAhead` (update `meal_slots` by id). Pass `needs_night_before` in `recipeSavePayload`'s steps. Edit the spec's call 4 to the three-state ruling. Run `npm test` and `npx tsc -b`: green.
- [ ] **Step 6: Commit** (`Migration 0018: prep ahead per dinner, needs-the-night-before per step`).

### Task 2: The recipe format, tonight's version and the connector carry the flag

**Files:**
- Modify: `supabase/functions/_shared/recipeSeed.ts`, `supabase/functions/_shared/recipeRules.ts`, `supabase/functions/_shared/slotVersion.ts`, `supabase/functions/ask-claude-connector/index.ts` (`set_tonights_version` step schema), `supabase/functions/_shared/askClaude.ts` (phase heading wording and a "(needs the night before)" mark on flagged steps), `supabase/functions/_shared/mealSpec.ts` (Time text)
- Test: `scripts/recipeSeed.test.mjs`, `supabase/functions/_shared/slotVersion.test.ts`, `supabase/functions/_shared/askClaude.test.ts`

**Interfaces:**
- Consumes: the `recipe_steps.needs_night_before` column (Task 1).
- Produces: seed step field `night?: boolean` (prep_8pm only), mapped to `needs_night_before` in `contentRows`, and back to `night` in `seedFromDetail` when true. `VersionStep.needs_night_before: boolean`; `InStep.needs_night_before?: boolean`.

- [ ] **Step 1: Failing tests:**
  - recipeSeed: `'a prep step can need the night before'`: `{ phase: 'prep_8pm', night: true, … }` gives a row with `needs_night_before: true`; `night: true` on a `finish` step is reported as `recipes[0].steps[0].night is only for prep_8pm steps`; `seedFromDetail` round-trips it.
  - slotVersion: `'a step keeps its needs-the-night-before flag by phase and title; a new step takes the one Claude sends, else false'`.
  - askClaude: the recipe text's prep heading is `Prep ahead (can be done the day before)` and a flagged step ends with `(needs the night before)`; the existing test at `askClaude.test.ts:139` is updated to the new heading.
- [ ] **Step 2: Run** `npx vitest run scripts/recipeSeed.test.mjs supabase/functions/_shared/slotVersion.test.ts supabase/functions/_shared/askClaude.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** In `recipeRules.ts`, add `night` to the steps format and replace the "Prep ahead" rule with: `'Prep ahead: what can be done the day before in Today\'s hour (sauces, chopping that keeps) goes in prep_8pm steps; mark a prep step night: true only when it can\'t wait until the day\'s hour (marinating for hours, soaking, overnight chilling or setting). Weeknight hands-on time, prep included, within Today\'s hour less 15 minutes.'`. In `mealSpec.ts`, the Time text becomes `'About 30 minutes on the night, with longer work done as prep ahead in Today\'s hour the day before.'`. In the connector schema, add `needs_night_before: { type: 'boolean' }` to the step properties.
- [ ] **Step 4: Run** the same command, then `npm test`. Run the Deno check (CLAUDE.md command) on `ask-claude-connector/index.ts`. Expected: all green.
- [ ] **Step 5: Commit** (`Recipes, tonight's version and the connector carry needs-the-night-before`).

### Task 3: `planHour` handles essential vs optional prep

**Files:**
- Modify: `src/lib/todayHour.ts`
- Test: `src/lib/todayHour.test.ts`

**Interfaces:**
- Consumes: `RecipeStep.needs_night_before`, `PrepAhead` (Task 1).
- Produces (HourInput changes):
  - `yesterdayPlanned` is replaced by `tonightPrep: 'done' | 'optional-skipped' | 'missed'`. `'done'` = yesterday's hour ran and tonight's slot is `'ahead'`. `'optional-skipped'` = it ran and the slot is `'on_the_day'`. `'missed'` = yesterday wasn't planned, or the slot is `'missed'`.
  - `tomorrow.dinner` gains `prepAhead: boolean` (slot is `'ahead'`).
  - `tomorrow.roast?: { title: string; steps: { time: string; title: string; partTitle: string }[] } | null`.
- Produces (HourPlan additions):
  - `forTomorrow: { title: string; optional: number; mustDo: string[]; ahead: boolean } | null`. This is tomorrow's dinner: how many optional prep steps it has, the titles of its must-do steps, and whether the optional ones are in tonight's hour. It is null when tomorrow has no cooked dinner with prep steps.
  - `doneLastNight: { title: string; steps: string[]; state: 'done' | 'optional-skipped' | 'missed' } | null`. This is tonight's dinner's prep that yesterday's hour was meant to do. It is null when tonight's recipe has no prep steps.
  - `roastAhead: { title: string; steps: { time: string; title: string; partTitle: string }[] } | null`.

Rules (from the spec's "What is essential and what is optional"):
- Tomorrow's must-do steps (`needs_night_before`) always go in tonight's extras, titled `For tomorrow: …`.
- Tomorrow's other prep steps, and the `box` chopping for tomorrow, only go in when `prepAhead` is true.
- Tonight's carried prep goes before tonight's finish steps, in one chain right after the chopping, with tonight's `at_minute` offsets starting when it ends. Its titles start `From yesterday's prep: `.
  - With `'optional-skipped'`, only the non-must steps are carried.
  - With `'missed'`, all of them are carried, and each must-do step adds the warning `` `${title}: this needed the night before, so it gets less time tonight` ``.
- Tonight's ingredients are chopped fresh (no fridge box) unless `tonightPrep` is `'done'`.
- The roast is passed through as `roastAhead` and never put on the timeline.

- [ ] **Step 1: Failing tests** in `todayHour.test.ts` (reuse its fixtures; give the fixture a second prep step with `needs_night_before: true`):
  - `'tomorrow\'s optional prep is in tonight\'s hour only when prep ahead is on; must-do prep always is'`
  - `'the chopping boxed for tomorrow follows the tick'`
  - `'skipped optional prep is done tonight, before tonight\'s cook, and tonight is chopped fresh'`
  - `'missed prep: everything comes into tonight, must-do with a warning'` (also covers no hour yesterday)
  - `'a dinner with only must-do prep has no optional steps to tick'` (`forTomorrow.optional === 0`)
  - `'a roast tomorrow shows its night-before steps and stays off the timeline'`
  - Update existing tests that pass `yesterdayPlanned` to `tonightPrep`.
- [ ] **Step 2: Run** `npx vitest run src/lib/todayHour.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** in `planHour`, `extras` and `chopList`, following the rules above.
- [ ] **Step 4: Run** the test file, then `npm test`. Expected: PASS and all green (fix `TodayHour.test.tsx` fixture inputs if they pass `yesterdayPlanned`).
- [ ] **Step 5: Commit** (`Today's hour: tomorrow's prep is optional unless it needs the night before; skipped prep comes into the next hour`).

### Task 4: Today's hour screen — the choices on the first page

**Files:**
- Modify: `src/screens/today/useTodayHour.ts`, `src/screens/today/TodayHour.tsx`, `src/lib/roast.ts` (export a helper)
- Test: `src/screens/today/TodayHour.test.tsx`

**Interfaces:**
- Consumes: `planHour` input and output (Task 3); `repo.setPrepAhead` (Task 1); `planRoast`, `parseRoastChoice`, `roastQuery`.
- Produces: `roastEveningSteps(choice: RoastChoice, parts: Map<string, RoastPartRecipe>): { time: string; title: string; partTitle: string }[]` in `roast.ts`. It returns the plan's `'Night before'` steps, plus its `'Day before'` steps whose time is 17:00 or later.

- [ ] **Step 1: Failing tests** in `TodayHour.test.tsx`:
  - `'the first page offers tomorrow\'s prep as recommended, ticked, and unticking saves on_the_day'`: the switch is labelled `Prep for tomorrow's <title> (recommended)` and `repo.setPrepAhead` is called with the tomorrow dinner slot's id and `'on_the_day'`.
  - `'must-do prep for tomorrow is listed with no tick'`: the text `Needs the night before` is present, with no switch for it.
  - `'done last night shows with I didn\'t get to it, which saves missed and can be undone'`.
  - `'a roast tomorrow shows its night-before prep with a link to the roast cook view'`.
- [ ] **Step 2: Run** `npx vitest run src/screens/today/TodayHour.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`useTodayHour`:** compute `tonightPrep` from yesterday's slots and tonight's `prep_ahead`, and `tomorrow.dinner.prepAhead`. When tomorrow's dinner slot has `roast`, build `tomorrow.roast` from `roastEveningSteps`, loading the part recipes the way `RoastBuilder` does. Return `tomorrowSlot` and a `setPrep(slotId, value)` that calls `repo.setPrepAhead` and then `reload()`.
  - **`TodayHour` first page,** between Get it out and Start:
    - the `forTomorrow` row: a switch when `optional > 0`, and a "Needs the night before" list for `mustDo`
    - the `doneLastNight` row: "Done last night: prep for tonight's X", with "I didn't get to it", or "Undo" once it's `missed`
    - the `roastAhead` row, linking to `/recipes/roast/cook?${roastQuery(choice)}`
  - Follow the page's existing white styling.
- [ ] **Step 4: Run** the test file, then `npm test`. Expected: green.
- [ ] **Step 5: Commit** (`Today's hour: choose tomorrow's prep, say if last night's didn't happen, see a roast's night-before prep`).

### Task 5: Week tab day sheet — the same choice

**Files:**
- Modify: `src/screens/week/DayCard.tsx` (a "Today's hour" section), `src/screens/week/useWeek.ts` (an action)
- Test: `src/screens/week/WeekView.test.tsx`

**Interfaces:**
- Consumes: `MealSlot.prep_ahead`, `RecipeStep.needs_night_before`, `repo.getRecipe`.
- Produces: `w.setPrepAhead(date: string, value: PrepAhead)` in `useWeek`. It uses the existing `update(date, 'dinner', s => ({ ...s, prep_ahead: value }))`, so the change is saved through `saveSlots` like other day edits.

- [ ] **Step 1: Failing tests** in `WeekView.test.tsx`:
  - `'a day sheet offers the next day\'s dinner prep as recommended, and unticking saves on_the_day on that dinner'`
  - `'must-do prep shows as a line with no tick, and a day before out or leftovers shows no prep'`
- [ ] **Step 2: Run** `npx vitest run src/screens/week/WeekView.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `DayCard`, below the meals, add a "Today's hour" section. It only appears when the next day's dinner is cooked with a recipe that has `prep_8pm` steps (load that recipe's detail with `repo.getRecipe` once the sheet opens).
  - It shows a switch `Prep for <weekday>'s <title> (recommended)` when there are non-must steps, and a `Needs the night before: <step titles>` line when there are must-do steps.
  - When the next day's dinner is a roast, it shows "Roast prep the night before", linking to the roast builder.
  - Use the existing `switchClasses` (see Task 6 for its new home).
- [ ] **Step 4: Run** the test file, then `npm test`. Expected: green.
- [ ] **Step 5: Commit** (`Week tab: choose a day's prep for tomorrow from its day sheet`).

### Task 6: Wording — no more 8pm or Night before (except roasts)

**Files:**
- Create: `src/lib/switchClasses.ts` (moved from `prepAhead.ts`)
- Delete: `src/lib/prepAhead.ts`
- Modify:
  - `src/screens/recipes/RecipeCard.tsx`: no Prep ahead switch; the method is in cooking order; badges on prep steps; the time box reads "Prep ahead".
  - `src/screens/recipes/CookMode.tsx`: no switch or tabs; one list; badges.
  - `src/screens/recipes/RecipeEditor.tsx`: phase labels "Prep ahead" / "On the day"; a "Needs the night before" checkbox on prep steps.
  - `src/screens/week/DayCard.tsx` and `src/screens/shop/ShopList.tsx`: imports.
  - `src/styles/tokens.css`: comment.
  - `src/screens/settings/PlanningRules.tsx`, if it says 8pm.
- Test: the recipe card, cook mode and editor tests (`grep -l "Prep ahead\|Night before" src -r`)

- [ ] **Step 1: Update or add tests:**
  - `'the recipe card has no prep ahead switch and badges prep steps'`: shows "Can be done the day before" and "Needs the night before".
  - `'cook mode shows every step in one list'`.
  - `'the editor can mark a prep step as needing the night before'`: saved with `needs_night_before: true`.
  - Remove the tests for the old switch.
- [ ] **Step 2: Run** the affected test files. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Then run `grep -rn -i "8pm\|8 pm\|night before" src supabase/functions/_shared --include=*.ts --include=*.tsx` (in bash). Expected: only roast code (`roast.ts`, `roastModel.ts`, Roast screens), `cookidoo.ts`, the `prep_8pm` identifier itself, and test fixtures.
- [ ] **Step 4: Run** `npm test` and `npm run build`. Expected: green.
- [ ] **Step 5: Commit** (`Recipes read in cooking order with prep-ahead badges; no 8pm wording`).

### Task 7: The flagging pass (commands), docs, deploy

**Files:**
- Modify: `scripts/recipes.ts` (two commands), `docs/spec.md` (the 8pm sections, the Today's hour row, the recipe card row, the data model `recipe_steps` and `meal_slots`), `docs/playbooks/recipe-import.md` and `docs/playbooks/cookidoo.md` (set `night` on prep steps), `CLAUDE.md` if needed

**Interfaces:**
- Produces:
  - `npm run -s recipes -- prep-steps --household <id>` prints JSON `[{ id, recipe, step, body, timer, night }]` for every `prep_8pm` step of the household's recipes.
  - `npm run -s recipes -- flag-night --household <id>` reads `{ "night": [stepId, …] }` on stdin. First it writes every prep step's current flag to `seed/private/backups/night-flags-<ISO date>.json`. Then it sets `needs_night_before` true for the listed ids and false for the household's other prep steps. Ids not in the household are refused, and nothing is written.

- [ ] **Step 1: Implement both commands** (small; covered by running them in Step 4).
- [ ] **Step 2: Update the docs** listed above. "8pm prep" in the spec becomes "prep ahead in Today's hour". Add a dated paragraph (14 Nov 2026) to the Today's hour row describing the essential and recommended tasks, the tick in both places, "I didn't get to it", and roasts.
- [ ] **Step 3: Commit, then hand over migration 0018.** Commit with `npm test` green. Give the owner the migration to run in the SQL Editor (clipboard, then clear it), and wait for "It ran".
- [ ] **Step 4: The flagging pass.**
  - Run `prep-steps`. Subagents judge each step against the rule in Task 2 Step 3; their output is data.
  - Show the owner the steps to be flagged, as a short list grouped by recipe, and wait for their OK.
  - Run `flag-night`.
- [ ] **Step 5: Deploy.**
  - Push to `main` (the app deploys).
  - Deploy `ask-claude-connector` with the CLAUDE.md command, including `--no-verify-jwt`.
  - Confirm the live bundle has the new commit.
