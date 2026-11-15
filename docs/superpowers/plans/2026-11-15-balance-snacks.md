# Daily balance and snack makes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, as the owner chose). Steps use
> checkbox syntax.

**Goal:** Each planned day shows a Mediterranean balance (four markers), and the week shows three more. Claude plans
snack makes on the prep days, which Today's cooking makes and the shopping list buys.

**Architecture:**
- Pure shared logic sits in `supabase/functions/_shared/balance.ts`: the nutrition type, `dayBalance` and
  `weekBalance`.
- Migration 0023 adds the `snack` recipe kind, nutrition, `keeps_days`, and the `snack_am`/`snack_pm` slots.
- The connector reads and saves estimates and snack makes.
- The app adds snack paths to shopping and Today's cooking, and shows the balance on the Week tab.

**Spec:** `docs/superpowers/specs/2026-11-15-balance-snacks-design.md`

## Global Constraints

- **Daily markers:**
  - breakfast protein ≥ 25g;
  - veg + fruit ≥ 5 portions, with veg ≥ half of them;
  - at least one healthy fat;
  - fibre ≥ 30g.

  Each marker is `ok`, `low` or `unknown`. It's `unknown` when a piece it needs has no estimate, or the dinner is
  `out`.
- **Weekly markers:** oily-fish dinners ≥ 2; days with beans or lentils ≥ 3; red-meat dinners ≤ 2; processed-meat
  dinners ≤ 1.
- **Nutrition is per adult portion:** `{ protein_g, fibre_g, veg_portions, fruit_portions, healthy_fat, oily_fish,
  legumes, red_meat, processed_meat }` (numbers ≥ 0, plus booleans).
- **Snack slots** are `snack_am` and `snack_pm`.
  - A make is mode `cook` on its make date, with `portions` for every covered day.
  - Each covered day after the make day has the same slot with mode `leftovers` and `source_date` = the make date.
