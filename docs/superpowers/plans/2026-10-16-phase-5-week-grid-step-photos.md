# Phase 5: Week Grid, Ratings and Step Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The week becomes a grid of day tiles (breakfast, lunch and dinner at a glance, plus a week tile with Approve), each day opens in a sheet with all its options, and a 👍 after cooking makes AI step photos for that recipe.

**Architecture:**
- **Pure helpers:** `src/lib/weekSummary.ts` turns slots into tile summaries. `supabase/functions/_shared/stepPhoto.ts` builds the step-photo prompt and the guard rules, shared by the app tests and the Edge Function.
- **Generation:** a new `generate-step-photo` Edge Function makes **one** photo per call, so it stays inside the function time limit. A small runner in the app calls it step by step and picks up where it left off the next time the recipe opens.
- **Rating:** a `rating` on `recipes` (`up` | `down`). `down` keeps a recipe out of the planner.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind, Supabase (Postgres, RLS, Storage, Edge Functions in Deno), Gemini `gemini-3.1-flash-lite-image` via the Interactions API, Vitest + Testing Library + PGlite.

**Spec:** `docs/spec.md`, which this phase updates in §5 "Images", §6 "Screens" and §4 "Feedback". The mockup is the private artifact https://claude.ai/artifact/EDpL1UtZPT2LuP8NJcxcVj.

**Decisions taken with the owner (16 Oct 2026):**
- **Home page:** the week is a grid of day tiles. Approve is on the week tile, and tapping a day opens a sheet with everything else.
- **Step photos are AI-made only after 👍 ("Have it again").** 👎 ("Not for us") never makes them and keeps the recipe out of future menus.
- **Style is a food close-up, never the machine.** In the curry test (16 Oct), shots that included the TM7 drew the wrong machine. Close-ups that used the hero photo as a style reference looked right, but one showed spinach a step too early.
- **Your own photo always wins.** A generated photo never replaces it.

## Global Constraints
- **Images:** model `gemini-3.1-flash-lite-image`, Interactions API at `GEMINI_URL`, JPEG, 4:3, `1K`. The key is the Supabase secret `GOOGLE_AI_API_KEY`. Spend cap is £5/month, so generation stops at the first failure and is never retried in a loop.
- **Base64 in Deno:** `jsr:@std/encoding@1.0.5/base64`. Hand-written loops were too slow in the test.
- **Privacy:** the repo is public. No recipe content or personal data goes in tests beyond made-up fixtures.
- **Database changes:** in a new migration `supabase/migrations/0006_ratings_step_photos.sql`, which the owner runs in the SQL Editor.
- **Layout:** the grid is 2 tiles across on a phone and 4 across at ≥760px (iPad), with 8 tiles in total (7 days plus the week tile). For a 5-day plan it's 5 days plus the week tile.
- **Colours:** slot colours are breakfast = yolk, lunch = teal, dinner = accent, 8pm prep = evening.
- **Copy:**
  - "Approve week"
  - "✓ Approved"
  - "Have it again?" with buttons "👍 Have it again" and "👎 Not for us"
  - "Making step photos… n of N"
  - "Not for us · Undo"
  - "Redo photo"

## Review Focus
1. **The app closes in the middle of making photos:** the next time the recipe is opened, it carries on with the missing steps only, with no duplicates and no re-doing of finished ones. (Task 6 test: `resumes with only the steps that have no photo`.)
2. **The owner has their own photo of a step:** it is never replaced. A re-seed (`replace_recipe_contents`) keeps generated photos and their source too. (Task 1 migration test, Task 2 `stepPhotoRefusal` test.)
3. **The recipe has no hero photo:** generation stops with "Make the main photo first", rather than failing on every step. (Task 2 `stepPhotoRefusal` test.)
4. **A 👎 recipe:** it is never in a Friday proposal or the Swap suggestions, but it can still be picked by hand from "Choose any recipe". (Task 1 `buildPlannerInput` test.)
5. **The day sheet:** Escape and the close button both close it, focus goes back to the tile, and a long dinner title wraps to two lines without widening the tile. (Task 5 test: `Escape closes the day and returns focus to its tile`.)

