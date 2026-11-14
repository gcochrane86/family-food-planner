# Preview any day's hour, and change it for that day

Date: 14 Nov 2026. Approach 1 chosen by the owner ("I think 1 yeah"); this doc awaits approval.

## Why
Today's hour only opens for today. The owner wants to look at each day's hour ahead of time from the Week tab, adjust
it (choices, recipes, and the hour itself for that day), and make any missing photos before the day.

## What it does
- **Preview the hour**: each day's sheet on the Week tab gets a link that opens `/today?day=YYYY-MM-DD`: that day's
  hour exactly as it will run (`useTodayHour` takes the date; everything is already computed from it). A bar at the
  top says "Preview · Wednesday 18 Nov"; the Week tab's own Today's hour card still opens today.
- **Photos ahead**: Add step photos works in the preview as on the day (missing step photos, chopping cartoons,
  ingredient icons; ones already made are reused).
- **Choices**: the prep tick for the next day works in the preview as on the day. **Day options** opens that day's
  sheet on the Week tab (`/week?day=…`) for swapping or moving the dinner, portions, guests, out tonight; coming back
  rebuilds the preview.
- **Recipe**: each recipe step in the preview links to **Edit recipe** for a lasting change.
- **Change for this day** (the chosen approach): on a step that comes from a dinner's recipe (tonight's own steps, or
  the next day's prep done in this hour), a sheet to change its wording, its timer, when it starts (minutes into the
  cook, for tonight's steps), or remove it for that day. Saved as that dinner's **tonight's version**
  (`meal_slots.version`, built with the shared `buildVersion`, so it's checked the same way as Claude's); the saved
  recipe is untouched. The hour, the chopping list, the shopping list and cook mode follow it, as they already do for
  Claude's versions. An existing version (Claude's or an earlier change) is changed, not replaced; its note gains
  "Changed for this day: <step>". **Undo this day's changes** clears it.

## Decisions (my calls)
- Only dinner steps can be changed for a day: a breakfast or lunch step links to Edit recipe (their slots don't carry
  a recipe version the hour reads). Generated steps (chopping, board into the dishwasher, rinses, plate up, wipe down)
  have no edit; they follow what they depend on.
- In a preview of a future day, "Done last night" is shown as what's planned, without "I didn't get to it" (only on
  the day itself does that make sense). Get-it-out ticks are kept per day, as now.
- Days in this week and next (what the app loads). A past day's preview is read-only.
- The app now writes `meal_slots.version` (only through this change); the database still clears it when the day's
  recipe changes (migration 0015). No migration needed.

## Non-goals
Pinning or skipping generated steps; changing a breakfast or lunch for one day; reordering by drag.
