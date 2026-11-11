# Today's Hour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One cooking hour a day, 17:30–18:30, with a clear timeline. It covers tonight's dinner, tomorrow's packed
lunch, any night-before breakfast and tomorrow's night-before steps, and starts with a single chopping session.
Cleaning is built in and the kit fits one dishwasher load.

**Architecture:**
- **A pure scheduler** (`src/lib/todayHour.ts`, like `src/lib/roast.ts`) turns tonight's and tomorrow's slots and
  recipes into three things:
  - a chopping list
  - a timed list of steps
  - a count of things to wash
- **A dark cook-view screen** (`/today`, like `RoastCook`) walks through it.
- **The Week tab** shows a "Today's hour" card.
- **The weekly planner** keeps each weeknight's hands-on time within the hour.
- **No database migration:**
  - The new settings live in the `settings.data` JSON.
  - What each step dirties is inferred from its machine and wording.

**Tech Stack:** React + Vite + TS, Vitest + Testing Library.

**Spec:** the owner's decisions in chat on 11 Nov 2026, summarised in Global Constraints. `docs/spec.md` gets a
"Today's hour" row in Task 6.

## Global Constraints
- **The hour:** every day, start `17:30`, length `60` minutes, both editable in Settings → Today's hour.
- **The hour covers:**
  - tonight's dinner
  - tomorrow's packed or leftover lunch
  - tomorrow's breakfast only if it's made the night before (default `Overnight oats` and `Baked oats`; porridge and
    eggs stay fresh in the morning)
  - tomorrow's dinner's `prep_8pm` steps
- **Chopping first, in one session at the start:**
  - Grouped by when things go in, not by bowl number ("For the curry: onions, garlic and ginger, one bowl (into
    the TM7)").
  - **No numbered bowls, and no bowl count shown.**
  - Veg and herbs first, then raw meat or fish last, "on its own mat".
- **Chop-ahead limits** (days an ingredient keeps once cut, in a lidded box at ≤5°C). Raw meat and fish never go
  more than 1 day.

  | Keeps | Ingredients |
  |---|---|
  | 4 | carrot, celery, pepper, cabbage, red onion, squash, swede, broccoli, cauliflower, green beans, salad leaves |
  | 2 | onion, leek, spring onion, kale |
  | 1 | garlic, ginger, chicken, beef, pork, lamb, turkey |
  | 0 (cut on the day) | tomato, cucumber, courgette, mushroom, potato, apple, avocado, aubergine, soft herbs (coriander, basil, parsley, dill, mint), fish and seafood |
  | 1 (anything else) | everything not listed |
- **Cleaning:**
  - The steps say what to rinse during the waits.
  - The last 10 minutes are plate up, wipe down and "load and start the dishwasher".
  - The day's kit is counted against one load.
