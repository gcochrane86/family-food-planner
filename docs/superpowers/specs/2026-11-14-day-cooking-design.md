# Today's cooking: the day's steps, aiming for about an hour

Owner's request (14 Nov 2026): stop treating the evening as a fixed hour. Each day is just its steps, aiming for
roughly an hour, with more on the days the owner says have more time when planning the week.

## Why
The fixed 17:30–18:30 hour confuses more than it helps: clock times on every step, and steps pushed out with
"Not enough time: do it after dinner" when the day simply needs longer. The owner wants to plan around real time:
some days have more, and the plan should say so and use it.

## Goals
- Each day's page is the day's steps in order (chop, cook, extras fitted into the waits, plate, pack, clean), with
  no clock times and nothing pushed out for lack of time.
- A rough total on the first page ("About 55 minutes · 40 hands-on"), and a gentle note when the day runs well past
  its aim.
- A cooking time per day of the week in Settings (default 60 minutes every day), changeable for a week when planning.
- The planner (built-in and Claude) fits each day's dinner and prep ahead to that day's time.
- "Today's hour" is renamed **Today's cooking** everywhere the owner reads it.

## Non-goals
- Changing what goes into a day (prep ahead, must-do night-before steps, extras, packing, cleaning all stay).
- Changing the order the steps are worked out in, or the fitting of extras into waits.
- Editing a single day's time from the Week tab (a later step if wanted; for now Settings and the plan note).

## Anti-goals
- Any wording that implies a deadline or a start time.
- Steps hidden or dropped because a day is long.

## Approaches
1. **Per-weekday times in Settings, with a per-week change from the plan note (chosen by the owner).** Settings
   holds Mon–Sun minutes; when the owner tells Claude "Wednesday I've got 2 hours", Claude saves that day's time with
   the week. The app shows the right aim for each day; it lasts only that week.
2. Only the plan note, read by Claude each week: nothing to set, but the app can't show a day's aim, and the
   built-in planner can't use it.
3. One cooking time for every day (today's setting, minus the clock): simplest, but can't say which days have more.

## Design
- **Settings → Today's cooking:** "Time for cooking" with a minutes field per day, Mon–Sun, 30–240, default 60.
  Stored in settings as `cooking_minutes: { mon: 60, … }`. The old `hour_start` and `hour_minutes` stop being used
  (an existing `hour_minutes` becomes every day's default when `cooking_minutes` isn't set).
- **A week's own times:** `plan_weeks.cooking_minutes jsonb` (migration 0019), `{ "YYYY-MM-DD": minutes }`, only
  for days that differ. `save_week_plan` takes an optional `cooking_minutes` the same way; Claude fills it from the
  owner's note. A day's time is the week's value, else the weekday's setting.
- **The steps (`todayHour.ts`):** timed from 0, not a clock. There's no end: extras that don't fit a wait go after
  plating, as ordinary steps (no `after` list, no "Not enough time" or "runs to" warnings). Must-do prep carried
  into the day keeps its own warning. Steps show their length (as now with timers), not "17:45".
- **First page:** "About N minutes · M hands-on". When N is more than the day's time plus 15 minutes: "Longer than
  the hour and a half you planned for Wednesday" (the day's time in words).
- **Week tab:** the card is **Today's cooking** (no start time); each day's sheet has **Preview the cooking** and,
  when the day differs from 60 minutes, its time ("2 hours today").
- **Planner:** a weekday dinner's hands-on time (prep included) stays within that day's time less 15 minutes;
  weekends as now. `get_plan_context` lists each day's time and asks Claude to save `cooking_minutes` when the note
  changes a day.
- **Words:** "Today's hour" becomes "Today's cooking" in the app, Settings, the connector's text and spec.md; code
  names (`planHour`, `/today`) stay.

## Calls made after the builder check (the owner can change any)
- **More time lifts the dinner limit too:** on a weekday with more than 60 minutes, a dinner may take up to that
  day's time less 15 minutes in all (not just the 30-minute weekday limit); 60-minute days keep the 30.
- **Prep counts where it's done:** a dinner's prep ahead counts against the evening before (the day it's done);
  its cook counts against its own day.
- **A week's times are set while planning** (a draft); after approval, change them by replanning or in Settings.
- **The day sheet always shows the day's time** ("Cooking time: 1 hour"), whatever it is.
- **Weekends:** their times drive the total and the over-time note, and Claude sees all seven days; the built-in
  planner keeps no hands-on check at weekends.
- The migration is 0020 (0019 is taken).

## Left to the builder
- Exact wording of the total and the over-time note, within the above.
- How minutes are entered in Settings (field or − / +).