---

### Task 1: Ratings and step-photo source in the database, and 👎 kept out of the planner

**Files:**
- Create: `supabase/migrations/0006_ratings_step_photos.sql`
- Modify:
  - `src/lib/types.ts`: Recipe gets `rating`; RecipeStep gets `image_source`
  - `src/lib/repo.ts`
  - `supabase/functions/_shared/planInput.ts`
  - `supabase/functions/propose-week/index.ts:35`
  - `scripts/check-rls.mjs` (no new tables, so check only)
- Test:
  - `scripts/migration.test.mjs`
  - `supabase/functions/_shared/planInput.test.ts`
  - `src/test/fakeRepo.ts`

**Interfaces:**
- Produces:
  - `recipes.rating text check (rating in ('up','down'))`, null meaning not rated; `recipes.rated_at timestamptz`
  - `recipe_steps.image_source text check (image_source in ('own','generated'))`
  - `Recipe.rating: 'up' | 'down' | null`
  - `RecipeStep.image_source: 'own' | 'generated' | null`
  - `repo.rateRecipe(recipeId: string, rating: 'up' | 'down' | null): Promise<void>`
  - `repo.generateStepPhoto(recipeId: string, stepId: string, replace?: boolean): Promise<string>`: the new image path; it throws the function's error message
  - `repo.uploadStepPhoto` now also sets `image_source: 'own'`
  - `getRecipe` selects `image_source`

- [ ] **Step 1: Write the failing tests**
  - In `scripts/migration.test.mjs`: `0006 adds rating and image_source with their checks`. Inserting `rating = 'meh'` fails, and so does `image_source = 'ai'`.
  - In `scripts/migration.test.mjs`: `replace_recipe_contents keeps a generated photo and its source`.
    - Set up a step with `image_path = 'x.jpg', image_source = 'generated'`.
    - Call `replace_recipe_contents` with the same phase and title.
    - Expect the step to still have `image_path 'x.jpg'` and `image_source 'generated'`.
  - In `planInput.test.ts`: `a recipe rated down is left out`. `buildPlannerInput` with two meals, one `rating: 'down'`, gives `recipes.map(r => r.id)` equal to only the other.

- [ ] **Step 2: Run them to see them fail**
  Run: `npx vitest run scripts/migration.test.mjs supabase/functions/_shared/planInput.test.ts`
  Expected: FAIL, because the columns don't exist and the down-rated recipe is still included.

- [ ] **Step 3: Write the migration**
  - Add the columns.
  - Run `update recipe_steps set image_source = 'own' where image_path is not null`.
  - `create or replace` `replace_recipe_contents`, so its kept-photo lookup carries `image_source` as well as `image_path`. The signature and grants stay the same as 0002.

- [ ] **Step 4: Update the code**
  - Types and repo as above. `generateStepPhoto` calls `functions.invoke('generate-step-photo', { body: { recipeId, stepId, replace } })` and turns an error body into a thrown `Error(message)`, the same as `generateHero`.
  - In `planInput.ts`, add `rating?: string | null` to the recipe rows and filter out `rating === 'down'`.
  - Add `rating` to the select in `propose-week`.
  - Add `rateRecipe` and `generateStepPhoto` to `fakeRepo`.

