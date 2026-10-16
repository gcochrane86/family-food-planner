# Phase 3: Week Planning, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Friday at 7pm (London time), next week's balanced dinner menu appears in the app. You keep, swap, mark "out tonight", add guests or take a leftovers night, then approve. The Week tab shows the plan as a calendar with breakfast, lunch, dinner and an 8pm prep row. Approving builds a shopping list (Sunday and Tuesday deliveries) from the recipes, minus what's in the pantry. You can mark meals cooked and say whether the portions were right. Six new dinners (2 fish, 2 red meat, 2 veggie) give the planner choice.

**Architecture:**
- One pure TypeScript planner lives in `supabase/functions/_shared/planner.ts`. The app imports it for swaps, and the `propose-week` Edge Function imports it for Friday's proposal, so both apply the same rules.
- Plans live in new tables (`plan_weeks`, `meal_slots`), behind the same household access rules.
- `pg_cron` runs hourly through Friday evening (UTC) and calls the function with a shared secret held in Supabase Vault. The function only proposes when London local time is 19:xx and no plan exists yet for that week.
- The shopping list is calculated from the approved plan (not stored), and ticks are saved per item.

**Tech Stack:** As in Phases 1–2, plus `pg_cron`, `pg_net` and Supabase Vault.

**Spec:** `docs/spec.md`: §3 (rhythm, breakfast and lunch routines, office days, toddler), §4 Planning, §6 calendar, §7 optimiser (simplified: no offers or prices yet), §8 timeline, "Weekly proposal (Friday 7pm) and review", §11 Phase 3.

## Global Constraints

- **Balance targets (settings.balance, editable):** `{chicken: 2, fish: 1, red_meat: 1, veggie: 1}` per 7-day week, scaled down for 5-day plans. No same protein two nights running. No recipe repeated within 14 days.
- **Weekday dinners:** finish within `weekday_dinner_max_min` (30). On office days (from `member_week_pattern` for adults), dinner finish is ≤ 20 min and lunch is "packed".
- **Cook once, eat twice:** at most one dinner per week with `reheats_well` and `base_portions ≥ 6`, placed Mon–Thu. Its extra portions fill the next day's lunch slots.
- **Sunday dinner** is a "use it up" night (leftovers or freezer), because the shop arrives 7–8pm.
- **Breakfast:** Monday is fixed as overnight oats; other days are the pool (eggs, porridge, baked oats), recorded by tap. **Lunch:** leftovers when there are any; otherwise the "Home lunch" routine (chicken sandwich or soup).
- **8pm prep row:** for day D, it shows the `prep_8pm` steps of D+1's dinner, with their total `prep_minutes`.
- **Proposal timing:** cron `0 17-20 * * 5` (UTC). The function acts only when Europe/London time is 19:xx and the household has no `plan_weeks` row for next Monday. The function rejects requests without the `x-cron-secret` header matching the `CRON_SECRET` secret.
- **Shopping split** (2 shops/week): items needed Mon–Wed go in the Sunday order; items needed Thu–Sun go in the Tuesday order, unless the ingredient keeps (cupboard staples go Sunday). Staples marked `have` are left off; `low` and `out` are added.
- **Keys:** `CRON_SECRET` is set with `supabase secrets set` and stored in Vault (`cron_secret`); no secrets go in the repo.

## Review Focus

1. **A library too small to meet the targets** (e.g. only 1 fish recipe and a 14-day no-repeat window). The planner relaxes the rules in a fixed order (repeat window, then targets) and says so in the reason, rather than failing or leaving gaps. *(Task 2)*
2. **The clocks change.** 7pm London is 18:00 UTC in summer and 19:00 UTC in winter; the proposal must appear at 7pm local both ways and never twice. *(Task 4)*
3. **"Out tonight" on the cook-once dinner.** The lunches it was supplying lose their source and fall back to the routine. *(Task 5)*
4. **Guests +N.** The shopping quantities follow the new portions. *(Task 7)*
5. **Approving twice, or editing after approval.** The week stays one plan, and the shopping list recalculates. *(Tasks 5, 7)*

---

### Task 1: Schema for plans, plus recipe protein
**Files:**
- Create `supabase/migrations/0003_planning.sql`
- Extend `scripts/migration.test.mjs`
- Update `src/lib/types.ts`
- Update `scripts/recipeSeed.mjs` and its test (the `protein` field is required for meals)
- Update the private seed files with `protein` for every recipe

