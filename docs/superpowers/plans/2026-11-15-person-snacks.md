# Each person's snacks and meal partners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Snacks chosen per person and per day, fixed meal partners per person (overnight oats → 2 boiled eggs), all
made and bought as one family, planned by Claude in one go; a day-sheet nudge; a calmer Week page.

**Architecture:** One new table, `snack_eats` (who eats which snack, when, from which make day). Makes are never
stored: they're the eats grouped by make day and recipe, so a make always equals its eats. Partner eats are worked
out from the planned breakfasts and lunches and `settings.meal_partners`. A shared pure module turns all eats into
synthetic make slots (`slot: 'snack'`, mode `cook`), which shopping, the Sainsbury's basket and Today's cooking
already know how to read.

**Tech Stack:** React + Vite + TS, Supabase (Postgres, RLS, Edge Functions), Vitest with PGlite.

**Spec:** `docs/superpowers/specs/2026-11-15-person-snacks-design.md`

## Global Constraints

- No personal names, and none of the private-rule words, in committed files.
- Database changes in a new numbered migration (0025), run by the owner before deploying functions that need it.
- Estimates are per serving; an eat's `qty` is portions of the snack recipe (one portion = one item).
- The toddler only eats `toddler_ok` recipes.
- Snacks follow the meal specifications and the private rules, like any recipe.
- Week tiles show meals only: no "Low: …" line, no off-target line, no week strip.

## Review Focus

