# Preview the Hour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Open any day's Today's hour from the Week tab, exactly as it will run, and change a dinner step for that day.

**Architecture:** `useTodayHour` takes the day; `/today?day=` passes it. Hour steps carry where they come from; a
"Change for this day" sheet writes that dinner slot's tonight's version through the shared `buildVersion`.

**Spec:** `docs/superpowers/specs/2026-11-14-preview-the-hour-design.md`

## Global Constraints
- No migration. The app writes `meal_slots.version` only through `repo.setSlotVersion`.
- Today's hour without `?day` behaves exactly as now.

## Review Focus
1. A preview of a past day: look only (no tick changes, no day edits, no "I didn't get to it").
2. A day edit on top of Claude's version: Claude's changes are kept; the note gains the new line.
3. Removing a step whose ingredients are only used there: the version is still valid (ingredients kept).
4. The preview's step position and Get-it-out ticks don't leak into the real day (keys per day).
5. `?day=` that isn't a date, or outside the loaded weeks: falls back to today / says so.

### Task 1: Preview any day
- `useTodayHour(day?: string, now?)`: the hour for `day` (default today); returns `day`, `isToday`, `isPast`.
- `TodayHour`: reads `?day=` (valid YYYY-MM-DD, else today); keys `today-hour:<day>`, `today-got:<day>`; a bar
  "Preview · <Weekday d Mon>" with **Day options** (`/week?day=<day>`) when not today; Close and Done go to `/week?day=<day>`
  in a preview. In a preview of a past day, the prep tick and "I didn't get to it" are hidden; in a future day's
  preview, "Done last night" shows without its button.
- `DayCard` (Week tab day sheet): **Preview the hour** link (`/today?day=<date>`) for a day with something to cook.
- `WeekView`: `?day=<date>` opens that day's sheet (switching to next week if the date is in it).
- Tests: TodayHour (preview of Tuesday shows Tuesday's dinner and the bar; past day has no tick), WeekView (link, `?day` opens the sheet).

### Task 2: Steps know their dinner
- `HourStep.source?: { date: string; phase: 'prep_8pm' | 'finish'; title: string }` on steps from tonight's dinner (date = the hour's date, incl. carried prep) and from tomorrow's dinner prep (date = tomorrow). `HourInput.date` is the hour's date.
- Test in todayHour.test.ts.

### Task 3: Change for this day
- `src/lib/dayVersion.ts`: `changeStepForDay(recipe: RecipeDetail /* saved */, current: SlotVersion | null, change: { phase; title; body?: string; timer?: number | null; at?: number | null; remove?: boolean }): { version: SlotVersion } | { error: string }` — starts from the current version's steps/ingredients (else the recipe's), applies the change, builds through `buildVersion` with note `<old note>; ` + `Changed for this day: <title>` (or removed).
- `repo.setSlotVersion(slotId: string, version: SlotVersion | null)`.
- `useTodayHour` returns the slots (tonight's and tomorrow's dinner) and their saved recipes (not the versioned ones) for this.
- TodayHour step page: **Change for this day** on steps with `source` (not on a past day): a sheet with the wording, timer, start minute (finish steps only), Save / Remove for this day / Cancel; saves then reloads. On the first page, when tonight's or tomorrow's dinner has a version: "Changed for this day: <note>" with **Undo this day's changes** (sets null). Other steps link **Edit recipe** (`/recipes/<id>/edit`).
- Tests: dayVersion (change body, timer, remove, on top of an existing version keeps it), TodayHour (save calls setSlotVersion with the changed step; undo clears).

### Task 4: Docs, review, deploy
- spec.md Today's hour row and Week tab row; review; merge; push; check live.
