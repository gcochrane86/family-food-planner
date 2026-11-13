# Family Food Planner — Spec

*Draft v1 · 15 Oct 2026*

A meal-planning web app for a household of two adults and a toddler. It plans the week's meals, keeps track of the pantry, builds the Sainsbury's shopping list, cuts waste by planning meals around leftovers, and sends recipes to Cookidoo for the TM7.

---

## 1. Goals

1. **A calendar on the home page.** Each day shows breakfast, lunch and dinner, plus an **8pm prep** row for the work done the night before.
2. **Little thinking needed.** Breakfasts and lunches run on routines. You choose 3 anchor dinners (4 in a 7-day week) and the app fills the rest.
3. **Very little waste.** The other dinners are chosen to use up leftovers from the anchors and to make the most of Sainsbury's offers. Anything still left over gets a snack or lunch suggestion.
4. **The pantry looks after itself.** It updates from deliveries and from meals marked as cooked, not from manual stocktakes.
5. **Weeknights stay easy.** Dinner takes about 30 minutes, with the heavier work moved to 8pm the night before.
6. **Food made from scratch.** Ultra-processed ingredients are kept to a minimum, and house rules swap them out automatically.
7. **Shopping is done for you.** Claude fills the Sainsbury's basket and **you do the checkout**.
8. **Recipes reach the Thermomix.** They are sent to Cookidoo's Created Recipes so they show up on the TM7.

**Out of scope for now:** native iOS app, nutrition targets, budget tracking beyond weekly totals, other supermarkets.

---

## 2. Architecture

```
 iPhone / iPad (PWA)  ──►  React app (GitHub Pages)  ──►  Supabase
                                                      (Postgres, Auth, Storage,
                                                       Edge Functions ──► Claude API)
                                                           ▲
                    ┌──────────────────────────────────────┤
                    │                                      │
          Claude: weekly planning run            Claude in Chrome (your browser)
          - scheduled task, Fridays              - Sainsbury's: prices, offers,
          - reads/writes Supabase                  basket fill, slot check,
          - runs the optimiser scripts             order confirmations
          - picks / writes recipes               - Cookidoo: Created Recipes + My Week
```

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + Tailwind, a static, installable **PWA** | One codebase for phone and iPad, no App Store, home-screen icon. On the iPad the screen stays on while the app is open (wake lock, iOS 18.4+); phones only in cook mode. Photos: each has a 1000px copy beside it (`…-sm.jpg`) that every sized view loads, since Supabase's resizing isn't on this project (11 Nov 2026); a device that finds one missing shows the original and makes the copy, and `npm run photos -- small-copies` backfills them. A few seconds after opening, the app keeps every photo's copy on the device |
| Backend | **Supabase** (Postgres, Auth, Storage, Realtime) | Hosted, shared household login, live sync between devices, photo storage. The app talks to it directly; row-level security protects the data |
| Server-side code | **Supabase Edge Functions** | The few things that need secrets or a server: the kitchen assistant (Claude API key), image generation (image API key) and in-app PDF import |
| Hosting | **GitHub Pages**, deployed by a GitHub Actions workflow on every push to `main` | Matches how you already host; free; HTTPS (needed for a PWA) |
| Optimiser | TypeScript module in the repo (`/src/lib/planner`) | Exact, testable arithmetic: pack sizes, leftovers, scoring. Runs in the browser, in scripts and in Edge Functions |
| Judgement | Claude | Choosing recipes, writing new ones, converting HelloFresh cards, judging variety |
| Sainsbury's & Cookidoo | Claude in Chrome, using your logged-in sessions | Neither has a public API |
| Kitchen assistant | Claude API, called from a Supabase Edge Function | Voice/text help inside the app (§10) |

**Secrets and repo visibility.** No secrets go in the repo. The Supabase *anon* key in the app is designed to be public, with row-level security protecting the data. The Claude API key and the Supabase *service* key live only in Edge Function secrets and on your Mac (`.env`, git-ignored). **Personal data, such as recipes, pantry and preferences, lives in Supabase, not in the repo.** Seed data is loaded from a local, git-ignored file, so the repo is safe to make public if you don't have a paid plan for Pages from a private repo.

**Who does what.** The code handles quantities: what to buy, which pack, what's left over, the score for each candidate. Claude handles taste and judgement: whether a meal fits the week, writing a new recipe when the library has nothing that uses the leftovers, and converting recipes into your format.

**How Claude runs.** The repo has a `CLAUDE.md` playbook (the steps of the weekly run) and scripts such as `npm run plan:week` and `npm run list:build`. A Claude desktop scheduled task starts the run on Friday. Claude in Chrome needs your Mac awake with Chrome open. If it isn't, the run finishes the plan and the list, and the basket fill waits until you start it.

---

## 3. Household profile (seed data)

### Members and portions
| Member | Type | Portion weight | Notes |
|---|---|---|---|
| You | Adult | 1.25 | Office every Monday, some Wednesdays |
| Partner | Adult | 1.25 | Home every day |
| Toddler (18 months) | Child | 0.5 | Home for every meal; weight is reviewed as they grow |

**Household dinner = 3.0 standard portions.** The weights adjust from after-meal feedback (see §9).

