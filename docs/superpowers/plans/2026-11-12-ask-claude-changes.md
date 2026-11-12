# Ask Claude Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Claude (through the existing connector, with the owner's approval in the Claude app) save a one-day "tonight's version" of a recipe, swap a dinner, and set a staple's pantry status. The app uses tonight's version wherever that day's meal is cooked or shopped for.

**Architecture:**
- A new `meal_slots.version` jsonb column.
- Two new pure shared modules in `supabase/functions/_shared/`:
  - `slotVersion.ts` builds, validates and applies a version.
  - `slotMerge.ts` is the Week screen's `merge`, moved out, so the app and the connector clear batch, roast and version the same way.
- A shared write module, `askClaudeWrite.ts`, does the date and household checks and the writes. The connector registers four new tools on top of it.
- In the app, the day card's links carry `?day=&slot=`, so the recipe card and cook mode can load that slot's version. Today's hour and the shopping list apply versions too.

**Tech Stack:** TypeScript, React, Vitest, PGlite migration tests, a Deno Edge Function with mcp-lite.

**Spec:** `docs/spec.md` §10, "Ask Claude: changes you approve (12 Nov 2026)" (builds on "Ask Claude (a read-only connector…)").

## Global Constraints
- Writes go only to `meal_slots`, and only to rows whose `plan_week_id` was just read from `plan_weeks` with `.eq('household_id', hid)`. They also go to `pantry_items` with `.eq('household_id', hid)`. Nothing else is written.
- A slot write never includes `id` or `cookidoo_recipe_id` (as `repo.saveSlots`). Upserts use `onConflict: 'plan_week_id,date,slot'`.
- Changeable dates run from today in London (`londonParts(now).date`) to the Sunday of next week, inclusive. The week must exist.
- `swap_meal` changes dinners only. It takes a `recipe` title (via `pickRecipe`, which only offers active recipes) or `out: true`. It uses `applySwap`/`applyOut` from `_shared/planner.ts` with `loadPlannerInput(db, hid, weekStart)`, then `mergePlan`.
- A version is set only on a slot that has a `recipe_id` and whose mode isn't `out` or `reheat`. `based_on` must equal that `recipe_id`.
- Whenever the slot's recipe changes, or its mode stops being `cook`, the version is cleared. This happens in `mergePlan` and so in both the app and the connector.
- `changed` flags are computed by the server from the saved recipe, never taken from Claude.
- The app must keep working before the migration runs. Never write `version: null` to a slot that didn't have one (`mergePlan` only sets it when `s.version` is set).
- Every reply from a change tool states what changed and the knock-on effects:
  - Approved week plus a dinner swap: "Cookidoo will re-sync this dinner."
  - A `basket_runs` row for that week with `status = 'done'`: "The Sainsbury's basket is already filled: use Empty and refill, or a Spar trip."
  - A version: "Tonight's version isn't sent to Cookidoo; Cookidoo keeps the saved recipe."
- Privacy: no word naming what the private rules are for, anywhere. Run the usual private-word check on the staged diff before every commit.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Database change: `supabase/migrations/0015_slot_version.sql`, which the owner runs in the SQL Editor before the function or app ships.

## Review Focus
1. **A version whose `based_on` no longer matches the slot's recipe** (swapped in the app since). It's ignored everywhere: the saved recipe is used, never a stale version.
2. **Claude replaces an ingredient** (`replaces: "crème fraîche"`) **but leaves the saved name in the list too.** It's accepted, but the saved one counts as kept. Removing an ingredient needs `removed`, or a `replaces` on its own.
3. **Portions.** A version's quantities are for the recipe's `base_portions`, like the saved recipe, so cook mode and shopping scale them the same way.
4. **A date of today in the evening, or next Sunday.** Both are allowed. Yesterday and the Monday after next are refused with a clear message.
5. **The app reading slots before the migration runs** (no `version` key). Every screen behaves as today.

---

### Task 1: The version column, the type and the shared version logic

**Files:**
- Create: `supabase/migrations/0015_slot_version.sql` (`alter table public.meal_slots add column version jsonb;`)
- Modify: `scripts/migration.test.mjs`
- Modify: `src/lib/types.ts`: `MealSlot.version?: SlotVersion | null`, re-exported from the shared module.
- Create: `supabase/functions/_shared/slotVersion.ts`
- Test: `supabase/functions/_shared/slotVersion.test.ts`

