# Plan with Claude choices: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to work through this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan with Claude opens a screen of the week's choices, filled in from the usual week. The choices go with
the plan request to the connector, and the week remembers its own office days and prep days. Settings gets one
Usual week page.

**Architecture:**
- A pure shared module, `supabase/functions/_shared/planChoices.ts`, owns the choices: their type, the prefill from
  the usual week, parsing, and applying them to the planner input. The app, `loadPlannerInput`, `planContext` and the
  save all use it.
- Migration 0022 stores the choices on `week_plan_requests` and the week's office and prep days on `plan_weeks`.
- The app's new `/plan` screen creates the request and then opens the Claude app.

**Tech stack:** React, Vite and TS; Supabase (Postgres, Edge Functions); Vitest with PGlite.

**Spec:** `docs/superpowers/specs/2026-11-15-plan-choices-design.md`

## Global Constraints

- **Values the screen allows:**
  - Cooking-time steps: 30, 45, 60, 90 and 120 minutes. The stored minutes stay 30–240 (`cookingTime.ts`).
  - Weeknight limit: 20, 30, 45 or 60 min.
  - New recipes: 0–7.
  - The note: up to 300 characters.
  - Weekdays: 0 = Monday … 6 = Sunday. Office days are Monday to Friday only.
- **Prep days:**
  - Picking a prep day raises that day's time to at least 120. Unpicking it puts the usual time back.
  - A prep day may fall on a night off.
- **What can become usual:** changes are for that week only unless "Make this week's changes my usual" is ticked.
  Nights off and use-up items never become usual.
- **The rule for Claude:** every choice either reaches the plan, or the save is refused with a reason Claude can
  fix. No dinner on a night off, and no more new recipes than chosen.
- **Copy:** the UI text matches the approved mockup:
  - Section titles: "Office days", "Nights off", "Time to cook each evening", "Longer prep days", "Weeknight dinners
    take at most", "New recipes from Claude", "Use these up", "Anything else?".
  - The tick box: "Make this week's changes my usual".
- **Project rules:**
  - Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Run the private-rules grep before each commit.
  - `npm test` must be green.
- **Releasing:**
  - The owner runs migration 0022 in the SQL Editor before `ask-claude-connector` and `propose-week` are deployed.
  - Give the SQL as text; the owner is on the phone.

## Review Focus

1. **The Claude app is blocked from opening** after the request is saved (iOS blocks pop-ups after an `await`). The
   screen falls back to an "Open the Claude app" link, so the choices are never lost. Task 6 tests it.
2. **A week planned before 0022, or with `office_days` null,** still shows its office days from the usual pattern.
   Task 2 tests it.
3. **Claude saves without an open request** (a chat started from scratch, not from the app). No choices means the
   usual week, exactly as today. Task 4 tests it.
4. **Choices whose dates fall outside the week, or weekdays outside 0–6,** are dropped by `parseChoices` rather than
   saved. Task 1 tests it.
5. **A prep day that's unticked** gives that day its usual time back, not the 2 hours. Task 6 tests it.

---

### Task 1: The choices module

**Files:**
- Create: `supabase/functions/_shared/planChoices.ts`
- Create: `supabase/functions/_shared/planChoices.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PlanChoices {
    office: Record<string, number[]>;      // adult member id → weekdays 0–4
    nightsOff: string[];                   // dates in the week
    cookingMinutes: Record<string, number>;// date → minutes, all 7 dates
    prepDays: number[];                    // weekdays 0–6
    weekdayMaxMin: number;
    newRecipes: number;
    useUp: string[];                       // free names from the freezer and pantry, ≤ 20, each ≤ 80 chars
  }
  export function usualChoices(weekStart: string, settings: { cooking_minutes?: unknown; hour_minutes?: unknown; weekday_dinner_max_min?: number; adventure?: number; prep_days?: unknown }, adults: { id: string }[], pattern: { member_id: string; weekday: number; office: boolean }[]): PlanChoices
  export function parseChoices(raw: unknown, weekStart: string): PlanChoices | null
  export function applyChoices(input: PlannerInput, c: PlanChoices): PlannerInput   // officeDays = union of c.office, dayMinutes from c.cookingMinutes, weekdayMaxMin, nightsOff
  export function ownCookingMinutes(c: PlanChoices, settings: object): Record<string, number> | null // only dates that differ from weekdayMinutes(settings)
  export function setPrepDay(c: PlanChoices, usual: PlanChoices, weekday: number, on: boolean): PlanChoices // ≥120 when on, usual back when off
  ```

