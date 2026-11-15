# Per-person macros and targets

Agreed with the owner on 15 Nov 2026. This builds on the daily balance
(`2026-11-15-balance-snacks-design.md`).

## Why

The Mediterranean markers say whether a day is broadly right. The owner also wants each person's actual numbers:
calories, protein, fat, carbohydrate, sugars and fibre. Seeing those against each person's own targets lets them
adjust each person's day with snacks.

## Goals

1. **Fuller estimates.** Every recipe and routine estimate (per portion, worked out from the ingredients) gains
   `kcal`, `fat_g`, `sat_fat_g`, `carbs_g`, `sugars_g` and `salt_g`, alongside the existing protein, fibre,
   veg/fruit portions and flags. Claude re-estimates the library once from the Mac. New recipes and `save_nutrition`
   carry the full set.
2. **Each person's day.** For each household member, the day adds up:
   - each meal they eat × their portion share (Settings → Household, for example 1.25 for an adult and 0.5 for the
     toddler);
   - one portion of each snack they have. The toddler only has toddler-friendly snacks.

   Breakfasts and home lunches without recipes use their routine estimates in the same way.
3. **Targets.** Each member gets daily targets in Settings → Household: calories, protein, fat, carbohydrate,
   sugars and fibre. The owner sets them. Any target left empty just isn't compared. Protein and fibre are "at
   least", sugars and saturated fat "at most", and calories, fat and carbs "about" (within 10%).
4. **The day sheet** gets a table with a column for each person and a row for each number. Each cell shows the
   amount and its target ("62 / 90g"), marked under, about right or over. A day with an unknown part (a night out,
   a meal without an estimate) shows its totals as "at least", not as low.
5. **The day tile** gets one short line about the people who are off target, for example "Under protein: 2 ·
   Over sugar: 1" (counts, no names), only when something is off.
6. **Claude's planning** gets each person's day and their targets from the built-in proposal, so it can aim snacks
   at each person's gaps and say per person what a snack fixes.

## Calls made without the owner (theirs to change)

- The Mediterranean markers stay, beside the table.
- The toddler eats their share of every meal. A different meal for one person on a given day isn't modelled yet.
- No names in the repository. People are shown by their names from the household list in the app.

## Non-goals

- Logging what was actually eaten.
- Micronutrients beyond salt and saturated fat.
- Suggesting targets. The owner sets them.

## How it works (decided)

- **Migration 0024:** `members.targets jsonb`
  (`{ kcal?, protein_g?, fat_g?, sat_fat_g?, carbs_g?, sugars_g?, fibre_g? }`).
- **`balance.ts`:** the `Nutrition` type gains the new numbers as optional, so old estimates still parse.
  - `personDay(date, slots, recipes, routines, member, opts)` gives the totals for one person, and which parts are
    unknown.
  - `compareTargets(totals, targets)` gives each number's state.
- **Settings → Household:** a Targets section for each person.
- **Connector:** `builtInBalance` gains `people: [{ name, totals, targets, off: [...] }]`. `save_nutrition` and the
  seed accept the new fields.

## Left to the builder

- The table's exact layout on a phone (six rows, up to four columns).
- The colours for under and over.
