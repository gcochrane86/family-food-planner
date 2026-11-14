# Prep ahead in Today's hour (replacing the 8pm prep)

Date: 14 Nov 2026. Status: design, awaiting the owner's approval.

## Why

The household cooks in one hour a day (Today's hour, 17:30–18:30 by default). The old "8pm prep, the night before"
idea no longer matches how they cook, and it still shows in the app: "Night before" on recipe steps, a "The night before"
time on the recipe card, a Prep ahead switch on the recipe card and in cook mode. Today's hour already fits tomorrow's
prep into the waits, but always, with no say. The owner wants one model: the hour, with two kinds of task.

## What the owner asked for

- **Essential**: tonight's dinner, always done. Not tickable.
- **Optional but recommended**: prep ahead for tomorrow. Chosen from the day on the Week tab (the planner) or in
  Today's hour.
- A prep step that isn't really optional (it must be done the night before) is **not tickable**: it's essential.
- If optional prep is skipped, it moves into **tomorrow's hour as essential**, so the dinner still gets made.
- The app knows which prep steps must be done the night before because **Claude flags each step once** (chosen over
  guessing from the wording, and over treating all dinner prep as optional).

## Goals

1. Each day's hour shows its essential tasks and its optional prep for tomorrow, the optional prep ticked by default
   (recommended).
2. The tick can be changed on the Week tab's day sheet and on Today's hour's first page; both show the same choice, on
   every device.
3. Unticked prep appears in the next day's hour as essential, before that dinner's own steps.
4. Must-do prep (marinades, overnight soaks and the like) is always in the evening before's hour, shown as essential
   with "Needs the night before".
5. "8pm" and "Night before" (as a phase name) disappear from the app's wording.

## Non-goals

- Renaming the `prep_8pm` phase in the database or the recipe format. It stays as the internal name; only wording
  changes. (Renaming would touch every recipe, the seed format, the connector and Cookidoo for no visible gain.)
- Changing what goes to Cookidoo. Its step text keeps the current "The night before:" prefix, so no recipe is marked
  out of date and nothing needs re-syncing. (Builder's call to revisit later.)
- Changing the weekly planner's hands-on limit. It already counts prep plus the busy part of the cook within the hour
  less 15 minutes, which is exactly what a day with skipped prep needs.
- Prep for anything further ahead than tomorrow (roasts keep their own plan).

## Anti-goals

- A dinner that can't be made because a must-do step was skippable.
- Prep that silently disappears: if it was meant to happen last night and the household says it didn't, it must come
  back.
- The two places (Week tab, Today's hour) disagreeing.

## Decisions

### What is essential and what is optional, for day D's hour

Essential (not tickable):
- Tonight's dinner (D), chopping to dishwasher, as now.
- Any of tonight's dinner's prep that was **not** done in yesterday's hour (D-1's choice was "skip", or nothing was
  planned yesterday). These go before tonight's own steps.
- Tomorrow's (D+1) dinner prep steps flagged **needs the night before**.
- Tomorrow's night-before breakfast (overnight oats etc.) and the night-before part of a home lunch (the chicken
  sandwich's roast). These are for the morning or midday, so they can't wait.
- Packing tomorrow's leftovers lunch, plate up, wipe down, as now.

Optional, recommended, ticked by default:
- Tomorrow's (D+1) dinner prep steps **not** flagged needs-the-night-before, as one tick for the whole set ("Prep for
  tomorrow's Thai Green Curry"). One tick per dinner, not per step: simpler to read, and partial prep is hard to track
  the next day. (My call.)

### Where the choice lives

- A new column on `meal_slots`: `prep_ahead boolean not null default true`, on the **dinner slot that the prep is
  for** (D+1's dinner). True: its optional prep is planned in the evening before's hour. False: it's done on the day.
- Both the Week tab and Today's hour read and write that one column, so they always agree, on every device.
- When that slot's recipe changes (swap, move to another day, Claude replanning), the column goes back to true. Same
  pattern as `slot_version_follows_recipe` in migration 0015: a trigger, so every writer (app, connector, planner,
  day swap) gets it. (My call.)
- New migration `0018_prep_ahead.sql`, which the owner runs in the SQL Editor.

### The must-do flag on steps

- A new column on `recipe_steps`: `needs_night_before boolean not null default false`. Only meaningful on `prep_8pm`
  steps.
- Claude sets it once for every existing recipe: a pass over every recipe's prep steps, true when the step can't be
  done on the day in Today's hour before the cook (marinating for hours, soaking, overnight chilling or setting,
  slow cooks, anything whose result is needed before the next day's hour). Backups first
  (`seed/private/backups/`), as with every recipe change. The owner sees the list of flagged steps before it's
  saved. (How the pass is run, script or rework pipeline, is the builder's call.)
- The recipe editor gets a "Needs the night before" checkbox on prep steps.
- New recipes: `NEW_RECIPE_RULES` and the recipe format (`recipeRules.ts`, `recipeSeed.ts`) gain a
  `needs_night_before` field on prep steps; the recipe import and Cookidoo import playbooks say to set it; the
  rework pipeline keeps it.

### The day's hour (Today's hour)

- First page: the hour, Get it out, then a short **"For tomorrow (recommended)"** row with the tick, and Start. The
  Get it out list and the timeline follow the tick at once.
- If yesterday's hour had prep for today's dinner planned (ticked), the first page also shows **"Done last night:
  prep for tonight's X"** with an "I didn't get to it" option, which sets today's dinner's `prep_ahead` to false and
  brings those steps into tonight's hour as essential. (Answers the anti-goal "prep that silently disappears".)
- Steps keep their order and look; optional prep steps are labelled "For tomorrow" as now; skipped prep in
  tomorrow's hour reads "From yesterday's prep" or similar.
- `planHour` takes the two flags as input (tonight's prep done ahead or not; tomorrow's optional prep wanted or not)
  and the per-step must-do flag; `useTodayHour` loads them.

### The Week tab day sheet

- Each day's sheet gets a small "Today's hour" section: the dinner (essential) and, if tomorrow's dinner has optional
  prep, the same **"Prep for tomorrow's X (recommended)"** tick. Must-do prep shows as a plain line, "Needs the night
  before: marinate the chicken", with no tick.
- Only when the next day has a cooked dinner with prep steps.

### Wording

- Recipe card: drop the Prep ahead switch; the method reads in cooking order (as with the switch off now), with prep
  steps badged **"Can be done the day before"** or **"Needs the night before"**. The "The night before" time box
  becomes "Prep ahead" (minutes). "Make-ahead" tag and filter stay.
- Cook mode: drop the Prep ahead switch and its two tabs; one list in cooking order, with the same badges.
- Recipe editor: the phase option "Night before" becomes "Prep ahead"; "On the night" becomes "On the day".
- Settings, spec, playbooks, `mealSpec.ts` ("with anything longer done the night before") and the connector's
  descriptions (`askClaude.ts` "The night before" heading, `recipeRules.ts`): say "prep ahead", in the hour the
  evening before, never "8pm".
- `src/lib/prepAhead.ts` (the per-device switch) goes, unless something else still needs `switchClasses` (DayCard and
  ShopList use it: move it to a shared place).

### Roasts keep their prep ahead (the owner, 14 Nov 2026)

- A roast (Build a roast, Christmas dinner) keeps its own plan exactly as now: Two days before, Day before, Night
  before, Morning prep and so on, in the roast's cook view. Nothing in it becomes optional, and none of this design's
  wording changes touch it ("Night before" stays as a roast phase name).
- The hour the evening before a roast shows it as essential, not tickable: one line, "Tomorrow's roast: night-before
  prep", listing the roast plan's Night before steps (and Day before ones that fall that evening), with a link to the
  roast's cook view. They aren't fitted into the hour's timeline: the roast plan keeps its own times. (My call: the
  roast scheduler already places them; the hour only makes sure they're not missed.)

### Calls settled after the builder check (my calls, for the owner to check)

1. **Must-do prep that didn't happen** (no hour yesterday, or "I didn't get to it"): it still goes into tonight's hour,
   first, as essential, with a warning: "This needed the night before: it gets less time tonight." Most marinades
   still work shortened; the warning lets the household decide to swap instead. The "Done last night" row covers
   must-do steps as well as the optional tick, and shows whenever yesterday's hour had any prep for tonight.
2. **The tick covers tomorrow's boxed chopping too.** Chopping that keeps and is boxed for tomorrow is prep for
   tomorrow, so it follows the same tick. Skipped (or "I didn't get to it"): tomorrow's hour chops it fresh. The
   `yesterdayPlanned` fridge-box assumption is replaced by "yesterday's hour ran and tonight's `prep_ahead` is true".
3. **Tonight's version** (`meal_slots.version`, set through the connector): its steps carry `needs_night_before`
   too. A step keeps the flag of the recipe step with the same title; a new step defaults to false unless Claude sets
   it (`set_tonights_version` accepts the field). Tonight's version mostly matters on the day itself, so this is a
   small case.
4. **"I didn't get to it" writes the same column** (`prep_ahead = false` on tonight's dinner). Yesterday's sheet then
   reads "skipped", which is what happened. Tapping it again undoes it. No separate column.
5. **The trigger resets `prep_ahead` to true** when the slot's recipe changes or its mode changes away from cook. A
   re-inserted row gets the default anyway.

## Approaches considered (for the must-do flag)

1. **Claude flags each step once** (chosen). Accurate, editable, set for new recipes too. Costs a migration and one
   pass over the recipes.
2. Guess from the wording ("marinate", "overnight", "chill", "soak"). No migration, but misses some, and a missed
   marinade means a dinner that can't be made on the night.
3. Only breakfasts and lunches are must-do. Simplest, but a skipped marinade would quietly move to the day.

## Left to the builder

- How `planHour` places carried-over prep in tonight's timeline (before the finish steps, after the chopping, shifting
  tonight's `at_minute` offsets as needed); the existing waits-and-machines placement rules apply.
- Exactly how the flagging pass runs, as long as backups come first and the owner sees the flagged steps.
- Small wording on the labels.
- Tests: `todayHour.test.ts` and `TodayHour.test.tsx` for the flags; the migration in the in-memory Postgres tests.