- [ ] **Step 1: Write failing tests** in `planChoices.test.ts`:
  - `usualChoices` takes office days per adult from the pattern, cooking minutes for the 7 dates from
    `weekdayMinutes`, `prep_days` from settings (`[]` when missing), the limit and `adventure` (defaults 30 and 1),
    and empty `nightsOff`/`useUp`.
  - `parseChoices` returns null for a non-object. It drops nightsOff dates outside the week, weekdays outside 0–6
    (and 5–6 for office), minutes outside 30–240, and newRecipes outside 0–7 (clamped). It trims `useUp` to 20
    items of 80 chars.
  - `applyChoices` sets `officeDays` to the sorted union, `dayMinutes`, `weekdayMaxMin` and `nightsOff`.
  - `setPrepDay(c, usual, 2, true)` with Wednesday at 60 → 120; with Wednesday at 120 → unchanged. Off → the usual
    minutes.
  - `ownCookingMinutes` is null when nothing differs.
- [ ] **Step 2:** `npx vitest run supabase/functions/_shared/planChoices.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement. `PlannerInput` gains `nightsOff?: string[]` in Task 2; until then, cast in
  `applyChoices`.
- [ ] **Step 4:** The same command. Expected: PASS.
- [ ] **Step 5:** Commit: "Plan choices: one shared module for the week's choices (usual prefill, parse, apply)".

### Task 2: Planner and planner input — nights off and the week's own office days

**Files:**
- Modify: `supabase/functions/_shared/planner.ts`, `planInput.ts`
- Test: `planner.test.ts`, `planInput.test.ts`

**Interfaces:**
- `PlannerInput.nightsOff?: string[]`. In `proposeWeek`, a night off gets a dinner slot with
  `{recipeId:null, mode:'out', locked:true, reason:'Night off'}`. No protein place is used, and the next day's lunch
  isn't leftovers of it.
- `buildPlannerInput` Rows gains `weekOffice?: Record<string, number[]> | null`. When it's set, `officeDays` is the
  union of its values for adults; otherwise the pattern, as today.

- [ ] **Step 1: Failing tests:**
  - `proposeWeek` with `nightsOff: [<Wednesday>]` → Wednesday's dinner mode is `'out'` with reason `'Night off'`.
    Thursday's lunch has no `sourceDate` of Wednesday. Six cook dinners on a 7-day week.
  - `buildPlannerInput` with `weekOffice: {adult: [0]}` → `officeDays` is `[0]`, whatever the pattern says. With
    `weekOffice: null` → from the pattern.
- [ ] **Step 2:** Run both files. Expected: FAIL.
- [ ] **Step 3:** Implement. Remove the Task 1 cast.
- [ ] **Step 4:** Run both files, then `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: "Planner: nights off, and a week's own office days".

### Task 3: Migration 0022 and settings `prep_days`

**Files:**
- Create: `supabase/migrations/0022_plan_choices.sql`
- Modify: `src/lib/household.ts` (`validateSettings`, `DEFAULT_SETTINGS`), `src/lib/types.ts`
- Test: `scripts/migration.test.mjs`, `src/lib/household.test.ts`

**Interfaces:**
- SQL:
  - `week_plan_requests.choices jsonb`;
  - `plan_weeks.office_days jsonb`;
  - `plan_weeks.prep_days int[]`;
  - `save_claude_week(p_request uuid, p_days int, p_slots jsonb, p_summary text, p_cooking jsonb default null, p_office jsonb default null, p_prep int[] default null)`.
  - The new function drops the 5-argument one and sets the two new columns on insert and on replan, with the same
    revoke and grant as 0020.
- Types:
  - `Settings.prep_days?: number[]`;
  - `PlanWeek.office_days?: Record<string, number[]> | null` and `prep_days?: number[] | null`;
  - `WeekPlanRequest.choices?: PlanChoices | null`.
- `validateSettings` keeps `prep_days` as unique sorted integers 0–6, defaulting to `[]`.