- [ ] **Step 5: Run the tests to see them pass**
  Run: `npx vitest run scripts/migration.test.mjs supabase/functions/_shared/planInput.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**
  `git commit -m "feat: recipe ratings, step photo source, and 'not for us' recipes left out of menus"`

---

### Task 2: Step-photo prompt and guard rules (shared, pure)

**Files:**
- Create: `supabase/functions/_shared/stepPhoto.ts`
- Test: `supabase/functions/_shared/stepPhoto.test.ts`

**Interfaces:**
- Produces:
  - `stepPhotoPrompt(recipeTitle: string, steps: { title: string; body: string; machine: string | null; phase: string }[], index: number): string`
  - `stepPhotoRefusal(r: { rating: string | null; hero_image_path: string | null }, step: { image_path: string | null; image_source: string | null }, replace: boolean): string | null`: an error message, or null when it's fine to go ahead

- [ ] **Step 1: Write the failing tests**
  - `the prompt names only ingredients added so far`.
    - Steps: `**onions**`, then `**chickpeas** and **coconut milk**`, then `**spinach**`. For index 1, the prompt contains `onions`, `chickpeas` and `coconut milk`, and does not contain `spinach`.
    - Collect the `**bold**` words from steps 0 to index, in order and without repeats.
  - `the prompt is a close-up of food with no machine`.
    - The prompt contains `directly above`, `No appliance` and `No text`.
    - A `tm7` step contains `stainless steel mixing bowl`. A `hob` step contains `pan`. An `apo`, `hy24` or `oven` step contains `baking tray`. `null` contains `chopping board`.
  - `the prompt asks for the reference photo's table and light`: it contains `same table, light and colours as the reference photo`.
  - `a prep step is shown as made-ahead`: a step with phase `prep_8pm` contains `the night before` and `jar or container`.
  - `stepPhotoRefusal`:
    - not rated `up` → `'Only liked recipes get step photos.'`
    - no hero → `'Make the main photo first.'`
    - `image_source 'own'` → `'This step has your own photo.'`, even with `replace = true`
    - `generated` and `replace = false` → `'This step already has a photo.'`
    - `generated` and `replace = true` → `null`
    - no photo → `null`

- [ ] **Step 2: Run them to see them fail**
  Run: `npx vitest run supabase/functions/_shared/stepPhoto.test.ts`
  Expected: FAIL, because the module isn't there yet.

- [ ] **Step 3: Write `stepPhoto.ts`**
  - It has no imports, the same as `hero.ts`.
  - The prompt reads, in order:
    1. the dish and that the reference is the finished dish
    2. "same table, light and colours as the reference photo"
    3. the step title and its body with the `**` markers taken out
    4. "Only these ingredients are in it so far: …"
    5. the container for the machine
    6. "close up from directly above. No appliance, no controls, no screen. No text, no labels, no hands, no packaging, no logos."

- [ ] **Step 4: Run the tests to see them pass**
  Run: `npx vitest run supabase/functions/_shared/stepPhoto.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat: step photo prompt and rules"`

---

### Task 3: `generate-step-photo` Edge Function

**Files:**
- Create: `supabase/functions/generate-step-photo/index.ts`

**Interfaces:**
- Consumes:
  - `stepPhotoPrompt` and `stepPhotoRefusal` (Task 2)
  - `findImageData`, `GEMINI_URL` and `GEMINI_MODEL` from `_shared/hero.ts`
- Produces: `POST { recipeId: string, stepId: string, replace?: boolean }` → `200 { path }`, or `4xx/5xx { error }`

- [ ] **Step 1: Write the function, following `generate-hero/index.ts` (CORS, runs as the signed-in caller so RLS applies)**
  1. Load the recipe (`id, household_id, title, rating, hero_image_path`).
  2. Load its steps ordered by `phase` (prep_8pm first), then `position`. Find the step by id, or return 404.
  3. On a refusal, return 409 with `{ error }`.
  4. Download the hero from `recipe-images` and base64 it with std encoding.
  5. Call Gemini with `input: [{ type: 'text', text: prompt }, { type: 'image', data, mime_type: 'image/jpeg' }]` and `response_format` as in `geminiRequest`.
  6. Upload to `${household_id}/steps/${recipeId}-${stepId}-${Date.now()}.jpg`.
  7. Update the step: `image_path` and `image_source = 'generated'`.
  8. Error messages: "Google couldn't make the image: …" and "Couldn't save the image: …", the same as `generate-hero`.