- **Kit counts:** TM7 machines `1` or `2` and TM7 bowls `1` or `2` (Settings → Today's hour; default 1 and 1).
  With one bowl, the bowl is rinsed between a savoury TM7 job and anything after it (2 minutes).
- **Privacy:** never write the private rules' reason anywhere. The repo is public.

## Review Focus
1. **No dinner tonight (out or leftovers):** the hour still shows tomorrow's lunch, breakfast and prep, with no
   cooking steps.
2. **Tomorrow isn't planned** (the last day of the week, or no next week yet): only tonight's dinner, and nothing
   is chopped "for tomorrow".
3. **A dinner longer than the hour** (the 50-minute casserole plus its extras): a warning says what doesn't fit,
   and extras that don't fit are listed as "do these after dinner", never dropped silently.
4. **Tomorrow's lunch is tonight's leftovers:** "Pack tomorrow's lunch" comes after plating up, never before the
   dinner is cooked.
5. **Two TM7 jobs with one bowl:** a "rinse the TM7 bowl" step sits between them. With two bowls there's no rinse;
   with two machines they can overlap.

---

### Task 1: Chop-ahead limits (`src/lib/chopAhead.ts`)
**Files:** Create `src/lib/chopAhead.ts`, `src/lib/chopAhead.test.ts`

**Produces:**
- `keepsDays(name: string): 0 | 1 | 2 | 4`
- `needsChopping(ing: Pick<RecipeIngredient,'name'|'note'>): boolean`
- `isRawProtein(name: string): boolean`

**Tests:**
- `keepsDays('red onion') === 4`, `keepsDays('onion') === 2`, `keepsDays('salmon fillets') === 0`,
  `keepsDays('coriander') === 0`, `keepsDays('garlic') === 1`, and an unlisted name gives `1`.
- Names are matched by words using `words()` from `src/lib/recipes.ts`, and the longest match wins ("red onion" over
  "onion", "spring onion" over "onion").
- `needsChopping` is true when the note matches
  `/chop|dice|slice|grate|mince|cube|baton|strip|wedge|julienne|crush|halve|quarter|trim|floret|shred/i`, and false
  for `{ name: 'tinned tomatoes', note: null }` and `{ name: 'ground cumin', note: null }`.
- `isRawProtein('chicken thigh') === true`, `isRawProtein('chickpeas') === false`.

Steps: write the tests, watch them fail, implement, watch them pass, then commit with "Today's hour: chop-ahead
limits".

### Task 2: Settings → Today's hour
**Files:**
- Modify `src/lib/types.ts` (Settings), `src/lib/household.ts` (`DEFAULT_SETTINGS`, `validateSettings`),
  `src/lib/household.test.ts`, `src/screens/settings/SettingsHome.tsx` and `src/App.tsx` (route `settings/hour`).
- Create `src/screens/settings/TodayHourSettings.tsx` and its `.test.tsx`.

**Produces:** these Settings fields, each kept by `validateSettings`:
- `hour_start: string` (HH:MM, default `'17:30'`)
- `hour_minutes: number` (30–120, default `60`)
- `breakfast_ahead: string[]` (default `['Overnight oats', 'Baked oats']`)
- `tm7_machines: 1 | 2` (default `1`)
- `tm7_bowls: 1 | 2` (default `1`)

**Tests:**
- `validateSettings({})` returns those defaults.
- `hour_start: '25:00'` falls back to `'17:30'`, and `hour_minutes: 5` becomes `30`.
- The page saves a new start time, ticks a breakfast as "made the night before", and sets "TM7 bowls" to 2.
- The breakfast list comes from `settings.breakfasts`. Each item has a switch, "Made the night before", which is on
  for the names in `breakfast_ahead`.

Steps: tests → fail → implement → pass → commit with "Settings → Today's hour".

### Task 3: The scheduler (`src/lib/todayHour.ts`)
**Files:** Create `src/lib/todayHour.ts` and `src/lib/todayHour.test.ts` (fixtures from `src/test/fixtures.ts`).

**Consumes:**
- Task 1's functions
- `stepIngredients` from `src/lib/recipes.ts`
- `RecipeDetail`, `MealSlot`, `Settings`

**Produces:**
```ts
interface HourInput {
  date: string;
  start: string; minutes: number; tm7Bowls: 1 | 2; tm7Machines: 1 | 2;
  tonight?: { recipe: RecipeDetail; portions: number } | null;     // a cooked dinner, else none
  yesterdayPlanned: boolean;                                       // so tonight's keepable veg was chopped yesterday
  tomorrow?: {
    dinner?: { recipe: RecipeDetail; portions: number } | null;    // its prep_8pm steps, and veg to chop ahead
    lunch?: { kind: 'leftovers'; title: string } | { kind: 'make'; title: string; recipe?: RecipeDetail } | null;
    breakfast?: { title: string; recipe?: RecipeDetail } | null;   // only when it's made the night before
  } | null;
}
interface ChopGroup { label: string; where: 'bowl' | 'tm7' | 'box'; items: { name: string; qty: string; note: string | null }[]; raw: boolean }
interface HourStep { at: string; end: string; kind: 'chop' | 'cook' | 'extra' | 'clean'; title: string; body: string; kit: string | null; timer: number | null; ingredients: RecipeIngredient[]; factor: number }
interface HourPlan { chop: ChopGroup[]; steps: HourStep[]; handsOn: number; toWash: string[]; after: HourStep[]; warnings: string[] }
export function planHour(input: HourInput): HourPlan
```

**Algorithm** (these are the decisions; the tests below pin them):
1. **What to chop.** Take the ingredients tonight's `finish` steps use, via `stepIngredients`, that `needsChopping`.
   - Leave out any that `keepsDays ≥ 1` when `yesterdayPlanned` (they were chopped yesterday).
   - Add tomorrow's dinner ingredients (`finish` and `prep_8pm` steps) that `needsChopping` and `keepsDays ≥ 1`,
     with `where: 'box'` and the label "For tomorrow: <title>".
   - An ingredient used by a TM7 step whose settings start with seconds (`/^\d+ sec/`) goes in a group with
     `where: 'tm7'`.
   - Groups follow the order their step comes in, and raw-protein groups go last with `raw: true`.
   - Quantities are scaled by `portions / base_portions` with `formatQty`.
2. **The chopping block** starts at `start` and lasts `max(5, ceil(1.5 × items))` minutes. It ends with a clean
   step: "Board, knife and bowls into the dishwasher".
3. **Dinner `finish` steps** follow in position order.
   - A step starts at chop end plus its `at_minute`, or straight after the previous step when `at_minute` is null.
   - A step's busy length is `timer_minutes` (or 5 when there's none).
   - It's hands-off when it has a `timer_minutes ≥ 5` on `tm7`, `apo`, `oven` or `hy24`.