- [ ] **Step 1: Failing tests:**
  - Migration test "0022: save_claude_week saves the week's office and prep days; the 5-argument call still works":
    it creates a request with `choices`, calls with `p_office` and `p_prep`, and reads them back. A call without them
    leaves null.
  - Members can insert a request with `choices`.
  - `validateSettings({prep_days:[6,6,9,'x',0]})` → `[0,6]`.
- [ ] **Step 2:** `npx vitest run scripts/migration.test.mjs src/lib/household.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The same command. Expected: PASS.
- [ ] **Step 5:** Commit: "Migration 0022: a plan request's choices; a week's own office and prep days".

### Task 4: The connector reads and checks the choices

**Files:**
- Modify: `supabase/functions/_shared/loadPlan.ts`, `weekPlan.ts`, `askClaudePlan.ts`
- Test: `weekPlan.test.ts`, `askClaudePlan.test.ts`

**Interfaces:**
- `loadPlannerInput(db, hid, weekStart, choices?: PlanChoices | null)`: it applies the choices when they're given.
  Otherwise it reads `plan_weeks.office_days` for the week (as `weekOffice`).
- `openChoices(db, hid, weekStart): Promise<PlanChoices | null>`, in `weekPlan.ts`: the open request's choices,
  parsed.
- `planContext(db, hid, weekStart)`:
  - it uses `openChoices`;
  - `week.dates[i]` gains `nightOff` and `prepDay`;
  - `rules` gains `prepDays` (day names), `nightsOff` (dates) and `useUp`;
  - `newRecipesAllowed` is `choices.newRecipes` when there are choices.
- `parsePlan(..., {adventure})`: the save passes `choices.newRecipes` when there are choices.
- `saveWeekPlan(db, hid, requestId, weekStart, plan, choices?)`:
  - before any insert, it refuses a dinner on a night off: "<day> is a night off. Leave it out. Nothing was saved."
  - it passes `p_office: choices.office`, `p_prep: choices.prepDays` and
    `p_cooking: { ...ownCookingMinutes(choices, settings), ...plan.cookingMinutes }` (null when empty).
- `HOW_TO_PLAN` gains two lines:
  - "Nights off (rules.nightsOff) have no dinner: leave them out."
  - "Longer prep days (rules.prepDays): prefer dinners whose make-ahead parts keep until they're eaten, and say in the summary what to batch on each prep day. Build dinners around rules.useUp first."

- [ ] **Step 1: Failing tests:**
  - With an open request carrying choices (office Monday only, Wednesday off, Friday 90 min, prep Sunday,
    newRecipes 2), `planContext` shows `dates[0].office` true and `dates[1].office` false, Wednesday's `nightOff`,
    Friday's cookingTime 90, `prepDays ['Sunday']` and `newRecipesAllowed 2`.
  - The save refuses a Wednesday dinner. It accepts 2 new recipes and refuses 3. It calls `save_claude_week` with
    `p_office` and `p_prep`.
  - With no open request, the context equals today's (the existing tests stay green).
- [ ] **Step 2:** Run both files. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - In `askClaudePlan.save`, read the open request's choices before the night-off check. That check is reported
    before the request is taken over, like the other fixable mistakes.
- [ ] **Step 4:** Run both files, then `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: "Connector: plans and checks with the week's choices".

### Task 5: Settings → Usual week

**Files:**
- Create: `src/screens/settings/UsualWeek.tsx` (replaces `WeekPattern.tsx`; route `week`)
- Create: `src/screens/settings/UsualWeek.test.tsx`
- Delete: `WeekPattern.tsx` and `WeekPattern.test.tsx`
- Modify:
  - `TodayHourSettings.tsx`: move `DayTimes` to `ui.tsx` and export it; remove the Time for cooking section.
  - `Shopping.tsx`: remove the dinner limit and the new recipes.
  - `SettingsHome.tsx`: the entry becomes `{ to: 'week', title: 'Usual week', text: 'Office days, prep days, cooking time, new recipes' }`.
  - `PlanningRules.tsx`: the closing line points to Usual week.
  - Their tests.

