# Today's Cooking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Each day is its steps, aiming for that day's cooking time (60 minutes unless set), with no clock and no cut-off.

**Architecture:** One pure shared module (`supabase/functions/_shared/cookingTime.ts`) answers "how long is this day"
from settings and the week's own times; the day builder, the Week tab, the planner and the connector all ask it.

**Tech Stack:** React/Vite/TS, Vitest, Supabase (Postgres function, Edge Functions).

**Spec:** `docs/superpowers/specs/2026-11-14-day-cooking-design.md`

## Global Constraints
- Settings key `cooking_minutes: { mon … sun: number }`, each 30–240, default 60; an old `hour_minutes` is every day's default when `cooking_minutes` is missing.
- Week key `plan_weeks.cooking_minutes jsonb` `{ "YYYY-MM-DD": minutes }`, only days that differ; migration `0020_cooking_minutes.sql`.
- Owner-facing words: "Today's cooking", never "hour" for the session, no start time anywhere.
- Over-time note when the total is more than the day's time plus 15 minutes.
- Weekday dinner limit: a day over 60 minutes allows `minutes − 15` in all; office days keep `OFFICE_MAX`; 60-minute days keep `weekday_dinner_max_min`.
- Prep ahead counts against the day before its dinner; weekends (Sat, Sun) have no hands-on check in the built-in planner.
- Code names `planHour`, `/today`, `TodayHour*` stay.

## Review Focus
1. Settings saved before this change (only `hour_minutes: 75`): every day reads 75, nothing crashes.
2. A week row with no `cooking_minutes` (all existing weeks, or the column not yet added): the weekday setting is used.
3. A day with only extras (no dinner): total and steps still make sense, no over-time note at 0.
4. Preview of a day in next week: its time comes from next week's row, not this week's.
5. A step list longer than the day: every step is still there, in order, with nothing labelled "after dinner".

---

### Task 1: How long a day is

**Files:** Create `supabase/functions/_shared/cookingTime.ts` (+ `.test.ts`); modify `src/lib/types.ts` (Settings, PlanWeek), `src/lib/household.ts` (parse), `src/screens/settings/TodayHourSettings.tsx` (+ test).

**Interfaces — Produces:**
- `type Weekday = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'`
- `weekdayMinutes(settings: { cooking_minutes?: unknown; hour_minutes?: unknown }): Record<Weekday, number>`
- `dayMinutes(date: string, settings, week?: Record<string, number> | null): number`
- `weekMinutes(weekStart: string, settings, week?): number[]` (7, Monday first)
- `minutesInWords(n: number): string` — 60 "an hour", 90 "an hour and a half", 120 "2 hours", 45 "45 minutes", 75 "1 hour 15 minutes", 150 "2 and a half hours"

- [ ] Test `cookingTime.test.ts`: defaults 60 each; `{hour_minutes: 75}` → 75 each; `{cooking_minutes:{wed:120}}` → wed 120, rest 60; out-of-range (10, 500, 'x') falls back; `dayMinutes('2026-11-19', s, {'2026-11-19': 90})` → 90 and a different date → the weekday's; `minutesInWords` cases above. Watch fail.
- [ ] Implement; pass.
- [ ] `household.ts` parse keeps a valid `cooking_minutes` (clamped 30–240, rounded) and drops the rest; test in `household.test.ts`.
- [ ] Settings screen: section titled **Today's cooking**; the start time and hour length are replaced by **Time for cooking**, seven number fields (Mon–Sun) saving `cooking_minutes`; TM7 and breakfast settings stay. Test: changing Wednesday to 120 saves `cooking_minutes.wed = 120`; no "17:30" on screen.
- [ ] `npm test` green; commit.

### Task 2: The day's steps with no clock

**Files:** `src/lib/todayHour.ts` (+ test), `src/screens/today/useTodayHour.ts`, `src/screens/today/TodayHour.tsx` (+ test).

**Interfaces:** Consumes `dayMinutes`, `minutesInWords`. Produces `HourInput.aim: number` (replaces `start` and `minutes`); `HourStep.length: number` (minutes; `at`/`end` removed); `HourPlan.total: number`; `HourPlan.after` removed.