**Interfaces:**
- Produces:
  - `interface SlotVersion { based_on: string; note: string; ingredients: VersionIngredient[]; steps: VersionStep[] }`.
    - `VersionIngredient` is `{ group_name, name, qty, unit, note, qty_approx, changed: boolean }`.
    - `VersionStep` is `{ phase, position, at_minute, title, body, machine, settings, timer_minutes, changed: boolean }`.
  - `interface VersionInput { note: string; ingredients: (Omit<VersionIngredient,'changed'|'qty_approx'> & { replaces?: string })[]; removed_ingredients?: string[]; steps: (Omit<VersionStep,'changed'> & { replaces?: string })[]; removed_steps?: string[] }`.
  - `buildVersion(saved: { id: string; ingredients: …; steps: … }, input: VersionInput): { version: SlotVersion } | { error: string }`.
  - `applyVersion<R extends { id: string; ingredients; steps }>(recipe: R, version: unknown): R & { versionNote?: string; changedIngredients?: Set<string>; changedSteps?: Set<number> }`.
  - `parseVersion(v: unknown): SlotVersion | null`.

- [ ] **Step 1: Write the failing tests.**

  Migration test: after all migrations, `insert … version` with `'{"based_on":"x"}'::jsonb` works, and a select returns it.

  `buildVersion`:
  - A swap with `replaces: 'crème fraîche'` and an unchanged rest gives `changed: true` only on the swapped ingredient. The note is kept.
  - An ingredient whose qty differs from the saved one gives `changed: true`.
  - A saved ingredient missing from the input, with no `replaces` and not in `removed_ingredients`, gives the error `Tonight's version leaves out "<name>" without saying so: add it back, put it in removed_ingredients, or name it in replaces.`
  - The same check runs for steps, by title.
  - A step whose body changed gives `changed: true`. Positions are renumbered from 1 in each phase.
  - An empty `note` gives the error `Say in one line what's different tonight.`
  - More than 80 ingredients or 60 steps gives an error.
  - The match is case-insensitive and ignores surrounding spaces.

  `applyVersion`:
  - With a version whose `based_on` matches, it returns the recipe with the version's ingredients and steps. It adds `image_path: null` on steps where the saved step at the same phase and title had none; otherwise it keeps the saved image. It sets `versionNote`, `changedIngredients` (names) and `changedSteps` (indexes).
  - With `based_on` not matching, `null`, or a malformed object, it returns the recipe unchanged, with no `versionNote`.

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `npx vitest run supabase/functions/_shared/slotVersion.test.ts scripts/migration.test.mjs`
  - Expected: FAIL (module missing; column missing).
- [ ] **Step 3: Implement** the migration, the types and `slotVersion.ts`. Use relative `.ts` imports only.
- [ ] **Step 4: Run the tests and watch them pass.** Then run `npm test` and `npm run build`: green.
- [ ] **Step 5: Commit.** Message: `Tonight's version: column and shared logic`.

### Task 2: Move the slot merge into shared code, clearing versions

**Files:**
- Create: `supabase/functions/_shared/slotMerge.ts`, which exports `mergePlan(slots: MealSlot-like[], plan: ProposedSlot[]): { next; changed }` and `toProposed(s)`. These are moved from `src/screens/week/useWeek.ts:28-51` unchanged, plus one rule: a version is cleared when `recipe_id` changes or the mode isn't `cook`. `version` joins the "differs" keys.
- Modify: `src/screens/week/useWeek.ts`, which imports them and deletes the local copies.
- Test: `supabase/functions/_shared/slotMerge.test.ts`

The slot type: define a structural `SlotLike` in `slotMerge.ts` with the fields used (`date, slot, recipe_id, mode, portions, guests, locked, reason, source_date, batch?, roast?, version?`). The function is generic, `<S extends SlotLike>`, so `MealSlot` passes without `_shared` importing `src/`.

- [ ] **Step 1: Write the failing tests.**
  - A swap on a dinner with a version gives `version: null`, and the slot is in `changed`.
  - Setting it to out also clears the version.
  - A portions-only change keeps the version.
  - A slot without a `version` key gets no `version` key after a swap.
  - The existing batch and roast behaviour is unchanged (one test each).