4. **Extras** (in this order: tomorrow's `prep_8pm` steps, the night-before breakfast, then a "make" lunch) go into
   the earliest hands-off wait that fits their length.
   - Length is `timer_minutes ?? 5`.
   - A TM7 extra can't overlap a TM7 dinner step unless `tm7Machines === 2`.
   - With `tm7Bowls === 1`, a 2-minute "Rinse the TM7 bowl" clean step goes between any two consecutive TM7 jobs.
   - Extras that don't fit before `start + minutes − 10` go in `after` with a warning, e.g. "Not enough time for
     Make the overnight oats: do it after dinner".
5. **The end of the hour:**
   - At `start + minutes − 10`: "Plate up".
   - Then a `leftovers` lunch: "Pack tomorrow's lunch: <title>" (5 minutes, `kind: 'extra'`).
   - Then a clean step: "Wipe down, load and start the dishwasher".
   - If dinner itself runs past the hour, the warning is "Tonight's dinner runs to HH:MM".
6. **`handsOn`** is the sum of every non-hands-off step's length.
7. **`toWash`** lists the distinct items the hour dirties:
   - chopping always adds board and knife;
   - by machine: `tm7` → TM7 bowl, `hob` → pan, `oven`/`apo` → tray, `hy24` → air-fryer basket;
   - from the body's wording: "pan", "pot", "casserole", "tray", "dish", "bowl".

**Tests**, one per bullet, using a small two-recipe fixture with a TM7 chop step, a 20-minute TM7 cook and a
hob step:
- The chopping list comes first, at 17:30, with veg before raw meat. Tomorrow's carrots go in a "box" group, and
  tomatoes for tomorrow are not chopped ahead.
- With `yesterdayPlanned`, tonight's onions aren't on the list; without it, they are.
- Tomorrow's prep step sits inside tonight's 20-minute TM7 wait only when it isn't a TM7 job. A TM7 prep job
  waits for the bowl, with a "Rinse the TM7 bowl" step in between, when `tm7Bowls` is 1.
- With `tm7Bowls` 2 there's no rinse step. With `tm7Machines` 2, a TM7 extra can overlap the TM7 cook.
- (Review Focus 1) With `tonight: null`, there are no cook steps and the extras start after the chop block.
- (Review Focus 2) With `tomorrow: null`, there are no box groups and no extras.
- (Review Focus 3) A 55-minute dinner gives the warning "Tonight's dinner runs to 18:35", and any extra that doesn't
  fit goes in `after`.
- (Review Focus 4) A leftovers lunch is the step right after "Plate up".
- `toWash` contains "Board", "Knife", "TM7 bowl" and "Pan", each once.

Steps: tests → fail → implement → pass → commit with "Today's hour: the scheduler".

### Task 4: The Today's hour screen and the Week tab card
**Files:**
- Create `src/screens/today/TodayHour.tsx` and `.test.tsx`.
- Create `src/screens/today/useTodayHour.ts`, which loads data and builds `HourInput`.
- Modify `src/App.tsx` (route `/today`) and `src/screens/week/WeekView.tsx` (the card).

**Consumes:**
- `planHour` (Task 3) and the Task 2 settings
- `repo.getWeek`, `repo.getRecipe`, `repo.getSettings`
- `StepUses`, `useTimers` (`src/lib/cookTimers.ts`), `useWakeLock`

**Behaviour:**
- **Data:**
  - It reads today's and tomorrow's slots (tomorrow may be in next week's plan).
  - Tonight counts only when the dinner is `mode: 'cook'` with a recipe.
  - Tomorrow's breakfast counts only when its name is in `breakfast_ahead`.
  - Tomorrow's lunch is `leftovers` when it has a `source_date` of today. It's `make` when it's a routine lunch
    whose recipe has steps.
  - `yesterdayPlanned` is true when yesterday has a cooked dinner.
- **Screen:**
  - Dark, like `RoastCook`, with the same × in the top right.
  - **First page:** "Today's hour · 17:30–18:30", the hands-on minutes, "To wash: …" and the chopping list
    (each group's label, then its items with amounts and notes).
  - Then **Start**, and one step at a time:
    - each step shows its time and title, its kit, its body, and `StepUses` with `factor`
    - a "Start N-min timer" when `timer ≥ 2`
    - Back and Next buttons
  - "After dinner" steps come last. Warnings show on the first page.
- **Week tab:** when today is in the shown week, a card above the grid: "Today's hour · 17:30" with tonight's
  dinner title, linking to `/today`.

**Tests:**
- The first page shows the chopping list groups and "To wash: Board, Knife…".
- Start moves to the first step at 17:3x, and Next steps through.
- A timer starts.
- The Week tab card links to `/today`.
- Out tonight shows "No dinner to cook tonight" with tomorrow's extras.

Steps: tests → fail → implement → pass → commit with "Today's hour screen and Week tab card".

### Task 5: The weekly planner keeps weeknights within the hour
**Files:**
- Modify `supabase/functions/_shared/planner.ts`: `PlannerRecipe.handsOn?: number`, and `PlannerInput.hourMinutes?`.
- Modify `supabase/functions/_shared/planInput.ts`: `handsOn = prep_minutes + finish_minutes − hands_off_minutes`.
  `buildPlannerInput` reads `settings.hour_minutes`, and the rows include `prep_minutes` and `hands_off_minutes`.
- Modify `supabase/functions/_shared/loadPlan.ts` (select those columns), `planner.test.ts` and
  `docs/playbooks/week-plan.md`.

**Behaviour:**
- In `timeLimit`'s rule, on Monday to Friday a recipe also needs `handsOn ≤ hourMinutes − 15`, which leaves
  15 minutes for tomorrow's extras and cleaning.
- Recipes without `handsOn` are treated as fitting.
- The playbook's priority 4 gains: "the day's hands-on time, tonight's dinner plus tomorrow's prep, fits the
  household's hour (Settings → Today's hour, default 17:30–18:30)".

**Tests:**
- With `hourMinutes: 60`, a 50-minute hands-on recipe isn't chosen for a weekday when another fits, but can be
  chosen on Saturday.
- Without `hourMinutes`, the existing behaviour is unchanged (all existing planner tests still pass).

Steps: tests → fail → implement → pass → redeploy `propose-week` (owner asked first) → commit with "Planner:
weeknights fit the hour".

### Task 6: Spec, review, ship
- Add a "Today's hour" row to `docs/spec.md`.
- `npm test`, then `npm run build`.
- One fresh review of the whole branch against Review Focus.
- Merge, push, and check the live bundle has "Today's hour".

### Later (not in this plan)
- Snacks in the waits: needs a snack recipe set first.
- The "TM7 was the bottleneck" monthly count.
- Claude marking up what each step dirties, if the inference turns out too rough.