- [ ] **Step 2: Type-check**
  Run: `npx tsc --noEmit -p . && npx vitest run supabase/functions`
  Expected: no errors, and the shared tests pass.

- [ ] **Step 3: Commit**
  `git commit -m "feat: generate-step-photo function"`

- [ ] **Step 4: Deploy (after the owner has run 0006)**
  Run: `npx --yes supabase@2.48.3 functions deploy generate-step-photo --project-ref vzlfijeummlflmauevui --use-api`
  Expected: "Deployed Functions … generate-step-photo".

---

### Task 4: Week summary helpers

**Files:**
- Create: `src/lib/weekSummary.ts`
- Test: `src/lib/weekSummary.test.ts`

**Interfaces:**
- Consumes: `MealSlot` and `Recipe` from `types.ts`
- Produces:
  - `type DayChip = 'office' | 'prep' | 'twice' | 'guests' | 'out' | 'cooked'`
  - `daySummary(date: string, slots: MealSlot[], recipes: Map<string, Recipe>, officeDays: number[]): { breakfast: string; lunch: string; dinner: string; dinnerOut: boolean; chips: { kind: DayChip; label: string }[] }`
  - `proteinBalance(slots: MealSlot[], recipes: Map<string, Recipe>): { chicken: number; fish: number; red_meat: number; veggie: number }`, counting dinners with `mode 'cook'` only

- [ ] **Step 1: Write the failing tests** (made-up fixtures from `src/test/fixtures.ts`)
  - **Breakfast:** `routine_choice` wins. Otherwise use `reason`. Otherwise use `'Eggs, porridge or baked oats'`.
  - **Lunch:**
    - `reason` if there is one
    - otherwise `'Packed lunch'` for `packed`
    - otherwise `'Leftover <title>'` for a `reheat` with a recipe
    - otherwise `'Home lunch'`
  - **Dinner:**
    - the recipe title for `cook`
    - `'Out tonight'` with `dinnerOut: true` for `out`
    - `'Leftovers night'` for `leftovers`
  - **Chips, in this order:**
    - `office` when the weekday is in `officeDays`
    - `prep` when the next day's dinner is a `cook` whose recipe has `prep_minutes > 0`
    - `twice` when any `reheat` slot has `source_date === date`
    - `guests` labelled `+2 guests`
    - `out`
    - `cooked` when `cooked_at` is set
  - **proteinBalance:** 2 chicken, 1 fish and 2 veggie cook dinners plus one `out` give `{ chicken: 2, fish: 1, red_meat: 0, veggie: 2 }`.

- [ ] **Step 2: Run them to see them fail**
  Run: `npx vitest run src/lib/weekSummary.test.ts`
  Expected: FAIL, because the module isn't there yet.

- [ ] **Step 3: Write `weekSummary.ts`**

- [ ] **Step 4: Run the tests to see them pass**
  Run: `npx vitest run src/lib/weekSummary.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat: week summary for day tiles"`

---

### Task 5: Week grid, week tile and day sheet

**Files:**
- Create:
  - `src/screens/week/DayTile.tsx`
  - `src/screens/week/WeekTile.tsx`
  - `src/screens/week/DaySheet.tsx`
- Modify:
  - `src/screens/week/WeekView.tsx`: replace the day tabs and the wide list with the grid
  - `src/screens/week/DayCard.tsx`: add the portions stepper
  - `src/screens/week/useWeek.ts`: add `portions`
- Test: `src/screens/week/WeekView.test.tsx` (rewrite the parts that used the day tabs)

**Interfaces:**
- Consumes:
  - `daySummary` and `proteinBalance` (Task 4)
  - `WeekState` and `DayCard` (existing)
