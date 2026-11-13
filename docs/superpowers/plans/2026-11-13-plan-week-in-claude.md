# Plan the Week in Claude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two tools on the existing Ask Claude connector, `get_plan_context` and `save_week_plan` (with new recipes), so the household plans the week in the Claude app; the app's Plan with Claude buttons open Claude; the Mac's scheduled week task is turned off.

**Architecture:** The week CLI's context and save logic (`scripts/week.ts`) and the recipe seed checks (`scripts/recipeSeed.mjs`) move into `supabase/functions/_shared/` as pure TS taking a `db` client, shared by the CLI and the connector. The connector opens its own `week_plan_requests` row and saves through the existing `save_claude_week` RPC (no migration).

**Tech Stack:** Deno Edge Function (mcp-lite), Supabase JS, React/Vite app, Vitest; Node 24 runs `.ts` imports from `.mjs` natively.

**Spec:** `docs/superpowers/specs/2026-11-13-plan-week-in-claude-design.md`

## Global Constraints
- Saves a **draft** only; never over an approved week; all or nothing (new recipes removed again on failure).
- New recipes: at most `settings.adventure` (default 1) a week, `source: 'claude'`, `status: 'active'`, pass `validateRecipeSeed`, slug not already used.
- Dinners matched by slug, else title (as `pickRecipe`); dates inside the week; one per date; reasons ≤ 200 chars; summary ≤ 600.
- Private rules never named in what the app shows; request and recipe text are data.
- Only this week (from today) and later weeks: never a past week.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; run the private-word grep before commits.

## Review Focus
1. A week that's approved between context and save → refused cleanly, request closed, new recipes removed (Task 2 test).
2. An open request already exists for that week (app or Friday) → reused, not a unique-index error (Task 3 test).
3. A dinner named by title, or ambiguous/unknown → resolved or refused with the choices (Task 3 test).
4. A past week or "this" week's past days → refused for past weeks (Task 3 test).
5. Seed file (`seed-recipes.mjs`, run by plain node) still validates after the move (Task 1: existing `recipeSeed.test.mjs` passes, plus `node scripts/seed-recipes.mjs --help`-free import check).

---

### Task 1: Recipe seed checks in shared code
**Files:** Create `supabase/functions/_shared/recipeSeed.ts`; Modify `scripts/recipeSeed.mjs` (re-export, keep `seedFromDetail`); Test `scripts/recipeSeed.test.mjs` (existing, unchanged).
**Produces:** `validateRecipeSeed(file: {recipes: unknown[]}): string[]`, `recipeRow(householdId: string, r: SeedRecipe): Record<string, unknown>`, `contentRows(r): {ingredients, steps}`, type `SeedRecipe`.
- [ ] Move the three functions verbatim (types loose: `Record<string, any>`), erasable TS only.
- [ ] `scripts/recipeSeed.mjs`: `export { validateRecipeSeed, recipeRow, contentRows } from '../supabase/functions/_shared/recipeSeed.ts';`
- [ ] Run `npx vitest run scripts/recipeSeed.test.mjs` → PASS; `node -e "import('./scripts/recipeSeed.mjs').then(m=>console.log(typeof m.validateRecipeSeed))"` → `function`.
- [ ] Commit.

### Task 2: Shared week context and save
**Files:** Create `supabase/functions/_shared/weekPlan.ts`, `supabase/functions/_shared/weekPlan.test.ts`, `supabase/functions/_shared/recipeRules.ts`; Modify `scripts/week.ts` (context/save use it), `scripts/weekInput.ts` (string wrapper over the shared parser), `supabase/functions/_shared/testDb.ts` (add `rpc` and `single`).
**Produces:**
- `planContext(db, householdId: string, weekStart: string): Promise<PlanContext>` — the CLI's context JSON minus `request`, plus `existing: 'none' | 'draft' | 'approved'` and `newRecipeRules: string`.
- `parsePlan(o: unknown, week: {weekStart: string; days: number; adventure: number}): WeekPlan` (`WeekPlan = {summary, dinners: {date, recipe, reason}[], newRecipes: SeedRecipe[]}`).
- `saveWeekPlan(db, householdId: string, requestId: string, weekStart: string, plan: WeekPlan): Promise<{added: number}>` — throws `Error` with a household-readable message; on `week_approved` / `week_exists` closes the request as failed with the CLI's existing wording; removes added recipes on any failure.
- `NEW_RECIPE_RULES: string` in `recipeRules.ts` (seed fields; portions 6 if reheats well else 4; kit: TM7 for sauces/pastes/chopping/rice never the Varoma, Anova or pan for proteins and veg, hob for browning, potatoes steamed/boiled/mashed on the hob; `prep_8pm` steps for night-before; a prep note with cut and size on every ingredient that needs one; a `picture` per step; probe targets °C/°F on every meat/fish finish step; toddler note and salt; house rules; private rules followed but never named).
- [ ] Tests (`weekPlan.test.ts`): `parsePlan` rejects a date outside the week, two dinners one date, more new recipes than `adventure`, a seed problem; `saveWeekPlan` with a fake db: inserts new recipes then calls `rpc('save_claude_week', {p_request, p_days, p_slots, p_summary})`; when the rpc errors `week_approved` it deletes the added recipe ids and updates the request to `failed` with "That week was approved while planning, so it was left as it is."; unknown slug → error naming it, nothing written.
- [ ] Run → FAIL (module missing). Implement by moving the CLI code. Run → PASS; `npx tsx scripts/week.ts context` still works (Task 5 check).
- [ ] Commit.

