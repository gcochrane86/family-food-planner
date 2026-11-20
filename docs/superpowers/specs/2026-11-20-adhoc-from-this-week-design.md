# Ad-hoc: add meals from this week (short design)

**Why:** when the week slips (a meal missed and cooked later), the shop for the rest of the week shouldn't buy
everything again. Pick the week's meals you're still cooking, add any others, and get a list of just their
ingredients. Approved 20 Nov 2026, built on the ad-hoc plan (`2026-11-19-adhoc-plan-design.md`).

**Approaches:** a "just these meals" option inside the weekly shop (so a Sainsbury's basket could be filled from it),
or a "From this week" picker on the ad-hoc Plan. The owner picked the ad-hoc picker: it's for a trip to the shop, and
ad-hoc already makes the list, checks the pantry and takes extra meals and items.

**Design**
- The ad-hoc Plan gets a "From this week" button beside "Add a meal".
- It lists this week's (Monday to Sunday) lunches and dinners cooked from a recipe, by day, e.g.
  "Thu · Chicken traybake · 4 portions", each with a tick box. Ones already in the ad-hoc plan (same recipe and
  meal) show as added and can't be ticked.
- "Add N to the plan" adds each ticked meal as lunch or dinner (its slot in the week) at the week's portions.
- The weekly plan, its shop, its ticks and Sainsbury's are untouched. No database change.

**Builder's calls (shown to the owner)**
- The whole week shows, not just from today, so a missed Monday meal is there.
- Only meals cooked from a recipe: leftovers, eating out and reheats have nothing to buy.
- A roast adds its main recipe, not its sides.
- No plan this week: "There's no plan for this week."
- Portions are the slot's own (the household's if the slot has none). Extra cooked for a next-day leftover lunch isn't
  added; add the lunch meal too if needed.