1. A breakfast changed in the app after approval: its partners follow (numbers, Today's cooking, shopping) with no
   stale eggs from the old breakfast. (Task 2 test: partner eats follow the breakfast name.)
2. A partner whose recipe keeps 2 days with only a Sunday prep day: Thursday's make is the evening before, not
   Sunday. (Task 2 test.)
3. A Sunday-before make (eats in the week, make on the Sunday before) appears once in the first delivery and in
   Sunday's Today's cooking, not twice. (Task 4 test.)
4. Claude names a person or snack that doesn't exist, puts a nut snack on the toddler, or gives one person two
   afternoon snacks: refused with words it can act on, nothing saved. (Task 2 / Task 5 tests.)
5. A replan or a discarded draft: its eats go with it, and its proposed partners never reach settings. (Task 1 test.)

---

### Task 1: Migration 0025

**Files:** Create `supabase/migrations/0025_snack_eats.sql`; Test `scripts/migration.test.mjs`.

**Produces:** table `snack_eats(id uuid pk, plan_week_id uuid fk → plan_weeks on delete cascade, date date,
slot text check in ('snack_am','snack_pm'), member_id uuid fk → members on delete cascade, recipe_id uuid fk →
recipes, qty numeric check > 0 and ≤ 6, make_date date, unique (plan_week_id, date, slot, member_id))`, RLS
"household access" as `meal_slots`; `plan_weeks.new_partners jsonb`; `save_claude_week(p_request, p_days, p_slots,
p_summary, p_cooking default null, p_office default null, p_prep default null, p_eats jsonb default null,
p_partners jsonb default null)` (drop the 7-argument one; deletes the week's eats on replace; inserts `p_eats`
rows `{date, slot, member_id, recipe_id, qty, make_date}`, checking member and recipe belong to the household;
sets `new_partners = p_partners`); `approve_week(p_week)` merges `new_partners` into `settings.data.meal_partners`
(per meal key, per member key, replacing that member's list) and clears it, then requests the Cookidoo sync as now.

- [ ] Test "0025: …": service saves a week with two eats and partners → both eats readable by the owner, not a
  stranger; replace with no eats → 0 eats; an eat for another household's member → error; approve → settings
  `meal_partners` has the merged lists, `new_partners` null; the 5-argument call still works.
- [ ] Run `npx vitest run scripts/migration.test.mjs -t 0025` → FAIL; write the migration; → PASS. Commit.

### Task 2: Shared snack logic

**Files:** Create `supabase/functions/_shared/snackEats.ts`, test alongside. Delete `snackPlan.ts`'s
`parseSnacks`/`snackRows` (keep `snackMakeDates`, `saveNutrition`).

**Produces:**
- `interface Eat { date: string; slot: 'breakfast' | 'lunch' | 'snack_am' | 'snack_pm'; member_id: string; recipe_id: string; qty: number; make_date: string; partner?: boolean; id?: string }`
- `type Partners = Record<string /* routine name */, Record<string /* member id */, { recipe: string /* slug */; qty: number }[]>>`
- `mealName(date, 'breakfast' | 'lunch', slots, recipes, opts: { breakfasts?: string[]; homeLunches?: string[] }): string | null`
  — the plain routine name the day shows (null for a leftover or reheated-dinner lunch, as `balance.ts` resolves it).
- `partnerEats(dates, slots, partners, snackRecipes: Map<slug, { id; keeps_days; toddler_ok }>, makeDates, recipes, opts): Eat[]`
  — make day: the latest `makeDates` entry before the eat's date it keeps to (`date − make ≤ keeps − 1`), else the
  day before.
- `placeEat(eat: Omit<Eat, 'make_date'>, existing: Eat[], keeps: number, makeDates: string[]): Eat` — joins a make of
  the same recipe still keeping (on or before the date), else the latest make date it keeps from, else the day before.
- `makeSlots(eats: Eat[]): { date; slot: 'snack'; mode: 'cook'; recipe_id; portions; reason }[]` — grouped by
  `(make_date, recipe_id)`, portions summed.
- `parseEats(raw, ctx: { dates; makeDates; members: { id; name; kind }[]; snacks: Map<slugOrTitleLower, { id; slug; keeps_days; toddler_ok }> }): Eat[]`
  for Claude's `snacks: [{ person, date, slot: 'am'|'pm', recipe, qty, make_date }]`; `parsePartners(raw, ctx): Partners`
  for `[{ meal, person, recipe, qty }]`. Errors name the problem.

- [ ] Tests: partner eats follow the breakfast name (oats → eggs; a changed breakfast → none); Sunday-only prep with
  keeps 2 → Thursday's make on Wednesday; leftover lunches have no partners; placeEat joins a keeping make;
  makeSlots sums; parseEats refuses an unknown person, the toddler on a non-toddler snack, two pm snacks for one
  person on a day, a make day after the date or past keeps, a make day not in makeDates.
- [ ] Red, then green; commit.

### Task 3: Numbers and the nudge

**Files:** Modify `supabase/functions/_shared/balance.ts` (+ test).

**Produces:** `personDay(…, member: { id?; kind; portion_weight }, opts: BalanceOptions & { eats?: Eat[] })` — snacks
come only from that member's eats on the date (qty × estimate; partners included); snack slots are no longer read.
`dayBalance(…, opts & { eats?: Eat[] })` — markers count the given (one adult's) eats once. `mealEstimates` drops
the snack keys. `nudge(p: { name; kind; totals; states; targets; unknown }, eatsToday: Eat[], snacks: { id; title; toddler_ok; nutrition }[]): { macro; gap; recipe_id; title; slot } | null`
— the biggest "under" gap among protein, fibre and calories (only with a target set), the snack that gives the most
of it, in a free snack slot (pm first); null otherwise.

- [ ] Tests: an adult with 2 eggs at breakfast and protein balls ×2 adds them; the other adult without doesn't; nudge
  picks the highest-protein snack for a protein gap and the free slot; none without targets.
- [ ] Red, green, commit.

### Task 4: Loading, shopping, basket, Today's cooking, get_week

**Files:** `src/lib/repo.ts` (`getWeek` also returns `eats`; `addSnackEat(weekId, eat)`), `src/lib/types.ts`
(`PlanWeek.new_partners`, `Settings.meal_partners`, `SlotKind` keeps old values), new `src/lib/weekEats.ts`
(`allEats(week, slots, eats, settings, members, recipes): Eat[]` wrapping `partnerEats` with the week's make dates),
`src/lib/shopping.ts` (snack makes are `slot === 'snack'`), `src/screens/shop/Shopping.tsx`, `scripts/basket.ts`,
`src/screens/today/useTodayHour.ts` (append `makeSlots(allEats(...))` to the slots they read),
`supabase/functions/_shared/askClaude.ts` (get_week lists each person's snacks and partners).

- [ ] Tests: the shopping list buys a Sunday-before make once in the Sunday delivery; Today's cooking on Sunday has
  "Snack: Boiled egg" for 9 eggs from two people's partners; get_week shows "Snacks: <name> pm Protein balls ×2".
- [ ] Red, green, commit.

### Task 5: Claude plans it

**Files:** `_shared/weekPlan.ts` (context: `people: [{ name, kind, share, targets }]`, `partners` by names,
`builtInBalance.people` counting partners; `parsePlan` takes `snacks` (eats) and `partners`; `saveWeekPlan`
resolves and passes `p_eats`/`p_partners`), `_shared/askClaudePlan.ts` (`HOW_TO_PLAN` balance line), the
connector's `save_week_plan` schema, `scripts/week.ts` compiles.

- [ ] Tests: a plan with eats and partners reaches `save_claude_week` with member and recipe ids; a nut snack for the
  toddler is refused, nothing saved; the context lists people and partners by name.
- [ ] Red, green, commit.

### Task 6: The app

**Files:** `src/screens/week/useWeek.ts` (`eats(date)`, `people` uses them, `nudge(date)`, `addSnack(...)`),
`DayCard.tsx` (partner line under a meal: "With it: <name> 2 Boiled egg · <name> 1"), `Balance.tsx` (per-person
snack list replaces the household lines; nudge with a Yes button), `WeekView.tsx` / `DayTile.tsx` (no strip, no low
or target lines; the draft banner lists `new_partners` as "New: <meal> now comes with <qty> <recipe> for <name>"),
`src/screens/settings/Household.tsx` (each person's partners: list, remove, add from breakfasts/lunches × snack
recipes (toddler: toddler_ok only) × qty).

- [ ] Tests (WeekView/Household): tiles have no "Low:" or "Under"; no week strip; the day sheet shows a person's
  snacks and partners; Yes on a nudge saves an eat; a partner added in Settings saves `meal_partners`.
- [ ] Red, green, commit.

### Task 7: Final review

- [ ] Full suite, build, fresh reviewer on the branch, one fix pass, ledger rulings.