- [ ] Tests in `todayHour.test.ts`: (a) an extra that doesn't fit a wait comes after **Plate up** in `steps`, with no "Not enough time" warning; (b) a long dinner gives no "runs to" warning; (c) `total` is the end of the last step from 0; (d) a carried must-do step still warns. Update existing tests that use `start`/`minutes`/`at`/`after`. Watch the new ones fail.
- [ ] Implement: the timeline starts at 0; extras are placed in waits before plating where they fit (`endAt` = the dinner's end, or the day's `aim − 10` with no dinner), else appended after plating in chain order; drop `after` and the two warnings.
- [ ] `useTodayHour`: `aim = dayMinutes(today, settings, weekRow(today)?.cooking_minutes)`, the week row from the already-loaded `getWeek` for that date's Monday.
- [ ] Screen: first page heading **Today's cooking** (preview: the day's name); "About {total} minutes · {handsOn} hands-on"; when `total > aim + 15`: "Longer than the {minutesInWords(aim)} you planned for {weekday}". Step header shows `{length} min` instead of clock times; the top bar says **Today's cooking · n of N**; other "hour" wording on this screen becomes "cooking" or "tonight". Tests: no clock text like "17:30"; the total line; the over-time note appears with aim 60 and a 90-minute day; no "After dinner" label.
- [ ] `npm test` green; commit.

### Task 3: Week tab

**Files:** `src/screens/week/useWeek.ts`, `WeekView.tsx`, `DayCard.tsx` (+ tests).

- [ ] Tests: the week card says **Today's cooking** with no start time; a day's sheet shows **Preview the cooking** and "Cooking time: 2 hours" when the week row has 120 for that date, "Cooking time: an hour" otherwise. Watch fail.
- [ ] `useWeek` exposes `dayMinutes(date): number` (from settings and the loaded week row) instead of `hourStart`; the day sheet's "Today's hour" section heading becomes **Today's cooking**.
- [ ] `npm test` green; commit.

### Task 4: The built-in planner

**Files:** `supabase/functions/_shared/planner.ts`, `planInput.ts` (+ tests).

**Interfaces:** `PlannerInput.dayMinutes?: number[]` (7, Monday first) replaces `hourMinutes`; `PlannerRecipe.handsOn` is replaced by `prepMinutes?: number` and `cookHandsOn?: number`.

- [ ] Tests in `planner.test.ts`: (a) with `dayMinutes` all 60, a recipe with `cookHandsOn` 50 isn't chosen Mon–Fri; (b) with Wednesday 120 the same recipe can be Wednesday's, and a recipe with `finishMinutes` 90 is allowed Wednesday (limit 105) but not Tuesday; (c) a recipe with `prepMinutes` 60 isn't Wednesday's dinner when Tuesday is 60, and is when Tuesday is 120; (d) Saturday has no hands-on check; office days keep `OFFICE_MAX`. Update the old `hourMinutes` tests. Watch fail.
- [ ] Implement in `timeLimit`/`fitsDay`; prep is checked against day `i − 1` only when `i − 1` is Mon–Fri.
- [ ] `planInput.ts`: `prepMinutes = prep_minutes`, `cookHandsOn = max(0, finish_minutes − hands_off_minutes)` (when those are set); `dayMinutes = weekMinutes(weekStart, settings, week?.cooking_minutes)`; app callers pass the loaded week row where they have one. Test in `planInput.test.ts`.
- [ ] `npm test` green; commit.

### Task 5: The week's own times from Claude

**Files:** Create `supabase/migrations/0020_cooking_minutes.sql`; modify `supabase/functions/_shared/weekPlan.ts`, `askClaude.ts`, `askClaudePlan.ts`, `supabase/functions/ask-claude-connector/index.ts` (+ tests).

- [ ] Migration: `alter table plan_weeks add column cooking_minutes jsonb`; `save_claude_week` gains `p_cooking jsonb default null`, written on insert and update (drop the old 4-argument function; grants as before, service_role only). Test in the migrations test: saving with `{"2026-11-19": 120}` stores it; the 4-argument call still works through the default.
- [ ] `weekPlan.ts`: parse optional `cooking_minutes` (dates inside the week, 30–240, else dropped) and pass `p_cooking`; the planner around Claude's dinners uses those times. Tests: kept, out-of-week dropped, out-of-range dropped.
- [ ] Connector: `save_week_plan` schema gains `cooking_minutes` (object of date → minutes, "only days the household says differ, from their note"); `formatHousehold` says "Cooking time each day: Mon an hour, …; aim each day's cooking (dinner, prep for the next day, extras) at that"; `get_plan_context` gives each day's minutes; rule 4 says a weekday dinner's cook within that day's time less 15 minutes and its prep within the day before's. Tests on the text.
- [ ] `npm test` green; commit.

### Task 6: Words, docs, review, deploy
- [ ] Remaining owner-facing "Today's hour" strings (grep `src` for `hour` in JSX text) become "Today's cooking"; spec.md §7 row and other mentions updated; CLAUDE.md untouched.
- [ ] Final review (opus), fixes test-first, `npm test`, `npm run build`.
- [ ] Owner runs 0020 in the SQL Editor; then push; deploy `ask-claude-connector` and `propose-week`; check the live bundle.