- Produces:
  - `w.portions(date: string, delta: number)`: changes dinner portions by ±0.5, never below 0.5, using the latest state the same way `guests` does
  - `<DaySheet date w onClose />`: a modal `role="dialog"` with `aria-label` from `dayLabel(date)`, wrapping `<DayCard>`

- [ ] **Step 1: Write the failing tests**
  - `shows a tile per day with breakfast, lunch and dinner`.
    - With `NEXT_WEEK`, there are 7 buttons named like `/^Monday 19/` and so on.
    - Monday's tile contains the Monday dinner title and `Packed lunch`.
  - `the week tile approves the week`.
    - A draft week shows `Approve week`. Clicking it calls `repo.approveWeek`, and the tile then shows `✓ Approved`.
    - The tile shows the balance text `2 chicken`.
  - `tapping a day opens it with its options`.
    - Click Monday's tile. A dialog named `/Monday 19 October/` appears with `Swap`, `Out tonight` and `Mark cooked`.
    - `Out tonight` in the dialog changes Monday's tile to `Out tonight`.
  - `portions can be changed in the day`.
    - Click `More portions`. Then `repo.saveSlots` is called with Monday's dinner at `portions + 0.5`.
    - Click `Fewer portions` at 0.5 and it stays at 0.5.
  - `Escape closes the day and returns focus to its tile`.
  - `the 5-day plan shows 5 day tiles and the week tile`.
  - Keep the existing tests for the propose, banner and save-error paths.

- [ ] **Step 2: Run them to see them fail**
  Run: `npx vitest run src/screens/week`
  Expected: FAIL, because there is no grid yet.

- [ ] **Step 3: Build the screens to match the mockup**
  - **DayTile** is a button with:
    - the day name in accent at the top left and the date number at the top right
    - three rows, each with a coloured dot and text; dinner is bold, clamped to 2 lines, with `min-width: 0`
    - the chips row
    - an accent outline on today's tile
  - **WeekTile:**
    - Draft: accent background, "Approve by Saturday 2pm for the Sunday delivery" (or the existing Saturday copy), balance chips, and an `Approve week` button.
    - Approved: soft background and `✓ Approved`.
  - **DaySheet** is a bottom sheet on a phone and a centred card at ≥760px. It has:
    - a scrim that closes when clicked, a × button and Escape to close
    - focus that moves into it on open and back to the tile on close
    - `DayCard` inside, with its own `h2` hidden since the sheet has the title
  - **WeekView:**
    - Keep the header, the This/Next week tabs, the banners and the empty state.
    - Remove `useWide` and the day tabs.
    - Show `grid grid-cols-2 gap-3 md:grid-cols-4`.
  - **DayCard** gains a "Portions" row with `Fewer portions` and `More portions` buttons (−/+) and the value from `formatPortions`, next to Guests.

- [ ] **Step 4: Run the tests to see them pass**
  Run: `npx vitest run src/screens/week`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat: week grid home page with a sheet for each day"`

---

### Task 6: 👍/👎 after cooking, and making step photos

**Files:**
- Create:
  - `src/lib/stepPhotos.ts`
  - `src/lib/stepPhotos.test.ts`
- Modify:
  - `src/screens/week/DayCard.tsx`: the rating prompt after the portions verdict
  - `src/screens/week/useWeek.ts`: add `rate`
  - `src/screens/recipes/RecipeCard.tsx`: progress, resume, "Redo photo", "Not for us · Undo"
- Test:
  - `src/screens/week/WeekView.test.tsx`
  - `src/screens/recipes/RecipeCard.test.tsx`

**Interfaces:**
- Consumes:
  - `repo.rateRecipe` and `repo.generateStepPhoto` (Task 1)
  - the `generate-step-photo` function (Task 3)
- Produces:
  - `makeStepPhotos(recipeId: string, steps: { id: string; image_path: string | null }[], onProgress: (done: number, total: number, stepId?: string, path?: string) => void): Promise<{ made: number; error: string | null }>`
    - It works through the steps with no `image_path` in order, one at a time, and stops at the first error.
    - One run per recipe at a time: a second call while one is running returns the same promise.
  - `w.rate(recipeId: string, rating: 'up' | 'down')`: saves the rating, and updates `w.recipes` at once so the prompt disappears.

