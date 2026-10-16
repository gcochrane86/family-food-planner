# Week Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Match the approved mockup (https://claude.ai/artifact/EDpL1UtZPT2LuP8NJcxcVj, v3):
- clean week tiles with no tags
- a day pop-up led by photos, with breakfast pills and a two-photo lunch choice
- a "More options" box: Out tonight, Friends over, Portions, Swap
- swipe-to-swap dinners
- a "How was last night's …?" card in place of Mark cooked

**Architecture:**
- **Photos:** breakfast and lunch become small recipes (`kind: component`, tag Breakfast or Lunch), so they get hero photos the same way as dinners (Recipes → Make photos). A pure helper maps a meal's name to its recipe.
- **Lunch choice:** stored in the lunch slot's `routine_choice` (`Leftovers` or `Chicken sandwich`), so no database change is needed.
- **The feedback card** works on whichever week holds last night's dinner.

**Spec:** `docs/spec.md` §6 Screens ("Home: week grid"), §3 Breakfast and Home lunch, §4 Feedback.

## Global Constraints
- No migration.
- Tokens and fonts as in `src/styles/tokens.css`.
- Phone: 2 tiles across. iPad: 2 across in portrait, 4 in landscape (current grid).
- Copy, as in the mockup:
  - "More options"
  - "Out tonight"
  - "Friends over"
  - "Portions"
  - "Swap"
  - "Lunch · pick one"
  - "How was last night's {title}?"
  - "Swap {Day}'s dinner"
  - "Browse all recipes"
- A meal with no photo yet shows a soft shaded box with its name, never a broken image.

## Review Focus
1. **The feedback card across weeks:** last night's dinner can be in "this week" while the screen shows "next week" (Fri–Sun). The card still appears, and its answers save to the right slot.
2. **Swiping on a phone:** a mostly-vertical drag must not choose or skip. Choosing a card applies the same swap as before (locked, shopping list and Cookidoo follow).
3. **The lunch choice:** with no leftovers available (last night's dinner doesn't reheat, or there was none), there's one card, not two. The choice persists and the tile shows it.
4. **A recipe with no photo:** the placeholder, not an empty or broken image.
5. **Removed controls:** Keep, Leftovers, the prep box and the cooked/verdict/rating rows in the sheet are gone. The planner still sets leftovers nights itself.

---

### Task 1: Clean tiles
- `daySummary`:
  - drop chips from the tile (keep the function's `chips` for now, but the tile doesn't render them)
  - the lunch label follows `routine_choice` when the lunch offers a choice: `Leftovers` or `Chicken sandwich`, defaulting to `Leftovers`
- `WeekTile`:
  - approved: "✓ Approved" plus the Cookidoo line, and Try again when it's failed
  - draft: the existing approve text and button
  - no balance chips
- **Tests:**
  - weekSummary: lunch follows the choice, defaulting to Leftovers
  - WeekView: tiles show no "Office"/"Prep tonight"/"Cook once" text
  - the week tile shows no balance
  - update the existing tests that expected chips or balance

### Task 2: Breakfast and lunch recipes and the photo mapping
- **Private seed** `seed/private/recipes/routines.json`: five component recipes, written from the household's own descriptions (spec §3):
  - `overnight-oats`
  - `baked-oats`: 4 eggs, 1 banana, cinnamon, oat flour added to batter consistency, with yoghurt, fruit and nut butter
  - `eggs-and-porridge`: 2 eggs per adult and 1 for the toddler, porridge with fruit, yoghurt and nut butter
  - `chicken-sandwich`: sourdough, shredded chicken, cucumber, tomatoes
  - `burrito-bowl`: rice, black beans, sweetcorn, chicken, pickled red onion, sauerkraut
  - Tag them `Breakfast` or `Lunch`, with `status: active`.
- **`src/lib/mealPhotos.ts`:**
  - `ROUTINE_SLUGS` (Overnight oats, Baked oats, Eggs & porridge, Chicken sandwich, Packed lunch → burrito-bowl)
  - `routineRecipe(name, recipes): Recipe | undefined`, matching by slug