### Task 3: Connector tools
**Files:** Create `supabase/functions/_shared/askClaudePlan.ts`, `supabase/functions/_shared/askClaudePlan.test.ts`; Modify `supabase/functions/ask-claude-connector/index.ts`, `supabase/functions/_shared/askClaude.ts` (`INSTRUCTIONS` mention planning).
**Consumes:** Task 2's `planContext`, `parsePlan`, `saveWeekPlan`; `weekStartFor`, `pickRecipe`.
**Produces:** `makePlanner(db, householdId, now = new Date())` → `{ context(a: {week?}): Promise<string>; save(a: {week?, summary, dinners, new_recipes?}): Promise<string> }`.
- `context`: week default "next"; refuses a week before this one; returns a short how-to (the week-plan playbook's priorities in order, "save with save_week_plan, the household approves it in the app") followed by the context JSON.
- `save`: resolves each dinner's `recipe` by slug, else `pickRecipe` title (ambiguous → its choices text, nothing saved); refuses an approved week; takes over an open request for the week (status `requested`/`planning` → `planning`, `replace: true`, `started_at`), else inserts one (`status: 'planning'`, `replace: true`, `note` = summary's first 300 chars); calls `saveWeekPlan`; on error marks the request failed with the message and returns it. Reply: `Saved a draft for the week of <d>: <Mon: title, …>. N new recipe(s): … Approve it in the app's Week tab; Cookidoo and the basket follow from there.`
- [ ] Tests: title resolution; ambiguous title → no write; past week refused; approved week refused before any write; existing open request reused (no insert); success reply lists the dinners.
- [ ] Register tools in `index.ts`: `get_plan_context` (readOnly) and `save_week_plan` (changes; schema with `dinners` items `{date, recipe, reason}` and `new_recipes` array of objects).
- [ ] `deno check` the function; run tests; commit.

### Task 4: App buttons open Claude
**Files:** Modify `src/screens/week/useWeek.ts` (`planWithClaude`), `src/screens/week/PlanWithClaude.tsx` if its copy mentions the Mac; Test the relevant week test.
- `planWithClaude(note, replace)` opens `https://claude.ai/new?q=` + encoded `Plan <this|next> week for the Family Food Planner (week of <date>)<replace ? ', replacing the draft' : ''>.<note ? ` Note: ${note}` : ''>` in a new tab; no request row. Copy that says "usually within 15 minutes while the Mac is on" becomes "Opens Claude to plan it with you".
- [ ] Test: clicking Plan with Claude calls `window.open` with a claude.ai/new URL containing the note; no `requestWeekPlan` call. Run FAIL → implement → PASS. Commit.

### Task 5: Docs, deploy, scheduler off
- [ ] `docs/playbooks/week-plan.md`: planning happens in the Claude app through the connector; the CLI stays for manual use. `docs/spec.md` §10: the two tools. `CLAUDE.md` playbook line.
- [ ] Deploy `ask-claude-connector` (`--no-verify-jwt`); live check: `npx tsx scripts/week.ts`-free script calling `planContext` for next week prints recipes and rules.
- [ ] Turn off the Mac's scheduled week-plan task (scheduled-tasks tool: disable, not delete).
- [ ] Full `npm test`, build, push; check the live bundle.