- [ ] **Step 2: Run them and watch them fail.**
  - Run: `npx vitest run supabase/functions/_shared/slotMerge.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement and wire `useWeek` to it.**
- [ ] **Step 4: Run the tests and watch them pass.** Then run `npm test` (`WeekView.test.tsx` must stay green) and `npm run build`.
- [ ] **Step 5: Commit.** Message: `Week: shared slot merge, which clears tonight's version on a swap`.

### Task 3: The app uses tonight's version

**Files:**
- Modify: `src/lib/repo.ts`: add `getSlot(householdId: string, date: string, slot: SlotKind): Promise<MealSlot | null>`, which goes through `plan_weeks` for the week containing `date` (reusing `getWeek`).
- Modify: `src/screens/week/DayCard.tsx`: dinner, lunch and breakfast recipe links get `?day=<date>&slot=<slot>`.
- Modify: `src/screens/recipes/RecipeCard.tsx`:
  - With `day` and `slot` params, it loads the slot and applies the version.
  - It shows a banner: `Tonight's version: <note>`, with a link `See the saved recipe` (the same path without the params).
  - Changed ingredients get a "changed" mark.
  - The cook mode link keeps `day` and `slot`.
- Modify: `src/screens/recipes/CookMode.tsx`: the same param handling. It shows a banner on the first page, and changed steps get a "Changed tonight" tag. Its close link keeps the params.
- Modify: `src/screens/today/useTodayHour.ts`: `detail` becomes per slot, applying each slot's version (tonight's dinner, tomorrow's dinner, tomorrow's "make" lunch).
- Modify: `src/screens/shop/ShopList.tsx` and/or `src/lib/shopping.ts`: each slot's recipe goes through `applyVersion(recipe, slot.version)` before its ingredients are added.
- Tests: `RecipeCard.test.tsx`, `CookMode.test.tsx`, `TodayHour.test.tsx`, `shopping.test.ts` (the existing files, plus new tests).

- [ ] **Step 1: Write the failing tests.**
  - `shopping.test.ts`: a slot whose version replaces "crème fraîche 200ml" with "Greek yoghurt 200g" lists Greek yoghurt and not crème fraîche. A version with a stale `based_on` lists the saved ingredients.
  - `RecipeCard.test.tsx`: opened at `/recipes/r1?day=2026-10-19&slot=dinner`, with that slot carrying a version, it shows the `Tonight's version:` banner, the changed ingredient, and a `See the saved recipe` link to `/recipes/r1`. Opened at `/recipes/r1`, there's no banner.
  - `CookMode.test.tsx`: with the params, the changed step's body is shown, with `Changed tonight`.
  - `TodayHour.test.tsx`: tonight's dinner with a version that swaps the chicken gives a chopping list naming the new ingredient.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and watch them pass.** Then run `npm test` and `npm run build`.
- [ ] **Step 5: Commit.** Message: `Tonight's version in cook mode, the recipe card, Today's hour and shopping`.

### Task 4: The connector's change tools

**Files:**
- Create: `supabase/functions/_shared/askClaudeWrite.ts`
- Test: `supabase/functions/_shared/askClaudeWrite.test.ts`
- Modify: `supabase/functions/_shared/askClaude.ts`:
  - `INSTRUCTIONS` changes to: "Suggest first; change only when asked. Change tools need the household's approval in Claude." It also prefers tonight's version to a swap when one ingredient is the problem, and says never to edit saved recipes.
  - The reader's `week()` selects `version`.
  - `slotLine` adds ` · tonight's version: <note>` when the version's `based_on` matches.
- Modify: `supabase/functions/ask-claude-connector/index.ts`: four tools, each with `annotations: { readOnlyHint: false, destructiveHint: false }`.

**Interfaces:**
- Consumes `pickRecipe`, `weekStartFor`, `makeReader` (Task 1 of the first plan), `buildVersion` (Task 1), `mergePlan`/`toProposed` (Task 2), `applySwap`/`applyOut` (`planner.ts`) and `loadPlannerInput` (`loadPlan.ts`).
- Produces:
  - `changeWindow(date: string, now: Date): { weekStart: string } | { error: string }`.
  - `makeChanger(db, hid, now = new Date())`, with:
    - `swapMeal({date, recipe?, out?}): Promise<string>`
    - `setVersion({date, slot, …VersionInput}): Promise<string>`
    - `clearVersion({date, slot}): Promise<string>`
    - `setPantry({item, status}): Promise<string>`

