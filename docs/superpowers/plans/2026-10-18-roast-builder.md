# Roast Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A **Build a roast** page on the Recipes tab.
- **You pick:** a main (beef, chicken or lamb), the sides, how many people, and when to eat.
- **The app builds one plan for that exact combination:** timed steps with photos, grouped into phases, a timeline per appliance across the household's kit, and the shopping. You can then add the plan to a day.

**Architecture:**
- **Roast parts are small recipes** (`kind: component`, tag `Roast`), each with a `roast` description: is it a main or a side, which mains it goes with, and, for each step, when it happens relative to serving, which kit it needs and at what temperature.
- **A pure scheduler** (`src/lib/roast.ts`) works backwards from serving time:
  - it places every step, gives each oven step a cavity that's free at a compatible temperature (or moves it earlier and holds it)
  - it returns the merged plan
- **A planned roast is stored on the dinner slot** (`meal_slots.roast`: main, sides, people, serve time), so shopping and the day sheet follow it.

**Tech Stack:** React + Vite + TS, Supabase (migration 0013), Vitest + PGlite.

**Spec:** `docs/spec.md` (adds a "Roast builder" row), the owner's Sunday roast (`gcochrane86/Recipes`: SundayRoast.html and data/recipes/sunday-roast.json), and the Meal specifications.

## Global Constraints
- **Kit (owner, 18 Oct 2026):**
  - **Oven 1** and **Oven 2:** roasting cavities, fan or conventional
  - **Oven 3:** warming and grill
  - **APO:** the Anova oven, with steam
  - **TM7**, **hob** and the **HY air-fryer** (`hy24`)
- **Beef defaults** to the owner's sides: goose-fat roasties, Yorkshires, mash, honey-citrus carrots, bay parsnips, cauliflower cheese, gravy.
- **The selector offers the classics, adjusted for the Meal specifications** (from scratch, no UPFs, no sausages, toddler salt ≤ 0.5g, the TM7 for sauces):
  - **For every main:** roasties, Yorkshires, mash, honey-citrus carrots, bay parsnips, cauliflower cheese, red cabbage, buttered greens & peas, sage & onion stuffing balls, gravy
  - **Lamb:** mint sauce
  - **Beef:** horseradish cream
  - **Chicken:** bread sauce
  - **No pigs in blankets:** they're sausages. The stuffing balls are the from-scratch alternative.
- **Mains:**
  - **Beef:** overnight-braised brisket, from the owner's recipe
  - **Chicken:** a whole chicken in the APO, to 74°C on the MEATER
  - **Lamb:** a leg of lamb, oven then rest, to 60°C on the MEATER
- **Lessons kept from 11 Oct 2026:**
  - roots go in raw (never steamed)
  - brisket at 80°C for 10 hours, held in its juices
  - gravy from a browned base with the wine reduced first, finished with redcurrant jelly, soy, salt and butter
  - Yorkshires in a 4mm layer of smoking fat
- **Temperatures that can share a cavity:** within 10°C of each other, and at most 2 trays per cavity at once.
- **Photos:** each step shows its part's step photo, or the part's main photo. Making missing photos is offered with a cost (about 3p each), never automatic.

## Review Focus
1. **Two sides that need different temperatures at the same time** (Yorkshires at 220°C and roots at 200°C): they go in different cavities. With no cavity free, the earlier item moves earlier and is held in Oven 3 or the APO. Nothing silently overlaps.
2. **More oven work than the ovens can take:** the plan says so ("Too much for the ovens at 12:40: drop a side or eat at 13:45") rather than producing an impossible timeline.
3. **Changing the number of people:** quantities scale, and step times don't change except where a part says they do (more roasties: a third tray, which may need another cavity).
4. **A side that doesn't suit the main** (mint sauce with beef) isn't offered for that main.
5. **A roast added to a day:** shopping buys every part at that day's portions, the day sheet shows the roast with its photo, and the planner never auto-plans a roast.

---