### Weekly rhythm
- **Monday (office, always):** overnight oats for breakfast; a homemade wrap or a **burrito-style bowl** for lunch; a quick dinner.
- **The bowl** (a healthy Chipotle-style bowl, built from components and packed at Sunday's 8pm prep):

  | Part | Default | Notes |
  |---|---|---|
  | Base | Basmati rice (a staple) | Cooked in the TM7 simmering basket |
  | Protein | Chicken, from the Sunday batch or the week's leftover chicken | Aim for about 30g protein per bowl, together with the beans |
  | Beans | Black beans (a staple) | Rinsed; can be warmed with cumin and smoked paprika |
  | Veg | Sweetcorn (tinned with no added sugar, or frozen) | Plus any salad veg that needs using |
  | Pickles | **Homemade pickled red onions**, sauerkraut | The onions are made in batches (apple cider vinegar, keeps about 2 weeks) and are shared with the tacos. Sauerkraut: raw, live, no additives |
  | Sauce | Greek yoghurt and lime, or chipotle yoghurt (TM7) | Packed separately |

  - **Leftover-friendly:** the bowl is a good home for odds and ends: half a pepper, the last of the spinach, extra chicken. The optimiser treats it as a flexible "use it up" lunch on other days too.
  - **Toddler version:** no sauerkraut (it's salty); beans lightly mashed; plain yoghurt.
- **Wednesday (office, sometimes):** off by default. The weekly check asks about it. If you're in, you get a packed lunch from Tuesday's dinner and a quick dinner.
- **Weekday dinners:** about 30 minutes at dinner time. Longer work goes in the 8pm prep the night before.
- **Weekends:** flexible, with no time limit. Hosting and eating-out options are available.
- **Plan length:** chosen each week, **5 days** (Mon–Fri) or **7 days**.

### Food preferences (house rules)
| Rule | Effect |
|---|---|
| Made from scratch, minimal UPF | When choosing Sainsbury's products, prefer the shortest ingredient lists; flag UPF ingredients in imported recipes |
| Wraps are homemade, never bought | Tortillas, wraps and taco shells → a homemade flatbread component (flour + Greek yoghurt) |
| Cream is made in the TM7 | Cream → butter + milk on the shopping list, plus a "TM7 cream" sub-step |
| Yoghurt is always Greek | Any yoghurt → Greek yoghurt |
| Meat + veg + basic carb + a sauce made from scratch | The default shape of a dinner; sauces made in the TM7 or a pan, ahead of time where possible |
| Reheatable recipes cooked at 6 portions | One cook covers a dinner plus lunches (or a second dinner) |
| 8pm prep is fine | Steps can move to the evening before |
| No allergies | — |
| Toddler | Recipes are tagged *toddler OK* or come with a *toddler note* (e.g. "take out a portion before the chilli flakes go in") |
| Toddler salt: limited, a little for flavour is fine | Every recipe stores **salt per portion**, and the planner counts the toddler's salt across the day. The NHS guideline for ages 1–3 is about 2g a day, so main meals aim for roughly **0.5g or less in the toddler portion**. Recipes over that are adjusted rather than excluded: **cook with less salt and season the adult plates at the table**, use low-sodium soy and stock, and go easy on salty extras (stock cubes, cheese, cured meat). Where salt does a job in the recipe (e.g. binding the doner meat), keep the minimum that works and say so on the card |

### Breakfast (a pool, not fixed days)
Breakfast moves between three options, plus Monday's fixed one:

| Option | Main | Served with |
|---|---|---|
| **Boiled eggs** | **2 eggs per adult, 1 for the toddler** (5 per breakfast) | — (soldiers or toast to confirm) |
| **Porridge** | Oats + milk | Fruit, Greek yoghurt, peanut or almond butter |
| **Baked oats** | 4 eggs, 1 banana, cinnamon, oat flour (oats milled in the TM7) **added until it reaches batter consistency**, since egg sizes vary | Greek yoghurt, fruit, nut butter |
| **Overnight oats** (Monday, fixed) | Oats, milk/yoghurt, made at Sunday's 8pm prep | Fruit |

- **Planned rotation (decided 16 Oct 2026):** office days get **overnight oats** (made at 8pm the night before, shown in that evening's prep); other days alternate **baked oats** and **eggs & porridge** (eggs and porridge are one breakfast). The day sheet offers all three, with the planned one highlighted; tap another to record what you actually had.
- **Shopping covers a week of breakfasts** using the mix you've actually had (starting at one third each). Over time it learns the split, e.g. more baked oats at weekends.
- **Baked oats can be made at 8pm the night before**, and they're a good use for spare bananas and eggs. The leftover optimiser counts bananas that are going brown as baked-oats ingredients before suggesting a snack.
- **Nut butter house rule:** prefer 100%-nut butters (no palm oil or added sugar). Or make almond butter in the TM7, since almonds are already bought for the honey chilli chicken.
- **Toddler:** eggs fully cooked, nut butter smooth and spread thinly (never whole nuts), fruit cut to a safe size.
- **Baked oats card:** the oat flour step reads "add gradually until it's a thick batter" rather than giving a fixed weight. **Ingredients with an approximate quantity** like this have a `qty_approx` flag. For shopping they use an estimate (starting at about 100g of oats per batch), corrected over time by how fast the oats bag actually runs down in the pantry.
- **Eggs are counted:** boiled-egg mornings use 5 eggs and baked-oats mornings use 4, on top of eggs used in dinners. The weekly egg order is worked out from the breakfast mix plus the dinner recipes.
- **To confirm:** whether one batch of baked oats feeds all three of you, and what goes with the boiled eggs.

### Home lunch (a pool, leftovers first)
*Proof of concept (16 Oct 2026):* each home lunch shows a suggestion: "Leftover <last night's dinner>, or a chicken sandwich" when that dinner reheats well, otherwise "Chicken sandwich on sourdough". Sandwich chicken is a weekly basic (600g chicken breast, split across both deliveries). The fuller version below comes later.

The planner fills each home lunch in this order:
1. **Leftovers** from a 6-portion dinner (the usual case, through "cook extra")
2. **Chicken sandwich**
3. **Soup**, always with enough protein (see below)

**Chicken for sandwiches:**
- It comes from the week's chicken shop, not a separate pack. The pack-size maths already leaves extra (e.g. the 300g left over in the example week), so the optimiser counts sandwich chicken as one way to use it.
- When there isn't any leftover, a **batch of poached or APO-steamed chicken breast** goes into the Sunday 8pm prep. Sliced, it keeps for 3 days.
- **Bread: a bought sourdough loaf.**
  - **Product choice:** a real sourdough (flour, water, salt, starter) is preferred over "sourdough-style" loaves with yeast and additives. Product matching checks the ingredient list.
  - **Freshness:** a loaf lasts about 3–4 days, so one comes in **each** delivery (Sunday and Tuesday) when sandwiches are planned. Any half that won't be used in time is **sliced and frozen**, which the app reminds you about. Toast and boiled-egg soldiers use the frozen slices.
  - **Quantity:** worked out from the sandwich lunches and boiled-egg breakfasts in the plan, not a fixed loaf a week.

**Soup with enough protein:**
- Every soup recipe stores **protein per portion**. A soup only counts as a full lunch if it reaches **about 25g protein per adult portion** (a setting you can change).
- **Below that, the planner adds protein automatically,** choosing from what's in the pantry:
  - **blended in:** white beans, chickpeas or red lentils (chickpeas are already a staple); silky, and good for the toddler too
  - **stirred through:** shredded chicken, or a spoon of Greek yoghurt
  - **on the side:** a boiled egg, or half a chicken sandwich
- The recipe card shows the protein total, e.g. *"Roasted tomato soup · 9g → 27g protein with 1 tin of chickpeas blended in"*.
- **Soups are batch-cooked in the TM7 and frozen** in portions, so a soup lunch is reheat-only. Freezer soups count as `prepared_items`.

**Toddler:** soups are blended smooth and seasoned less; sandwich chicken is cut into strips.

### Kitchen
| Equipment | Used for |
|---|---|
| **Thermomix TM7** | Sauces, chopping, milling, dough, rice (simmering basket), cream, emulsifying meat |
| **Anova Precision Oven (APO)** | Steam, sous-vide-style velveting, roasting |
| **HY 24L rotisserie air-fryer oven** | Rotisserie basket, spit, air-frying, reheating office lunches |
| **MEATER 2 Plus** | Probe targets (e.g. 74°C) |
| Frying pans, saucepans | Hob steps |

The kitchen list is stored as data (§4 `equipment`). It decides which recipes are possible and which machine each step uses.

**Changed 17 Oct 2026 (owner's choice):** the Friday menu no longer plans a "cook once, eat twice" dinner or a Sunday leftovers night. Every night gets a dinner at the household's portions; office days still get a packed lunch and overnight oats. Leftovers or freezer nights and extra portions are added by hand in the day sheet. **Leftover lunches:** a dinner that reheats well (the Reheats well tick on the recipe) also makes the next day's lunch — packed on an office day, the default pick at home — and the shopping list and Cookidoo portions include it; picking another lunch takes the extra off.

### Shopping model and the flavour pantry (17 Oct 2026)
The two weekly Sainsbury's shops buy **fresh meat and vegetables** (plus any staple marked *out* that a recipe needs). Flavour comes from a from-scratch pantry, in the spirit of Ethan Chlebowski's Cook Well:
- **Cupboard:** grains, tins, oils, vinegars, umami, nuts and whole spices.
- **Fridge:** dairy, pickles and one homemade sauce on the go.
- **Freezer:** batch pastes, stock paste, cooked beans and meat, plain frozen veg and fruit.

Recipes are reworked over time to draw on this list.

### Pantry staples (from your list)
Cumin, coriander seeds, garlic granules, soy sauce, olive oil, apple cider vinegar, eggs, tinned tomatoes, tomato purée, red wine vinegar, red wine, white wine, beef stock, chicken stock, balsamic vinegar, dates, sea salt, Dijon mustard, onion powder, paprika, turmeric, chilli flakes, basmati rice, chickpeas, black beans.

Staples are tracked as **have / low / out**, not by weight. Eggs and rice are the exceptions and are counted, because recipes use them in bulk.

*To confirm:* flour (plain / self-raising), butter, milk, oats, honey, Greek yoghurt, cornflour, almonds, black pepper, dried oregano, dried mint.

---

## 4. Data model (Supabase / Postgres)

Every table has `household_id` and row-level security, so only your household can read or write its data.

### Household and settings
- **households** — `id, name`
- **members** — `household_id, name, kind (adult|child), birthdate, portion_weight`
- **member_week_pattern** — `member_id, weekday, office (bool)`
- **settings** — one JSON row: `weekday_dinner_max_min (30)`, `default_plan_days (5|7)`, `shops_per_week (1|2)`, `delivery_slots [{day, start, end}]`, `delivery_pass (bool)`, `use_nectar (bool)`, `adventure (new recipes per week)`
- **house_rules** — `id, kind (substitute|prefer|avoid), match (ingredient/category), replacement (ingredient or component recipe), note`
- **equipment** — `id, name, code (tm7|apo|hy24|meater|hob|pan|saucepan), capabilities (json)`

### Ingredients and products
- **ingredients** — canonical: `name, category, default_unit (g|ml|each), fridge_days, freezer_ok, is_staple, perishability (1–5), icon_url`
- **products** — Sainsbury's items: `sainsburys_id, name, ingredient_id, pack_qty, pack_unit, price, unit_price, offer_price, offer_text, offer_ends, nectar_price, ingredient_count (UPF signal), last_seen_at`

### Recipes
- **recipes** — `title, subtitle, kind (meal|component), component_role (sauce|protein|veg|carb|bread|null), source (hellofresh|own_doc|claude|cookidoo|web), source_url, base_portions, reheats_well, freezes_well, toddler_ok, toddler_note, prep_minutes (8pm), finish_minutes, passive_minutes, hero_image, hero_image_source (generated|hellofresh|own), nutrition (json), allergens[], tags[], status (draft|active|archived), cookidoo_status (none|sent|outdated), cookidoo_url`
- **recipe_parts** — `meal_id, component_id, multiplier` (lets a meal be built from a sauce + protein + veg + carb)
- **recipe_ingredients** — `recipe_id, ingredient_id, qty, unit, group ("The Sauce", "The Coating"), prep_note, optional, qty_approx (bool: "add until it looks right"; qty is the shopping estimate)`
- **recipe_steps** — `recipe_id, phase (prep_8pm|finish|reheat), position, title, body (ingredient names marked for bold), image (null = show ingredient icons), image_source (hellofresh|own), machine (tm7|apo|hy24|hob|oven|none), settings (json), active_min, passive_min`
  - `settings` example for the TM7: `{time:"12 min", temp:"Varoma", speed:2, reverse:false, mc_off:true}`
  - for the APO: `{temp:65, steam:100, time:"15 min"}`
  - for the HY 24L: `{temp:180, mode:"rotisserie", time:"18 min", basket:"rotisserie"}`
  - for the MEATER: `{target:74}`
- **recipe_equipment** — `recipe_id, equipment_id`
- **recipe_ratings** — `recipe_id, member_id, would_make_again, notes, created_at`

### Pantry
- **pantry_items** — `ingredient_id, qty, unit, location (fridge|freezer|cupboard), use_by, staple_status (have|low|out), source (order_id|cooked_leftover|manual)`
- **prepared_items** — cooked things in the fridge or freezer: `recipe_id, portions, made_on, use_by, location` (e.g. "honey chilli sauce, 1 jar"; "doner meat, 3 portions")

### Planning
- **plan_weeks** — `week_start (Mon), days (5|7), status (draft|approved|ordered|in_progress|done), notes`
- **meal_slots** additions: `locked (bool)`, `guests (int)`, and `mode` gains `leftovers`
- **settings.balance**: `{chicken: 2, fish: 1, red_meat: 1, veggie: 1}`, plus `no_repeat_days: 14`
- **recipes.protein**: `chicken|fish|red_meat|veggie|egg|other`, used by the balance rules
- **week_overrides** — this week only: `date, member_id, office (bool)`, events (`hosting +N`, `eating_out`, `busy_evening`)
- **meal_slots** — `date, slot (breakfast|lunch|dinner|prep_8pm|snack), recipe_id | routine_id | prepared_item_id, mode (cook|reheat|leftover|routine|packed|eating_out|hosting|freezer), portions, for_members[], is_anchor, reason (why the planner chose it), status (planned|done|skipped)`
- **routines** — `weekday (or null = any day), slot, name, recipe_id, kind (fixed|pool)` (e.g. Monday breakfast = overnight oats, fixed; Tue–Sun breakfast = pool of eggs / porridge / baked oats)
- **routine_usage** — `date, slot, routine_id` (which pool option was actually eaten; sets future shopping quantities)

### Shopping
- **shopping_lists** — `plan_week_id, delivery (sun|tue), slot_date, status (draft|basket_filled|ordered|delivered)`
- **shopping_list_items** — `ingredient_id, qty_needed, product_id, packs, est_cost, needed_by (date), reason, status (to_add|added|unavailable|substituted)`
- **orders** — `sainsburys_order_no, delivery_slot, total, delivery_charge, status, delivered_at`
- **order_items** — `product_id, qty, substituted_product_id, missing (bool), price_paid, decision (accepted|reject_at_door|pending)`
- **slot_adjustments** — this week's changes to a planned meal: `meal_slot_id, kind (swap|qty|step_note), from_ingredient_id, to_ingredient_id, qty, unit, step_position, note, source (substitution|assistant|manual)`
- **quick_shop_items** — the Spar list: `ingredient_id, qty, unit, needed_by, for_meal_slot_id, reason, status (to_get|got|skipped)`

### Feedback
- **meal_feedback** — `meal_slot_id, portions_verdict (not_enough|right|leftovers), leftover_portions, rating, notes`
- **recipes.rating** (`up` | `down`, with `rated_at`): the "Have it again?" answer after cooking. `up` gets step photos; `down` keeps the recipe out of proposals and swap suggestions (it can still be chosen by hand, and Undo on the recipe clears it). **recipe_steps.image_source** (`own` | `generated`) says where a step photo came from.

---

## 5. Recipe format

The layout comes from HelloFresh; the structure comes from your Google Docs recipes.

**Recipe card (screen and printable A4 PDF):**
1. **Header:** title, subtitle, hero photo, tags (*TM7 · Make-ahead · Reheats well · Toddler OK*), and three times: **8pm prep · Dinner finish · Hands-off**
2. **Ingredients:** a picture grid, grouped as your Docs do it ("The Sauce", "The Coating"…). A scaling table shows **your household (3.0) / 6 portions / custom**. Each item is labelled *From pantry* or *To buy*.
3. **You'll need:** the actual machines and pans, taken from your kitchen list.
4. **Phase 1, 8pm prep (the night before):** numbered steps, each showing that step's ingredient icons (or your own photo, once you've added one) and a machine badge, e.g. `TM7 · 12 min · Varoma · Speed 2 · MC off`
5. **Phase 2, dinner-time finish:** steps in two columns on the iPad (machine work alongside hob or hand work), with a timeline:
   ```
   0 min   TM7: rice 20 min / 100°C / speed 4
   2 min   HY 24L: chicken, rotisserie 180°C / 18 min
   12 min  HY 24L: add peppers + onions; sauce jar on bottom tray
   20 min  Toss and serve
   ```
6. **Machine settings summary:** a table of every machine setting, as in your Docs.
7. **Reheating for the office:** how to store it and how to reheat it.
8. **Toddler note.**
9. **Nutrition per portion and allergens.**

**Importing:**
- **HelloFresh PDFs:** extract the ingredients for 2P/3P/4P, the steps and the photos. Then convert the recipe into the two phases, move suitable steps to the TM7, APO or HY 24L, and apply the house rules (e.g. taco shells → homemade flatbreads; mayo → TM7 mayo). The original is kept as a reference.
- **Your Google Docs recipes:** already in the right format. Parse them; images come from the generation step below.
- **New recipes (written by Claude):** use the same format; they start as `draft` until you've cooked and rated them.

**Images:**
| Image | Source |
|---|---|
| **Hero photo** (1 per recipe) | **AI-generated** when a recipe is saved without one: a plated photo in a consistent house style (natural light, overhead or 45°, the same kind of plates and table). HelloFresh imports keep their original hero photo |
| **Ingredient icons** | **AI-generated once per ingredient**, in one consistent style (a single item on a plain background, like the HelloFresh grid), then reused in every recipe |
| **Step photos** | **AI-made only for recipes you like** (decided 16 Oct 2026, after a test on the chickpea curry). After you mark a dinner cooked and answer "Have it again?" with 👍, each step gets a photo, one at a time, using the hero photo as the style reference. They're **close-ups of the food only**: shots showing the TM7 drew the machine wrong. Each prompt names just the ingredients added so far. A 👎 recipe never gets them. **Your own photo always wins:** "Add photo" in cook mode replaces a generated one, and a generated one never replaces yours. Each step can have your own one-sentence description of what its photo should show; it replaces the automatic description and is saved with the step. In cook mode, ⚙︎ → "Make a new photo ✨" does one step (with a description box, the cost, and progress while it works); it can replace your own photo after a warning. Cook mode also moves between steps with a swipe. For a recipe already in the library, "Add step photos ✨" in the ⚙︎ menu makes them without a 👍, after showing the number of photos and a rough cost (about 3p each). To remake them, use "New step photos ✨" in the recipe's ⚙︎ settings menu (next to "New main photo ✨" and "Print"). A few pence a photo, within the £5/month Google cap; a run stops at the first failure. |

- **How it works:** a `generate-images` Edge Function calls **Google's Gemini image API** (key from Google AI Studio, stored only as the Edge Function secret `GOOGLE_AI_API_KEY`), stores the result in Supabase Storage, and saves where each image came from. Regenerating a hero image is one tap ("try another").
- **Prompts** are built from the recipe title, its main ingredients and the house style, so a whole library looks like one set.
- **Cost:** a few pence per image. Ingredient icons are a one-off; after the initial library, it's roughly one hero image per new recipe.
- **Marking:** generated images get a small ✨ marker, so it's clear the dish might look a bit different in real life.

**Initial library:** your 9 recipes, plus about 20 new ones built around **combinable components**: around 8 TM7 sauces, 6 proteins and 6 veg/carb sides. They're chosen to share ingredients, so the leftover optimiser has plenty of combinations to work with.

---

## 6. Screens

| Screen | Phone | iPad |
|---|---|---|
| **Home: week grid** | A grid of day tiles, 2 across, each with breakfast, lunch and dinner and no tags. An eighth tile shows the week's status (Approve / ✓ Approved), and once approved two ticks: ✓ In Sainsbury's (every delivery filled; otherwise which delivery is filled, filling, waiting or failed) and ✓ In Cookidoo (or waiting / sending / didn't sync, with Try again). Tapping **✓ Approved** opens a pop-up with each delivery's and Cookidoo's status, **Send to Sainsbury's again** per delivery (a delivery never sent links to the Shop tab, where the freezer check is), **Sync Cookidoo again**, and **Back to draft** (after a warning; to change or replan the week, then approve again). Tap a day for a photo-led sheet (since 22 Oct 2026: **one photo per meal, dinner first, then lunch and breakfast**; tap a photo for its recipe, **hold it** (or right-click) for that meal's options in a pop-up, which holds everything below): breakfast as a swipeable row of photo cards from your own breakfast list; a home lunch as a row of photos to pick from (last night's leftovers when it reheats well, then your lunch list, which starts as chicken, roast beef, egg, or tuna & sweetcorn sandwich and a Mexican beef poke bowl; leftovers, else the first on your list, by default). Lunch's sandwiches share one **Sandwich** card and its poke bowls (tuna, Mexican beef, chicken, salmon) one **Poke bowl** card, each suggesting the one you've had least this week; the fillings stay folded away until you tap the card, which opens them underneath (with + Add a filling); tap it again to fold them. Both rows end in a **+** card to add an option (it gets its own small recipe and, if you like, a photo for about 3p), and holding a card (or right-clicking it) offers to remove it from the list; the lists live in household settings and the Friday menu rotates through your breakfasts, and packed or planned reheat lunches as one photo; the dinner photo (tap for the recipe); and **More options**: Out tonight, Friends over ±, Portions ±, **Swap**, **Move to another day** (trade dinners with another night, e.g. when the night before isn't free for the prep) (a full-screen stack of the best-fitting ideas: swipe right to choose, left to skip, ✓/✕ buttons, then Browse all recipes). There's no Mark cooked: a **"How was last night's …?"** card at the top asks for portions and 👍/👎 the next time you open the app (× dismisses it) | Same, 4 across in landscape; the day opens as a centred card |
| **This week (planning wizard)** | Step by step | Same |
| **Plan review** | List of suggested meals, each with its reason | Calendar with suggestions highlighted |
| **Recipe library** | Search (title, subtitle, tags) and filters (TM7, ≤30 min, make-ahead, toddler OK, uses X). **Add recipe**: paste a recipe page's link (and an optional note, e.g. "no mushrooms"); Claude on the owner's Mac converts it within about 15 minutes, scaled to the household and rewritten for its equipment (`docs/playbooks/recipe-import.md`). The link shows as waiting / converting / ✓ added (Open recipe) / couldn't add (Try again) until dismissed. Web recipes link back to the original page. Main photos carry no AI label | Grid |
| **Recipe card** | Scrolling card. ⚙︎ → **Edit recipe** changes it by hand (title, times, ingredients, and each step's text, timing phase, machine, settings and timer; renamed steps keep their photos); ⚙︎ → **Rework with Claude ✨** sends a bigger change in your own words ("use the Anova for the chicken instead of the TM7") to the scheduled task on the Mac, which rewrites the recipe within about 15 minutes and shows what changed on the card. Edits to a recipe in Cookidoo trigger a Cookidoo update. Steps read as one method in cooking order; a **Prep ahead** switch (remembered per device) splits them into "The night before" and "On the night" when a recipe has steps that can be done ahead. Cook mode follows the same switch | Full card, print / PDF |
| **Cook mode** | — | One step at a time, large text, timers, machine badges, screen stays on. Each step lists **For this step**: the ingredients its method names in bold, with amounts scaled to the portions picked on the recipe (the roast cook view scales each part to the people eating); made parts like "the sauce" aren't listed |
| **Pantry** | **Freezer** (batch portions with made / use-by dates, out-of-date first as "use or bin", − / + and add), **Fridge** and **Cupboard** (staples as have / low / out, plus things you add with an amount), and a "We're out of…" search. Recipes with a part that freezes well (`recipes.batch`) get a day-sheet switch, "Make 4× the curry paste and freeze 3", or "Use curry paste from the freezer (2 left)"; the recipe shows a batch tip on those steps; the next morning's card asks whether the batch went in the freezer. A dinner using a frozen portion leaves that part off the list, so the Shop tab asks **Check the freezer first** (It's there / Not there) before Ready for Sainsbury's, and the basket fill refuses to run until it's answered. The Friday menu prefers, and marks, dinners with portions in the freezer. After a delivery Claude reads the order (My Account → Orders, read only) and updates the pantry | Same |
| **Shopping** | Sunday and Tuesday lists, each with cost, offers used and status. **Ready for Sainsbury's** asks Claude to fill the trolley; afterwards **Fill again (tops up only)**, or **Empty and refill** (after a warning that it removes everything in the trolley, including things added by hand) when the menu or ingredients changed | Same |
| **Your requirements** (Planner specifications) | Day rules: a set dinner on a set day (e.g. fish on Thursday, when the fishmonger's in town); the Friday menu fixes those nights first and balances the rest around them. Other shops: what you buy elsewhere, for a given day's dinner (the fishmonger on Thursday) or any day, and whether only some weeks (the farm shop: a "Going this week?" switch on the Shop tab). Those things come off the Sainsbury's list and the basket fill, and show on the shop's own list on the Shop tab | Same |
| **Build a roast** (Recipes) | Pick beef, chicken or lamb, then the sides as photo cards (beef starts with the household's own: roasties, Yorkshires, mash, honey-citrus carrots, bay parsnips, cauliflower cheese, gravy; the classics are offered adjusted for the Meal specifications: red cabbage, greens & peas, sage & onion stuffing balls instead of pigs in blankets, mint sauce with lamb, horseradish cream with beef, bread sauce with chicken), people and serve time (prep from 08:45 by default). The plan works back from serving: night before, **morning prep at breakfast**, out and about (hands-off only), and a **service countdown of at most 95 minutes**; oven steps share Oven 1 / Oven 2 within 10°C and 3 shelves, Oven 3 warms and grills, the APO holds. It shows each step with its part's photo, a kit timeline and warnings (over-full ovens, hands-on work while you're out). **Add to the week** puts it on a day's dinner; the shopping list buys every part; the Friday menu never picks roast parts or hosting meals itself **Christmas dinner** (a tab, 22 Oct 2026): turkey, glazed ham or both, with the classic sides (turkey takes the sides that suit chicken, ham those that suit beef, until a side names them), cooked over three days: 23 December, Christmas Eve and Christmas Day (parts' steps can be `day2`/`day1` at a clock time). It adds to 25 December once that week is planned. A roast can go on Sunday even on a 5-day week (that Sunday then shows on the week). **Beef cuts** (22 Oct 2026): brisket and silverside are slow-cooked overnight in the APO; ribeye, sirloin and topside roast in the APO to a chosen doneness (rare 50°C, medium rare 54°C, medium 58°C, medium well 63°C, well done 68°C on the MEATER; medium by default), which moves the roast's timing. **Cook view** walks the plan one step at a time in time order, with each part's own method, a timer per step and the screen kept on. | Same |
| **Start fresh** (Settings) | Clears this and next week's plans, the shopping list and the Spar list at once (`start_fresh`), and leaves a request the scheduled tasks pick up: empty the Sainsbury's trolley, and remove the My Week dinners Claude added (only those). Recipes, pantry, staples, settings and Cookidoo recipes stay. Shows how the trolley and My Week clean-up went | Same |
| **Preferences** | Household, week pattern, routines, kitchen, house rules, shopping | Same |
| **Import** | Upload a PDF or paste a link | Same |
| **Assistant** | Mic button on every screen; chat sheet | Large mic button in cook mode |

### Day tiles and the day sheet
Tiles show breakfast, lunch and dinner only, with no tags. The night-before prep isn't shown on the week page (the owner's choice, 17 Oct 2026). It lives in each recipe's **Prep ahead** view and in cook mode. Changes happen in the day sheet (see Home above).

### Weekly proposal (Friday 7pm) and review
*Replaces the earlier "What do you fancy this week?" screen (decided 16 Oct 2026).*

**Fresh without reopening (13 Nov 2026):** the Week tab and Today's hour load again quietly whenever the app comes back on screen (from the Claude app, say), and a new version of the app shows a "A new version of the app is ready · Refresh" bar (checked every 30 minutes and on coming back) instead of waiting for the app to be reopened. **Claude plans the week, in the Claude app (13 Nov 2026):** **Plan with Claude** and **Replan with Claude** open the Claude app with the week and note typed in; Claude plans there with the household through the connector (`get_plan_context`, then `save_week_plan`, see §10) and saves a draft to approve here. The Mac's scheduled `week-plan` task is turned off; the 7pm Friday built-in menu stays as the backup. Before that: **Claude plans the week (decided 17 Oct 2026).** **Plan with Claude** on the Week tab (with an optional note, "out Wednesday, use up the lamb") leaves a request that the scheduled task `week-plan` on the owner's Mac picks up within 15 minutes; on Fridays from 6pm it plans next week by itself. Claude chooses the dinners from the Planner and Meal specifications, recipes, freezer, pantry and pack sizes, and may write up to the week's allowed new recipes; the built-in planner fills breakfasts and lunches around them. Claude's summary shows under the week, and each dinner says why. A draft can be **Replan with Claude** (it replaces the draft, after a warning); an approved week never is. **Quick menu** runs the built-in planner straight away (`docs/playbooks/week-plan.md`, `npm run week`).

**Every Friday at 7pm, the built-in planner proposes a menu for next week if it still has none** (the backup when the Mac is off).
- **Runs on Supabase's scheduler** (`pg_cron` calling a `propose-week` Edge Function), so it happens even if no device is on. It uses the planner logic below; no AI call is needed for the basic proposal.
- **Covers next Mon–Sun**, or Mon–Fri when the plan length setting is 5 days.
- **Balance rules** (editable in Settings → Planning):
  - targets per week: about **2 chicken, 1 fish, 1 red meat** (beef, lamb or pork), **1 veggie**; the rest is free
  - never the same protein two nights running
  - quick dinners (within the weekday limit) on office days; longer cooks at weekends
  - one 6-portion "cook once, eat twice" dinner where it fits, to cover lunches
  - prefers recipes that use up leftovers, fit the week's offers (later phases), and haven't been eaten in the last 2 weeks
- **Nudge:** an in-app banner, "Next week's menu is ready". Web push to the home-screen app comes later.

**You review it.** Each night shows the proposed dinner and why it was picked. Actions on any night:

| Action | What happens |
|---|---|
| **✓ Keep** | Locks the meal |
| **Swap** | 3 alternatives that keep the week balanced (e.g. "fish instead: Tuesday is chicken"), or choose any recipe |
| **Out tonight** | Removes the dinner; leftovers it was meant to supply are re-planned |
| **Guests +N** | Rescales the portions and prefers dishes that suit a crowd |
| **Leftovers / freezer** | A night off, using leftovers or something from the freezer |

- **Approve week** fixes the plan, which then builds the shopping list (Phase 3) and syncs Cookidoo (Phase 6).
- **If it's not approved by Saturday 2pm**, you get a reminder, because of the Sunday delivery cut-off.
- **Mid-week changes** (out tonight, guests, swap) use the same actions on the calendar, or the kitchen assistant later.

**Recipe library gap:** balance needs choice. Phase 3 adds about 6 more dinners in the house style (2 fish, 2 beef or pork, 2 veggie, with TM7 sauces and quick weeknight finishes).

## 7. Planning optimiser

### Inputs
Plan days, members, week overrides, anchors, pantry and prepared items, the recipe library (leaving out recipes rated 👎 "Not for us"), product prices and offers, house rules, settings.

### Steps
1. **Lay out the week.** Fill breakfast and lunch from routines. Apply the Monday rules and any office days (packed lunch, quick dinner). Mark Sunday dinner as a "use it up" dinner, because the shop arrives at 7–8pm.
2. **Apply your requests, then place the anchors.** Requests come first and are never overridden: a requested dish goes on its day; a requested protein restricts that day's candidates; people or guests set the portions. Respect the weekday finish limit (30 min) and the 8pm prep the night before. Avoid putting big prep on the night of a late or busy evening.
3. **Expand reheats.** A recipe that reheats well is cooked at 6 portions. The 3.0 household portions left over are allocated, in order, to:
   1. packed office lunches
   2. home lunches for your partner and the toddler
   3. a second dinner later in the week, if it keeps that long

   If none of those fit, a freezer portion.
4. **Work out what's needed.** Add up the ingredients across every planned meal, scaled by portions, then take away the pantry and prepared items.
5. **Round up to packs.** For each ingredient, choose the product combination with the lowest effective cost, counting offers and Nectar if enabled. A bigger pack on offer can win; the extra goes into the leftover pool.
6. **Calculate leftovers.** Leftover = bought + pantry − used, for each ingredient. Each leftover is weighted by perishability and how soon it goes off: `waste_risk = qty_fraction × perishability × urgency`.
7. **Score candidate dinners for the open slots:**
   ```
   score = 3.0 × waste_risk_reduced
         − 1.0 × extra_cost (£)
         + 0.5 × variety (different protein/sauce from the rest of the week)
         + 0.5 × rating_bonus
         + 0.3 × offer_bonus (uses something on offer)
         − hard constraints fail → excluded (time, equipment, house rules)
   ```
   Fill one slot at a time (greedy), recalculating leftovers after each choice. Claude reviews the top 5 for each slot and can write a new recipe or component when nothing scores well.
8. **Use up the rest.** If a perishable leftover is still more than 20% of its pack, suggest a snack, a toddler snack or a lunch add-on (e.g. "200g spinach → spinach & feta muffins, toddler friendly") and place it on the day before it goes off.
9. **Split across the deliveries** (when there are 2 shops a week):
   - Items needed Mon–Wed, plus cupboard, frozen and staple items → **Sunday**
   - Items needed Thu or later with `fridge_days` under 5 → **Tuesday**
   - An offer only available in the Sunday order can pull an item forward if it keeps until it's needed.

   With 1 shop a week, everything goes on Sunday, and step 7 adds a penalty for meals late in the week that need fragile ingredients.

### Output
The meal slots (each with a reason), the shopping lists, the estimated cost and the expected leftovers. These are written to Supabase as a `draft` plan week.

---

## 8. Weekly timeline

| When | Who | What |
|---|---|---|
| **Fri 7pm (scheduled)** | Supabase scheduler | `propose-week` makes a balanced draft menu for next week → banner in the app (later: Claude adds Sainsbury's offers before 7pm) |
| **Fri evening / Sat** | You | Review: keep, swap, out tonight, guests, leftovers → **Approve week** (reminder at Sat 2pm if not approved) |
| **On approval** | Claude (Chrome) | Sync Cookidoo: create or update the week's Created Recipes and add each meal to My Week on its day |
| **Sat** | Claude (Chrome) | Check the Sunday 7–8pm slot is booked; fill the basket for the Sunday list; report anything unavailable and the alternatives chosen |
| **Sat** | **You** | Review the basket and **check out** before the cut-off |
| **Sun 7–8pm** | Delivery | — |
| **Sun & Tue from midday** | Claude | Watch your email for Sainsbury's substitutions → adjust this week's recipes, build the Spar list, ask about anything that breaks a house rule (reject at the door?) |
| **Sun after delivery** | Claude | Read the order confirmation → update the pantry, including substitutions → re-plan if anything is missing |
| **Sun 8pm** | You | Monday prep: overnight oats, flatbreads or bowl components (rice, beans, chicken; pickled onions when the jar runs low), dinner prep |
| **Mon** | Claude | Recheck the plan against feedback and skipped meals → fill the Tuesday basket |
| **Mon** | **You** | Check out the Tuesday order before the cut-off |
| **Tue 7–8pm** | Delivery | Pantry updates |
| **Daily 17:30–18:30** | You | **Today's hour** (Week tab card → `/today`): chop everything first in one session (veg first, raw meat last on its own mat; what keeps for tomorrow goes in a lidded box), then tonight's dinner with tomorrow's prep, any night-before breakfast and tomorrow's lunch fitted into the waits, then plate up, pack the leftovers lunch, wipe down and start the dishwasher. Times, night-before breakfasts and TM7 machines and bowls are in Settings → Today's hour. On weekdays the planner keeps a dinner's hands-on time within the hour less 15 minutes. **Pictures (12 Nov 2026):** each step shows its own photo, else your photo of the machine for a machine-only step (Settings → Kitchen), else the recipe's photo; "Chop all the ingredients below" shows a chopping-board photo per ingredient and cut (`prep_photos`, made once and reused across recipes, remake or use your own); "Add step photos" makes what's missing (about 3p each). No timers in cook mode or Today's hour. **Get it out (12 Nov 2026):** the first page lists everything the hour uses (all of tonight's dinner, everything chopped, and what the extras use), once each with amounts added up, grouped Fridge / Freezer / Cupboard (read from the ingredient's name: frozen → freezer; dry goods, tins, bottles, onions, garlic and potatoes → cupboard; the rest → fridge; water left out). Each has a small cartoon picture on white with its name in a label underneath, made once per ingredient (`prep_photos`, key `icon:<ingredient>`, about 3p, by "Add step photos") and reused; hold one to remake it or use your own; tap one to tick it off as you get it out (it fades with a ✓ and drops to the end of its group; kept on the device for the day). The step pages show the same pictures: each step's ingredients as tiles (name, amount and how it's prepared), and each thing to chop as a tile too (name, weight and cut). **Step pictures are cartoons too (12 Nov 2026):** every recipe step has a thorough picture description (`recipe_steps.photo_hint`, up to 600 characters from migration 0017: every item with its amount, cut and state, which container each is in, raw meat and fish never sharing a container with other food, and what must not appear; written by Claude for all recipes, and a `picture` field on each step when Claude adds or reworks a recipe) naming the one moment of the action, the container and the food's state; the request asks for the same cartoon style on white, with the dish photo used only for what the food looks like. New ones are saved as `steps/cartoon-…`; "Add step photos" in Today's hour redraws older realistic ones (your own photos are kept); recipe main photos stay as photos. The chopping step ("Chop all the ingredients below") gives each thing a plain instruction beside its card, read from the recipe's note ("Cut the new potatoes in half", "Dice the potatoes into 2cm cubes"); the chopping picture has no caption. Every ingredient that needs prepping says how in its note (peel, cut, size), so it reaches the chopping list (12 Nov 2026). Cook mode looks like Today's hour: white, the ingredient cards with their cartoons, settings in °C and °F. The first page is just the hour, what to get out and Start (the chopping list and "to wash" are on the steps); item names sit in plain bold black under each picture. A home lunch with a night-before part (the chicken sandwich: a spatchcocked chicken roasted in the Anova, shredded and chilled) has that part done in the hour the evening before; one roast covers two days running of sandwiches for everyone (`AHEAD_COVERS` in `src/lib/lunchAhead.ts`), so the hour roasts every other sandwich day. The weekly basics buy one whole chicken instead of chicken breast. Swipe left or right to move between steps. Machine settings show °F beside °C (nearest 5°F), large and bold in Today's hour, and in cook mode and on the recipe card. Today's hour has a white background (12 Nov 2026), so the cartoons sit on white; its pop-up menus stay dark. **Chopping pictures are cartoons** in the same style (board, knife and the cut ingredient on white); older realistic ones are redrawn by "Add step photos" (saved as `prep/cartoon-…`; your own photos are kept) |
| **Daily** | You | Tap ✓ cooked (removes the ingredients from the pantry) and give quick portion feedback |

Sainsbury's order-amendment cut-off is usually 11:45pm the night before delivery. **Check the exact cut-off on your account**; the app stores it in settings.

---

## 9. Pantry maintenance and learning

- **When a meal is marked cooked:** its ingredients are removed from the pantry, and any extra portions become `prepared_items` with a use-by date.
- **When an order is delivered:** the order items are added, with use-by dates estimated from `fridge_days`. Substitutions are matched to their ingredients.
- **Staples:** a "running low" tap adds the item to the next list. Spices are never weighed.
- **"Use soon" alerts** for anything within 2 days of its use-by date. These also feed the next re-plan.
- **Portion learning:** if a meal gets "not enough" or "leftovers" 3 times, the relevant portion weights move by ±0.1.
- **Favourites:** recipes rated "would make again" rank higher; recipes rated "no" twice are archived.
- **Delivery Pass check:** after 4 weeks, compare actual delivery charges with the cost of a pass, and recommend whether to buy one.

---

## 10. Integrations

### Sainsbury's (Claude in Chrome, logged in as you)
- **Product matching:** for each ingredient, search the site, record candidate products (pack size, price, offers, ingredient list) and save the best match. You can pin a preferred product.
- **Offer scan:** each Friday, refresh prices and offers for every ingredient the library uses, so the optimiser has current numbers.
- **Basket fill:** add each item on the list in the right quantity. Out-of-stock items are reported along with the alternative chosen.
- **Slot:** check that the delivery slot is booked. Claude only books a slot with your OK at the time.
- **What Claude does not do:** enter payment details, check out, or confirm an order. **You** always do that.
- **Risk:** site changes can break the automation. If that happens, the shopping list still works on its own, and you can shop from it on the phone.

### Substitutions and missing items (your email)
Sainsbury's emails you about substitutions and missing items on delivery day, before the driver arrives. Claude reads that email and fixes the week's plan before you start cooking.

- **Reading the email:** through the Gmail connector, **read-only**. Claude only searches for Sainsbury's order emails for the expected delivery, and never sends, deletes or changes anything. Fallback: the order page on Sainsbury's in Chrome shows the same details.
- **When:** checks start at midday on each delivery day (Sunday, Tuesday) and repeat hourly until the email arrives. A final check runs after delivery, to catch anything changed at the door.
- **For each change, Claude decides how to handle it:**

| Change | Example | What happens |
|---|---|---|
| **Works as is** | Different brand, bigger pack | Quantities and pantry updated; nothing for you to do |
| **Works with a tweak** | Chicken thighs instead of breast | This week's copy of the recipe is updated (e.g. "+3 min in the HY, MEATER 74°C"). The master recipe stays as it is, and Cookidoo gets the tweak at the next sync |
| **Breaks a house rule** | Natural yoghurt instead of Greek | You're asked **before the driver arrives**: reject it at the door, or accept it for this week |
| **Missing, needed soon** | Coriander for tomorrow's tacos | Goes on the **Spar list** (see below), or an alternative from the pantry is offered |
| **Missing, not needed for days** | Lamb mince for Friday | Moved to the Tuesday order if there is one; otherwise the Spar list or a re-plan |

- **One notification, one decision.** Your phone gets e.g. *"2 substitutions sorted, 1 needs you: natural yoghurt (reject at the door?) · Spar list: coriander, 2 limes."* Approve with one tap, or change things.
- **Recipe changes apply to this week only.** They're stored as adjustments on the meal slot, so the recipe card and cook mode show *"This week: chicken thighs (substitution)"* with the changed step highlighted.

### Spar quick shop (5-minute walk)
A Spar is close enough to cover gaps at short notice, so the app keeps a separate **Spar list**:
- **What goes on it:** anything missing or used up and needed **within 48 hours**, where waiting for the next Sainsbury's delivery isn't an option. Examples: a missing herb, milk running out, an extra onion for guests.
- **Sources:** substitution emails, "we're out of…" taps, the kitchen assistant ("we've no eggs for tomorrow"), and last-minute guest requests that need more of something.
- **Shown on the Shop tab and in the evening notification**, with the meal each item is for and when it's needed ("by 5pm tomorrow for the tacos").
- **Small convenience-store basics only.** The list knows Spar is a smaller shop. It suggests Spar for basics (milk, eggs, bread, onions, herbs, lemons/limes, tinned goods) and offers a pantry alternative or a swap for anything specialist.
- **Nobody orders from Spar automatically.** It's a list for you to walk with; tick items off as you go and the pantry updates.

### Cookidoo (Claude in Chrome, logged in as you; requires a subscription)
- **Automatic weekly sync.** **Approving the weekly menu is your OK** for Claude to update Cookidoo for that week. There's no separate confirmation for each recipe. Straight after approval, Claude:
  1. **creates or updates Created Recipes** for any planned meal that isn't in Cookidoo yet or has changed since it was sent: ingredients scaled to the planned portions, steps, and TM7 settings for each step;
  2. **adds each meal to Cookidoo's weekly planner ("My Week")** on the day it's eaten. Only the Thermomix parts of each recipe go to Cookidoo (its TM7 steps and their ingredients; owner's choice, 17 Oct 2026), and recipes with no TM7 step stay in this app only. Prep ahead stays in this app (recipe Prep ahead and cook mode). Breakfast and lunch routines are only added if they use the TM7 (e.g. baked oats);
  3. **reports back** in the app: "Cookidoo synced: 5 recipes, 2 new", or lists anything that failed.
- **Mid-week changes keep Cookidoo in step.** If a meal is swapped, moved or marked eating out (including through the kitchen assistant), the next sync moves or removes it in Cookidoo's planner.
- **This app's planner stays the master copy.** Claude only adds, moves and removes entries it created itself, and leaves anything you add to Cookidoo by hand alone. Cookidoo's own shopping list isn't used, because Sainsbury's is driven from this app.
- **"Send to Cookidoo"** on a recipe still works on its own, for recipes outside the week's plan.
- **Recipe status:** `cookidoo_status` tracks *sent* and *outdated* (outdated means the recipe's ingredients or steps changed since it was sent; photos don't count). Each dinner slot records `cookidoo_recipe_id`, the recipe Claude put in My Week that day, so only those entries are ever moved or removed.
- **How it runs (built 16 Oct 2026):** approving a week, or changing an approved week's dinners, leaves a `cookidoo_runs` request. A scheduled Claude task on the owner's Mac (every 15 minutes, 7am–10pm) claims it and follows `docs/playbooks/cookidoo.md`, using `npm run cookidoo`. The week tile shows "Cookidoo: waiting for Claude", "sending…", "✓ In Cookidoo" or why it didn't sync; a recipe card links to its Cookidoo copy.
- **Imported recipes:** the household's useful Cookidoo recipes are in the library with source "From your Cookidoo".
- **Needs** your Mac awake with Chrome open and logged in to Cookidoo. If it isn't, the sync waits and the app shows "Cookidoo sync pending".
- **To check first:** how much guided cooking the TM7 gives for created recipes. We'll test with one recipe before relying on it.
- **Later option:** the unofficial Cookidoo API library, if it supports what we need.

### Kitchen assistant (voice chat with Claude inside the app)
A mic button available on every screen, made large in cook mode, so you can ask things like:
> "I've run out of Dijon, what can I use?" · "Can I swap the chicken thighs for breast?" · "How long does the sauce keep?" · "We're eating out Thursday, move that meal."

- **How it works:**
  1. You tap and talk; your speech is turned into text, using the browser's speech recognition or a speech-to-text service if Safari's proves unreliable.
  2. A Supabase Edge Function calls the **Claude API** with what you said and some context: the recipe and step you're on, the pantry, house rules, equipment and this week's plan.
  3. The reply appears as text and is **read aloud**, using the browser's built-in voice or a nicer text-to-speech service.
- **What it can do:** these are tools the assistant calls, and they write to Supabase:
  - suggest a substitute from what's actually in the pantry, and scale it to the recipe
  - apply the substitute to tonight's recipe, without changing the saved version
  - mark something as out, or add it to the next shopping list
  - swap or move meals, mark eating out, re-run the optimiser for the rest of the week
  - answer questions about storage, reheating, toddler safety and timings
- **Confirmation before changes:** anything that changes the plan or the shopping list is read back first ("Move fish pie to Friday and mark Thursday as eating out?") and only applied after you confirm.
- **Limits:** it's a separate Claude running through the API, not the planning run. It can't use your browser, so it **queues** Sainsbury's changes for the next basket fill rather than editing an order directly.
- **Cost:** the Claude API is billed per use, using a key stored only on the server. Model choice and expected monthly cost will be confirmed during the build; casual kitchen use should cost very little.
- **Hands-free:** in cook mode, the mic stays one big tap away. A wake word ("hey…") is a possible later addition but isn't planned for the first version.

### Hands-free cooking (12 Nov 2026)
A **🎤 Listen** switch in cook mode and Today's hour, off by default (hidden where the browser has no speech recognition). While it's on, say **"planner next"**, **"planner back"**, **"planner repeat"** (reads the step aloud in the device's own voice) or **"planner stop"** (stops listening). Only words straight after "planner" count (and its usual mishearings: planer, planter, plana, "plan a"), so "next" or "back" in conversation never moves the screen. It uses the browser's own speech recognition on the device: free, no Claude involved. Safari only finalises what it heard much later, so commands are read from the live transcript as you speak, each acted on once. The browser stops listening after a pause; the app starts a fresh listener after a short, growing pause while the switch is on. If Safari keeps ending sessions at once, it falls back to listening without the live transcript (as the listening test did), and after 8 quick stops it turns off with a note giving Safari's reason. A refused microphone turns it off with a note too. Timers aren't voice commands (there are none in cook mode).
- **Data:** `assistant_messages` (`member_id, context (screen/recipe/step), role, content, actions_taken`). This keeps a history, so you can see what was changed and why.

### Ask Claude (a read-only connector in the Claude app, 12 Nov 2026)
The first version of the kitchen assistant. You chat in the Claude app (phone, iPad, Mac) on your own subscription, and Claude looks things up in the planner. It answers questions such as "swap Thursday for something quicker using what's in the pantry", "redesign next week with two fish dinners" or "what can I use instead of crème fraîche tonight?". It **changes nothing**: you make any change in the app yourself, or tap Plan with Claude with a note.

- **Setup, once:** in Claude, Settings → Connectors → Add custom connector, named "Family Food Planner", with the secret link. It is then available in every chat.
- **Where it runs:** a Supabase Edge Function, `ask-claude-connector`, speaking MCP over streamable HTTP, built on Supabase's documented MCP route. It is deployed with `--no-verify-jwt`, because Claude has no app login.
- **The lock:** the link is `…/functions/v1/ask-claude-connector/<key>`. The key is a long random value in the Supabase secret `CONNECTOR_KEY`, compared in constant time. The secret `CONNECTOR_HOUSEHOLD_ID` names the one household it reads. A missing or wrong key gets a plain 404, so nothing shows there is a connector. To cut access, change the secret and add the connector again with the new link. The link is never committed: it lives only in the Supabase secrets and your Claude settings.
- **Read-only:** the function uses the server key, so the code itself is the guard. It only ever runs `select` queries, always filtered to that household.
- **Tools Claude can call:**
  - `get_household`: members and portions, house rules, private rules, what makes a meal, kit (TM7 machines and bowls, APO, air fryer, oven), Today's hour (start, length, weeknight hands-on limit), and the breakfast and home-lunch pools.
  - `get_week` (`week`: "this", "next", or any date in the week, London time): each day's breakfast, lunch and dinner, with mode, recipe title, portions and the planner's reason; whether the week is a draft or approved; "No plan for that week yet" when there isn't one.
  - `find_recipes` (optional `query` words, optional `tag`): matching recipes with title, kind, protein, tags, total and hands-on minutes, base portions, reheats well, rating and when last cooked. With no arguments it returns every recipe, which is the full list Claude needs to redesign a week.
  - `get_recipe` (`title`): one recipe in full, with ingredients and amounts, and steps with phase, timings and TM7 settings. If the title isn't an exact match, it takes the closest single match, or lists the candidates.
  - `get_pantry`: staples with their status (have, low, out), other items with amounts, and the freezer with portions and use-by dates.
  - `get_products` (optional `query` words): the Sainsbury's product saved for each shopping item, with pack size and the price last seen. These are saved prices, not live offers: Claude says so, and anything live is checked in Claude Code, where Chrome is available.
- **Standing instructions** sent with the connector:
  - The connector is read-only. Suggest changes, and point to the app or Plan with Claude to make them.
  - Keep suggestions within the house rules and the private rules. Never name or explain the private rules; call them "your private rules" if you have to mention them.
  - Keep weeknight dinners' hands-on time within Today's hour, less 15 minutes. Prefer what's already in the pantry and freezer.
- **App:** the Week tab gets a small "Ask Claude" link that opens claude.ai in a new tab. On the phone or iPad, the Claude app picks it up.
- **Out of scope:** writes of any kind, chat history in Supabase, Sainsbury's, Cookidoo and email. The in-app voice assistant above, which can make changes using the paid API, stays a later option.
- **Testing:**
  - The tools are pure functions in `supabase/functions/_shared/askClaude.ts`: rows in, text out. Unit tests cover each tool, including an unknown recipe, a close-match title, an empty week, a missing pantry and a product with no saved price.
  - Further tests cover the key check (missing, wrong, right) and confirm the data reader only uses `select`.
  - After deploying, a real MCP `tools/list` and one `tools/call` with curl confirm it works. Then you add the connector and ask it one question.

### Ask Claude: changes you approve (12 Nov 2026)
The same connector gains four tools that change things. In Claude, each change tool is set to **Needs approval**, so you see exactly what it will do and tap to allow it. The lookups stay **Always allow**. This replaces "read-only" and "writes of any kind" above. The lock (the secret link) is unchanged; if it leaked, someone could now change the plan as well as read it, until the key is changed.

- **Tonight's version.** A day's meal can carry its own version of the recipe, for when you're out of something or want to cook it differently. The saved recipe stays as it is.
  - **Data:** a new `meal_slots.version` jsonb column, added in a new numbered migration that you run in the SQL Editor. It holds:
    - `note`: one line, e.g. "Greek yoghurt instead of crème fraîche".
    - `ingredients`: the full list for that day, in the recipe's shape (group, name, qty, unit, note), each marked `changed` when it differs from the saved recipe.
    - `steps`: the full steps (phase, position, at minute, title, body, machine, settings, timer), each marked `changed` the same way.
    - `based_on`: the recipe ID it was made from.
  - **Claude builds it** from the saved recipe plus the changes. The connector refuses it if an ingredient or step from the saved recipe disappears without being marked as removed, or if `based_on` isn't the day's recipe.
  - **Where it shows:**
    - **Cook mode:** opened from that day (the day sheet or Today's hour), it shows tonight's version, with a "Tonight's version" banner and the changes marked.
    - **Today's hour** plans its chopping and steps from it.
    - **The shopping list** uses its ingredients for that day.
    - **The recipe card,** opened from the day, shows the banner and a "See the saved recipe" link.
    - Opened from the recipe list, cook mode and the recipe card show the saved recipe as before.
  - **Cleared** whenever the day's recipe changes or the meal stops being cooked: in the app (with the batch and roast plans, as now) and in the connector.
- **The change tools:**
  - `set_tonights_version` (`date`, `slot`, `note`, `ingredients`, `steps`).
  - `clear_tonights_version` (`date`, `slot`).
  - `swap_meal` (`date`, `slot`, `recipe` title, or `out` for eating out). It uses the app's own swap rules, so leftovers lunches are released, portions are set, and the meal is kept from being replanned.
  - `set_pantry` (`item`, `status`: have, low or out), for staples. For a non-staple item, it says to use the app.
- **The rules every change tool follows:**
  - Only this week and next, from today on; never a past day.
  - Only a week that exists; a swap only uses an active recipe from your list.
  - Every write is limited to your household.
  - Each reply says plainly what changed and what follows:
    - In an approved week, Cookidoo re-syncs a swapped dinner by itself.
    - If the Sainsbury's basket for that week is already filled, the shopping may need "Empty and refill" or a Spar trip.
    - Tonight's version isn't sent to Cookidoo, which keeps the saved recipe.
- **Standing instructions** gain: suggest first, change only when asked; prefer tonight's version over swapping the meal when one ingredient is the problem; never edit saved recipes (that's Claude Code's job).
- **Still out of scope:** editing saved recipes, approving weeks, Sainsbury's, Cookidoo, email and chat history.
- **Shared logic:**
  - The step that drops a day's batch and roast plans (and now tonight's version) when its dinner changes moves out of the Week screen into `supabase/functions/_shared/`, so the app and the connector use the same code.
  - Applying tonight's version to a recipe is a pure function there too, used by cook mode, Today's hour and the shopping list.
- **Testing:**
  - Unit tests cover:
    - a past date, or a date outside this week and next, being refused
    - an unknown recipe
    - leftovers released on a swap
    - tonight's version cleared on a swap
    - a version that drops an ingredient silently being refused
    - pantry status on a staple and on a non-staple
  - Screen tests cover cook mode, Today's hour and the shopping list using tonight's version.
  - After deploying, a live check sets and clears a version on a future day and swaps a meal, then puts it back.

---

## 11. Build plan

The app is usable from Phase 3 onwards; each phase after that adds automation.

| Phase | Delivers |
|---|---|
| **1. Foundation** | GitHub repo, React/Vite PWA deployed to GitHub Pages by GitHub Actions, Supabase schema and row-level security, household login for you and your partner, Preferences screens, seeded members, equipment, staples and house rules |
| **2. Recipes** | Recipe model, card view, printable PDF, cook mode on the iPad (including "add photo"), PDF import, hero image and ingredient icon generation; your 9 recipes imported and converted; about 20 component recipes seeded |
| **3. Calendar & manual planning** | Calendar home, routines, 8pm prep row, cook/reheat logic, planning wizard (choose all meals yourself), shopping list from recipes minus pantry, mark cooked and feedback |
| **4. Optimiser** | Pack maths, leftover pool, scoring, auto-fill with reasons, snack suggestions, Sunday/Tuesday split, Plan review |
| **5. Sainsbury's** | Product matching, Friday offer scan, basket fill, reading the delivery confirmation and updating the pantry, substitutions email check (Gmail connector, read-only) with recipe adjustments, Spar list, `CLAUDE.md` playbook and scheduled tasks |
| **6. Cookidoo** | Automatic sync on plan approval (Created Recipes + My Week planner), mid-week updates, Send to Cookidoo, status tracking |
| **6b. Kitchen assistant** | Voice/text chat with Claude: substitutions, plan changes with confirmation, spoken replies. A text-only version can come early, straight after Phase 3 |
| **7. Learning & polish** | Portion learning, favourites ranking, Delivery Pass calculator, use-soon alerts |

---

## 12. Open questions and risks

1. **Pantry gaps:** confirm the basics listed in §3.
2. **Image provider: Google (decided).** The exact Gemini image model is confirmed at the start of Phase 2.
3. **Boiled eggs:** served with sourdough toast or soldiers? (Assumed yes for now.)
4. **Bowl sauce:** Greek yoghurt and lime, or chipotle yoghurt by default? (Chipotle paste is often ultra-processed. Dried chipotle chillies blended in the TM7 avoid that.)
5. **Doner salt test:** the doner uses salt to bind the meat (2 tsp per kg). We'll try ¾ tsp, with the adults' portions seasoned at the table, and check the texture still holds the first time you make it.
6. **Sainsbury's automation** depends on their website and your Mac being awake.
7. **Cookidoo created recipes:** the TM7 guided-cooking support needs testing.
8. **Assistant voice on iPhone/iPad:** Safari's built-in speech recognition can be unreliable. If it is, we switch to a paid speech-to-text service.


### Ask Claude: planning the week (13 Nov 2026)
Two more tools on the same connector, so the week is planned in the Claude app instead of by the Mac's scheduled task:
- **`get_plan_context`** (read-only; `week`: next by default, this, or a date): how to plan (the Planner page's priorities in order) and everything the plan needs as JSON: dates and office days, portions, rules (protein balance, time limits, Today's hour, day rules, other shops, what makes a meal, house and private rules), every plannable dinner with times and ingredients, recent dinners, freezer, pantry, pack sizes, whether the week has a draft, the new-recipe allowance and the rules for writing one (`_shared/recipeRules.ts`), and the built-in proposal.
- **`save_week_plan`** (needs approval): the summary, a dinner per night (slug or title, with a one-line reason) and up to the allowed new recipes in the seed format. New recipes are added first; the built-in planner fills breakfasts and lunches; the week is saved as a draft through a plan request and `save_claude_week`, all or nothing (new recipes removed again if the week isn't saved), replacing a draft, never an approved week. Past weeks are refused. The context and save code is shared with the week CLI (`_shared/weekPlan.ts`).