- [ ] **Step 1: Write the failing tests.** Use the `tableDb` fake from `askClaude.test.ts`, moved to a shared test helper `supabase/functions/_shared/testDb.ts`, extended to record writes (method, table, payload, filters).
  - `changeWindow` (now `2026-11-12T20:00:00Z`):
    - `2026-11-12` → ok, week `2026-11-09`. `2026-11-22` → ok, week `2026-11-16`.
    - `2026-11-11` → `That day has passed.` `2026-11-23` → `Only this week and next can be changed.` `tomorrow` → `Use a date like 2026-11-16.`
  - `swapMeal`:
    - Writes one upsert to `meal_slots` with the dinner `{recipe_id, mode:'cook', locked:true, reason:'Your choice'}` and the released lunch, with no `id` or `cookidoo_recipe_id`. The `plan_weeks` read has `eq('household_id','h1')`.
    - The reply names the old and new dinner.
    - In an approved week it adds the Cookidoo line. With a `basket_runs` row `{status:'done'}` it adds the basket line.
    - An unknown recipe → the `pickRecipe` text, with no write. No week → `No plan for that week yet.` with no write.
  - `swapMeal({out:true})`: mode `out`, and the version is cleared if there was one.
  - `setVersion`:
    - Writes `{version}` with `based_on` equal to the slot's recipe, with `changed` computed.
    - A `buildVersion` error → the error text, with no write.
    - A slot that's `out` → `There's nothing cooked then to change.`
    - The reply lists the changed ingredients and steps, plus the Cookidoo line.
  - `clearVersion`: writes `{version: null}`. If there was none → `There's no tonight's version on that day.` with no write.
  - `setPantry`:
    - A staple matched by ingredient name (exact, case-insensitive, else a single contains-match) updates `pantry_items.staple_status`, with `eq('household_id','h1')` and `eq('id',…)`.
    - A non-staple → `<name> isn't a staple: change it in the app's Pantry.` with no write.
    - Several matches → a list, with no write.
  - Write safety: across all calls, written tables ⊆ {`meal_slots`, `pantry_items`}. The write methods are only `upsert` and `update`. Every `pantry_items` update has the household filter.
- [ ] **Step 2: Run them and watch them fail.**
  - Run: `npx vitest run supabase/functions/_shared/askClaudeWrite.test.ts supabase/functions/_shared/askClaude.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `askClaudeWrite.ts`, read the week's slots with `select('*')`. The write is the full changed slot rows minus `id`/`cookidoo_recipe_id`, as `repo.saveSlots`.
  - In `index.ts`, register `swap_meal`, `set_tonights_version`, `clear_tonights_version` and `set_pantry`. Their JSON Schemas mirror the interfaces.
  - Tool descriptions say "Changes the plan: the household approves each call in Claude".
  - Tool arguments go through `String()` / `Number()` coercion.
- [ ] **Step 4: Run the tests and watch them pass.**
  - Then run `npm test`, `npm run build`, and the Deno check: `DENO_DIR=<scratchpad>/deno npx --yes deno@2 check --node-modules-dir=none --no-lock supabase/functions/ask-claude-connector/index.ts`.
  - Also run the local smoke test: `deno run` with a test key, then `tools/list` → 10 tools.
- [ ] **Step 5: Commit.** Message: `Ask Claude: change tools (tonight's version, swap, pantry)`.

### Task 5: Ship

- [ ] **Step 1: The migration.** The owner runs `0015_slot_version.sql` in the SQL Editor (copy it to the clipboard, then clear the clipboard afterwards). Confirm with a read: `npx tsx` with the `.env` service key, `select version from meal_slots limit 1`, which gives no error.
- [ ] **Step 2: Deploy the function** with the usual command, and push the app to main. Confirm the live bundle contains `Tonight's version`.
- [ ] **Step 3: Live check** (the key lives only in the owner's Claude settings, so the owner asks in Claude):
  - "Make Saturday's dinner use <X> instead of <Y>". After approval, check the slot's `version` with a service-key read.
  - Open Saturday's recipe from the Week tab and see the banner.
  - Then "clear Saturday's tonight's version", and check it's `null`.
  - The owner sets the four change tools to **Needs approval** in Claude's connector settings.
