# Plan with Claude: the week's choices on one screen

Approved mockup: the "Plan with Claude mockup" canvas (15 Nov 2026).

## Why

Planning a week used to mean a free-text note, with the settings that shape the week (office days, cooking time,
new recipes…) spread over several Settings pages. The owner wants those settings on the Plan with Claude screen as
choices to tap, filled in with the usual values, so a week that differs is changed in a few taps. Settings keeps the
usual values, gathered on one page.

## Goals

- Tapping **Plan with Claude** (on an empty week, or **Replan with Claude**) opens a screen for that week, with
  everything filled in from the usual week:
  1. **Office days:** a Mon–Fri row for each adult. A day changed from the usual one says "this week".
  2. **Nights off:** Mon–Sun. No dinner is planned or bought on those nights.
  3. **Time to cook each evening:** Mon–Sun. A tap moves through 30 min, 45, 1 hr, 1½ hr and 2 hr.
  4. **Longer prep days:** Mon–Sun, more than one allowed. Picking a day raises its time to at least 2 hr, and
     unpicking it puts the usual time back. Each prep day covers the nights up to the next prep day. A prep day can
     fall on a night off.
  5. **Weeknight dinners take at most:** 20, 30, 45 or 60 min.
  6. **New recipes from Claude:** a counter from 0 to 7.
  7. **Use these up:** the freezer's in-date portions and the pantry's items, as chips to tap.
  8. **Anything else?:** the free-text note, as today (up to 300 characters).
  9. **"Make this week's changes my usual":** a tick box, shown only once something differs from the usual. Nights
     off and Use these up are one-off choices, so they never become usual.
  10. A summary line ("6 dinners · up to 2 new · prep Sun + Wed · 1 changed from usual"), and the **Plan with
      Claude** button.
- Changes are for that week only, unless the box is ticked.
- **Settings → Usual week:** one page for office days, longer prep days, time to cook each evening, the weeknight
  limit and new recipes per week. It replaces the Office days page and those fields in Planning & shopping and
  Today's cooking. The automatic Friday-evening plan uses these values.
- **A week remembers its own office days and prep days,** so its Office chips, packed lunches and Today's cooking
  follow that week rather than Settings.

## Non-goals

- Quick menu doesn't move onto the screen. It stays on the Week tab, using the usual week. (My call. The built-in
  planner would need its own copy of every choice; the mockup's "Quick menu instead" link is dropped.)
- No guests or per-day protein on the screen. Day rules stay in Settings.
- **Moving prep steps onto a prep day in Today's cooking** is a later piece, with its own design. For now Claude is
  told the prep days and plans around them: it prefers dinners whose make-ahead parts keep, and it says in the summary
  what to batch on each prep day. Today's cooking keeps preparing each dinner the evening before, as now.

## Anti-goals

- A week planned with a choice that Claude or the app then quietly ignores. Every choice either reaches the plan or
  the summary says why it couldn't.
- The screen changing the usual week without the box ticked.

## How it works

- **Data:**
  - Settings gains `prep_days` (weekdays, 0 = Monday) in its data. No migration is needed for that.
  - Migration 0022:
    - `week_plan_requests.choices jsonb`: the screen's answers, i.e. office days by member, nights off, cooking
      minutes by date, prep days, the weeknight limit, new recipes and use-up items.
    - `plan_weeks.office_days jsonb`: weekdays by member.
    - `plan_weeks.prep_days int[]`.
    - `save_claude_week` writes both from the request's choices.
- **The button:**
  - If the box is ticked, the usual values are saved first.
  - Then a plan request is created with the choices and the note, and the Claude app opens with a short line to
    plan that week. The choices aren't in the line; they're read from the request.
  - Replan does the same with `replace`.
- **The connector:**
  - `get_plan_context` reads the week's open request and applies its choices: office days, nights left out, each
    day's minutes, prep days, the weeknight limit, the new-recipe allowance and the use-up list. That covers the
    built-in proposal too.
  - `save_week_plan` checks against them: no dinner on a night off, and no more new recipes than allowed.
  - The planning rules gain one line for prep days and one for use-up items.
- **The week:** office days come from `plan_weeks.office_days` when it's set, otherwise from the pattern. That
  covers the planner input for swaps, the week tiles and Today's cooking.

## Approaches considered

1. **Choices saved with the plan request (chosen).** The connector reads exact values, can check Claude's save
   against them, and the week keeps what it was planned with.
2. **Choices written into the text sent to the Claude app.** No database change, but Claude would read them as a
   note: nothing checks the save, and the week wouldn't remember its office days.
3. **Every change saved straight to Settings.** Simple, but a one-off week would change the usual week, which the
   owner doesn't want.

## Left to the builder

The exact layout follows the mockup and the app's existing Settings components. So do the names of the new types
and functions, and the wording of the planning rule lines.