**Produces:**
- **`recipes.protein`** column: `chicken|fish|red_meat|veggie|egg|other`, nullable
- **`plan_weeks`** table:
  - columns: `id, household_id, week_start date, days 5|7, status draft|approved, proposed_at, approved_at`
  - unique on `(household_id, week_start)`
- **`meal_slots`** table: `id, plan_week_id, date, slot breakfast|lunch|dinner, recipe_id null, mode cook|reheat|leftovers|out|routine|packed, portions numeric, guests int default 0, locked bool, reason text, source_slot_id null (for reheats), cooked_at, portions_verdict null|not_enough|right|leftovers`
- **`shopping_ticks`** table:
  - columns: `id, plan_week_id, delivery sun|tue, item_key text, ticked bool`
  - unique on `(plan_week_id, delivery, item_key)`
- **Access:** RLS on all of these through the household
- **Function:** `approve_week(p_week uuid)` sets `approved` and `approved_at`; calling it again has no extra effect

- [ ] **Failing tests:**
  - a stranger can't see or edit another household's plans or slots
  - `week_start` is unique per household
  - `approve_week` can be called twice
  - deleting a week removes its slots and ticks
- [ ] **Implement.** Run the tests, then commit with message `feat: planning schema`.

### Task 2: The planner
**Files:**
- Create `supabase/functions/_shared/planner.ts`
- Create `supabase/functions/_shared/planner.test.ts`

**Produces:**
- `proposeWeek(input: PlannerInput): ProposedSlot[]`, where:
  - `PlannerInput = { weekStart: string; days: 5|7; recipes: PlannerRecipe[]; recentRecipeIds: string[]; officeDays: number[]; balance: Balance; weekdayMaxMin: number; householdPortions: number; seed: number }`
  - each `ProposedSlot` has `date`, `slot`, `recipeId`, `mode`, `portions`, `reason` and `sourceDate?`
- `alternatives(plan, date, input, n=3): {recipeId, reason}[]`
- `applyOut(plan, date)`, `applyGuests(plan, date, n, input)` and `applyLeftovers(plan, date)` each return a new plan

Choices are made with a seeded pseudo-random number generator (`mulberry32(seed)`), so tests are predictable and each week varies.

- [ ] **Failing tests:**
  - **A week from the seed library:**
    - every weekday dinner fits the time limit
    - the office-day dinner (Monday) is ≤ 20 min
    - no protein two nights running
    - the protein counts meet the targets when the library allows it
    - there is exactly one cook-once dinner Mon–Thu, and the next day's lunches point to it as "reheat"
    - Sunday dinner is "leftovers"
  - **A thin library** (1 fish recipe, 1 red meat, which was used last week): the plan still fills every night, and the reasons mention the relaxed rule
  - **Same seed** gives the same plan; a different seed gives a different plan
  - **`alternatives`:** returns 3 options that don't break the no-repeat rule, each with a reason naming the balance
  - **`applyOut` on the cook-once dinner:** the dependent lunches go back to "routine"
  - **`applyGuests(+2)`:** portions = household + 2 × 1.25
- [ ] **Implement**, run the tests, then commit with message `feat: balanced week planner`.

### Task 3: Six new dinners
**Files:** Create `seed/private/recipes/more-dinners.json` (git-ignored).

**Content:** in the house style (TM7 sauce, 8pm prep, ≤30 min weekday finish, toddler notes, salt per portion, safe core temperatures):
- **Fish:**
  - salmon, TM7 lemon-dill yoghurt sauce, new potatoes and greens
  - cod, TM7 tomato-olive sauce and orzo
- **Red meat:**
  - beef stir-fry, TM7 black bean or soy-ginger sauce and rice
  - pork tenderloin, TM7 apple-mustard sauce and mash, with the MEATER at 63°C plus rest
- **Veggie:**
  - chickpea and spinach curry made in the TM7 (cook once, eat twice; reheats and freezes)
  - halloumi-free veggie fajita bowls with homemade flatbreads and black beans

- [ ] **Validate** with `recipeSeed.test`, then load with `npm run seed:recipes` and check the counts. This needs no commit, because the content is private.

### Task 4: Friday 7pm proposal
**Files:**
- Create `supabase/functions/propose-week/index.ts`
- Create `supabase/functions/_shared/schedule.ts` and its test
- Create `supabase/migrations/0004_schedule.sql`

**Produces:**
- `shouldPropose(nowUtc: Date): {go: boolean, weekStart: string}`. It's true when the London hour is 19 on a Friday, and `weekStart` is the following Monday.
- **The function:**
  - checks `x-cron-secret`
  - for each household without a plan for `weekStart`, loads its recipes, settings, office days and the last 14 days of dinners
  - runs `proposeWeek` and inserts `plan_weeks` (draft) plus `meal_slots`
  - takes a `?force=1` option (needs the secret too) for testing
