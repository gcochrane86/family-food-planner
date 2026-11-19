# Ad-hoc plan and shop (short design)

**Why:** someone pops to the shops for an unplanned lunch or a dinner swap. Today they write their own list, since
adding meals to the week would mix them into the weekly shop. Instead, they should pick the meals in the app and get a
list just for that trip: in aisle order, checked against the pantry, with the weekly plan and its shop left alone.

**Goals**
- Settings has a switch: **Plan** (the normal week) or **Ad-hoc**. It's per phone (stored on the device), so one
  person can be in Ad-hoc while the other stays on the week. Either phone can switch to Ad-hoc and see the same
  ad-hoc plan: it's shared household data.
- In Ad-hoc:
  - The Week tab becomes **Plan**. It's a list of the trip's meals, with no days, grouped as Lunch and Dinner. Tapping a
    meal opens its recipe, where Cook works as it does now. Each meal has a remove button, there's an "Add a meal" button (pick a recipe, as lunch or dinner), and a "Clear the
    plan" button for when the trip's done.
  - The Recipes tab has "Add to plan" on a recipe, which adds it to the ad-hoc plan.
  - Shop shows only the ad-hoc plan's list. It has the same aisle order, the same "Check the cupboard" step (it's the
    same kitchen, so the pantry counts) and the same ticking. The Spar list stays as it is.
  - No weekly basics on the ad-hoc shop. The weekly shop covers those.
  - **Add an item:** a box on the ad-hoc shop for anything that isn't in a meal (toothpaste, bin bags, a bag of
    apples). It goes in with the rest, sorted into its aisle, and ticks off like any other line. Clearing the plan
    clears these too.
  - **A new aisle, "Toiletries & household"** (a builder's call on where it goes): it comes before Frozen, so frozen
    is still last. It's for toothpaste, shampoo, soap, nappies, wipes, washing-up liquid, bin bags, foil and the
    like. It's used on the weekly shop too, so nothing else moves. Anything the word lists don't know goes under
    Everything else, as now.
- The real week is untouched: its meals, its shop, its ticks, Sainsbury's and Cookidoo. Switching back to Plan shows
  it exactly as it was.

**Non-goals**
- Sainsbury's basket, Cookidoo sync, Claude planning, or Balance for the ad-hoc plan.
- Changing the week when a dinner is swapped. The household swaps it on the Week tab themselves if they want Today to
  follow it.
- Today belongs to the week (it opens from the Week tab), so it isn't part of Ad-hoc. Switching back to Plan brings
  it back, still following the real week. Pantry is the same in both.

**Approaches**
- Considered:
  - an ad-hoc plan stored like a week, flagged and with no real date
  - a new trip-list table with its own list builder
  - saving the trip only on the phone
- Picked the first. Shop already builds its list from a plan, so aisle order, the cupboard check and ticking come for
  free, and the plan is shared so either phone can see it. The second would rebuild the list-making a second time. The
  third couldn't be seen from the other phone and could be lost.

**The how, as decided**
- One new migration. Builder's call, made while planning: the ad-hoc meals, added items and their ticks get three
  small household tables of their own, rather than a flagged row in `plan_weeks`. A week allows one dinner per date,
  and many things read weeks by date (Today, propose-week, Cookidoo, the basket runs), so separate tables mean none
  of them can pick the ad-hoc plan up. The list itself is still made by the same code as the weekly shop.

**Left to the builder**
- The household word list, with tests.
- The exact wording, and the tests.
