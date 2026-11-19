# Ad-hoc Plan and Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-phone Ad-hoc switch. In Ad-hoc, the Week tab becomes Plan (a list of meals with no days) and Shop
shows a list just for those meals plus hand-added items, sorted by aisle and checked against the pantry. The real week
is untouched.

**Architecture:**
- The ad-hoc meals, the hand-added items and their ticks live in three small household tables, apart from
  `plan_weeks`, so nothing that reads weeks can pick them up.
- The list reuses `buildShoppingList`: each ad-hoc meal goes in as a cooked dinner on a fixed placeholder date, with
  no basics and one shop. Its day labels and cupboard-only lines are then stripped, and the added items are put in
  with it.
- The UI reuses Shop's `CupboardCheckList` and `Section`.

**Tech Stack:** React + Vite + TS, Supabase, Vitest (+ PGlite for migrations).

**Spec:** `docs/superpowers/specs/2026-11-19-adhoc-plan-design.md`

## Global Constraints
- **Migration:** the database change is one new migration, `supabase/migrations/0027_adhoc_plan.sql`. The owner runs
  it in the SQL Editor.
- **Privacy:** no personal names in committed files. Run
  `git diff --cached | grep -i -E "pregnan|midwife|gareth|maria|zach"` before each commit.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Switch storage:** the switch is stored on the device, in localStorage key `adhoc-mode`, as `'1'` when on. Every
  read and write is wrapped in try/catch, and the app falls back to Plan.
- **Copy:**
  - Settings row "Plan or ad-hoc"
  - tab label "Plan"
  - aisle "Toiletries & household", before "Frozen"

## Review Focus
1. **The same recipe added twice** (lunch and dinner) is two meals, and its ingredients add up on one line. Test in
   Task 2.
2. **An empty ad-hoc plan with no items** shows a friendly empty state, not a broken list. Test in Task 5.
3. **Ticking an item that restocks a run-out staple** marks it "have", as the weekly shop does. Test in Task 2:
   `staples` is kept on the line.
4. **Clearing the plan** removes meals, items and ticks, but leaves the Spar list and the weekly ticks alone. Test in
   Task 1 (migration) and Task 5.
5. **localStorage throwing** (private mode): the app still renders in Plan mode. Test in Task 3.

---

### Task 1: Migration and repo
**Files:** create `supabase/migrations/0027_adhoc_plan.sql`; modify `src/lib/types.ts`, `src/lib/repo.ts`,
`src/test/fakeRepo.ts`, `scripts/migration.test.mjs`.

- **Tables** (all `household_id uuid not null references households on delete cascade`, RLS `is_member(household_id)`,
  granted to authenticated and service_role):
  - `adhoc_meals`: `id`, `recipe_id` (references recipes, on delete cascade), `meal text check in ('lunch','dinner')`,
    `portions numeric(5,2) check > 0`, `created_at`.
  - `adhoc_items`: `id`, `name text check length(trim(name)) between 1 and 80`, `created_at`.
  - `adhoc_ticks`: `item_key text`, `ticked boolean`, primary key `(household_id, item_key)`.
- **Types:** `AdhocMeal {id, household_id, recipe_id, meal: 'lunch'|'dinner', portions: number, created_at}` and
  `AdhocItem {id, household_id, name, created_at}`.
- **Repo:**
  - `listAdhoc(hid): Promise<{ meals: AdhocMeal[]; items: AdhocItem[]; ticks: Map<string, boolean> }>`
  - `addAdhocMeal(hid, recipeId, meal, portions): Promise<AdhocMeal>`
  - `removeAdhocMeal(id)`
  - `addAdhocItem(hid, name): Promise<AdhocItem>`
  - `removeAdhocItem(id)`
  - `setAdhocTick(hid, key, ticked)`: an upsert
  - `clearAdhoc(hid)`: deletes all three for the household
  - The fake repo gets `vi.fn` versions.
- **Migration test** "0027: the ad-hoc plan is the household's own and clears on its own":
  - a member adds a meal, an item and a tick
  - a stranger sees none of them
  - deleting the household's ad-hoc rows leaves `quick_shop_items` alone
- **Steps:** write the test, run it with `npx vitest run scripts/migration.test.mjs -t 0027` (expect FAIL), write the
  migration, re-run (expect PASS), then commit.

### Task 2: Ad-hoc list and the household aisle
**Files:** modify `src/lib/aisles.ts` and `src/lib/shopping.test.ts`; create `src/lib/adhoc.ts` and
`src/lib/adhoc.test.ts`.

- **Aisles:** `AISLES` becomes `[…'Everything else', 'Toiletries & household', 'Frozen']`.
  - `aisle()` returns 5 for frozen and 4 for household words: toothpaste, toothbrush, shampoo, conditioner, soap,
    shower, deodorant, nappy, nappies, wipes, washing, detergent, bleach, bin, foil, cling, film, kitchen roll, toilet,
    tissue, tissues, sponge, cleaner, dishwasher, tablets, razor, plaster, plasters, paracetamol, ibuprofen.
  - The test is the existing walking-order test with frozen now 5, plus
    `aisle('toothpaste')===4`, `aisle('bin bags')===4`, `aisle('washing-up liquid')===4` and `aisle('sourdough loaf')===3`.