- **Make dates** are prep days in the week. A Sunday prep day (6) means the Sunday before `week_start` (and may also
  be that week's own Sunday). With no prep days chosen, any date from the Sunday before up to the week's Sunday.
- **Covering:** a make covers its make day as day 0, up to `keeps_days` − 1 days after, and only dates in the week
  (the Sunday before counts only as the make day).
- **Words:** in code these are "snack makes", never "batches".
- **Toddler:** use the existing `recipes.toddler_ok`.
- **Project rules:** commits end with the Co-Authored-By line; run the private-rules grep before each commit; never
  name the private rules; `npm test` green.
- **Release:** one approval from the owner before anything goes live. Migration 0023 is run by the owner, then the
  library's estimates are filled in, then deploy and push.

## Review Focus

1. A dinner `out`, or a breakfast name with no estimate, gives `unknown`, never `low`. (Task 1)
2. A make dated the Sunday before the week reaches the Sunday delivery and that Sunday's Today's cooking. (Tasks 4
   and 5)
3. A snack covering a day the household has off still counts that day. (Task 1)
4. A second save, or a replan, replaces the snack slots with the rest of the week. This is already true:
   `save_claude_week` deletes all of a week's slots. (Task 3)
5. A routine name with a suffix, like "Overnight oats (made Sunday)", finds its estimate by the part before " (".
   (Task 1)

---

### Task 1: `balance.ts`

**Files:**
- Create: `supabase/functions/_shared/balance.ts` and `balance.test.ts`

**Produces:**
```ts
export interface Nutrition { protein_g: number; fibre_g: number; veg_portions: number; fruit_portions: number; healthy_fat: boolean; oily_fish: boolean; legumes: boolean; red_meat: boolean; processed_meat: boolean }
export type Mark = 'ok' | 'low' | 'unknown';
export interface DayBalance { breakfastProtein: Mark; vegFruit: Mark; healthyFat: Mark; fibre: Mark; low: string[] /* labels: 'breakfast protein','veg & fruit','healthy fats','fibre' */; totals: Partial<Nutrition> }
export interface WeekBalance { oilyFish: { count: number; mark: Mark }; legumes: { count: number; mark: Mark }; redMeat: { count: number; mark: Mark }; processed: { count: number; mark: Mark } }
export function parseNutrition(v: unknown): Nutrition | null
export function routineName(name: string | null | undefined): string   // the part before " ("
export function dayBalance(date: string, slots: BalanceSlot[], recipes: Map<string, { nutrition?: unknown }>, routines: Record<string, unknown>): DayBalance
export function weekBalance(dates: string[], slots: BalanceSlot[], recipes: Map<string, { nutrition?: unknown }>, routines: Record<string, unknown>): WeekBalance
type BalanceSlot = { date: string; slot: string; mode: string; recipe_id: string | null; routine_choice?: string | null; reason?: string | null; source_date?: string | null }
```

**How a day's parts are found:**
- **Breakfast:** a recipe if the slot has one, otherwise `routines[routineName(routine_choice ?? reason)]`.
- **Lunch:**
  - a recipe on the slot;
  - otherwise leftovers of the source date's dinner recipe (`source_date`, or `routine_choice === 'Leftovers'`);
  - otherwise the routine name.
- **Dinner:** a `cook`, `reheat` or `leftovers` dinner with a recipe. Mode `out` makes the totals-based markers
  `unknown`.
- **Snacks:** the snack slots' recipes.

**Tests** (in `balance.test.ts`):
- all ok;
- breakfast protein 20 → low;
- the dinner out → `vegFruit`, `fibre` and `healthyFat` unknown, and `breakfastProtein` still judged;
- a missing breakfast estimate → `breakfastProtein` unknown;
- fruit 4 and veg 1 → low (veg under half);
- a snack's fibre lifts the day to ok;
- the routine suffix is stripped;
- the weekly counts and marks;
- `parseNutrition` rejects junk.

Commit: "Balance: daily Mediterranean markers and the week's".

### Task 2: Migration 0023, types and seed rules

**Files:**
- Create: `supabase/migrations/0023_snacks_nutrition.sql`
- Modify:
  - `src/lib/types.ts` (`SlotKind` += `'snack_am' | 'snack_pm'`; `Recipe` += `nutrition?`, `keeps_days?`, kind
    `'snack'`; `Settings.routine_nutrition?`);
  - `src/lib/household.ts` (validate `routine_nutrition` with `parseNutrition`);
  - `supabase/functions/_shared/recipeSeed.ts` (kind `snack`: no protein required; `keeps_days` 1–7 is required for
    snacks; optional `nutrition`, checked by `parseNutrition`; `recipeRow` writes both);
  - `askClaude.ts:57` slot type.
- Test: `scripts/migration.test.mjs` ("0023: snack recipes, nutrition and snack slots"), `recipeSeed` tests, and
  `household.test.ts`.

**SQL:**
- drop and re-add the recipes kind check: `('meal','component','snack')`;
- add `recipes.nutrition jsonb` and `recipes.keeps_days int check (keeps_days between 1 and 7)`;
- drop and re-add the meal_slots slot check: `('breakfast','lunch','dinner','snack_am','snack_pm')`. Find the
  constraint names with `pg_constraint` in a `do` block, so this works whatever they were named.

Commit: "Migration 0023: snack recipes, nutrition, snack slots".

### Task 3: Connector — estimates and snack makes

**Files:**
- Modify:
  - `supabase/functions/_shared/weekPlan.ts`, `askClaudePlan.ts`;
  - the connector's tool list in `supabase/functions/ask-claude-connector/index.ts`;
  - `src/lib/types.ts` if needed.
- Test: `weekPlan.test.ts`, `askClaudePlan.test.ts`

**Interfaces:**
- **`planContext` gains:**
  - `snackRecipes`: kind `snack`, not archived, with slug, title, `keeps_days`, `toddler_ok`, nutrition and
    ingredients;
  - `nutritionMissing: { recipes: string[] /* slugs of meal recipes in the library without nutrition */; routines: string[] /* breakfasts+lunches names without an estimate */ }`;
  - `rules.snackMakeDates`: the dates allowed by the constraints above;
  - `builtInBalance`: `dayBalance` for each date of the built-in proposal.
- **`save_nutrition`:** `makeNutrition(db, hid).save({ recipes?: [{ recipe: slugOrTitle, nutrition }], routines?: [{ name, nutrition }] })`.
  It writes `recipes.nutrition`, and merges into `settings.routine_nutrition` through `validateSettings`-compatible
  JSON. Unknown names are reported back; nothing is half-saved.
- **`parsePlan`** gains `snacks: [{ recipe, slot: 'am'|'pm', make_date, covers: string[] }]`. It's checked against
  the constraints, plus: a slot and date covered twice → error; a make date not allowed → error naming the allowed
  dates.
- **`saveWeekPlan`:**
  - resolves snack recipe slugs (library or new);
  - checks covers against `keeps_days`;
  - adds the snack slot rows to `p_slots`. The make row has portions = (covered days × 2 adults' portions, plus 1 per
    day if `toddler_ok`) ÷ 2 per slot. Simplify to `covers.length * (adults + (toddler_ok ? children : 0))`.
- **`HOW_TO_PLAN`** gains these lines:
  - fill `nutritionMissing` with `save_nutrition` first;
  - pick 1–2 snack makes on `rules.snackMakeDates`, aimed at `builtInBalance` gaps, pairing protein or fat with
    fibre, using leftovers, and at least one `toddler_ok` each week;
  - new snack recipes need `kind: "snack"`, `keeps_days` and nutrition.

**Tests:**
- the context lists missing nutrition and the snack dates (the Sunday before with prep day 6);
- `save_nutrition` saves a recipe and a routine;
- the save adds snack rows (a make plus leftovers) and refuses a cover beyond `keeps_days`, a disallowed make date,
  and a double cover.

Commit: "Connector: nutrition estimates and snack makes".

### Task 4: Shopping buys snack makes

**Files:**
- Modify: `src/lib/shopping.ts`
- Test: `shopping.test.ts`

The loop also takes `snack_am`/`snack_pm` slots with mode `cook`. Factor = `portions / base_portions`. The label is
"<Day> snack: <title>". A `neededBy` before the week's Monday goes in the Sunday delivery.

Tests:
- a Wednesday snack make goes in Tuesday's list;
- a make on the Sunday before goes in Sunday's list.

Commit: "Shopping: snack makes".

### Task 5: Today's cooking makes them

**Files:**
- Modify: `src/lib/todayHour.ts`, `src/screens/today/useTodayHour.ts`
- Test: `todayHour.test.ts`, `TodayHour.test.tsx`

`HourInput.snacks?: { title: string; recipe: RecipeDetail; factor: number }[]`, made tonight. Each becomes an extras
chain from its finish steps, prefixed "Snack: ". `useTodayHour` fills it from today's snack slots with mode `cook`.

Tests:
- the plan includes "Snack: …" steps and counts their ingredients in Get it out;
- on a Sunday before the week, a make stored in next week's plan appears.

Commit: "Today's cooking: snack makes".

### Task 6: The Week tab shows the balance and the snacks

**Files:**
- Modify: `src/screens/week/useWeek.ts` (`balance(date)` and `weekBalance`), `DayTile.tsx` ("Low: …" line),
  `DaySheet.tsx` or `DayCard.tsx` (the four markers and the day's snacks), `WeekView.tsx` (a week strip with the
  three weekly markers)
- Test: `WeekView.test.tsx`

Tests:
- a day low on fibre shows "Low: fibre" on its tile;
- the day sheet lists the snack and the four markers;
- the week strip shows "Oily fish 1 of 2".

Commit: "Week: the day's balance, its snacks, and the week's markers".

### Task 7: Review and release prep

- A fresh reviewer goes over the whole branch, and its findings are fixed with a test first.
- Then the owner's one approval → migration 0023 → fill in the library's estimates from the Mac (the owner's
  recipes, estimated by Claude, written with a temporary script) → deploy `ask-claude-connector` and `propose-week`
  → push.