### Task 1: Migration 0013 and the roast model
- **Database:** `recipes.roast jsonb` and `meal_slots.roast jsonb`.
- **`src/lib/roastModel.ts`:**
  - `RoastPart { part: 'main' | 'side'; mains: ('beef' | 'chicken' | 'lamb')[]; steps: RoastStep[] }`
  - `RoastStep { title: string; before: number /* minutes before serving */; minutes: number; kit: 'oven' | 'grill' | 'warm' | 'apo' | 'tm7' | 'hob' | 'hy24' | 'counter'; temp?: number; fan?: boolean; trays?: number; when?: 'night' | 'morning' | 'service' }`
  - `parseRoastPart(raw): RoastPart | null`, which validates and clamps
- **Seed:** `seed` validation accepts `roast`. `recipeRow` and `seedFromDetail` carry it.
- **Tests:** migration checks; `parseRoastPart` accepts a part, and rejects a bad kit, a missing title or a negative minutes.

### Task 2: The roast parts (content)
- **New file** `seed/private/recipes/roast.json` with 3 mains and 13 sides as `kind: component`, tagged `Roast`, each with a `roast` description. Written from the owner's roast (beef parts copied from it) and the Meal specifications. Base portions are 15 for the brisket and 6 for the rest.
- **Owner check:** each part's steps and timings are shown to the owner before seeding.
- **Test:** `recipeSeed.test.mjs` already validates every private file.

### Task 3: The scheduler (`src/lib/roast.ts`)
- **The plan:** `planRoast({ main, sides, people, serve: 'HH:MM', parts: Map<slug, Recipe & { roast }> }): RoastPlan`. A `RoastPlan` has:
  - `phases` (Night before / Morning / Downtime / Service countdown), each a list of timed steps with their part, kit, cavity and photo source
  - `kit` (a timeline per appliance)
  - `warnings`
- **Cavities:**
  - Oven steps go to Oven 1, then Oven 2, by temperature compatibility and trays.
  - When neither is free, the step moves earlier and adds a "hold in Oven 3 (warm) / APO" step.
  - When even that fails, a warning (Review Focus 1–2).
- **Tests:**
  - **The owner's beef combination at 13:30:** it reproduces the key times from the HTML (Yorkshires 12:15 in Oven 1 at 220°C, roasties 12:42 at 210°C, roots 12:36 in Oven 2 at 200°C, cauliflower cheese 12:48).
  - **Clashes:** Yorkshires plus roots at the same time land in different cavities.
  - **Over capacity:** an overloaded combination returns a warning.
  - **Scaling:** 15 versus 30 people moves roasties to 3 trays.
  - **Main fit:** mint sauce isn't valid with beef.

### Task 4: Build a roast (Recipes tab)
- **The page:** `src/screens/recipes/RoastBuilder.tsx` at `/recipes/roast`, linked from the Recipes tab ("Build a roast").
- **Choosing:**
  - mains as photo cards
  - sides as a photo grid (pre-ticked with the main's defaults; sides that don't suit the main are hidden)
  - people ±
  - serve time
- **The plan, shown below as you choose:**
  - phases as photo step cards (a step's photo, else its part's main photo, else a placeholder)
  - a timeline per appliance
  - warnings
- **"Make the missing photos (about Np)":** the existing step-photo flow, per part.
- **"Add to a day":** pick a date in this week or next. It sets that dinner slot to the roast (Task 5).
- **Print**, laid out like the owner's HTML.
- **Tests:**
  - choosing beef pre-ticks the owner's sides
  - lamb shows mint sauce and beef doesn't
  - changing the time moves every step
  - a warning shows
  - Add to a day saves the slot

### Task 5: Roasts on the week, the shopping and the planner
- **The slot:** `meal_slots.roast = { main, sides, people, serve }`, with `mode: 'cook'` and `recipe_id` set to the main part (for the photo and title).
- **Day sheet:** the roast card ("Sunday roast · beef · 15 people · 13:30") opens the builder with that combination.
- **Shopping:** buys every chosen part at `people / base_portions`.
- **Week tile:** "Roast".
- **The Friday planner** never picks a `Roast`-tagged part, or a recipe tagged `Hosting`, by itself.
- **Tests:**
  - a roast slot's list contains the brisket, the roasties' potatoes and the cauliflower
  - the planner never proposes `Hosting` or `Roast` recipes

### Final
- Update the spec, run the full suite and the build, then one fresh review.
- **Live:** the owner runs 0013; seed the roast parts after the owner checks them; merge and push.