- **`buildAdhocList(meals: AdhocMeal[], recipes: Map<string, RecipeDetail>, staples: Staple[], items: AdhocItem[]): { list: ShopItem[]; check: CupboardCheck[] }`**:
  - Meals become `MealSlot`s: slot `'dinner'`, mode `'cook'`, date `ADHOC_DATE = '2000-01-03'`, and their `portions`.
  - It calls `buildShoppingList(slots, recipes, staples, 1)`.
  - It drops the `staple|` lines, strips the 3-letter day prefix from `forMeals` (in lines and checks), and labels
    each meal "Lunch: Title" or "Dinner: Title".
  - It appends items as `{ key: 'extra|'+id, name, qty: null, unit: '', approx: false, forMeals: [], neededBy: '' }`.
  - The result is sorted by `aisle`.
- **Tests (`adhoc.test.ts`):**
  - Two meals of the same recipe add up on one line, with `forMeals` `['Lunch: X', 'Dinner: X']`.
  - Staples the pantry has go to `check`, not `list`.
  - A low or run-out staple that isn't in a meal isn't on the list.
  - An ingredient covering a run-out staple keeps `staples`.
  - An added "toothpaste" comes after the food and before "frozen peas".
  - Portions scale the quantity.
- **Steps:** red, green, commit.

### Task 3: The switch, Settings and the Plan tab
**Files:** in `src/lib/adhoc.ts`, add `isAdhoc(): boolean`, `setAdhoc(on: boolean): void` (dispatches a window
`adhoc-mode` event) and `useAdhoc(): boolean`. Create `src/screens/settings/PlanMode.tsx` (route `settings/mode`,
row "Plan or ad-hoc" / "Switch this phone to an ad-hoc shop") and `src/screens/adhoc/AdhocPlan.tsx`. Modify
`BottomNav.tsx`, `App.tsx` and `SettingsHome.tsx`.

- **The switch:** a two-option tablist, Plan / Ad-hoc, with a line explaining that it's this phone only and the weekly
  plan is kept.
- **BottomNav:** when `useAdhoc()` is on, the first tab is `{to:'/plan-adhoc', label:'Plan'}`. App routes
  `/plan-adhoc` to `AdhocPlan`, and `/week` redirects to `/plan-adhoc` while ad-hoc is on.
- **AdhocPlan:**
  - heading "Ad-hoc plan", and a note: "Your weekly plan is kept. Switch back in Settings."
  - Lunch and Dinner groups, each meal a Link to `/recipes/:id`, with its portions and a Remove button
  - "Add a meal" opens a searchable recipe picker (title filter), then asks Lunch or Dinner, using
    `householdPortions` for portions
  - "Clear the plan" asks to confirm, then calls `clearAdhoc`
  - The empty state is "Nothing planned yet. Add a meal here or from a recipe."
- **Tests:**
  - `adhoc.test.ts`: `isAdhoc` is false when localStorage throws. `setAdhoc(true)` makes `isAdhoc()` true.
  - `AdhocPlan.test.tsx`:
    - shows the meals grouped
    - Remove calls `removeAdhocMeal`
    - adding through the picker calls `addAdhocMeal(hid, id, 'dinner', n)`
    - Clear calls `clearAdhoc` after confirming
  - `BottomNav` test: the label is Plan in ad-hoc.

### Task 4: The ad-hoc shop
**Files:** create `src/screens/adhoc/AdhocShop.tsx` and its test. Modify `ShopList.tsx` (in ad-hoc, `<SparList/>`
then `<AdhocShop/>` in place of `<Shopping/>`). In `Shopping.tsx`, export `CupboardCheckList` and `Section`, and
make `Section` show no "for" line when `forMeals` is empty.

- **What AdhocShop loads:** `listAdhoc`, `listStaples`, and `getRecipe` for each meal's recipe. It builds with
  `buildAdhocList`.
- **What it shows, in order:**
  - Check the cupboard: answers are stored as ticks `cupboard-got|id` and `cupboard-need|id`. "Need it" sets the
    staple out, as Shopping does, and needed ids are passed through as Shopping does.
  - An "Add an item" form: text input "Add an item" and an Add button.
  - `Section` titled "Ad-hoc shop", with `showRun={false}` and an empty products map. Ticks use
    `setAdhocTick(hid, tickKey(item), v)` and restock staples as Shopping does.
  - Each added item has a remove control.
- **Empty state:** "Add meals on the Plan tab, or add an item."
- **Tests:**
  - It lists a meal's ingredient and an added item under their aisles.
  - Adding an item calls `addAdhocItem` and shows it.
  - Ticking calls `setAdhocTick`.
  - The empty state.

### Task 5: Add to plan from a recipe
**Files:** modify `RecipeCard.tsx` and its test.

- **When ad-hoc is on:** under the portions control, show an "Add to plan" button. It opens Lunch / Dinner choices,
  then calls `addAdhocMeal(hid, recipe.id, meal, target)` and shows "Added to the ad-hoc plan".
- **When it's off:** nothing new shows.
- **Test:** both modes.

### Task 6: Whole check and ship
- Run `npm test` and `npm run build`.
- Get a final review by a fresh reviewer.
- Commit and push, and confirm the deploy.
- The owner runs `0027_adhoc_plan.sql` in the SQL Editor before using it.