- [ ] **Step 1: Write the failing tests**
  - `stepPhotos.test.ts`:
    - `makes photos for steps without one, in order`: 3 steps, the middle one already has a photo. `generateStepPhoto` is called for steps 1 and 3 only, and progress is reported as `1 of 2` and then `2 of 2`.
    - `stops at the first failure`: the first call rejects with `"Google couldn't make the image: quota"`. There is no second call, and the result is `{ made: 0, error: "Google couldn't make the image: quota" }`.
    - `resumes with only the steps that have no photo`: run with steps 1 and 2 already having photos, and only step 3 is called.
    - `a second call while running shares the first run`: `generateStepPhoto` is called once per step in total.
  - `WeekView.test.tsx`:
    - `after the portions verdict, asks Have it again`.
      - Open a cooked day with a verdict on a recipe that has `rating null`. It shows `Have it again?`.
      - `👍 Have it again` calls `rateRecipe(id, 'up')` and starts `generateStepPhoto` for that recipe's steps.
      - `👎 Not for us` calls `rateRecipe(id, 'down')` and makes no photos.
    - A rated recipe shows no prompt.
  - `RecipeCard.test.tsx`:
    - `a liked recipe with missing step photos finishes them` shows `Making step photos… 0 of 2`. Each step's `img` appears when it's made.
    - `a generated photo can be redone`: `Redo photo` calls `generateStepPhoto(recipeId, stepId, true)`.
    - Own photos have no `Redo photo`.
    - `a down-rated recipe shows Not for us with Undo`: Undo calls `rateRecipe(id, null)`.

- [ ] **Step 2: Run them to see them fail**
  Run: `npx vitest run src/lib/stepPhotos.test.ts src/screens/week src/screens/recipes/RecipeCard.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Write the code**
  - `stepPhotos.ts` keeps a module-level `Map<recipeId, Promise>`, so a run keeps going when the sheet closes.
  - **DayCard:** after `portions_verdict` is set, and while `recipe.rating` is null, show the "Have it again?" prompt. On 👍, run `w.rate(id, 'up')`, then `makeStepPhotos(id, steps)`, with the steps fetched by `repo.getRecipe`. Show `Making step photos… n of N` in the card while it's open.
  - **RecipeCard:** when `rating === 'up'` and some steps have no photo, start `makeStepPhotos` on open and show the progress line. Show `Redo photo` under each `image_source === 'generated'` photo. For `rating === 'down'`, show `Not for us · Undo` under the title. Show errors with the existing ErrorBanner.

- [ ] **Step 4: Run the tests to see them pass**
  Run: `npx vitest run src/lib/stepPhotos.test.ts src/screens/week src/screens/recipes/RecipeCard.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Update the spec**
  - **§5 Images:** step photos are AI-made after 👍 only. They are food close-ups that use the hero as reference, never show the machine, and your own photo wins. Cost is about 4p a photo.
  - **§6 Screens:** Home is a week grid of day tiles plus the week tile; tap a day for the sheet.
  - **§4 Feedback:** `recipes.rating` (up|down).
  - **§7:** 👎 recipes are left out of proposals.

- [ ] **Step 6: Run everything and commit**
  Run: `npx vitest run && npm run build`
  Expected: all pass, and the build succeeds.
  `git commit -m "feat: have it again? rating makes step photos for liked meals"`

---

## Owner steps after merging
1. Run `0006_ratings_step_photos.sql` in the Supabase SQL Editor.
2. Run `npm run check-rls`.
3. Deploy `generate-step-photo` (Task 3, Step 4).
4. Merge and push to deploy the app.
5. Try it: mark a dinner cooked, give the portion verdict, tap 👍, and watch the step photos arrive.