- **The SQL:**
  - enables `pg_cron` and `pg_net`
  - `cron.schedule('propose-week', '0 17-20 * * 5', ...)` uses `net.http_post` with the secret from `vault.decrypted_secrets`

- [ ] **Failing tests** for `shouldPropose`:
  - Fri 10 Jul 2026 18:30 UTC (BST) gives go
  - Fri 10 Jul 2026 19:30 UTC gives no
  - Fri 4 Dec 2026 19:15 UTC (GMT) gives go
  - Fri 4 Dec 2026 18:15 UTC gives no
  - a Thursday gives no
  - `weekStart` is the next Monday
- [ ] **Implement and deploy.** Generate `CRON_SECRET` and set it with the CLI. You run `0004_schedule.sql` with the secret, which I put on your clipboard. Then a forced run creates the first proposal. Commit with message `feat: Friday 7pm menu proposal`.

### Task 5: Week screen with review actions
**Files:**
- Create `src/screens/week/WeekView.tsx`, `DayCard.tsx`, `SlotActions.tsx`, `useWeek.ts`, with tests
- Extend `src/lib/repo.ts` with `getWeek(householdId, weekStart)`, `saveSlots`, `approveWeek` and `recordBreakfast`
- Replace the Week placeholder route

**Behaviour:**
- **Layout:** one day at a time with a day strip on the phone; the week grid on the iPad (≥760px), following the mockup.
- **Header:**
  - "Next week's menu is ready" when a draft exists
  - "Approve by Saturday 2pm" once it's Saturday
  - "✓ Approved" once approved
- **Dinner actions:** Keep, Swap (3 alternatives from `alternatives`, plus "Choose any recipe"), Out tonight, Guests +N, Leftovers. They save straight away.
- **Approve week** calls `approve_week`.
- **Breakfast:** chips for the pool; Monday is fixed. **Lunch:** shows leftovers (reheat) or the routine; "packed" on office days.
- **8pm prep row:** shows tomorrow's prep steps and minutes, and links to the recipe.
- **No plan yet:** "Your first menu arrives Friday at 7pm", plus a "Propose now" button that calls the function with the user's session. The function accepts either a member JWT for their own household or the cron secret.
- [ ] **Failing tests:**
  - a draft shows the banner and Approve
  - Swap shows 3 options, and choosing one saves the slot with `locked`
  - Out tonight on the cook-once dinner sends Tuesday's lunch back to the routine
  - Guests +2 shows the new portions
  - Approve calls the repo once and the banner changes
  - the 8pm prep row on Sunday lists Monday's prep
  - the phone view switches days
- [ ] **Implement**, run the tests, then commit with message `feat: week calendar with review actions`.

### Task 6: Cooked and portion feedback
**Files:** Modify `DayCard.tsx` and add a test.
- [ ] **Failing test:** "Mark cooked" on a dinner records `cooked_at`, then offers "Not enough / About right / Leftovers"; choosing one saves `portions_verdict`.
- [ ] **Implement**, then commit with message `feat: mark cooked and portion feedback`.

### Task 7: Shopping list
**Files:**
- Create `src/lib/shopping.ts` with tests
- Create `src/screens/shop/ShopList.tsx` with tests
- Replace the Shop placeholder route

**Produces:**
- `buildShoppingList(slots, recipes, staples, settings): { sun: Item[]; tue: Item[] }`
- Each `Item = { key, name, qty, unit, approx, forMeals: string[], neededBy: date }`
- Items with the same name and unit are combined, and quantities are scaled by slot portions ÷ base portions
- [ ] **Failing tests:**
  - two recipes with onions add up
  - a staple marked `have` is left off; `low` is included
  - an item needed on Thursday goes to Tuesday (2 shops); with 1 shop everything is Sunday
  - guests increase the quantities
  - an "out" or "leftovers" slot adds nothing
- [ ] **Screen:**
  - Sunday and Tuesday sections
  - tick boxes saved to `shopping_ticks`
  - shows "for: Mon honey chilli chicken, Wed …"
  - empty states: "Approve next week's menu to make the list"
- [ ] **Implement**, run the tests, then commit with message `feat: shopping list from the approved plan`.

---
**Owner actions:**
1. Run `0003_planning.sql`.
2. Run `0004_schedule.sql` (it contains the cron secret, from your clipboard).
3. After Friday 7pm, check the first proposal. Before then, use "Propose now".