- [ ] **Step 1: Failing tests:**
  - Usual week shows each adult's office row, which saves with `repo.setOffice`.
  - The Longer prep days row saves `prep_days`.
  - Time to cook each evening saves `cooking_minutes`.
  - The weeknight limit (20/30/45/60) saves `weekday_dinner_max_min`.
  - The new recipes counter saves `adventure`.
  - The Shopping and Today's cooking tests no longer find those fields.
- [ ] **Step 2:** Run the settings tests. Expected: FAIL.
- [ ] **Step 3:** Implement with the existing `Page`, `card` and `Segmented` components.
- [ ] **Step 4:** Run them, then `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: "Settings: one Usual week page".

### Task 6: The Plan with Claude screen

**Files:**
- Create: `src/screens/week/PlanChoices.tsx` (route `/plan?week=<monday>&replace=1`)
- Create: `src/screens/week/PlanChoices.test.tsx`
- Modify: `src/App.tsx` (route), `src/lib/repo.ts`

**Interfaces:**
- Consumes: `usualChoices`, `setPrepDay` and `PlanChoices` (Task 1).
- `repo.requestWeekPlan(hid, weekStart, note, replace, choices)`.
- `repo.saveUsualWeek(hid, settings, changedOffice: {memberId, weekday, office}[])`.
- `planUrl(weekStart, shown, replace): string`, moved out of `useWeek.planWithClaude`.
- The screen loads settings, members, pattern, freezer (`listPrepared`) and pantry (`listPantry`). It shows the
  sections in the mockup's order, each change marked against the usual, the summary line, and the tick box when
  anything differs.
- **Plan with Claude:**
  1. If the box is ticked, save the usual week.
  2. `requestWeekPlan`.
  3. `window.open(planUrl)`.
  4. If that returns null, show "Your choices are saved." and an `<a href={planUrl} target="_blank">Open the Claude app</a>`.
  5. Otherwise navigate to `/week`.

- [ ] **Step 1: Failing tests** with the fake repo:
  - The prefill shows the usual office days, cooking times, limit and new recipes.
  - Tapping Wednesday in Nights off and Plan with Claude calls `requestWeekPlan` with `nightsOff` containing
    Wednesday's date. `saveUsualWeek` isn't called.
  - With the tick box, `saveUsualWeek` gets the changed office day, and nights off aren't included.
  - Ticking Sunday in Longer prep days shows Sunday at 2 hr; unticking it shows the usual.
  - When `window.open` returns null, the "Open the Claude app" link appears.
- [ ] **Step 2:** `npx vitest run src/screens/week/PlanChoices.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The same command, then `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: "Plan with Claude: the week's choices on one screen".

### Task 7: The Week tab uses the screen and the week's own office days

**Files:**
- Modify: `src/screens/week/WeekView.tsx`, `PlanWithClaude.tsx`, `useWeek.ts`
- Test: `WeekView.test.tsx`

**Interfaces:**
- On an empty week, a "Plan with Claude" link goes to `/plan?week=<monday>` in place of `PlanForm`.
- "Replan with Claude" and Failed's "Try again" go to `/plan?week=<monday>&replace=1`. `PlanForm` and
  `planWithClaude` are removed.
- `Planning` copy: "Waiting for Claude to save the plan for {next week|this week}…".
- `useWeek`'s input passes `weekOffice: week.office_days`, so the Office chips follow the week.

- [ ] **Step 1: Failing tests:**
  - The empty week links to `/plan?week=…`.
  - A draft's Replan links with `replace=1`.
  - A week with `office_days {adult:[2]}` shows Office on Wednesday and not on the pattern's days.
- [ ] **Step 2:** `npx vitest run src/screens/week/WeekView.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The same command, then `npm test` and `npm run build`. Expected: PASS, and the build succeeds.
- [ ] **Step 5:** Commit: "Week: Plan with Claude opens the choices; a week shows its own office days".

### Task 8: Release

- [ ] Give the owner the text of `0022_plan_choices.sql` to run, and wait for "ran".
- [ ] Deploy:
  - `npx --yes supabase@2.48.3 functions deploy ask-claude-connector --project-ref vzlfijeummlflmauevui --use-api`
  - the same for `propose-week`.
- [ ] Push `main` over SSH, and wait for the site's `last-modified` to pass the commit time.
- [ ] Check with `get_plan_context` (week "next") that the usual week comes through unchanged when there's no open
  request.