- **Tests:** the mapping, and an unknown name giving undefined.

### Task 3: The day pop-up (`DayCard` rewritten as the sheet's content)
- **Breakfast:** a photo card (the routine's hero, or the placeholder), its name, and pills for the three options. A pill sets `routine_choice`, as now.
- **Lunch:**
  - if last night's dinner reheats well and today's lunch is `routine` (not packed, not already reheat):
    - two choice cards: "Leftover {title}" with last night's hero, and "Chicken sandwich" with the sandwich hero
    - the selected card has a green border and a tick
    - selecting one sets `routine_choice`
  - otherwise, one photo card:
    - packed → burrito bowl, labelled "Burrito bowl (packed)"
    - reheat → that recipe's hero
    - otherwise the sandwich
- **Dinner:**
  - a photo card linking to the recipe, showing "{portions} portions · {finish} min"
  - out → greyed, "Out tonight"
  - leftovers night → placeholder, "Leftovers night"
- **More options:**
  - Out tonight: a toggle, using the existing `w.out` (toggling back plans a dinner, through Swap)
  - Friends over ± (`w.guests`)
  - Portions ± (`w.portions`)
  - Swap (opens Task 4)
- **Removed:** Keep, Leftovers, the prep box, and the cooked/verdict/rating rows.
- **`useWeek`:** add `lunch(date, choice)`.
- **Tests:**
  - photo cards render with the recipe image or the placeholder
  - two lunch cards when last night reheats well, one otherwise
  - choosing saves `routine_choice`
  - More options rows work
  - no "Mark cooked" or prep box

### Task 4: Swipe-to-swap
- **`SwapStack.tsx`:** a full-screen dialog with a stack of up to 5 alternatives (`plannerAlternatives(..., n=5)` → `w.alternatives(date, 5)`).
- **Each card:** the hero (or placeholder), the title and the reason.
- **Choosing and skipping:**
  - ✓ and ✕ buttons
  - pointer drag: horizontal over 110px chooses (right) or skips (left); a mostly-vertical drag is ignored (|dy| > |dx|)
- **At the end:** "Browse all recipes" opens a search box and a list of all meals. Picking one swaps.
- **Escape and × close it.**
- **Tests:**
  - ✓ swaps to the first card (`saveSlots` with that `recipe_id`, locked)
  - ✕ moves to the next card
  - a drag right of 150px with dy 10 chooses
  - a drag of dx 150 with dy 300 does nothing
  - browse search picks a recipe

### Task 5: "How was last night's …?" card
- **`useWeek`:**
  - `lastNight`: the dinner slot dated yesterday (London) from this week or next. Or today's, after 8pm. It must be `mode cook`, with a recipe, where `portions_verdict` is null or the recipe's `rating` is null, and not dismissed (localStorage `ffp.fb.<slotId>`).
  - `feedback(v)` saves the verdict, and `cooked_at` if empty, to that slot through `repo.saveSlots`, updating whichever week holds it.
  - `rate` already exists; a 👍 also starts `makeStepPhotos`, as before.
- **`FeedbackCard.tsx`:**
  - the hero thumbnail, "How was last night's {title}?", portions pills, and 👍 / 👎
  - × dismisses
  - when both are answered, it says "Thanks" (and "Step photos are on their way" for 👍) and then hides
- **Shown** at the top of WeekView, whichever week tab is open.
- **Tests:**
  - shown for yesterday's dinner while viewing next week
  - the answers save to that slot
  - 👍 starts photos
  - × hides it and stays hidden after a reload (localStorage)
  - not shown when both are already answered, or when last night was out

### Final
- Update the spec (§6 Home and day sheet, no Mark cooked, swipe swap).
- Run the full suite and the build.
- One fresh review.
- Live steps:
  - seed the routines (`npm run seed:recipes`)
  - the owner taps Recipes → Make photos to make the missing heroes (about 3p each)
  - push
