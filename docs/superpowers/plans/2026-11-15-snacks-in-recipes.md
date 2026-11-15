# Snacks in the Recipes tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Snacks on the Recipes tab, any recipe usable as a snack, quick snacks without steps, and adding or
removing a snack on a day yourself; Claude plans with all of them and a replan keeps yours.

**Architecture:** Three recipe columns (`snack_ok`, `snack_portions`, `quick`) and `snack_eats.added_by`. One shared
`isSnack()` and `snackFactor()` decide what counts as a snack and how much of the recipe one snack is; numbers, makes,
shopping and the connector all go through them. Quick snacks get nutrition from a small built-in food table (or Claude
later, through `nutritionMissing`), are bought but never made.

**Tech Stack:** React + Vite + TS, Supabase (Postgres, RLS, Edge Functions), Vitest with PGlite.

**Spec:** `docs/superpowers/specs/2026-11-15-snacks-in-recipes-design.md`

## Global Constraints

- Owner's answers: a snack added after that delivery's Sainsbury's basket is filled goes on the Spar (top-up) list,
  not the basket; quick snacks have no picture; meal partners can't be quick snacks yet.
- Snacks stay morning and afternoon; `kind = 'snack'` implies snack_ok.
- One snack of a snack_ok recipe = `base_portions / snack_portions` servings of it.
- No personal names or private-rule words in committed files. Migration 0026 is run by the owner before deploying
  the connector; deploy with `--no-verify-jwt`.

## Review Focus

1. A replan with a household snack on Tuesday afternoon: it stays, and Claude's snack for that person and slot is
   dropped, not duplicated (Task 1 test).
2. A quick snack never appears in Today's cooking, but its items are on the shopping list (Task 3 test).
3. Baked oats as a snack (8 squares from a 4-serving tray): one square counts half a serving, and 8 squares buy one
   tray (Task 2 test).
4. A snack added after the basket is filled: its items go on the Spar list once; before that, nothing is added there
   (Task 3 test).
5. A toddler picked for a snack that isn't toddler-friendly: refused with words, nothing saved (Task 4 test).

---

### Task 1: Migration 0026
**Files:** `supabase/migrations/0026_snacks_in_recipes.sql`, `scripts/migration.test.mjs`.
`recipes.snack_ok boolean not null default false`, `recipes.snack_portions int check (1..100)`,
`recipes.quick boolean not null default false`; `snack_eats.added_by text not null default 'claude' check in
('claude','household')`; `save_claude_week` (same 9 arguments) deletes only Claude's eats on a replan and skips
Claude's eats that clash with a household eat on (date, slot, member).
- [ ] Test "0026", red, migration, green, commit.

### Task 2: Shared snack rules
**Files:** create `_shared/snackRules.ts` (`isSnack(r)`, `snackFactor(r)`), `_shared/quickNutrition.ts`
(`quickNutrition(items: { name; qty; unit }[]): Nutrition | null`); modify `_shared/snackEats.ts` (`makeSlots(eats,
factor?)`; `parseEats` accepts quick recipes with make_date = the day), `_shared/balance.ts` (eats count
`estimate × qty × snackFactor`, and fall back to the routine estimate by title for a breakfast recipe without one).
- [ ] Tests: isSnack for kind snack / snack_ok / quick / plain meal; factor 4/8 = 0.5; quick nutrition for
  "1 apple + 30g almonds" and null for an unknown item; makes scale by the factor; a person's day counts a square of
  baked oats as half a serving. Red, green, commit.

### Task 3: App data paths
**Files:** `src/lib/types.ts`, `src/lib/repo.ts` (`setSnackOptions`, `addQuickSnack`, `addSnackEat` with
added_by 'household', `removeSnackEat`), `src/lib/weekEats.ts` (isSnack, factor), `src/lib/shopping.ts`
(`deliveryFor(date, weekStart, shopsPerWeek)`), `src/screens/today/useTodayHour.ts` (no quick makes),
`src/screens/week/useWeek.ts` (isSnack; `addSnacks(date, memberIds, recipeId, slot, qty)` → Spar items when that
delivery's basket is done; `removeSnack(id)`), `Household.tsx` (isSnack and not quick).
- [ ] Tests (weekEats / shopping / TodayHour / WeekView): quick snack shopped not made; top-up rule. Red, green, commit.

### Task 4: Screens
**Files:** `RecipeLibrary.tsx` (Snacks filter), `AddRecipe.tsx` area (Quick snack form), `RecipeCard.tsx` ("Can be a
snack" switch with snack portions, keeps days, OK for the toddler), `Balance.tsx` (+ Add a snack; remove ×; "added by
you").
- [ ] Tests (RecipeLibrary, RecipeCard, WeekView). Red, green, commit.

### Task 5: Claude
**Files:** `_shared/weekPlan.ts` (select all kinds, isSnack pool with quick and snackPortion, householdSnacks in the
context, nutritionMissing covers them), `_shared/askClaude.ts`, `_shared/askClaudePlan.ts` (HOW_TO_PLAN),
`_shared/recipeSeed.ts` (a quick snack needs no steps), connector schema text.
- [ ] Tests: context lists a snack_ok meal and a quick snack with their portions; a quick snack's eat needs no
  make date; a new quick snack seed without steps passes. Red, green, commit.

### Task 6: Review and release
- [ ] Full suite and build, fresh reviewer, one fix pass, push; owner runs 0026; deploy the connector and
  propose-week with `--no-verify-jwt` and check they answer.

Deferred by the builder: making a snack_ok breakfast once in a bigger batch for both uses (the spec's "if the make
dates line up").
